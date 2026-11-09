# 🧠 MindGate MCP (`v1.2.0`) — بوابة العقل

[![CI](https://github.com/aaserag1/mindgate-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/aaserag1/mindgate-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](./LICENSE)
[![Security: Node2Shell Hardened](https://img.shields.io/badge/Security-Node2Shell%20Hardened-06b6d4.svg)](./SECURITY.md)
[![Version: 1.2.0](https://img.shields.io/badge/MCP-v1.2.0-8b5cf6.svg)](https://github.com/aaserag1/mindgate-mcp)

**Local-First Persistent Memory & Context Gateway for AI Agents (Model Context Protocol).**

[🇪🇬 اقرأ التوثيق باللغة العربية](./README.ar.md)

---

## 💡 Why MindGate MCP?

AI coding and workflow agents (**Antigravity**, **Cursor**, **Claude Desktop**, **Windsurf**, **Cline**) suffer from two critical limitations:

1. **Cross-Session Context Amnesia:** Every new chat starts from zero—forgetting architectural decisions, debugging root causes, coding conventions, and session handoffs.
2. **Secret Leakage & Prompt-Infected Stores:** Memory servers that persist raw agent output can end up storing leaked API keys and acting as a confused-deputy for poisoned instructions.

**MindGate MCP** addresses both in a single, zero-cloud local server:
- 🗄️ **Blazing-Fast Local SQLite + FTS5 BM25 Search:** Instant full-text retrieval of architectural decisions, bugfixes, conventions, preferences, and session handoffs.
- 🔄 **Auto-Compiled Workspace Rules (`AGENTS.md` / `.cursorrules` / `CLAUDE.md`):** Compiles your stored decisions, conventions, and bugfixes into a structured rules file so any AI agent immediately inherits project context. Writes are atomic, existing files are backed up (`.bak-<timestamp>`), and hand-written files are never overwritten without `force: true`.
- ✏️ **In-Place Memory Updates & Portable JSON Snapshots:** Update evolving decisions in place (`update_memory`) while keeping FTS5 indexes in sync, and export full JSON backups (`export_memory_snapshot`).
- 🔒 **Secret Redaction On Write:** Well-known token patterns (OpenAI, GitHub, AWS, Slack, Google, JWT, PEM private keys) are masked with `[REDACTED:<kind>]` before anything touches disk — in memories, session handoffs, and preferences. Tool responses report a `redacted_secrets` count. Disable with `MINDGATE_REDACT_SECRETS=false` (not recommended).
- 🛡️ **Node2Shell (CVE-2026-111497) Mitigations:** stdio-only transport (zero HTTP attack surface), runtime version check against the patched releases (22.23.4 / 24.22.1 / 26.12.1, Bun ≥ 1.4.4), and a best-effort in-process lock of the public `node:zlib` Brotli decompression API installed before any other module loads. See [SECURITY.md](./SECURITY.md) for the honest threat model and limitations.

> ⚠️ MindGate does **not** execute shell commands, does **not** open network sockets, and does **not** attempt to detect prompt injection in arbitrary text. Memories you store are embedded verbatim into generated rules files — treat stored memories as you would any local notes file, and review generated rules before committing them.

---

## 🏛️ Architecture — How MindGate Works

```mermaid
flowchart TB
    subgraph Clients["MCP Clients (any of them)"]
        A1["Antigravity"]
        A2["Cursor"]
        A3["Claude Desktop"]
        A4["OpenCode / Codex / Windsurf"]
    end

    subgraph Server["MindGate MCP Server — 100% local"]
        direction TB
        BOOT["1 · security/bootstrap.ts — first import<br/>locks the node:zlib Brotli API<br/>+ runtime version check (CVE-2026-111497)"]
        TOOLS["2 · index.ts — MCP handlers<br/>10 tools · 2 resources · 1 prompt<br/>stdio JSON-RPC only"]
        VALID["3 · validation.ts<br/>type + range + size limits<br/>invalid input → isError: true"]
        REDACT["4 · security/secretRedactor.ts<br/>sk-…, AKIA…, JWT, PEM → [REDACTED:kind]"]
        STORE["5 · db/memoryStore.ts<br/>SQLite (WAL) + FTS5 BM25<br/>triggers keep the index in sync"]
        RULES["6 · rulesSync.ts<br/>atomic write + .bak backup<br/>hand-written files protected (sentinel)"]
        BOOT --> TOOLS
        TOOLS --> VALID
        VALID --> REDACT
        REDACT --> STORE
        VALID --> RULES
        STORE --> RULES
    end

    DB[("Local filesystem<br/>~/.mindgate/mindgate.db<br/>file chmod 600 · dir chmod 700")]
    PROJ["Project workspace<br/>AGENTS.md · CLAUDE.md · .cursorrules"]

    Clients <-->|"stdio JSON-RPC only<br/>no network · no HTTP"| BOOT
    STORE <--> DB
    RULES -->|"write / backup"| PROJ
```

**Request lifecycle (numbered as in the diagram):**

1. Any MCP client spawns `mindgate-mcp` as a child process. All communication is newline-delimited JSON-RPC over **stdio** — no sockets, no HTTP, no telemetry.
2. The first module evaluated is `src/security/bootstrap.ts` (imported before everything else): it hard-locks the public `node:zlib` Brotli decompression API and checks the Node/Bun version against the patched releases for CVE-2026-111497.
3. Every tool call is validated at runtime — types, ranges, size limits, positive IDs. Invalid input returns an MCP tool error (`isError: true`) with a descriptive message, never a crash.
4. On write paths (remember / update / session handoff / preferences), secrets are redacted **before** anything touches disk.
5. Storage is embedded SQLite + FTS5 (`better-sqlite3`) at `~/.mindgate/mindgate.db` — WAL mode, owner-only permissions. Insert/update/delete triggers keep the FTS index in sync automatically.
6. `sync_workspace_rules` compiles memories → Markdown and writes it atomically (temp file + rename) with a timestamped `.bak-<timestamp>` backup; files without the `<!-- mindgate:auto-generated -->` marker are never overwritten unless `force: true`.

> Trust boundaries: memories are **data, not instructions**; secret redaction is best-effort pattern matching; the Brotli lock is defense-in-depth. See [SECURITY.md](./SECURITY.md) for the full threat model.

---

## 🛠️ MCP Tools Included (10 Tools)

| Tool Name | Description |
| :--- | :--- |
| `remember_decision` | Store a persistent memory (architecture / decision / bugfix / convention / context) with automatic secret redaction |
| `update_memory` | Update an existing memory in-place by ID while keeping FTS5 search indexes in sync |
| `recall_context` | Search memories with FTS5 BM25 full-text ranking + workspace/category filters. When no query matches, falls back to most-recent memories and flags it (`search.fallback: true`) |
| `log_session_summary` | Save a structured session handoff (summary, next steps, active files) for the next agent to resume |
| `sync_workspace_rules` | Generate `AGENTS.md`, `.cursorrules`, `CLAUDE.md`, `.windsurfrules`, or `MINDGATE_CONTEXT.md` from stored memories. Atomic write, `.bak` backup, hand-written files protected unless `force: true` |
| `export_memory_snapshot` | Export a portable JSON backup of memories, session handoffs, and preferences |
| `set_user_preference` | Save or update a persistent developer preference (`key`/`value`) |
| `get_user_preferences` | Retrieve all saved preferences, optionally filtered by `category` |
| `list_workspaces` | List all workspaces with memory counts and last-updated timestamps |
| `delete_memory` | Delete an outdated or superseded memory by its ID |

All tool arguments are validated at runtime; invalid input returns an MCP tool error (`isError: true`) with a descriptive message instead of a protocol error.

---

## 📦 MCP Resources & Prompts

### Resources
- `mindgate://context/latest` — Snapshot of recent memories, latest cross-agent session handoff, and developer preferences (JSON).
- `mindgate://rules/agents-md` — Live auto-compiled `AGENTS.md` rules preview (Markdown).

### Prompts
- `mindgate-bootstrap` — Loads persistent project memory, preferences, and the latest session handoff at session start. Argument: `workspace` (optional).

---

## ⚙️ Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `MINDGATE_DB_PATH` | `~/.mindgate/mindgate.db` | Absolute path of the SQLite database file. Parent directory is created automatically (`0700`). |
| `MINDGATE_DEFAULT_WORKSPACE` | `global` | Default workspace when a tool call omits `workspace`. |
| `MINDGATE_REDACT_SECRETS` | `true` | Set to `false` to disable secret redaction on write (not recommended). |
| `MINDGATE_STRICT_NODE2SHELL` | `false` | Set to `true` to refuse starting on an unpatched Node.js runtime. |

Database files are created with owner-only permissions (`0600` file, `0700` directory). Contents are **plaintext by design** — treat the database like any local credential store.

---

## 🚀 Quick Start

### Option 1: Zero-Install via `npx` (once published to npm)

```bash
npx -y mindgate-mcp init
```

### Option 2: Build from Source (Windows / macOS / Linux)

```bash
git clone https://github.com/aaserag1/mindgate-mcp.git
cd mindgate-mcp
npm install
npm run build

# Print ready-to-paste MCP client configuration
npm run init-config
```

### Configure in Antigravity / Cursor / Claude Desktop (Windows Example)

```json
{
  "mcpServers": {
    "mindgate": {
      "command": "node",
      "args": ["C:\\path\\to\\mindgate-mcp\\dist\\index.js"],
      "env": {
        "MINDGATE_DB_PATH": "C:\\Users\\YOUR_USER\\.mindgate\\mindgate.db"
      }
    }
  }
}
```

### Configure via `npx` (Cross-Platform 1-Liner)

```json
{
  "mcpServers": {
    "mindgate": {
      "command": "npx",
      "args": ["-y", "mindgate-mcp"]
    }
  }
}
```

---

## 🧪 Testing & Verification

```bash
npm run typecheck   # TypeScript --noEmit
npm test            # node:test unit/integration suite (SQLite + FTS5)
npm run build       # emit dist/
```

CI (GitHub Actions) runs install, typecheck, tests, and build on Node 22.x, 24.x, and 26.x.

---

## 📄 License

Released under the [MIT License](./LICENSE).
