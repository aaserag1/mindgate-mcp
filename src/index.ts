#!/usr/bin/env node
/**
 * MindGate (بوابة العقل) v1.1.0 — Model Context Protocol (MCP) Server
 *
 * A unified, local-first memory & context gateway for Antigravity, OpenCode,
 * Codex, Cursor, and Claude. Hardened against Node2Shell (CVE-2026-111497).
 */

import { enforceNode2ShellProtection } from "./security/node2shellGuard.js";

// Step 1: Activate Node2Shell (CVE-2026-111497) security shield before loading any I/O
const securityStatus = enforceNode2ShellProtection();

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MindGateStore, MemoryCategory } from "./db/memoryStore.js";

const __filename = fileURLToPath(import.meta.url);

const ALLOWED_RULE_FILENAMES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  ".windsurfrules",
  "MINDGATE_CONTEXT.md",
]);

function printInitGuide(): void {
  const scriptPath = path.resolve(__filename).replace(/\\/g, "/");
  console.log(`
=======================================================================
🧠 MindGate v1.1.0 (بوابة العقل) — Configuration Generator
🛡️ Security Status: ${securityStatus.advisory}
=======================================================================

Option A — Zero-Install via npx (Once published to npm):
-----------------------------------------------------------------------
{
  "mcpServers": {
    "mindgate": {
      "command": "npx",
      "args": ["-y", "mindgate-mcp"],
      "env": {
        "MINDGATE_DEFAULT_WORKSPACE": "my-project"
      }
    }
  }
}

Option B — Local Build (Antigravity / Cursor / Claude Desktop on Windows/macOS/Linux):
-----------------------------------------------------------------------
{
  "mcpServers": {
    "mindgate": {
      "command": "node",
      "args": ["${scriptPath}"],
      "env": {
        "MINDGATE_DEFAULT_WORKSPACE": "my-project"
      }
    }
  }
}

Option C — OpenCode (opencode.json):
-----------------------------------------------------------------------
{
  "mcp": {
    "mindgate": {
      "type": "local",
      "command": ["node", "${scriptPath}"],
      "enabled": true
    }
  }
}

Option D — Codex CLI (~/.codex/config.toml):
-----------------------------------------------------------------------
[mcp_servers.mindgate]
command = "node"
args = ["${scriptPath}"]
`);
}

if (process.argv.includes("init") || process.argv.includes("--init")) {
  printInitGuide();
  process.exit(0);
}

const store = new MindGateStore();

const server = new Server(
  {
    name: "mindgate-mcp",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "remember_decision",
        description:
          "Save an architectural decision, coding convention, bug root-cause, or important context into MindGate (بوابة العقل) so all AI tools remember it.",
        inputSchema: {
          type: "object",
          properties: {
            workspace: {
              type: "string",
              description:
                "Project workspace identifier (e.g. 'ecommerce-api' or 'global'). Defaults to MINDGATE_DEFAULT_WORKSPACE or 'global'.",
            },
            category: {
              type: "string",
              enum: [
                "architecture",
                "decision",
                "bugfix",
                "convention",
                "context",
              ],
              description: "Category of the memory record.",
            },
            title: {
              type: "string",
              description: "Concise title summarizing the decision or context.",
            },
            content: {
              type: "string",
              description:
                "Detailed explanation, rationale, code patterns, or constraints.",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Optional searchable keywords/tags.",
            },
            source_agent: {
              type: "string",
              description:
                "Name of the AI tool recording this memory (e.g. 'antigravity', 'opencode', 'codex').",
            },
          },
          required: ["title", "content"],
        },
      },
      {
        name: "update_memory",
        description:
          "Update an existing memory or architectural decision in-place by its ID without losing its record ID or creation timestamp.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Numeric ID of the memory record to update.",
            },
            workspace: {
              type: "string",
              description: "Optional updated workspace identifier.",
            },
            category: {
              type: "string",
              enum: [
                "architecture",
                "decision",
                "bugfix",
                "convention",
                "context",
              ],
              description: "Optional updated category.",
            },
            title: {
              type: "string",
              description: "Optional updated title.",
            },
            content: {
              type: "string",
              description: "Optional updated explanation or decision content.",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Optional updated tags array.",
            },
            source_agent: {
              type: "string",
              description:
                "Name of the AI tool updating this memory (e.g. 'antigravity').",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "recall_context",
        description:
          "Search MindGate (بوابة العقل) using FTS5 BM25 full-text ranking for relevant project decisions, latest cross-agent session handoff, and developer preferences.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Search keywords or natural language topic (leave empty to fetch most recent memories).",
            },
            workspace: {
              type: "string",
              description: "Project workspace to search inside.",
            },
            category: {
              type: "string",
              enum: [
                "architecture",
                "decision",
                "bugfix",
                "convention",
                "context",
              ],
              description: "Optional category filter.",
            },
            limit: {
              type: "number",
              description: "Maximum number of memories to return (default 10).",
            },
            include_global: {
              type: "boolean",
              description:
                "Whether to also include memories from the 'global' workspace (default true).",
            },
          },
        },
      },
      {
        name: "log_session_summary",
        description:
          "Log a session handoff summary when finishing work in one AI agent (e.g. Antigravity) so the next agent (e.g. OpenCode or Codex) can continue seamlessly.",
        inputSchema: {
          type: "object",
          properties: {
            workspace: {
              type: "string",
              description: "Project workspace identifier.",
            },
            source_agent: {
              type: "string",
              description:
                "AI agent logging the session (e.g. 'antigravity', 'opencode', 'codex').",
            },
            summary: {
              type: "string",
              description: "Summary of what was accomplished in this session.",
            },
            next_steps: {
              type: "array",
              items: { type: "string" },
              description:
                "Actionable next steps for the next coding session or AI agent.",
            },
            active_files: {
              type: "array",
              items: { type: "string" },
              description:
                "List of file paths that were created or modified during this session.",
            },
          },
          required: ["summary"],
        },
      },
      {
        name: "sync_workspace_rules",
        description:
          "Generate a structured Markdown rules file (AGENTS.md, .cursorrules, or CLAUDE.md) from stored MindGate memories, conventions, preferences, and latest session handoff, optionally writing it directly to the project directory.",
        inputSchema: {
          type: "object",
          properties: {
            workspace: {
              type: "string",
              description: "Project workspace identifier.",
            },
            project_dir: {
              type: "string",
              description:
                "Optional absolute path to the project directory where the rules file should be written. If omitted, returns the generated Markdown without writing to disk.",
            },
            target_file: {
              type: "string",
              enum: [
                "AGENTS.md",
                "CLAUDE.md",
                ".cursorrules",
                ".windsurfrules",
                "MINDGATE_CONTEXT.md",
              ],
              description:
                "Target filename to write inside project_dir (default: 'AGENTS.md').",
            },
            include_global: {
              type: "boolean",
              description:
                "Whether to include global developer preferences and memories (default true).",
            },
          },
        },
      },
      {
        name: "export_memory_snapshot",
        description:
          "Export a portable JSON backup snapshot of MindGate memories, session handoffs, and developer preferences.",
        inputSchema: {
          type: "object",
          properties: {
            workspace: {
              type: "string",
              description:
                "Optional workspace filter (leave empty to export all workspaces).",
            },
          },
        },
      },
      {
        name: "set_user_preference",
        description:
          "Save a persistent developer preference or global coding rule (e.g., preferred test runner, naming conventions, forbidden packages).",
        inputSchema: {
          type: "object",
          properties: {
            key: {
              type: "string",
              description:
                "Unique preference key (e.g. 'typescript.strict_mode', 'db.orm_policy').",
            },
            value: {
              type: "string",
              description: "Preference rule or value.",
            },
            category: {
              type: "string",
              description:
                "Preference category (e.g. 'coding-style', 'stack', 'security').",
            },
          },
          required: ["key", "value"],
        },
      },
      {
        name: "get_user_preferences",
        description:
          "Retrieve all saved global developer preferences and coding rules.",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "Optional category filter.",
            },
          },
        },
      },
      {
        name: "list_workspaces",
        description:
          "List all project workspaces stored in MindGate along with memory counts.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "delete_memory",
        description: "Delete an outdated or superseded memory record by its ID.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Numeric ID of the memory to delete.",
            },
          },
          required: ["id"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  switch (name) {
    case "remember_decision": {
      const record = store.rememberDecision({
        workspace: args.workspace as string | undefined,
        category: args.category as MemoryCategory | undefined,
        title: String(args.title),
        content: String(args.content),
        tags: Array.isArray(args.tags) ? args.tags.map(String) : [],
        sourceAgent: args.source_agent as string | undefined,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "saved",
                message: "Memory stored in MindGate (بوابة العقل).",
                record,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "update_memory": {
      const id = Number(args.id);
      const updated = store.updateMemory({
        id,
        workspace: args.workspace as string | undefined,
        category: args.category as MemoryCategory | undefined,
        title: args.title !== undefined ? String(args.title) : undefined,
        content: args.content !== undefined ? String(args.content) : undefined,
        tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
        sourceAgent: args.source_agent as string | undefined,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              updated
                ? {
                    status: "updated",
                    message: `Memory #${id} updated in-place in MindGate (بوابة العقل).`,
                    record: updated,
                  }
                : {
                    status: "not_found",
                    message: `No memory found with ID #${id}.`,
                    id,
                  },
              null,
              2
            ),
          },
        ],
      };
    }

    case "recall_context": {
      const result = store.recallContext({
        query: args.query as string | undefined,
        workspace: args.workspace as string | undefined,
        category: args.category as MemoryCategory | undefined,
        limit: typeof args.limit === "number" ? args.limit : 10,
        includeGlobal:
          typeof args.include_global === "boolean" ? args.include_global : true,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                security: securityStatus,
                ...result,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "log_session_summary": {
      const session = store.logSessionSummary({
        workspace: args.workspace as string | undefined,
        sourceAgent: args.source_agent as string | undefined,
        summary: String(args.summary),
        nextSteps: Array.isArray(args.next_steps)
          ? args.next_steps.map(String)
          : [],
        activeFiles: Array.isArray(args.active_files)
          ? args.active_files.map(String)
          : [],
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "logged",
                message:
                  "Session handoff logged. Ready for next AI agent to resume.",
                session,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "sync_workspace_rules": {
      const generated = store.generateWorkspaceRulesMarkdown({
        workspace: args.workspace as string | undefined,
        includeGlobal:
          typeof args.include_global === "boolean" ? args.include_global : true,
      });

      const projectDir =
        typeof args.project_dir === "string" ? args.project_dir.trim() : "";
      const targetFile =
        typeof args.target_file === "string" &&
        ALLOWED_RULE_FILENAMES.has(args.target_file)
          ? args.target_file
          : "AGENTS.md";

      let writtenTo: string | null = null;
      if (projectDir) {
        const resolvedDir = path.resolve(projectDir);
        if (
          fs.existsSync(resolvedDir) &&
          fs.statSync(resolvedDir).isDirectory()
        ) {
          const fullTarget = path.join(resolvedDir, targetFile);
          fs.writeFileSync(fullTarget, generated.markdown, "utf8");
          writtenTo = fullTarget;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: writtenTo ? "synced_to_disk" : "generated",
                written_to: writtenTo,
                workspace: generated.workspace,
                memory_count: generated.memoryCount,
                preference_count: generated.preferenceCount,
                has_session_handoff: generated.hasSessionHandoff,
                markdown: generated.markdown,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "export_memory_snapshot": {
      const snapshot = store.exportSnapshot(
        args.workspace as string | undefined
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(snapshot, null, 2),
          },
        ],
      };
    }

    case "set_user_preference": {
      const pref = store.setUserPreference(
        String(args.key),
        String(args.value),
        (args.category as string | undefined) || "coding-style"
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status: "saved", preference: pref }, null, 2),
          },
        ],
      };
    }

    case "get_user_preferences": {
      const prefs = store.getUserPreferences(
        args.category as string | undefined
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ preferences: prefs }, null, 2),
          },
        ],
      };
    }

    case "list_workspaces": {
      const workspaces = store.listWorkspaces();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ workspaces }, null, 2),
          },
        ],
      };
    }

    case "delete_memory": {
      const deleted = store.deleteMemory(Number(args.id));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { status: deleted ? "deleted" : "not_found", id: Number(args.id) },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown MindGate tool: ${name}`);
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "mindgate://context/latest",
        name: "MindGate Latest Project Context & Session Handoff",
        mimeType: "application/json",
        description:
          "Snapshot of recent architectural decisions, latest cross-agent session handoff, and developer preferences.",
      },
      {
        uri: "mindgate://rules/agents-md",
        name: "MindGate Auto-Generated AGENTS.md Rules",
        mimeType: "text/markdown",
        description:
          "Formatted AGENTS.md / .cursorrules Markdown compiled from MindGate memories and preferences.",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === "mindgate://context/latest") {
    const data = store.recallContext({ limit: 15, includeGlobal: true });
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              security: securityStatus,
              ...data,
            },
            null,
            2
          ),
        },
      ],
    };
  }
  if (request.params.uri === "mindgate://rules/agents-md") {
    const generated = store.generateWorkspaceRulesMarkdown({
      includeGlobal: true,
    });
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "text/markdown",
          text: generated.markdown,
        },
      ],
    };
  }
  throw new Error(`Resource not found: ${request.params.uri}`);
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "mindgate-bootstrap",
        description:
          "Load full project memory, coding preferences, and the latest session handoff from MindGate (بوابة العقل).",
        arguments: [
          {
            name: "workspace",
            description: "Project workspace name (optional).",
            required: false,
          },
        ],
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === "mindgate-bootstrap") {
    const workspace = request.params.arguments?.workspace;
    const context = store.recallContext({
      workspace,
      limit: 15,
      includeGlobal: true,
    });
    return {
      description: "MindGate Context Bootstrap",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please review my persistent project memory and preferences from MindGate (بوابة العقل) before proceeding:\n\n${JSON.stringify(
              context,
              null,
              2
            )}`,
          },
        },
      ],
    };
  }
  throw new Error(`Prompt not found: ${request.params.name}`);
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[MindGate Fatal Error]", err);
  process.exit(1);
});