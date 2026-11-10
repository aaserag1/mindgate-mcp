import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { MindGateStore } from "../src/db/memoryStore.js";
import { getDashboardHtml, startDashboardServer } from "../src/ui/dashboardServer.js";

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
  const html = await res.text();
  assert.ok(html.includes("MindGate"));
  assert.ok(html.includes("بوابة العقل"));
  const csp = res.headers.get("content-security-policy") ?? "";
  const nonce = csp.match(/script-src 'nonce-([^']+)'/)?.[1];
  assert.ok(nonce);
  assert.ok(html.includes(`<script nonce="${nonce}">`));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.doesNotMatch(html, /\son(?:click|input|change)=/i);
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
    headers: { "Content-Type": "application/json", Origin: dashboard.url },
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
    headers: { "Content-Type": "application/json", Origin: dashboard.url },
    body: JSON.stringify({ reason: "Superseded in UI test" }),
  });
  assert.equal(depRes.status, 200);
  const depData = (await depRes.json()) as { record: { status: string } };
  assert.equal(depData.record.status, "deprecated");

  // 4. DELETE memory
  const delRes = await fetch(`${dashboard.url}/api/memories/${memoryId}`, {
    method: "DELETE",
    headers: { Origin: dashboard.url },
  });
  assert.equal(delRes.status, 200);
});

test("dashboard API /api/preferences round-trips", async () => {
  const postRes = await fetch(`${dashboard.url}/api/preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: dashboard.url },
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

test("dashboard rejects DNS rebinding, cross-origin requests, and non-JSON writes", async () => {
  const reboundStatus = await new Promise<number | undefined>((resolve, reject) => {
    http.get(`${dashboard.url}/api/export`, {
      headers: { Host: `rebind.example:${dashboard.port}` },
    }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on("error", reject);
  });
  assert.equal(reboundStatus, 403);

  const exportResponse = await fetch(`${dashboard.url}/api/export`, {
    headers: { Origin: "http://127.0.0.1:1" },
  });
  assert.equal(exportResponse.status, 403);
  assert.equal(exportResponse.headers.get("access-control-allow-origin"), null);

  const writeUrl = `${dashboard.url}/api/preferences`;
  const body = JSON.stringify({ key: "attack", value: "injected" });
  const foreign = await fetch(writeUrl, {
    method: "POST",
    headers: { Origin: "https://attacker.example", "Content-Type": "text/plain" },
    body,
  });
  assert.equal(foreign.status, 403);
  const missingOrigin = await fetch(writeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  assert.equal(missingOrigin.status, 403);
  const nonJson = await fetch(writeUrl, {
    method: "POST",
    headers: { Origin: dashboard.url, "Content-Type": "text/plain" },
    body,
  });
  assert.equal(nonJson.status, 415);
  assert.ok(!store.getUserPreferences().some((p) => p.key === "attack"));
});

test("dashboard renders saved HTML and workspace quotes as literal text", async () => {
  class Element {
    textContent = "";
    children: Element[] = [];
    append(...children: Element[]) { this.children.push(...children); }
    replaceChildren(...children: Element[]) { this.children = children; }
    addEventListener() {}
    set innerHTML(_value: string) { throw new Error("Dashboard tried to parse HTML"); }
  }

  const payload = `"'><img src=x onerror="alert(1)">`;
  const nodes = new Map<string, Element>();
  const document = {
    createElement: () => new Element(),
    getElementById(id: string) {
      if (!nodes.has(id)) nodes.set(id, new Element());
      return nodes.get(id);
    },
  };
  const fixtures: Record<string, unknown> = {
    "/api/workspaces": [{ workspace: payload, memory_count: 1 }],
    "/api/memories": { memories: [{ id: 1, workspace: payload, content: payload }] },
    "/api/sessions": [{ id: 1, summary: payload }],
    "/api/preferences": [{ key: "test", value: payload }],
  };
  const script = getDashboardHtml().match(/<script [^>]+>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  await runInNewContext(script + "\nPromise.all([loadWorkspaces(), loadMemories(), loadSessions(), loadPreferences()])", {
    document,
    URLSearchParams,
    fetch: async (url: string) => ({ json: async () => fixtures[url.split("?")[0]] }),
  });

  function textOf(element: Element): string {
    return element.textContent + element.children.map(textOf).join("");
  }
  for (const id of ["wsBar", "memoriesGrid", "sessionsList", "prefList"]) {
    const node = nodes.get(id);
    assert.ok(node, id);
    assert.ok(textOf(node).includes(payload), id);
  }
});
