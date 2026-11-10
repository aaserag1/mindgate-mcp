import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MindGateStore } from "../src/db/memoryStore.js";
import { startDashboardServer } from "../src/ui/dashboardServer.js";

const tmpDir = path.join(os.tmpdir(), `mindgate-dashboard-test-${Date.now()}`);
const dbPath = path.join(tmpDir, "test-dashboard.db");
let store: MindGateStore;
let dashboard: Awaited<ReturnType<typeof startDashboardServer>>;

before(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  store = new MindGateStore(dbPath);
  store.rememberDecision({
    workspace: "ui-test-ws",
    category: "architecture",
    title: "Test Dashboard Memory",
    content: "Content for dashboard test",
  });
  // Use port 0 for dynamic ephemeral port allocation
  dashboard = await startDashboardServer({ port: 0, store });
});

after(async () => {
  if (dashboard) {
    await dashboard.close();
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // cleanup
  }
});

test("dashboard serves HTML root page on 127.0.0.1", async () => {
  const res = await fetch(`${dashboard.url}/`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  const text = await res.text();
  assert.ok(text.includes("MindGate"));
  assert.ok(text.includes("بوابة العقل"));
});

test("dashboard API /api/workspaces lists workspaces", async () => {
  const res = await fetch(`${dashboard.url}/api/workspaces`);
  assert.equal(res.status, 200);
  const data = (await res.json()) as Array<{ workspace: string; memory_count: number }>;
  assert.ok(Array.isArray(data));
  assert.ok(data.some((w) => w.workspace === "ui-test-ws"));
});

test("dashboard API /api/memories creates, searches, and deprecates memory", async () => {
  // 1. POST new memory
  const postRes = await fetch(`${dashboard.url}/api/memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace: "ui-test-ws",
      category: "decision",
      title: "Created via Dashboard API",
      content: "Detailed rationale from UI",
      tags: ["api", "test"],
    }),
  });
  assert.equal(postRes.status, 201);
  const postData = (await postRes.json()) as { record: { id: number; title: string } };
  const memoryId = postData.record.id;
  assert.ok(memoryId > 0);

  // 2. GET /api/memories
  const getRes = await fetch(`${dashboard.url}/api/memories?workspace=ui-test-ws&q=Dashboard`);
  assert.equal(getRes.status, 200);
  const getData = (await getRes.json()) as { memories: Array<{ id: number }> };
  assert.ok(getData.memories.some((m) => m.id === memoryId));

  // 3. POST deprecate
  const depRes = await fetch(`${dashboard.url}/api/memories/${memoryId}/deprecate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "Superseded in UI test" }),
  });
  assert.equal(depRes.status, 200);
  const depData = (await depRes.json()) as { record: { status: string } };
  assert.equal(depData.record.status, "deprecated");

  // 4. DELETE memory
  const delRes = await fetch(`${dashboard.url}/api/memories/${memoryId}`, {
    method: "DELETE",
  });
  assert.equal(delRes.status, 200);
});

test("dashboard API /api/preferences round-trips", async () => {
  const postRes = await fetch(`${dashboard.url}/api/preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: "ui.theme",
      value: "dark",
      category: "ui",
    }),
  });
  assert.equal(postRes.status, 200);

  const getRes = await fetch(`${dashboard.url}/api/preferences`);
  assert.equal(getRes.status, 200);
  const data = (await getRes.json()) as Array<{ key: string; value: string }>;
  assert.ok(data.some((p) => p.key === "ui.theme" && p.value === "dark"));
});
