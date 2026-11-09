/**
 * MindGate Security Shield — Node2Shell (CVE-2026-111497) Mitigation Module
 *
 * Protects the MCP Server and developer host against Node2Shell (CVE-2026-111497),
 * a critical (CVSS 9.2) out-of-bounds write (CWE-787) in the Brotli decoder
 * bundled with unpatched Node.js builds and OS-level shared libbrotli packages.
 * Fixed upstream in Node.js 22.23.4 / 24.22.1 / 26.12.1 and Bun >= 1.4.4.
 *
 * Honest scope of the in-process lock (defense-in-depth, NOT a sandbox):
 *  - This process speaks MCP over stdio and never decompresses untrusted
 *    Brotli data, so its real-world exposure is minimal by design.
 *  - The lock replaces the public node:zlib Brotli API surface
 *    (createBrotliDecompress / brotliDecompress / brotliDecompressSync /
 *    BrotliDecompress class) with throwing stubs.
 *  - It cannot intercept code that captured references BEFORE the lock ran,
 *    private/native entry points, or third-party native addons. For that
 *    reason src/index.ts imports ./security/bootstrap.js as its FIRST import,
 *    so the lock is installed before any other module is evaluated.
 *  - Running on a patched runtime remains the only complete mitigation.
 */

import zlib from "node:zlib";

export interface SecurityStatus {
  runtime: "node" | "bun" | "unknown";
  version: string;
  isPatchedRuntime: boolean;
  brotliDecompressionLocked: boolean;
  advisory: string;
}

/**
 * Checks whether a semantic version tuple [major, minor, patch] meets the
 * minimum patched Node.js release for CVE-2026-111497:
 *  - v22.x -> >= 22.23.4
 *  - v24.x -> >= 24.22.1
 *  - v26.x -> >= 26.12.1
 *  - EOL lines (<=20, 21, 23, 25) -> Vulnerable (no official fix)
 */
export function isNodeVersionPatched(versionString: string): boolean {
  const clean = versionString.replace(/^v/, "").split("-")[0];
  const parts = clean.split(".").map((n) => parseInt(n, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
    return false;
  }
  const [major, minor, patch] = parts;

  if (major === 22) {
    return minor > 23 || (minor === 23 && patch >= 4);
  }
  if (major === 24) {
    return minor > 22 || (minor === 22 && patch >= 1);
  }
  if (major === 26) {
    return minor > 12 || (minor === 12 && patch >= 1);
  }
  if (major > 26) {
    return true;
  }
  return false;
}

/**
 * Checks whether Bun version is >= 1.4.4 (patched against CVE-2026-111497).
 */
export function isBunVersionPatched(versionString: string): boolean {
  const clean = versionString.replace(/^v/, "").split("-")[0];
  const parts = clean.split(".").map((n) => parseInt(n, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
    return false;
  }
  const [major, minor, patch] = parts;
  if (major > 1) return true;
  if (major === 1 && minor > 4) return true;
  if (major === 1 && minor === 4 && patch >= 4) return true;
  return false;
}

/**
 * Neutralizes the public node:zlib Brotli decompression API surface inside
 * the MindGate process by replacing those entry points with throwing stubs:
 *
 *   - zlib.createBrotliDecompress (factory)
 *   - zlib.brotliDecompress / zlib.brotliDecompressSync (one-shot)
 *   - zlib.BrotliDecompress (the streaming class — constructor throws)
 *
 * Limitations (documented, by design): this is best-effort in-process
 * hard-locking. It cannot stop native addons or references captured before it
 * ran, which is why the process entry point installs the lock before any
 * other module evaluates the application. A patched runtime is the definitive
 * fix. Compression APIs and unrelated zlib functionality are intentionally
 * left intact.
 */
export function lockBrotliDecompressor(): boolean {
  try {
    const blockedError = () => {
      throw new Error(
        "[MindGate Security] Brotli decompression is disabled to prevent Node2Shell (CVE-2026-111497) exploitation."
      );
    };

    const blockedClass = class BrotliDecompress {
      constructor() {
        blockedError();
      }
    };

    const replaceable: Array<[keyof typeof zlib, unknown]> = [
      ["createBrotliDecompress", blockedError],
      ["brotliDecompress", blockedError],
      ["brotliDecompressSync", blockedError],
      ["BrotliDecompress", blockedClass],
    ];

    for (const [key, value] of replaceable) {
      Object.defineProperty(zlib, key, {
        value,
        writable: false,
        configurable: false,
      });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Enforces Node2Shell protection at startup.
 * Logs warnings to stderr (never stdout, preserving MCP JSON-RPC integrity).
 */
export function enforceNode2ShellProtection(): SecurityStatus {
  const brotliDecompressionLocked = lockBrotliDecompressor();
  const bunVersion = (process.versions as Record<string, string | undefined>).bun;

  if (bunVersion) {
    const isPatched = isBunVersionPatched(bunVersion);
    if (!isPatched) {
      console.error(
        `[MindGate Security Warning] Detected Bun v${bunVersion}, which is vulnerable to Node2Shell (CVE-2026-111497). Please upgrade to Bun >= 1.4.4. In-process Brotli lock is active.`
      );
    }
    return {
      runtime: "bun",
      version: bunVersion,
      isPatchedRuntime: isPatched,
      brotliDecompressionLocked,
      advisory: isPatched
        ? "Patched Bun runtime + Brotli decompression locked."
        : "Unpatched Bun runtime mitigated via in-process Brotli lock. Upgrade to Bun >= 1.4.4 recommended.",
    };
  }

  const nodeVersion = process.versions.node || "0.0.0";
  const isPatched = isNodeVersionPatched(nodeVersion);

  if (!isPatched) {
    console.error(
      `[MindGate Security Warning] Detected Node.js v${nodeVersion}, which is below the patched releases for Node2Shell (CVE-2026-111497: update to >=22.23.4, >=24.22.1, or >=26.12.1). In-process Brotli decompression has been hard-locked to protect this session.`
    );
    if (process.env.MINDGATE_STRICT_NODE2SHELL === "true") {
      console.error(
        "[MindGate Security] Exiting because MINDGATE_STRICT_NODE2SHELL=true is set on an unpatched Node.js runtime."
      );
      process.exit(1);
    }
  }

  return {
    runtime: "node",
    version: nodeVersion,
    isPatchedRuntime: isPatched,
    brotliDecompressionLocked,
    advisory: isPatched
      ? "Patched Node.js runtime + Brotli decompression locked."
      : "Unpatched Node.js runtime mitigated via in-process Brotli lock. Upgrade to Node >=22.23.4, >=24.22.1, or >=26.12.1.",
  };
}
