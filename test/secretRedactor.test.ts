import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { redactSecrets, isRedactionEnabled } from "../src/security/secretRedactor.js";

afterEach(() => {
  delete process.env.MINDGATE_REDACT_SECRETS;
});

test("redacts OpenAI-style keys", () => {
  const input = "token: sk-proj-abcdefghijklmnopqrstuvwxyz123456";
  const { value, redactions } = redactSecrets(input);
  assert.ok(redactions >= 1);
  assert.ok(!value.includes("sk-proj-abcdefghijklmnopqrstuvwxyz123456"));
  assert.ok(value.includes("[REDACTED:openai_key]"));
});

test("redacts GitHub tokens", () => {
  const { value } = redactSecrets(`ghp_${"a".repeat(36)}`);
  assert.ok(value.includes("[REDACTED:github_token]"));
  const pat = redactSecrets(`github_pat_${"A1_".repeat(12)}xx`);
  assert.ok(pat.value.includes("[REDACTED:github_token]"));
});

test("redacts AWS access key IDs", () => {
  const { value } = redactSecrets("aws key AKIAIOSFODNN7EXAMPLE");
  assert.ok(value.includes("[REDACTED:aws_access_key]"));
  assert.ok(!value.includes("AKIAIOSFODNN7EXAMPLE"));
});

test("redacts JWTs", () => {
  const jwt = `eyJ${"a".repeat(12)}.eyJ${"b".repeat(12)}.${"c".repeat(16)}`;
  const { value } = redactSecrets(`auth: ${jwt}`);
  assert.ok(value.includes("[REDACTED:jwt]"));
});

test("redacts PEM private key blocks (multiline)", () => {
  const pem =
    "here:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA1234567890abcdef\nMoreLinesOfKeyMaterialHere+/=\n-----END RSA PRIVATE KEY-----\ndone";
  const { value, redactions } = redactSecrets(pem);
  assert.equal(redactions, 1);
  assert.ok(value.includes("[REDACTED:private_key]"));
  assert.ok(!value.includes("MIIEpAIBAAKCAQEA"));
});

test("redacts Slack and Google tokens", () => {
  const slack = redactSecrets(`xoxb-${"1".repeat(12)}`);
  assert.ok(slack.value.includes("[REDACTED:slack_token]"));
  const google = redactSecrets(`AIza${"A".repeat(35)}`);
  assert.ok(google.value.includes("[REDACTED:google_api_key]"));
});

test("leaves ordinary prose untouched", () => {
  const input = "Use pnpm as the package manager and prefer strict TypeScript.";
  const { value, redactions } = redactSecrets(input);
  assert.equal(value, input);
  assert.equal(redactions, 0);
});

test("can be disabled via MINDGATE_REDACT_SECRETS=false", () => {
  process.env.MINDGATE_REDACT_SECRETS = "false";
  assert.equal(isRedactionEnabled(), false);
  const input = "key: sk-proj-abcdefghijklmnopqrstuvwxyz123456";
  const { value, redactions } = redactSecrets(input);
  assert.equal(value, input);
  assert.equal(redactions, 0);
});

test("counts multiple secrets in one string", () => {
  const input = `a=AKIAIOSFODNN7EXAMPLE b=ghp_${"c".repeat(36)}`;
  const { redactions } = redactSecrets(input);
  assert.equal(redactions, 2);
});
