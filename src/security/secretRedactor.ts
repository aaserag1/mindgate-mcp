/**
 * MindGate Secret Redactor (v1.2.0)
 *
 * Best-effort, local, offline redaction of well-known secret patterns before
 * they are persisted to the SQLite store. This is a safety net, not a
 * guarantee: it matches known token shapes (OpenAI, GitHub, AWS, JWT, PEM
 * private keys, Slack, Google API keys) and replaces them with
 * `[REDACTED:<kind>]` tokens.
 *
 * Set MINDGATE_REDACT_SECRETS=false to disable. Keeping it enabled is
 * strongly recommended.
 */

export interface RedactionResult {
  value: string;
  redactions: number;
}

interface SecretPattern {
  kind: string;
  pattern: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // PEM private key blocks (multiline) — match first, before generic rules
  {
    kind: "private_key",
    pattern:
      /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g,
  },
  // OpenAI-style keys (sk-..., sk-proj-..., sk-live-...)
  { kind: "openai_key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_, github_pat_)
  { kind: "github_token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  // AWS access key IDs (AKIA... / ASIA...)
  { kind: "aws_access_key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  // Slack tokens (xoxb-, xoxp-, xoxa-, xoxr-, xoxs-)
  { kind: "slack_token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  // Google API keys
  { kind: "google_api_key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  // JWT (three base64url segments starting with eyJ)
  {
    kind: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
];

/** Whether redaction is enabled (default: true). */
export function isRedactionEnabled(): boolean {
  return process.env.MINDGATE_REDACT_SECRETS !== "false";
}

/**
 * Redacts known secret patterns in `input`. Returns the redacted string and
 * the number of replacements made. When redaction is disabled via env, the
 * input is returned verbatim with `redactions: 0`.
 */
export function redactSecrets(input: string): RedactionResult {
  if (!isRedactionEnabled() || typeof input !== "string" || input.length === 0) {
    return { value: input, redactions: 0 };
  }

  let redactions = 0;
  let value = input;
  for (const { kind, pattern } of SECRET_PATTERNS) {
    value = value.replace(pattern, () => {
      redactions += 1;
      return `[REDACTED:${kind}]`;
    });
  }
  return { value, redactions };
}
