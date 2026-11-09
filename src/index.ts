#!/usr/bin/env node
/**
 * MindGate (بوابة العقل) v1.2.0 — Model Context Protocol (MCP) Server
 *
 * A unified, local-first memory & context gateway for Antigravity, OpenCode,
 * Codex, Cursor, and Claude. Mitigates Node2Shell (CVE-2026-111497).
 */

// Step 1: Install the Node2Shell (CVE-2026-111497) hard-lock BEFORE any other
// module is evaluated. ESM imports are evaluated in order, so this MUST stay
// the first import in the file.
import { securityStatus } from "./security/bootstrap.js";

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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MindGateStore } from "./db/memoryStore.js";
import { writeRulesFile, RulesWriteError } from "./rulesSync.js";
import {
  LIMITS,
  ToolInputError,
  ensureArgsObject,
  requiredString,
  optionalString,
  optionalBoolean,
  optionalPositiveInt,
  optionalLimit,
  optionalStringArray,
  optionalCategory,
} from "./validation.js";

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
🧠 MindGate v1.2.0 (بوابة العقل) — Configuration Generator
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
    version: "1.2.0",
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
          "Generate a structured Markdown rules file (AGENTS.md, .cursorrules, or CLAUDE.md) from stored MindGate memories, conventions, preferences, and latest session handoff. Writes are atomic; existing files are backed up to <file>.bak-<timestamp> and hand-written files are never overwritten unless force=true.",
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
            force: {
              type: "boolean",
              description:
                "Allow overwriting an existing target file that MindGate did not generate (e.g. a hand-written AGENTS.md). A timestamped .bak backup is always created before overwriting. Default false.",
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
  const { name, arguments: rawArgs } = request.params;

  try {
    const args = ensureArgsObject(rawArgs);

    switch (name) {
    case "remember_decision": {
      const { record, redactions } = store.rememberDecision({
        workspace: optionalString(args.workspace, "workspace", LIMITS.workspaceMax),
        category: optionalCategory(args.category),
        title: requiredString(args.title, "title", LIMITS.titleMax),
        content: requiredString(args.content, "content", LIMITS.contentMax),
        tags: optionalStringArray(args.tags, "tags", LIMITS.tagsMax, LIMITS.tagMax) ?? [],
        sourceAgent: optionalString(args.source_agent, "source_agent", LIMITS.sourceAgentMax),
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "saved",
                message: "Memory stored in MindGate (بوابة العقل).",
                redacted_secrets: redactions,
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
      const id = optionalPositiveInt(args.id, "id");
      if (id === undefined) {
        throw new ToolInputError('Missing or invalid required field: "id" (positive integer expected).');
      }
      const result = store.updateMemory({
        id,
        workspace: optionalString(args.workspace, "workspace", LIMITS.workspaceMax),
        category: optionalCategory(args.category),
        title: optionalString(args.title, "title", LIMITS.titleMax),
        content: optionalString(args.content, "content", LIMITS.contentMax),
        tags: optionalStringArray(args.tags, "tags", LIMITS.tagsMax, LIMITS.tagMax),
        sourceAgent: optionalString(args.source_agent, "source_agent", LIMITS.sourceAgentMax),
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              result
                ? {
                    status: "updated",
                    message: `Memory #${id} updated in-place in MindGate (بوابة العقل).`,
                    redacted_secrets: result.redactions,
                    record: result.record,
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
        query: optionalString(args.query, "query", LIMITS.queryMax),
        workspace: optionalString(args.workspace, "workspace", LIMITS.workspaceMax),
        category: optionalCategory(args.category),
        limit: optionalLimit(args.limit, "limit", 50) ?? 10,
        includeGlobal:
          optionalBoolean(args.include_global, "include_global") ?? true,
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
      const { record, redactions } = store.logSessionSummary({
        workspace: optionalString(args.workspace, "workspace", LIMITS.workspaceMax),
        sourceAgent: optionalString(args.source_agent, "source_agent", LIMITS.sourceAgentMax),
        summary: requiredString(args.summary, "summary", LIMITS.summaryMax),
        nextSteps: optionalStringArray(args.next_steps, "next_steps", LIMITS.nextStepsMax, LIMITS.contentMax) ?? [],
        activeFiles: optionalStringArray(args.active_files, "active_files", LIMITS.activeFilesMax, LIMITS.projectDirMax) ?? [],
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
                redacted_secrets: redactions,
                session: record,
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
        workspace: optionalString(args.workspace, "workspace", LIMITS.workspaceMax),
        includeGlobal:
          optionalBoolean(args.include_global, "include_global") ?? true,
      });

      const projectDir =
        optionalString(args.project_dir, "project_dir", LIMITS.projectDirMax)?.trim() ?? "";
      const targetFileArg = optionalString(args.target_file, "target_file", 100);
      let targetFile = "AGENTS.md";
      if (targetFileArg !== undefined) {
        if (!ALLOWED_RULE_FILENAMES.has(targetFileArg)) {
          throw new ToolInputError(
            `Invalid target_file "${targetFileArg}". Allowed: ${[...ALLOWED_RULE_FILENAMES].join(", ")}.`
          );
        }
        targetFile = targetFileArg;
      }
      const force = optionalBoolean(args.force, "force") ?? false;

      let writtenTo: string | null = null;
      let backupPath: string | null = null;
      if (projectDir) {
        const result = writeRulesFile({
          projectDir,
          targetFile,
          markdown: generated.markdown,
          force,
        });
        writtenTo = result.writtenTo;
        backupPath = result.backupPath;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: writtenTo ? "synced_to_disk" : "generated",
                written_to: writtenTo,
                backup: backupPath,
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
        optionalString(args.workspace, "workspace", LIMITS.workspaceMax)
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
      const key = requiredString(args.key, "key", LIMITS.preferenceKeyMax);
      const value = requiredString(args.value, "value", LIMITS.preferenceValueMax);
      const category =
        optionalString(args.category, "category", LIMITS.tagMax) || "coding-style";
      const { record, redactions } = store.setUserPreference(key, value, category);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { status: "saved", redacted_secrets: redactions, preference: record },
              null,
              2
            ),
          },
        ],
      };
    }

    case "get_user_preferences": {
      const prefs = store.getUserPreferences(
        optionalString(args.category, "category", LIMITS.tagMax)
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
      const id = optionalPositiveInt(args.id, "id");
      if (id === undefined) {
        throw new ToolInputError('Missing or invalid required field: "id" (positive integer expected).');
      }
      const deleted = store.deleteMemory(id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { status: deleted ? "deleted" : "not_found", id },
              null,
              2
            ),
          },
        ],
      };
    }

    default:
      throw new ToolInputError(`Unknown MindGate tool: ${name}`);
    }
  } catch (error) {
    // Tool-level failures are reported as MCP tool errors (isError: true),
    // not as JSON-RPC protocol errors, so agents can read and recover.
    const message =
      error instanceof RulesWriteError || error instanceof ToolInputError
        ? error.message
        : `MindGate internal error: ${error instanceof Error ? error.message : String(error)}`;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ status: "error", message }, null, 2),
        },
      ],
      isError: true,
    };
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