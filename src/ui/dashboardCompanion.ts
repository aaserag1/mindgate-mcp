import { spawn } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { MindGateStore } from "../db/memoryStore.js";
import { startDashboardServer } from "./dashboardServer.js";

export function launchDashboardCompanion(entrypoint: string, port: number): void {
  // In development, the TypeScript entry point needs the parent's loader.
  const loaderArgs = entrypoint.endsWith(".ts") ? process.execArgv : [];
  const args = [...loaderArgs, entrypoint, "ui", "--mcp-companion", "--port", String(port)];
  const child = spawn(process.execPath, args, {
    stdio: ["pipe", "ignore", "inherit"],
    windowsHide: true,
  });
  child.on("error", (err) => console.error("[MindGate] Could not start dashboard:", err.message));
  child.stdin?.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code !== "EPIPE") console.error("[MindGate] Dashboard pipe:", err.message);
  });
  const disconnect = () => child.stdin?.end();
  process.stdin.once("end", disconnect);
  process.stdin.once("error", disconnect);
  child.once("close", () => {
    process.stdin.off("end", disconnect);
    process.stdin.off("error", disconnect);
  });
  if (process.stdin.readableEnded) disconnect();
}

export async function runDashboardCompanion(port: number, store: MindGateStore): Promise<void> {
  // EOF also arrives when the MCP parent is killed, so no standalone UI is left behind.
  process.stdin.once("end", () => process.exit(0));
  process.stdin.once("error", () => process.exit(0));
  process.stdin.resume();

  let portWasBusy = false;
  while (true) {
    try {
      const { url } = await startDashboardServer({ port, store });
      console.error(`[MindGate] Dashboard: ${url}`);
      // A second client takes over the address if it frees up, without opening another tab.
      if (!portWasBusy) openDashboard(url);
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err;
      if (!portWasBusy) console.error(`[MindGate] Dashboard port ${port} is in use. Waiting for it to free up.`);
      portWasBusy = true;
      await delay(2_000);
    }
  }
}

function openDashboard(url: string): void {
  let command: string;
  let args: string[];
  if (process.platform === "win32") {
    command = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "rundll32.exe");
    args = ["url.dll,FileProtocolHandler", url];
  } else {
    command = process.platform === "darwin" ? "/usr/bin/open" : "xdg-open";
    args = [url];
  }
  const browser = spawn(command, args, { stdio: "ignore", detached: true, windowsHide: true });
  browser.on("error", (err) => console.error(`[MindGate] Open ${url} in your browser: ${err.message}`));
  browser.on("exit", (code) => {
    if (code) console.error(`[MindGate] Could not open the browser. Dashboard: ${url}`);
  });
  browser.unref();
}
