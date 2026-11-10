import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MindGateStore } from "../src/db/memoryStore.js";

const tmpDir = path.join(os.tmpdir(), `mindgate-supersede-test-${Date.now()}`);
const dbPath = path.join(tmpDir, "test-supersede.db");
let store: MindGateStore;

before(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  store = new MindGateStore(dbPath);
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // cleanup
  }
});

test("rememberDecision marks superseded decisions and records linkage", () => {
  // 1. Initial decision
  const dec1 = store.rememberDecision({
    workspace: "test-ws",
    category: "architecture",
    title: "Use REST API for billing service",
    content: "REST endpoints will be used for all billing integrations.",
  });
  assert.equal(dec1.record.status, "active");
  assert.equal(dec1.record.superseded_by, null);

  // 2. Newer decision that supersedes dec1
  const dec2 = store.rememberDecision({
    workspace: "test-ws",
    category: "architecture",
    title: "Migrate billing service to gRPC",
    content: "We now use gRPC instead of REST for billing service for performance.",
    supersedes: dec1.record.id,
  });
  assert.equal(dec2.record.status, "active");
  assert.equal(dec2.record.supersedes, String(dec1.record.id));

  // 3. Verify dec1 was updated to superseded
  const recalledAll = store.recallContext({
    workspace: "test-ws",
    status: "all",
  });
  const updatedDec1 = recalledAll.memories.find((m) => m.id === dec1.record.id);
  assert.ok(updatedDec1);
  assert.equal(updatedDec1.status, "superseded");
  assert.equal(updatedDec1.superseded_by, dec2.record.id);

  // 4. By default, recallContext only returns active memories
  const recalledDefault = store.recallContext({
    workspace: "test-ws",
  });
  assert.ok(recalledDefault.memories.some((m) => m.id === dec2.record.id));
  assert.ok(!recalledDefault.memories.some((m) => m.id === dec1.record.id));
});

test("deprecateMemory marks record as deprecated with reason", () => {
  const dec = store.rememberDecision({
    workspace: "dep-ws",
    category: "convention",
    title: "Always use var in legacy modules",
    content: "Legacy modules need var for Node 0.10 compatibility.",
  });
  assert.equal(dec.record.status, "active");

  const deprecated = store.deprecateMemory(dec.record.id, "Node 0.10 is no longer supported");
  assert.ok(deprecated);
  assert.equal(deprecated.status, "deprecated");
  assert.ok(deprecated.content.includes("[Deprecated: Node 0.10 is no longer supported]"));

  // Default recallContext excludes it
  const activeOnly = store.recallContext({ workspace: "dep-ws" });
  assert.ok(!activeOnly.memories.some((m) => m.id === dec.record.id));

  // Explicit status: all or deprecated includes it
  const all = store.recallContext({ workspace: "dep-ws", status: "all" });
  assert.ok(all.memories.some((m) => m.id === dec.record.id));
});

test("deprecateMemory redacts secrets in the persisted reason", () => {
  const { record } = store.rememberDecision({
    workspace: "redaction-test",
    title: "Retired integration",
    content: "Integration details.",
  });
  const fakeToken = "ghp_" + "a".repeat(36);
  store.deprecateMemory(record.id, `Replaced token ${fakeToken}`);

  const [saved] = store.recallContext({ workspace: "redaction-test", status: "deprecated" }).memories;
  assert.ok(saved.content.includes("[Deprecated: Replaced token [REDACTED:github_token]]"));
  assert.ok(!saved.content.includes(fakeToken));
});

test("compactMemories aggregates historical sessions into milestone session", () => {
  const ws = "compact-ws";
  // Add 7 sessions
  for (let i = 1; i <= 7; i++) {
    store.logSessionSummary({
      workspace: ws,
      sourceAgent: "agent-" + i,
      summary: `Completed sprint task #${i}`,
      nextSteps: [`Prepare sprint #${i + 1}`],
      activeFiles: [`src/module${i}.ts`],
    });
  }

  const beforeSessions = store.getSessions({ workspace: ws, limit: 20 });
  assert.equal(beforeSessions.length, 7);

  // Compact with maxSessionsToKeep = 3
  const result = store.compactMemories({
    workspace: ws,
    maxSessionsToKeep: 3,
  });

  assert.equal(result.compacted, true);
  assert.equal(result.sessionsCompacted, 4); // 7 - 3 = 4 compacted
  assert.ok(result.milestoneSession);
  assert.ok(result.milestoneSession.summary.includes("Compacted Milestone: 4 historical sessions"));
  assert.ok(result.milestoneSession.active_files.includes("src/module1.ts"));

  // Now total sessions in DB should be 3 retained + 1 milestone = 4
  const afterSessions = store.getSessions({ workspace: ws, limit: 20 });
  assert.equal(afterSessions.length, 4);
});

test("compactMemories is a no-op when sessions count is at or below threshold", () => {
  const ws = "small-ws";
  store.logSessionSummary({
    workspace: ws,
    summary: "Single initial session",
  });

  const result = store.compactMemories({
    workspace: ws,
    maxSessionsToKeep: 5,
  });
  assert.equal(result.compacted, false);
  assert.equal(result.sessionsCompacted, 0);
  assert.equal(result.milestoneSession, null);
});
