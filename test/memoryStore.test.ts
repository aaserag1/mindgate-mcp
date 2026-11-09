import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { MindGateStore } from "../src/db/memoryStore.js";
import { RULES_SENTINEL } from "../src/rulesSync.js";

let tmpDir: string;
let dbPath: string;
let store: MindGateStore;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mindgate-test-"));
  dbPath = path.join(tmpDir, "test.db");
  store = new MindGateStore(dbPath);
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best effort cleanup
  }
});

test("database file is created owner-only (0600)", (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX permission bits are not supported on Windows");
    return;
  }
  const mode = fs.statSync(dbPath).mode & 0o777;
  assert.equal(mode, 0o600);
});

test("rememberDecision stores a memory and redacts secrets", () => {
  const { record, redactions } = store.rememberDecision({
    workspace: "ws-a",
    category: "decision",
    title: "Use quixotic database for caching layer",
    content: "We will use Redis as LRU cache. Backup key AKIAIOSFODNN7EXAMPLE stays off disk.",
    tags: ["cache", "redis"],
    sourceAgent: "test-runner",
  });
  assert.ok(record.id > 0);
  assert.equal(redactions, 1);
  assert.ok(!record.content.includes("AKIAIOSFODNN7EXAMPLE"));
  assert.ok(record.content.includes("[REDACTED:aws_access_key]"));
  assert.equal(record.tags, "cache, redis");
});

test("recallContext finds FTS matches and reports matched=true", () => {
  const result = store.recallContext({
    query: "quixotic",
    workspace: "ws-a",
    includeGlobal: false,
  });
  assert.equal(result.search.matched, true);
  assert.equal(result.search.fallback, false);
  assert.ok(result.memories.some((m) => m.title.includes("quixotic")));
});

test("recallContext with no match falls back to recents and flags it", () => {
  const result = store.recallContext({
    query: "zzzzqqqxyxnotfoundtoken",
    workspace: "ws-a",
    includeGlobal: false,
  });
  assert.equal(result.search.matched, false);
  assert.equal(result.search.fallback, true);
  // Still returns recent memories, clearly flagged as fallback
  assert.ok(result.memories.length >= 1);
});

test("updateMemory updates in place and preserves identity", () => {
  const created = store.rememberDecision({
    workspace: "ws-a",
    category: "convention",
    title: "Prefer zxqwvbun runtimes",
    content: "Initial rationale.",
  });
  const updated = store.updateMemory({
    id: created.record.id,
    title: "Prefer bun runtimes",
    content: "Updated rationale. Secret: ghp_" + "x".repeat(36),
  });
  assert.ok(updated);
  assert.equal(updated.record.id, created.record.id);
  assert.equal(updated.record.title, "Prefer bun runtimes");
  assert.equal(updated.redactions, 1);
  assert.equal(updated.record.created_at, created.record.created_at);
});

test("updateMemory returns null for a missing id", () => {
  const updated = store.updateMemory({ id: 999_999_999, title: "nope" });
  assert.equal(updated, null);
});

test("session handoff is logged, redacted, and surfaced as latestSession", () => {
  const { record, redactions } = store.logSessionSummary({
    workspace: "ws-a",
    sourceAgent: "test-runner",
    summary: "Shipped cache layer. key=AKIAIOSFODNN7EXAMPLE rotated.",
    nextSteps: ["rotate keys", "deploy"],
    activeFiles: ["src/cache.ts"],
  });
  assert.ok(record.id > 0);
  assert.equal(redactions, 1);
  assert.ok(!record.summary.includes("AKIAIOSFODNN7EXAMPLE"));

  const result = store.recallContext({ workspace: "ws-a", includeGlobal: false });
  assert.equal(result.latestSession?.id, record.id);
});

test("preferences round-trip with redaction", () => {
  const { record, redactions } = store.setUserPreference(
    "deploy.api_key",
    "AKIAIOSFODNN7EXAMPLE",
    "stack"
  );
  assert.equal(redactions, 1);
  assert.ok(!record.value.includes("AKIAIOSFODNN7EXAMPLE"));

  const prefs = store.getUserPreferences("stack");
  assert.ok(prefs.some((p) => p.key === "deploy.api_key"));
});

test("exportSnapshot returns memories, sessions and preferences", () => {
  const snapshot = store.exportSnapshot("ws-a");
  assert.ok(snapshot.memories.length > 0);
  assert.ok(snapshot.sessions.length > 0);
  assert.ok(Array.isArray(snapshot.preferences));
  assert.equal(snapshot.workspace_filter, "ws-a");
});

test("generateWorkspaceRulesMarkdown embeds the sentinel and workspace name", () => {
  const generated = store.generateWorkspaceRulesMarkdown({
    workspace: "ws-a",
    includeGlobal: false,
  });
  assert.ok(generated.markdown.includes(RULES_SENTINEL));
  assert.ok(generated.markdown.includes("ws-a"));
  assert.ok(generated.memoryCount > 0);
  // Stored content must already be redacted — no raw secrets in the output
  assert.ok(!generated.markdown.includes("AKIAIOSFODNN7EXAMPLE"));
});

test("deleteMemory removes rows and reports status", () => {
  const created = store.rememberDecision({
    workspace: "ws-a",
    title: "ephemeral note",
    content: "temporary",
  });
  assert.equal(store.deleteMemory(created.record.id), true);
  assert.equal(store.deleteMemory(created.record.id), false);
});
