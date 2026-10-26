# Contributing to MindGate (بوابة العقل)

Thank you for your interest in contributing to **MindGate**! As an open-source, local-first context gateway, community contributions help keep this project secure, performant, and cross-platform.

---

## 🤝 Code of Conduct
We are committed to providing a welcoming and inspiring community for all contributors. Please be respectful, inclusive, and professional in all interactions.

---

## 🛠️ Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/aaserag1/mindgate-mcp.git
   cd mindgate-mcp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run in development mode (live reload with tsx):**
   ```bash
   npm run dev
   ```

4. **Build the project:**
   ```bash
   npm run build
   ```

5. **Test using MCP Inspector:**
   ```bash
   npx @modelcontextprotocol/inspector node dist/index.js
   ```

---

## 📋 Pull Request Guidelines

1. **Fork & Branch:** Create a feature branch from `main` (e.g. `feature/sqlite-vector-index` or `fix/node-version-check`).
2. **TypeScript & Types:** Ensure `npm run build` runs cleanly without any TypeScript errors.
3. **Security First:**
   - MindGate is hardened against **CVE-2026-111497 (Node2Shell)**. Never introduce untrusted `node:zlib` Brotli decompression or unsafe remote execution calls.
   - All I/O must remain local-first (no unauthorized telemetry or external network calls).
4. **Formatting & Clean Code:** Keep code modular and properly documented.
5. **Submit PR:** Open a Pull Request on GitHub with a clear description of changes.

---

## 💡 Ways to Contribute

- **New AI Agent Integrations:** Documenting or adding configuration guides for other AI tools (e.g., Continue.dev, Aider, Roo Code).
- **Search & Indexing Improvements:** Optimizing SQLite FTS5 queries or evaluating local vector embedding bridges.
- **Translations:** Improving documentation in other languages.
- **Bug Fixes:** Reporting and resolving issues.

Thank you for building with us! 🚀
