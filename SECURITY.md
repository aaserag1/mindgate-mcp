# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

---

## 🛡️ Node2Shell (CVE-2026-111497) Defense Architecture

MindGate was built from day one with defense-in-depth protections against **Node2Shell (CVE-2026-111497)**:
- **Zero-HTTP Attack Surface:** MindGate communicates exclusively over local `stdio` (JSON-RPC), eliminating remote HTTP request smuggling and unauthorized network listening.
- **Runtime Version Enforcement:** MindGate inspects `process.versions.node` and warns users when running on unpatched Node.js versions (< 22.23.4, < 24.22.1, < 26.12.1).
- **In-Process Brotli Hard-Lock:** The server disables `node:zlib` Brotli decompression routines at process initialization to neutralize out-of-bounds writes on dynamically-linked systems.

---

## 🔒 Reporting a Vulnerability

If you discover a security vulnerability or exploit within MindGate:
1. Please **do not** open a public issue.
2. Email details and reproduction steps to the maintainer directly at [aadelserag00@gmail.com](mailto:aadelserag00@gmail.com) or submit a private security advisory through GitHub.
3. We will review and publish a patched release promptly.
