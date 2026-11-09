# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.2.x   | :white_check_mark: |
| 1.1.x   | :x: (upgrade to 1.2.x) |
| ≤ 1.0.x | :x:                |

---

## 🛡️ Node2Shell (CVE-2026-111497) Defense Architecture

MindGate was built with a layered, local-first defense model against **Node2Shell (CVE-2026-111497)**, a critical (CVSS 9.2) out-of-bounds write (CWE-787) in the Brotli decoder bundled with unpatched Node.js builds and OS-level shared libbrotli packages, fixed upstream in Node.js **22.23.4 / 24.22.1 / 26.12.1** and Bun **≥ 1.4.4**.

- **Zero-HTTP attack surface:** MindGate communicates exclusively over local `stdio` (JSON-RPC). It never opens a network listener.
- **Runtime version check:** On startup the server inspects `process.versions.node` / Bun and prints a warning (never on stdout, to protect the JSON-RPC channel) when the runtime is below the patched releases. Set `MINDGATE_STRICT_NODE2SHELL=true` to refuse starting on an unpatched Node.js runtime.
- **In-process Brotli hard-lock (defense-in-depth, not a sandbox):** the public `node:zlib` Brotli decompression API surface is replaced with throwing stubs — `createBrotliDecompress`, `brotliDecompress`, `brotliDecompressSync`, and the streaming `BrotliDecompress` class. The lock is installed by `src/security/bootstrap.ts`, which `src/index.ts` imports **before every other module**, so nothing evaluates first.
  - *Honest limitation:* the lock cannot stop third-party native addons or references captured before it ran, and Node.js itself may hold internal decoder handles. It is a mitigation layer, not a security boundary. Running on a patched runtime is the definitive fix. Since MindGate never decompresses untrusted Brotli data, its real-world exposure is minimal by design even without the lock.

## 🔒 Secret Handling

- Well-known secret patterns (OpenAI `sk-…`, GitHub `ghp_…`/`github_pat_…`, AWS `AKIA…`/`ASIA…`, Slack `xox…`, Google `AIza…`, JWTs, PEM private key blocks) are **redacted before anything is written to disk**, in memories, session handoffs, and preferences alike. Redactions are best-effort and pattern-based; they are not a substitute for not pasting secrets into AI tools. `MINDGATE_REDACT_SECRETS=false` disables redaction (not recommended).
- Tool responses include a `redacted_secrets` count so agents can report when masking occurred.
- The database lives at `~/.mindgate/mindgate.db` (override with `MINDGATE_DB_PATH`). The directory is created `0700` and the database file is `chmod 600`. Contents are **plaintext by design** — treat the file like any other local credential store.

## ⚠️ Trust Model: Memories Are Data, Not Instructions

Any connected MCP client can write memories, and generated rules files embed memory content. A compromised or prompt-injected agent could plant instructions that later agents read as project rules. Mitigations shipped in v1.2.0:

- `sync_workspace_rules` never overwrites a hand-written rules file without `force: true` (sentinel-marker detection), always creates a timestamped `.bak-<timestamp>` backup, writes atomically (temp file + rename), and labels embedded entries as verbatim data, not instructions.
- Secrets are redacted on write (see above).
- There is no network egress and no code execution surface in MindGate itself.

Users should still review generated `AGENTS.md`/`CLAUDE.md` diffs before committing them.

---

## 🔒 Reporting a Vulnerability

If you discover a security vulnerability or exploit within MindGate:
1. Please **do not** open a public issue.
2. Email details and reproduction steps to the maintainer directly at [aadelserag00@gmail.com](mailto:aadelserag00@gmail.com) or submit a private security advisory through GitHub.
3. We will review and publish a patched release promptly.
