/**
 * MindGate Tool Input Validation (v1.2.0)
 *
 * The MCP SDK does not enforce `inputSchema` at runtime, so every tool
 * argument is validated here before it reaches the store. Limits keep the
 * local database from being bloated by accident or abuse.
 */

import { MemoryCategory } from "./db/memoryStore.js";

/** Error thrown for invalid tool input; surfaced to the caller as an MCP tool error (isError). */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export const LIMITS = {
  titleMax: 500,
  contentMax: 50_000,
  summaryMax: 20_000,
  workspaceMax: 200,
  sourceAgentMax: 200,
  tagMax: 100,
  tagsMax: 20,
  nextStepsMax: 50,
  activeFilesMax: 100,
  preferenceKeyMax: 200,
  preferenceValueMax: 5_000,
  queryMax: 1_000,
  projectDirMax: 4_096,
} as const;

const CATEGORIES: ReadonlySet<string> = new Set([
  "architecture",
  "decision",
  "bugfix",
  "convention",
  "context",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function ensureArgsObject(args: unknown): Record<string, unknown> {
  if (args === undefined || args === null) return {};
  if (!isPlainObject(args)) {
    throw new ToolInputError("Tool arguments must be a JSON object.");
  }
  return args;
}

export function requiredString(
  value: unknown,
  field: string,
  maxLength: number
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ToolInputError(`Missing or invalid required field: "${field}" (non-empty string expected).`);
  }
  if (value.length > maxLength) {
    throw new ToolInputError(`Field "${field}" exceeds the maximum of ${maxLength} characters.`);
  }
  return value;
}

export function optionalString(
  value: unknown,
  field: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new ToolInputError(`Field "${field}" must be a string.`);
  }
  if (value.length > maxLength) {
    throw new ToolInputError(`Field "${field}" exceeds the maximum of ${maxLength} characters.`);
  }
  return value;
}

export function optionalBoolean(
  value: unknown,
  field: string
): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw new ToolInputError(`Field "${field}" must be a boolean.`);
  }
  return value;
}

export function optionalPositiveInt(
  value: unknown,
  field: string
): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ToolInputError(`Field "${field}" must be an integer.`);
  }
  if (value <= 0) {
    throw new ToolInputError(`Field "${field}" must be a positive integer.`);
  }
  return value;
}

export function optionalLimit(
  value: unknown,
  field: string,
  max: number
): number | undefined {
  const parsed = optionalPositiveInt(value, field);
  return parsed === undefined ? undefined : Math.min(parsed, max);
}

export function optionalStringArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxItemLength: number
): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new ToolInputError(`Field "${field}" must be an array of strings.`);
  }
  if (value.length > maxItems) {
    throw new ToolInputError(`Field "${field}" allows at most ${maxItems} items.`);
  }
  return value.map((item, index) => {
    const s = String(item);
    if (s.length > maxItemLength) {
      throw new ToolInputError(
        `Field "${field}[${index}]" exceeds the maximum of ${maxItemLength} characters.`
      );
    }
    return s;
  });
}

export function optionalCategory(value: unknown): MemoryCategory | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !CATEGORIES.has(value)) {
    throw new ToolInputError(
      `Field "category" must be one of: ${[...CATEGORIES].join(", ")}.`
    );
  }
  return value as MemoryCategory;
}
