/**
 * MindGate Startup Bootstrap (v1.2.1)
 *
 * This module exists so the Node2Shell guard runs BEFORE any other import of
 * the application is evaluated. ES modules are evaluated depth-first in import
 * order, so `src/index.ts` imports this module first — before the MCP SDK,
 * better-sqlite3, or any code that might capture node:zlib references.
 *
 * Do not import this module from anywhere except the process entry point
 * (src/index.ts). Tests and other modules import `node2shellGuard.ts`
 * directly instead.
 */

import { enforceNode2ShellProtection } from "./node2shellGuard.js";

export const securityStatus = enforceNode2ShellProtection();
