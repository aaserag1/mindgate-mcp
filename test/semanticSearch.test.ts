/**
 * MindGate v1.4.0 — Semantic Search Tests
 *
 * Tests the LocalEmbedder, cosineSimilarity, serialize/deserialize,
 * setEmbedding, hybridSearch, and recallContext with semanticVector.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { LocalEmbedder, cosineSimilarity, embedder, VECTOR_DIM } from "../src/embeddings/embedder.js";
import { MindGateStore } from "../src/db/memoryStore.js";

// Use a temp DB for isolation
function tmpDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mindgate-sem-"));
  return path.join(dir, "test.db");
}

describe("LocalEmbedder — availability & embedding", () => {
  it("model files should be available on disk", () => {
    assert.equal(LocalEmbedder.isAvailable(), true,
      "Model files missing — run: npm install mindgate-mcp");
  });

  it("embed() returns Float32Array of length VECTOR_DIM (384)", async () => {
    const vec = await embedder.embed("hello world semantic search");
    assert.ok(vec !== null, "embed() returned null — model failed to load");
    assert.ok(vec instanceof Float32Array, "embed() should return Float32Array");
    assert.equal(vec.length, VECTOR_DIM, `Expected ${VECTOR_DIM} dims, got ${vec!.length}`);
  });

  it("embed() returns unit-normalized vector (L2 norm ≈ 1.0)", async () => {
    const vec = await embedder.embed("unit normalization test");
    assert.ok(vec !== null);
    let norm = 0;
    for (const v of vec!) norm += v * v;
    norm = Math.sqrt(norm);
    assert.ok(Math.abs(norm - 1.0) < 1e-5, `L2 norm should be ~1.0, got ${norm}`);
  });

  it("cosineSimilarity of identical vectors = 1.0", async () => {
    const vec = await embedder.embed("test cosine identical");
    assert.ok(vec !== null);
    const sim = cosineSimilarity(vec!, vec!);
    assert.ok(Math.abs(sim - 1.0) < 1e-5, `Expected 1.0, got ${sim}`);
  });

  it("cosineSimilarity of similar sentences > dissimilar sentences", async () => {
    const [a, b, c] = await Promise.all([
      embedder.embed("machine learning neural network"),
      embedder.embed("deep learning artificial intelligence"),
      embedder.embed("Egyptian cuisine food recipes"),
    ]);
    assert.ok(a && b && c, "All embeddings should succeed");
    const simAB = cosineSimilarity(a!, b!);
    const simAC = cosineSimilarity(a!, c!);
    assert.ok(simAB > simAC,
      `Similar sentences (${simAB.toFixed(4)}) should score higher than dissimilar (${simAC.toFixed(4)})`);
  });
});

describe("LocalEmbedder — serialize / deserialize", () => {
  it("round-trips Float32Array through Buffer correctly", async () => {
    const original = await embedder.embed("serialize deserialize round trip");
    assert.ok(original !== null);
    const buf = LocalEmbedder.serialize(original!);
    assert.ok(buf instanceof Buffer);
    const restored = LocalEmbedder.deserialize(buf);
    assert.equal(restored.length, original!.length);
    // All values should match within float32 precision
    for (let i = 0; i < original!.length; i++) {
      assert.ok(Math.abs(restored[i] - original![i]) < 1e-6,
        `Mismatch at index ${i}: ${restored[i]} vs ${original![i]}`);
    }
  });
});

describe("MindGateStore — setEmbedding & hybridSearch", () => {
  let store: MindGateStore;

  before(() => {
    store = new MindGateStore(tmpDb());
  });

  it("setEmbedding stores vector without throwing", async () => {
    const { record } = store.rememberDecision({
      workspace: "test",
      category: "architecture",
      title: "Neural network architecture",
      content: "Deep learning with transformer models for NLP tasks",
      sourceAgent: "test",
    });
    const vec = await embedder.embed(`${record.title} ${record.content}`);
    assert.ok(vec !== null, "embed() returned null");
    assert.doesNotThrow(() => store.setEmbedding(record.id, vec!));
  });

  it("hybridSearch returns relevant results by cosine score", async () => {
    const store2 = new MindGateStore(tmpDb());

    // Insert multiple memories
    const records = [
      { title: "Database optimization", content: "SQL query performance tuning with indexes and query plans" },
      { title: "Machine learning pipeline", content: "Training neural networks with gradient descent and backpropagation" },
      { title: "Frontend React development", content: "React hooks and component lifecycle for web applications" },
    ];

    for (const r of records) {
      const { record } = store2.rememberDecision({ workspace: "test", category: "architecture", ...r, sourceAgent: "test" });
      const vec = await embedder.embed(`${r.title} ${r.content}`);
      if (vec) store2.setEmbedding(record.id, vec);
    }

    // Query about machine learning — should rank ML record highest
    const queryVec = await embedder.embed("deep learning neural network training");
    assert.ok(queryVec !== null);

    const results = store2.hybridSearch({
      queryVector: queryVec!,
      workspaces: ["test", "global"],
      workspace: "test",
      targetStatus: "active",
      limit: 3,
    });

    assert.ok(results.length > 0, "hybridSearch should return results");
    // The ML-related memory should appear first (or among top results)
    const topTitle = results[0].title;
    assert.ok(
      topTitle.toLowerCase().includes("machine") || topTitle.toLowerCase().includes("learn"),
      `Expected ML memory at top, got: "${topTitle}"`
    );
  });
});

describe("MindGateStore.recallContext — semantic flag", () => {
  it("returns search.semantic=true when semanticVector is provided and matches", async () => {
    const store = new MindGateStore(tmpDb());

    const { record } = store.rememberDecision({
      workspace: "test",
      category: "architecture",
      title: "TypeScript strict mode",
      content: "Always enable strict TypeScript compilation flags for type safety",
      sourceAgent: "test",
    });
    const vec = await embedder.embed(`${record.title} ${record.content}`);
    if (vec) store.setEmbedding(record.id, vec);

    // Query with semantic vector
    const queryVec = await embedder.embed("TypeScript type checking configuration");
    const result = store.recallContext({
      query: "TypeScript type checking configuration",
      workspace: "test",
      semanticVector: queryVec ?? undefined,
    });

    assert.equal(result.search.semantic, true,
      "recallContext should report search.semantic=true when semanticVector matches");
  });

  it("returns search.semantic=false when no semanticVector is passed", () => {
    const store = new MindGateStore(tmpDb());
    store.rememberDecision({
      workspace: "test",
      category: "decision",
      title: "Plain keyword search",
      content: "FTS5 BM25 keyword search only",
      sourceAgent: "test",
    });

    const result = store.recallContext({
      query: "keyword search",
      workspace: "test",
      // no semanticVector
    });

    assert.equal(result.search.semantic, false,
      "recallContext should report search.semantic=false without semanticVector");
  });
});
