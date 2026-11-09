# MindGate MCP — Launch Video Script (≈ 60 seconds, 6 scenes)

> Voiceover narration used to synthesize `mindgate-launch.mp4`.
> Slides are generated as SVG → PNG (1920×1080, dark navy theme).
> Tone: confident, calm, technical-but-friendly. English.

| # | Slide | Narration |
|---|-------|-----------|
| 1 | `EVERY AI AGENT STARTS FROM ZERO.` | "Every AI coding agent starts from zero. Same questions, same architecture debates, same bugs — session after session, tool after tool." |
| 2 | `ONE LOCAL BRAIN. EVERY AGENT PLUGGED IN.` | "MindGate is a local-first memory layer for AI coding agents. One shared SQLite brain over MCP — Antigravity, Cursor, Claude, Codex, all plugged into the same context." |
| 3 | `EVERY CALL FLOWS THROUGH ONE PIPE.` | "Every tool call flows through the same pipe. Runtime validation. Secret redaction on write. Then SQLite with built-in full-text search, ranked by BM25. No network. Ever." |
| 4 | `SAFETY IS THE FEATURE.` | "Secrets are masked before they touch disk. Hand-written rules files are never overwritten without your say-so. And it ships mitigations for Node2Shell. Audit every line. The code is all yours." |
| 5 | `REMEMBER ONCE. RECALL FOREVER.` | "An agent stores a decision. Weeks later, a different agent asks the same question — and gets the answer in half a millisecond. That is the whole magic." |
| 6 | `YOUR AGENTS FINALLY REMEMBER.` | "Free, open source, MIT. One command, and your agents finally remember. MindGate — your local gateway to AI memory. Link in the description." |

## Shot list for a live screen-recording (optional, richer)

1. Open `dist/index.js` briefly — show stdio-only, no network code
2. MCP client connects; `tools/list` returns 10 tools
3. `remember_decision` with an AKIA key → response shows `redacted_secrets: 1`
4. `recall_context` returns the decision ranked #1
5. `sync_workspace_rules` on a hand-written AGENTS.md → refused without `force: true`
6. Timestamped `.bak` file appears next to the target

## Recording notes

- Screen: 1920×1080, terminal font ≥ 16px, dark theme
- Terminal color scheme matches the landing page (#0b1020 background)
- Keep total length < 2 minutes; cut aggressively
