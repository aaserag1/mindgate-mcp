# 🧠 MindGate MCP (`v1.1.0`) — بوابة العقل

[![CI](https://github.com/aaserag1/mindgate-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/aaserag1/mindgate-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](./LICENSE)
[![Security: Node2Shell Hardened](https://img.shields.io/badge/Security-Node2Shell%20Hardened-06b6d4.svg)](./SECURITY.md)
[![Version: 1.1.0](https://img.shields.io/badge/MCP-v1.1.0-8b5cf6.svg)](https://github.com/aaserag1/mindgate-mcp)

**Security-Hardened Persistent Cognitive Memory & Context Gateway for AI Agents (Model Context Protocol).**

[🇪🇬 اقرأ التوثيق باللغة العربية](./README.ar.md)

---

## 💡 Why MindGate MCP?

AI coding and workflow agents (**Antigravity**, **Cursor**, **Claude Desktop**, **Windsurf**, **Cline**) suffer from two critical limitations:

1. **Cross-Session Context Amnesia:** Every new chat starts from zero—forgetting architectural decisions, debugging root causes, coding conventions, and session handoffs.
2. **Prompt-to-Shell (`Node2Shell`) & Secret Leakage Risks:** Unsanitized MCP memory servers can store leaked API keys in plaintext or ingest poisoned instructions that trick agents into executing destructive shell commands.

**MindGate MCP** solves both problems in a single, zero-cloud local server:
- 🗄️ **Blazing-Fast Local SQLite + FTS5 BM25 Search:** Instant full-text retrieval of architectural decisions, bugfixes, conventions, preferences, and session handoffs.
- 🔄 **Auto-Compiled Workspace Rules (`AGENTS.md` / `.cursorrules` / `CLAUDE.md`) — New in `v1.1.0`:** Automatically compiles your stored decisions, conventions, and bugfixes into a structured rules file so any AI agent immediately inherits project context.
- ✏️ **In-Place Memory Updates & Portable JSON Snapshots — New in `v1.1.0`:** Update evolving architectural decisions in place (`update_memory`) while keeping FTS5 indexes in sync, and export full JSON backups (`export_memory_snapshot`).
- 🛡️ **Built-in Node2Shell Security Guard:** Bi-directional inspection that blocks command-injection payloads (`curl | bash`, reverse shells, `child_process.exec`), detects prompt injection attempts, and automatically redacts secrets (`OpenAI`, `GitHub`, `AWS`, `JWT`, `Private Keys`) before they touch disk.

---

## 🛠️ MCP Tools Included (10 Tools)

| Tool Name | Description |
| :--- | :--- |
| `store_memory` | Store a persistent memory item with automatic secret redaction and Node2Shell screening |
| `update_memory` | **[New in v1.1]** Update an existing memory in-place by ID while syncing FTS5 search indexes |
| `recall_memory` | Search and rank stored memories using SQLite FTS5 BM25 full-text search + project/category filters |
| `delete_memory` | Remove an obsolete memory entry by its ID |
| `save_session_handoff` | Save a structured session handoff summary (completed tasks, blockers, next steps) |
| `get_project_context` | One-call retrieval of top project memories, recent session handoffs, and user preferences |
| `sync_workspace_rules` | **[New in v1.1]** Auto-generate `AGENTS.md`, `.cursorrules`, or `CLAUDE.md` from stored project memories |
| `export_memory_snapshot` | **[New in v1.1]** Export a portable JSON snapshot of memories, session handoffs, and preferences |
| `set_preference` | Save or update a persistent global developer preference (`key`/`value`) |
| `security_audit_text` | Audit any text or command snippet against Node2Shell and secret-leak rules |

---

## 📦 MCP Resources & Prompts

### Resources
- `mindgate://stats` — Live JSON telemetry of total memories, sessions, preferences, and category breakdown.
- `mindgate://security/policy` — Active Node2Shell security policy & protection status.
- `mindgate://rules/agents-md` — **[New in v1.1]** Live auto-compiled `AGENTS.md` rules preview from your stored memories.

### Prompts
- `bootstrap_session` — Ready-to-use prompt that instructs the AI agent to load full project context at session start.
- `handoff_session` — Ready-to-use prompt that summarizes work and stores a clean handoff before closing.

---

## 🚀 Quick Start

### Option 1: Zero-Install via `npx` (once published to npm)

```bash
npx -y mindgate-mcp --init
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
        "MINDGATE_DB_DIR": "C:\\Users\\YOUR_USER\\.mindgate-mcp"
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
npm run typecheck
npm test
```

---

## 📄 License

Released under the [MIT License](./LICENSE).
