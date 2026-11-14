/**
 * MindGate Local Embedder — Zero-network semantic embeddings (v1.5.0)
 *
 * Supports dual profiles:
 * 1. Default (bundled): all-MiniLM-L6-v2 (INT8 ONNX, ~23 MB, 384-dim)
 * 2. Multilingual: paraphrase-multilingual-MiniLM-L12-v2 (INT8 ONNX, ~118 MB, 384-dim)
 *    Downloaded on-demand via `mindgate-mcp download-model --multilingual`
 *
 * Uses @huggingface/tokenizers for robust WordPiece & Unigram subword tokenization
 * with native Arabic text normalization for cross-lingual (Arabic <-> English) search.
 * 100% offline, zero cloud API calls.
 */

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Tokenizer } from "@huggingface/tokenizers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BUNDLED_MODEL_DIR = path.join(__dirname, "model");
export const MULTILINGUAL_MODEL_DIR = path.join(os.homedir(), ".mindgate", "models", "multilingual");

// Backward compatibility export
export const MODEL_DIR = BUNDLED_MODEL_DIR;

export const VECTOR_DIM = 384;

// ─── Arabic Text Normalization ───────────────────────────────────────────────

/**
 * Normalizes Arabic text for cross-lingual semantic embedding:
 * - Strips Tashkeel (harakat / diacritics) and Tatweel
 * - Normalizes Alef forms (أ, إ, آ, ٱ -> ا)
 * - Normalizes Yaa forms (ى -> ي)
 */
export function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    // remove diacritics: fatha, damma, kasra, sukun, shadda, tanween, dagger alef, tatweel
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    // unify alef variants to bare alef
    .replace(/[أإآٱ]/g, "ا")
    // unify alif maqsura to yaa
    .replace(/ى/g, "ي")
    .trim();
}

// ─── Types (inlined to avoid loading onnxruntime at module evaluation time) ──

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

export type EmbeddingProfile = "default" | "multilingual";

export class LocalEmbedder {
  private session: OrtSession | null = null;
  private tokenizer: Tokenizer | null = null;
  private ort: OrtInference | null = null;
  private ready = false;
  private initPromise: Promise<void> | null = null;
  private activeProfile: EmbeddingProfile = "default";

  /**
   * Determine active embedding profile based on config and available files.
   * Priority:
   * 1. Environment variable MINDGATE_EMBEDDING_PROFILE or MINDGATE_MODEL
   * 2. Multilingual model if present on disk (~/.mindgate/models/multilingual)
   * 3. Bundled default model (all-MiniLM-L6-v2)
   */
  static getActiveProfile(): EmbeddingProfile {
    const forced = (process.env.MINDGATE_EMBEDDING_PROFILE || process.env.MINDGATE_MODEL || "").toLowerCase();
    if (forced === "multilingual" || forced === "multi") {
      return "multilingual";
    }
    if (LocalEmbedder.isMultilingualAvailable()) {
      return "multilingual";
    }
    return "default";
  }

  /** Returns true if the bundled model files exist on disk */
  static isBundledAvailable(): boolean {
    const modelPath = path.join(BUNDLED_MODEL_DIR, "model.onnx");
    const tokenizerPath = path.join(BUNDLED_MODEL_DIR, "tokenizer.json");
    return fs.existsSync(modelPath) && fs.existsSync(tokenizerPath);
  }

  /** Returns true if the multilingual model files exist on disk */
  static isMultilingualAvailable(): boolean {
    const modelPath = path.join(MULTILINGUAL_MODEL_DIR, "model.onnx");
    const tokenizerPath = path.join(MULTILINGUAL_MODEL_DIR, "tokenizer.json");
    return fs.existsSync(modelPath) && fs.existsSync(tokenizerPath);
  }

  /** Returns true if any embedding model is available */
  static isAvailable(): boolean {
    return LocalEmbedder.isMultilingualAvailable() || LocalEmbedder.isBundledAvailable();
  }

  /** Get model file paths for a given profile */
  static getModelPaths(profile: EmbeddingProfile): { modelPath: string; tokenizerPath: string; configPath?: string } {
    if (profile === "multilingual" && LocalEmbedder.isMultilingualAvailable()) {
      return {
        modelPath: path.join(MULTILINGUAL_MODEL_DIR, "model.onnx"),
        tokenizerPath: path.join(MULTILINGUAL_MODEL_DIR, "tokenizer.json"),
        configPath: path.join(MULTILINGUAL_MODEL_DIR, "tokenizer_config.json"),
      };
    }
    return {
      modelPath: path.join(BUNDLED_MODEL_DIR, "model.onnx"),
      tokenizerPath: path.join(BUNDLED_MODEL_DIR, "tokenizer.json"),
      configPath: path.join(BUNDLED_MODEL_DIR, "tokenizer_config.json"),
    };
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

    this.activeProfile = LocalEmbedder.getActiveProfile();
    const paths = LocalEmbedder.getModelPaths(this.activeProfile);

    // Dynamic import keeps onnxruntime out of the main module graph when not used
    this.ort = (await import("onnxruntime-node")) as unknown as OrtInference;
    this.session = await this.ort.InferenceSession.create(paths.modelPath, {
      executionProviders: ["cpu"],
      graphOptimizationLevel: "all",
    });

    const tokenizerRaw = JSON.parse(fs.readFileSync(paths.tokenizerPath, "utf8"));
    const configRaw = paths.configPath && fs.existsSync(paths.configPath)
      ? JSON.parse(fs.readFileSync(paths.configPath, "utf8"))
      : undefined;

    this.tokenizer = new Tokenizer(tokenizerRaw, configRaw);
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
    if (!this.session || !this.tokenizer || !this.ort) return null;

    // Apply Arabic text normalization to improve cross-lingual matching
    const cleanText = normalizeArabic(text);

    const MAX_SEQ = 128;
    const encoded = this.tokenizer.encode(cleanText);

    const tokenIds = encoded.ids.slice(0, MAX_SEQ);
    const attentionMask = encoded.attention_mask
      ? encoded.attention_mask.slice(0, MAX_SEQ)
      : new Array(tokenIds.length).fill(1);

    // Pad to MAX_SEQ
    while (tokenIds.length < MAX_SEQ) {
      tokenIds.push(0);
      attentionMask.push(0);
    }

    const inputIdsBig = BigInt64Array.from(tokenIds.map(BigInt));
    const attMaskBig = BigInt64Array.from(attentionMask.map(BigInt));
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

  /** Returns current active embedding profile */
  getProfile(): EmbeddingProfile {
    return this.activeProfile;
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

/**
 * Downloads the high-accuracy multilingual model (paraphrase-multilingual-MiniLM-L12-v2, INT8)
 * for cross-lingual (Arabic <-> English) semantic retrieval.
 * Stored locally in ~/.mindgate/models/multilingual/
 */
export async function downloadMultilingualModel(
  onProgress?: (msg: string) => void
): Promise<void> {
  const { pipeline } = await import("node:stream/promises");
  const { Readable } = await import("node:stream");

  if (!fs.existsSync(MULTILINGUAL_MODEL_DIR)) {
    fs.mkdirSync(MULTILINGUAL_MODEL_DIR, { recursive: true, mode: 0o700 });
  }

  const BASE_URL = "https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main";
  const files = [
    { name: "tokenizer_config.json", url: `${BASE_URL}/tokenizer_config.json` },
    { name: "tokenizer.json", url: `${BASE_URL}/tokenizer.json` },
    { name: "model.onnx", url: `${BASE_URL}/onnx/model_quantized.onnx` },
  ];

  for (const file of files) {
    const dest = path.join(MULTILINGUAL_MODEL_DIR, file.name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      onProgress?.(`[MindGate] Already downloaded: ${file.name}`);
      continue;
    }
    onProgress?.(`[MindGate] Downloading ${file.name}...`);
    const res = await fetch(file.url);
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download ${file.name}: HTTP ${res.status}`);
    }
    const fileStream = fs.createWriteStream(dest);
    // @ts-expect-error Node stream from Web stream
    await pipeline(Readable.fromWeb(res.body), fileStream);
    onProgress?.(`[MindGate] Successfully saved: ${file.name}`);
  }
}

// Singleton instance shared across the process
export const embedder = new LocalEmbedder();
