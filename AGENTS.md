# MindGate Workspace Rules

This repository uses **MindGate (بوابة العقل)** for local persistent memory and cross-session context.

- **Active Workspace**: `mindgate-mcp`
- Follow the global MindGate autonomous protocol:
  - Call `recall_context(workspace: "mindgate-mcp")` at the beginning of tasks.
  - Call `remember_decision(workspace: "mindgate-mcp", ...)` upon key architecture/bugfix milestones.
  - Call `log_session_summary(workspace: "mindgate-mcp", ...)` upon completing significant work.
