/**
 * MindGate Local Embedder — Zero-network semantic embeddings
 *
 * Uses all-MiniLM-L6-v2 (quantized ONNX, ~23 MB) via onnxruntime-node.
 * Produces 384-dimensional float32 vectors, fully offline.
 *
 * The embedder is OPTIONAL — if the model files are missing or onnxruntime
 * is not installed, it gracefully returns null and the caller falls back to
 * FTS5-only search. This keeps the base package lean.
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MODEL_DIR = path.join(__dirname, "model");
const MODEL_PATH = path.join(MODEL_DIR, "model.onnx");
const TOKENIZER_PATH = path.join(MODEL_DIR, "tokenizer.json");

export const VECTOR_DIM = 384;

// ─── Types (inlined to avoid importing onnxruntime at module-load time) ───────

interface OrtSession {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}
interface OrtTensor {
  data: Float32Array | BigInt64Array;
  dims: number[];
}
type OrtInference = {
  InferenceSession: {
    create(modelPath: string, opts?: object): Promise<OrtSession>;
  };
  Tensor: new (
    type: string,
    data: Float32Array | BigInt64Array,
    dims: number[]
  ) => OrtTensor;
};

// ─── Tokenizer (minimal WordPiece BPE subset sufficient for MiniLM) ──────────

interface TokenizerConfig {
  model: { vocab: Record<string, number> };
  added_tokens: Array<{ id: number; content: string }>;
}

function buildVocab(tokenizerJson: TokenizerConfig): {
  vocab: Record<string, number>;
  clsId: number;
  sepId: number;
  padId: number;
  unkId: number;
} {
  const vocab = tokenizerJson.model.vocab;
  return {
    vocab,
    clsId: vocab["[CLS]"] ?? 101,
    sepId: vocab["[SEP]"] ?? 102,
    padId: vocab["[PAD]"] ?? 0,
    unkId: vocab["[UNK]"] ?? 100,
  };
}

function tokenize(
  text: string,
  vocab: Record<string, number>,
  unkId: number,
  maxLen = 128
): number[] {
  // Lowercase + basic whitespace split (sufficient for MiniLM)
  const words = text.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff\s]/g, " ").split(/\s+/).filter(Boolean);
  const ids: number[] = [];
  for (const word of words) {
    if (ids.length >= maxLen - 2) break;
    // Try full word first, then character-level fallback
    if (word in vocab) {
      ids.push(vocab[word]);
    } else {
      // Simple character-level subword fallback
      let remaining = word;
      let first = true;
      while (remaining.length > 0) {
        let matched = false;
        for (let len = Math.min(remaining.length, 20); len > 0; len--) {
          const sub = first ? remaining.slice(0, len) : "##" + remaining.slice(0, len);
          if (sub in vocab) {
            ids.push(vocab[sub]);
            remaining = remaining.slice(len);
            first = false;
            matched = true;
            break;
          }
        }
        if (!matched) {
          ids.push(unkId);
          break;
        }
      }
    }
  }
  return ids;
}

// ─── Mean Pooling (average over non-padding token embeddings) ─────────────────

function meanPool(
  tokenEmbeddings: Float32Array,
  attentionMask: BigInt64Array,
  seqLen: number,
  dim: number
): Float32Array {
  const result = new Float32Array(dim);
  let count = 0;
  for (let t = 0; t < seqLen; t++) {
    if (Number(attentionMask[t]) === 0) continue;
    count++;
    for (let d = 0; d < dim; d++) {
      result[d] += tokenEmbeddings[t * dim + d];
    }
  }
  if (count > 0) {
    for (let d = 0; d < dim; d++) result[d] /= count;
  }
  return result;
}

// ─── Normalize to unit sphere (for cosine similarity via dot product) ─────────

function normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm) as Float32Array;
}

// ─── Cosine similarity ────────────────────────────────────────────────────────

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // Both are already unit-normalized
}

// ─── Embedder class ───────────────────────────────────────────────────────────

export class LocalEmbedder {
  private session: OrtSession | null = null;
  private vocabData: ReturnType<typeof buildVocab> | null = null;
  private ort: OrtInference | null = null;
  private ready = false;
  private initPromise: Promise<void> | null = null;

  /** Returns true if the model files exist on disk */
  static isAvailable(): boolean {
    return fs.existsSync(MODEL_PATH) && fs.existsSync(TOKENIZER_PATH);
  }

  /** Lazy-init: loads model only on first embed() call */
  async init(): Promise<void> {
    if (this.ready) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._load();
    return this.initPromise;
  }

  private async _load(): Promise<void> {
    if (!LocalEmbedder.isAvailable()) {
      throw new Error("[MindGate Embedder] Model files not found. Run: mindgate-mcp download-model");
    }
    // Dynamic import keeps onnxruntime out of the main module graph when not used
    this.ort = (await import("onnxruntime-node")) as unknown as OrtInference;
    this.session = await this.ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ["cpu"],
      graphOptimizationLevel: "all",
    });
    const tokenizerRaw = JSON.parse(fs.readFileSync(TOKENIZER_PATH, "utf8")) as TokenizerConfig;
    this.vocabData = buildVocab(tokenizerRaw);
    this.ready = true;
  }

  /**
   * Embed a text into a 384-dim unit-normalized float32 vector.
   * Returns null if the embedder is not available (graceful degradation).
   */
  async embed(text: string): Promise<Float32Array | null> {
    if (!LocalEmbedder.isAvailable()) return null;
    try {
      await this.init();
    } catch {
      return null;
    }
    if (!this.session || !this.vocabData || !this.ort) return null;

    const { vocab, clsId, sepId, padId, unkId } = this.vocabData;
    const MAX_SEQ = 128;

    const tokenIds = tokenize(text, vocab, unkId, MAX_SEQ);
    const inputIds = [clsId, ...tokenIds, sepId];
    const seqLen = Math.min(inputIds.length, MAX_SEQ);
    const paddedIds = new Array(MAX_SEQ).fill(padId);
    const attMask = new Array(MAX_SEQ).fill(0);
    for (let i = 0; i < seqLen; i++) {
      paddedIds[i] = inputIds[i];
      attMask[i] = 1;
    }

    const inputIdsBig = BigInt64Array.from(paddedIds.map(BigInt));
    const attMaskBig = BigInt64Array.from(attMask.map(BigInt));
    const tokenTypeIds = BigInt64Array.from(new Array(MAX_SEQ).fill(0n));

    const inputTensor = new this.ort.Tensor("int64", inputIdsBig, [1, MAX_SEQ]);
    const maskTensor = new this.ort.Tensor("int64", attMaskBig, [1, MAX_SEQ]);
    const typeTensor = new this.ort.Tensor("int64", tokenTypeIds, [1, MAX_SEQ]);

    const output = await this.session.run({
      input_ids: inputTensor,
      attention_mask: maskTensor,
      token_type_ids: typeTensor,
    });

    // last_hidden_state shape: [1, MAX_SEQ, 384]
    const hiddenState = output["last_hidden_state"] ?? output[Object.keys(output)[0]];
    const tokenEmbeddings = hiddenState.data as Float32Array;

    const pooled = meanPool(tokenEmbeddings, attMaskBig, MAX_SEQ, VECTOR_DIM);
    return normalize(pooled);
  }

  /** Serialize a float32 vector to a Buffer for SQLite BLOB storage */
  static serialize(vec: Float32Array): Buffer {
    return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
  }

  /** Deserialize a Buffer from SQLite back to float32 vector */
  static deserialize(buf: Buffer): Float32Array {
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  }
}

// Singleton instance shared across the process
export const embedder = new LocalEmbedder();
