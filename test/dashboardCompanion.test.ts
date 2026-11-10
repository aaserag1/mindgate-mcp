import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function bindPort(port = 0) {
  const listener = http.createServer();
  listener.listen(port, "127.0.0.1");
  await once(listener, "listening");
  return listener;
}

function connectClient(port: number) {
  const entrypoint = fileURLToPath(new URL("../src/index.ts", import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", entrypoint, "--open-dashboard", "--port", String(port)],
    env: { MINDGATE_DB_PATH: ":memory:" },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });
  const client = new Client({ name: "dashboard-companion-test", version: "1.0.0" });
  return {
    client,
    ready: client.connect(transport),
    async waitForLog(message: string) {
      const deadline = Date.now() + 6_000;
      while (!stderr.includes(message) && Date.now() < deadline) await delay(25);
      assert.ok(stderr.includes(message), `Expected ${message} in stderr. Got: ${stderr}`);
    },
  };
}

test("dashboard companions share the port, take over on exit, and stop with the MCP clients", { timeout: 15_000 }, async (t) => {
  // Occupy the port initially so the integration test never launches the browser.
  const blocker = await bindPort();
  t.after(() => blocker.close());
  const address = blocker.address();
  assert.ok(address && typeof address === "object");
  const { port } = address;
  const url = `http://127.0.0.1:${port}`;
  const busy = `Dashboard port ${port} is in use`;

  const first = connectClient(port);
  t.after(() => first.client.close());
  await first.ready;
  assert.ok((await first.client.listTools()).tools.some((tool) => tool.name === "recall_context"));
  await first.waitForLog(busy);
  blocker.close();
  await first.waitForLog(`Dashboard: ${url}`);
  assert.equal((await fetch(url)).status, 200);

  const second = connectClient(port);
  t.after(() => second.client.close());
  await second.ready;
  await second.waitForLog(busy);
  await first.client.close();
  await second.waitForLog(`Dashboard: ${url}`);
  assert.equal((await fetch(url)).status, 200);

  await second.client.close();
  const reusablePort = await bindPort(port);
  reusablePort.close();
});
