import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  MindGateStore,
  todayIso,
  addDaysIso,
  daysBetweenIso,
} from "../src/db/memoryStore.js";
import { optionalReviewDate } from "../src/validation.js";

const tmpDir = path.join(os.tmpdir(), `mindgate-assumptions-test-${Date.now()}`);
const dbPath = path.join(tmpDir, "test-assumptions.db");
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

test("recordAssumption stores owner and review_date, and defaults review to +30 days", () => {
  const { record, defaulted_review_date } = store.recordAssumption({
    workspace: "assump-ws",
    title: "API rate limit is 100 req/min",
    content: "The vendor docs state 100 requests per minute for our plan.",
    owner: "ahmed",
    reviewDate: addDaysIso(todayIso(), 10),
  });
  assert.equal(record.category, "assumption");
  assert.equal(record.status, "active");
  assert.equal(record.owner, "ahmed");
  assert.equal(record.review_date, addDaysIso(todayIso(), 10));
  assert.equal(defaulted_review_date, false);

  const { record: defaulted, defaulted_review_date: wasDefaulted } =
    store.recordAssumption({
      workspace: "assump-ws",
      title: "Node 24 is the pinned runtime",
      content: "CI and local dev both use Node 24.",
    });
  assert.equal(wasDefaulted, true);
  assert.equal(defaulted.review_date, addDaysIso(todayIso(), 30));
  assert.equal(defaulted.owner, "");
});

test("reviewAssumptions returns only overdue ones, plus the due-soon count", () => {
  const ws = "review-ws";
  const overdue = store.recordAssumption({
    workspace: ws,
    title: "Overdue: vendor SLA is 99.9%",
    content: "SLA from the 2024 contract.",
    owner: "ops",
    reviewDate: addDaysIso(todayIso(), -5),
  });
  const dueSoon = store.recordAssumption({
    workspace: ws,
    title: "Due soon: Postgres 16 is the prod version",
    content: "Prod runs Postgres 16.",
    owner: "dba",
    reviewDate: addDaysIso(todayIso(), 3),
  });
  store.recordAssumption({
    workspace: ws,
    title: "Not due: region is eu-central-1",
    content: "All infra lives in eu-central-1.",
    owner: "infra",
    reviewDate: addDaysIso(todayIso(), 30),
  });
  // A non-assumption memory with an old date must never show up here.
  store.rememberDecision({
    workspace: ws,
    title: "Old decision, not an assumption",
    content: "Decisions have no review date.",
  });

  const result = store.reviewAssumptions({ workspace: ws, includeGlobal: false });

  assert.equal(result.overdue.length, 1);
  assert.equal(result.overdue[0].id, overdue.record.id);
  assert.equal(result.overdue[0].title, "Overdue: vendor SLA is 99.9%");
  assert.equal(result.overdue[0].owner, "ops");
  assert.equal(result.overdue[0].review_date, addDaysIso(todayIso(), -5));
  assert.equal(result.overdue[0].days_overdue, 5);

  assert.equal(result.due_soon_count, 1);
  assert.equal(result.due_soon.length, 1);
  assert.equal(result.due_soon[0].id, dueSoon.record.id);
  assert.equal(result.due_soon[0].days_until_review, 3);

  // Nothing due today-or-past is counted as due soon, and vice versa.
  assert.ok(!result.due_soon.some((m) => m.id === overdue.record.id));
  assert.ok(!result.overdue.some((m) => m.id === dueSoon.record.id));
});

test("confirmAssumption extends the review date in place", () => {
  const { record } = store.recordAssumption({
    workspace: "confirm-ws",
    title: "Confirm me: cache TTL is 60s",
    content: "CDN cache TTL is 60 seconds.",
    owner: "perf",
    reviewDate: addDaysIso(todayIso(), -1),
  });

  const confirmed = store.confirmAssumption({
    id: record.id,
    action: "confirm",
  });
  assert.ok(confirmed);
  assert.equal(confirmed.action, "confirmed");
  assert.equal(confirmed.record.id, record.id);
  assert.equal(confirmed.record.status, "active");
  assert.equal(confirmed.record.review_date, addDaysIso(todayIso(), 30));
  assert.equal(confirmed.record.content, "CDN cache TTL is 60 seconds.");

  // No longer overdue after confirming.
  const { overdue } = store.reviewAssumptions({ workspace: "confirm-ws", includeGlobal: false });
  assert.ok(!overdue.some((m) => m.id === record.id));

  // Confirming a missing id, or a non-assumption, returns null.
  assert.equal(store.confirmAssumption({ id: 999_999, action: "confirm" }), null);
  const dec = store.rememberDecision({
    workspace: "confirm-ws",
    title: "A plain decision",
    content: "Not an assumption.",
  });
  assert.equal(store.confirmAssumption({ id: dec.record.id, action: "confirm" }), null);
});

test("confirmAssumption replace supersedes the old record and keeps it for audit", () => {
  const { record } = store.recordAssumption({
    workspace: "replace-ws",
    title: "Replace me: free tier allows 5 seats",
    content: "Free tier allows 5 seats per workspace.",
    owner: "billing",
    reviewDate: addDaysIso(todayIso(), -2),
  });

  const replaced = store.confirmAssumption({
    id: record.id,
    action: "replace",
    content: "Free tier allows 3 seats per workspace (changed March 2026).",
    reviewDate: addDaysIso(todayIso(), 60),
  });
  assert.ok(replaced);
  assert.equal(replaced.action, "replaced");
  assert.notEqual(replaced.record.id, record.id);
  assert.equal(replaced.record.status, "active");
  assert.equal(replaced.record.supersedes, String(record.id));
  assert.equal(replaced.record.content, "Free tier allows 3 seats per workspace (changed March 2026).");
  assert.equal(replaced.record.owner, "billing");
  assert.equal(replaced.record.review_date, addDaysIso(todayIso(), 60));

  // Old record is superseded and linked to the replacement.
  const all = store.recallContext({ workspace: "replace-ws", status: "all" });
  const old = all.memories.find((m) => m.id === record.id);
  assert.ok(old);
  assert.equal(old.status, "superseded");
  assert.equal(old.superseded_by, replaced.record.id);

  // Default recall shows the replacement, not the old record.
  const active = store.recallContext({ workspace: "replace-ws" });
  assert.ok(active.memories.some((m) => m.id === replaced.record.id));
  assert.ok(!active.memories.some((m) => m.id === record.id));
});

test("migration adds review_date and owner columns to a pre-existing old-format DB", () => {
  const oldDbPath = path.join(tmpDir, "old-format.db");
  const raw = new Database(oldDbPath);
  raw.exec(`
    CREATE TABLE memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace TEXT NOT NULL DEFAULT 'global',
      category TEXT NOT NULL DEFAULT 'decision',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      source_agent TEXT NOT NULL DEFAULT 'unknown',
      status TEXT NOT NULL DEFAULT 'active',
      supersedes TEXT NOT NULL DEFAULT '',
      superseded_by INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO memories (workspace, category, title, content)
    VALUES ('legacy-ws', 'decision', 'Legacy decision', 'Written before the ledger existed.');
  `);
  raw.close();

  const migrated = new MindGateStore(oldDbPath);
  const columns = (
    migrated as unknown as { db: Database.Database }
  ).db.pragma("table_info(memories)") as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));
  assert.ok(names.has("review_date"));
  assert.ok(names.has("owner"));

  // The legacy row survives, with ledger fields defaulted.
  const recalled = migrated.recallContext({ workspace: "legacy-ws" });
  assert.equal(recalled.memories.length, 1);
  assert.equal(recalled.memories[0].title, "Legacy decision");
  assert.equal(recalled.memories[0].review_date, null);
  assert.equal(recalled.memories[0].owner, "");
});

test("recallContext excludes expired assumptions from active context but lists them for review", () => {
  const ws = "recall-ws";
  const overdue = store.recordAssumption({
    workspace: ws,
    title: "StaleUniqueWord: vendor supports TLS 1.2 only",
    content: "StaleUniqueWord vendor requires TLS 1.2 and nothing newer.",
    owner: "sec",
    reviewDate: addDaysIso(todayIso(), -3),
  });
  const current = store.recordAssumption({
    workspace: ws,
    title: "Current: vendor supports TLS 1.3",
    content: "The other vendor supports TLS 1.3.",
    owner: "sec",
    reviewDate: addDaysIso(todayIso(), 20),
  });
  const dec = store.rememberDecision({
    workspace: ws,
    title: "Use TLS 1.3 everywhere",
    content: "All services negotiate TLS 1.3.",
  });

  // Plain recall: expired assumption is quarantined, the rest is usable.
  const recalled = store.recallContext({ workspace: ws, includeGlobal: false });
  assert.ok(!recalled.memories.some((m) => m.id === overdue.record.id));
  assert.ok(recalled.memories.some((m) => m.id === current.record.id));
  assert.ok(recalled.memories.some((m) => m.id === dec.record.id));
  assert.equal(recalled.assumptions_needing_review.length, 1);
  assert.equal(recalled.assumptions_needing_review[0].id, overdue.record.id);
  assert.ok(recalled.assumptions_review_notice?.includes("1 assumption(s) need review"));

  // FTS search that matches ONLY the expired assumption still cannot leak it
  // into the active context — it stays in the review section.
  const searched = store.recallContext({
    workspace: ws,
    query: "StaleUniqueWord",
    includeGlobal: false,
  });
  assert.ok(!searched.memories.some((m) => m.id === overdue.record.id));
  assert.ok(searched.assumptions_needing_review.some((m) => m.id === overdue.record.id));

  // Nothing overdue: the review section is empty and the notice is null.
  const clean = store.recallContext({ workspace: "assump-ws", includeGlobal: false });
  assert.equal(clean.assumptions_needing_review.length, 0);
  assert.equal(clean.assumptions_review_notice, null);
});

test("optionalReviewDate accepts real ISO dates and rejects bad ones", () => {
  assert.equal(optionalReviewDate("2026-12-31"), "2026-12-31");
  assert.equal(optionalReviewDate(undefined), undefined);
  assert.throws(() => optionalReviewDate("31/12/2026"), /ISO date/);
  assert.throws(() => optionalReviewDate("2026-13-01"), /not a real calendar date/);
  assert.throws(() => optionalReviewDate("2026-02-30"), /not a real calendar date/);
  assert.throws(() => optionalReviewDate(20261231), /ISO date/);
});

test("date helpers round-trip correctly", () => {
  assert.equal(addDaysIso("2026-01-31", 1), "2026-02-01");
  assert.equal(addDaysIso("2026-11-23", 30), "2026-12-23");
  assert.equal(daysBetweenIso("2026-11-18", "2026-11-23"), 5);
  assert.equal(daysBetweenIso("2026-11-23", "2026-11-18"), -5);
});
