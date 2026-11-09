# MindGate MCP — Community Launch Posts

> Ready-to-publish copy for launch day. All claims match v1.2.0 exactly.
> Links: repo → https://github.com/aaserag1/mindgate-mcp · npm: `mindgate-mcp`

---

## 1. Hacker News — Show HN

**Title:**
Show HN: MindGate – a local-first, single-file memory for every AI coding agent (MCP)

**Body:**

AI coding agents start from zero every session. Each one re-derives your architecture decisions, re-fixes the same class of bugs, and forgets what the previous agent did — even on the same repo, even in the same week.

MindGate is a tiny MCP server that gives all of them one shared, persistent memory on your own machine: an embedded SQLite + FTS5 (BM25) store with 10 tools over stdio. No network, no accounts, no cloud.

What it does:
- `remember_decision` / `update_memory` / `recall_context` — store and BM25-rank architecture decisions, bugfixes, conventions, context
- `log_session_summary` — structured handoffs (summary, next steps, active files) so Cursor → Codex → Antigravity resume from the same state
- `sync_workspace_rules` — compiles memory into AGENTS.md / CLAUDE.md / .cursorrules. Atomic write, timestamped `.bak` backup, and it refuses to overwrite hand-written files without an explicit `force: true`
- Secret redaction on write (OpenAI/GitHub/AWS/Slack/Google keys, JWTs, PEM blocks → `[REDACTED:kind]`)
- Mitigations for CVE-2026-111497 (Node2Shell): stdio-only, runtime version enforcement, and a Brotli hard-lock installed before any other module loads

Honest limits, stated in SECURITY.md: redaction is pattern-based best-effort; memories are data, not instructions; the Brotli lock is defense-in-depth, a patched runtime is the real fix. The tool never phones home — it has no network code.

Stack: TypeScript, better-sqlite3, @modelcontextprotocol/sdk. MIT. v1.2.0 has 29 tests (real SQLite + FTS5).

Repo: https://github.com/aaserag1/mindgate-mcp

I'd love feedback on the trust model (how much should an agent be allowed to *act* on stored memories?) and on whether the AGENTS.md compiler output is useful in real repos.

---

## 2. Reddit — r/programming / r/ClaudeAI / r/LocalLLaMA

**Title:**
MindGate – local-first MCP memory so your AI coding agents stop starting from zero

**Body:**

If you use more than one AI coding agent on the same repo (looking at you, Cursor + Claude Code + Codex), you've felt this: every agent is amnesiac. MindGate fixes that with one shared local memory file.

- **Local-first**: SQLite + FTS5 BM25, `chmod 600`, zero network code
- **Shared across agents**: any MCP stdio client plugs in (Antigravity, Cursor, Claude Desktop, OpenCode, Codex, Windsurf, Cline)
- **Handoffs**: structured session summaries so session #2 starts where session #1 ended
- **Safe file writes**: atomic, `.bak` backups, hand-written AGENTS.md protected unless `force: true`
- **Secret redaction** on write (pattern-based, best-effort — documented as such)
- MIT, v1.2.0, 29 passing tests

Repo & docs (EN/AR): https://github.com/aaserag1/mindgate-mcp

Not affiliated with any model vendor. Feedback welcome — especially from people running multi-agent workflows.

---

## 3. X / Twitter — thread

1/ Your AI coding agent forgets everything between sessions.
Build the same decision twice.
Fix the same bug twice.
Explain your architecture to a goldfish.
We built MindGate to fix exactly that. 🧵

2/ MindGate = one local, persistent memory shared by EVERY AI coding agent on your machine.
Antigravity, Cursor, Claude, Codex, Windsurf — one brain, over MCP.
SQLite + FTS5 BM25. No cloud. MIT.

3/ What it remembers:
→ architecture decisions
→ bugfix root causes
→ code conventions
→ session handoffs (summary + next steps + active files)
→ your preferences

4/ What it does NOT do:
✗ no network calls, ever
✗ won't overwrite your hand-written AGENTS.md (unless force:true)
✗ won't store your API keys raw (redacted on write)

5/ `npx -y mindgate-mcp init` → paste config → done.
29 tests, CI on Node 22/24/26.
GitHub: https://github.com/aaserag1/mindgate-mcp

---

## 4. LinkedIn

AI coding agents are brilliant — for about one session. Then they forget your architecture, your conventions, and yesterday's bugfix.

MindGate is an open-source (MIT) MCP memory layer that gives every AI agent on your machine one persistent, local brain: SQLite + FTS5 BM25, stdio-only, zero cloud.

It remembers decisions, bugfixes and handoffs — and can compile them into your AGENTS.md automatically, with atomic writes and backups, never silently overwriting your files.

Built for engineering teams that care about privacy (everything stays on your disk, file permissions 600) and about not re-litigating the same decisions every sprint.

https://github.com/aaserag1/mindgate-mcp

#MCP #AIagents #OpenSource #DeveloperTools

---

## 5. Product Hunt — draft

**Name:** MindGate MCP
**Tagline:** Your AI agents finally remember.
**Description:** Local-first memory & context gateway for AI coding agents over MCP. One shared SQLite brain (FTS5 BM25), session handoffs, auto-compiled AGENTS.md, secret redaction on write — MIT licensed, zero cloud.
**First comment:** Built this because my agents kept making the same decisions twice. Everything stays on your machine; the repo includes a full threat model and 29 passing tests. Feedback welcome!

---

## Launch checklist

- [ ] `npm publish --access public` (maintainer only)
- [ ] GitHub release `v1.2.0` + release notes from PR #1/#2 bodies
- [ ] Repo About → description + topics: `mcp`, `model-context-protocol`, `ai-memory`, `sqlite`, `fts5`, `local-first`
- [ ] Enable Discussions; pin "Show HN" thread
- [ ] Landing page live via GitHub Pages (see `deploy-pages.yml`)
- [ ] Post order: Show HN (Tue–Thu, 14:00–17:00 UTC) → Reddit → X/LinkedIn → PH
- [ ] Reply to every issue/comment within 24h for the first week
