# 🧠 MindGate MCP — Launch Kit

Everything needed to announce **v1.2.0** of MindGate MCP (بوابة العقل). This folder (`docs/`) is deployed as the project landing page via GitHub Pages using **Settings → Pages → Source: Deploy from a branch → main → /docs** — no GitHub Actions required.

| File / Folder | What it is |
| :--- | :--- |
| `index.html` | Landing page (EN ⇆ AR one-click toggle, live animated terminal demo, architecture walkthrough, install tabs, FAQ, og-image). Self-contained — only external requests are Google Fonts with system fallbacks. |
| `assets/og-image.jpg` | Social preview image (Egyptian gate fused with circuits, cyan/violet on navy — no text so it never dates). |
| `community-posts.md` | Ready-to-post copy for Hacker News (Show HN), Reddit, X thread, LinkedIn, Product Hunt + launch checklist. |
| `video-script.md` | 100-second launch video script + shot list for an optional live screen-recording. |
| `video/` | Narrated explainer video (`mindgate-launch.mp4`, ~60s). Committed for convenience; remove from the repo if you prefer release assets instead. |

## Preview locally

```bash
cd docs
python3 -m http.server 8080
# open http://localhost:8080
```

The EN/AR toggle persists your choice in `localStorage` and flips layout direction (`dir="rtl"`) for Arabic.

## Enable GitHub Pages (branch-sourced — works without Actions)

GitHub's branch-sourced Pages only serves `/` (root) or `/docs`, which is why this folder is named `docs/`. Enable it once in the repo:

**Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `docs` → Save.**

Then the landing page lives at `https://aaserag1.github.io/mindgate-mcp/` forever — no sandbox, no GitHub Actions, and no billing-lock dependency. ⚠️ Note: with `/docs` as the Pages source, anything in this folder (including the video and markdown posts) also becomes publicly reachable at `/docs/...` paths — the repo is public anyway.

## Generating / regenerating the video

The narrated explainer is produced from `video-script.md`: SVG slides are rendered to PNG (sharp), narration is synthesized with the selected voice, and muxed with ffmpeg. See the repo history for the pipeline, or ask the agent to rebuild it.

## Truthfulness rules (keep the launch honest)

- Never claim `security_audit_text`, prompt-injection detection, or cloud features — they don't exist (and v1.2.0 docs say so).
- Node2Shell mitigation wording: stdio-only + version enforcement + best-effort in-process Brotli lock; a patched Node is the definitive fix.
- "Secret redaction (pattern-based, best-effort)" — never "100% safe".
- If GitHub Actions are unavailable, say "tests run locally (29/29)" — never claim CI is green.
