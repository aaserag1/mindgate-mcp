import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  writeRulesFile,
  RulesWriteError,
  RULES_SENTINEL,
} from "../src/rulesSync.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mindgate-rulestest-"));
}

const SENTINEL_MARKDOWN = `# Rules\n${RULES_SENTINEL}\n> generated\n`;
const HANDWRITTEN_MARKDOWN = "# My Hand-Written Rules\nDo NOT lose me.\n";

test("writes a new rules file atomically", () => {
  const dir = makeTempDir();
  const result = writeRulesFile({
    projectDir: dir,
    targetFile: "AGENTS.md",
    markdown: SENTINEL_MARKDOWN,
  });
  assert.equal(result.backupPath, null);
  assert.equal(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"), SENTINEL_MARKDOWN);
  // No temp files should be left behind
  assert.deepEqual(fs.readdirSync(dir).sort(), ["AGENTS.md"]);
});

test("refuses to overwrite a hand-written file without force", () => {
  const dir = makeTempDir();
  const target = path.join(dir, "AGENTS.md");
  fs.writeFileSync(target, HANDWRITTEN_MARKDOWN, "utf8");

  assert.throws(
    () =>
      writeRulesFile({
        projectDir: dir,
        targetFile: "AGENTS.md",
        markdown: SENTINEL_MARKDOWN,
      }),
    RulesWriteError
  );
  // Original content must be untouched
  assert.equal(fs.readFileSync(target, "utf8"), HANDWRITTEN_MARKDOWN);
});

test("overwrites a hand-written file with force=true and keeps a backup", () => {
  const dir = makeTempDir();
  const target = path.join(dir, "CLAUDE.md");
  fs.writeFileSync(target, HANDWRITTEN_MARKDOWN, "utf8");

  const result = writeRulesFile({
    projectDir: dir,
    targetFile: "CLAUDE.md",
    markdown: SENTINEL_MARKDOWN,
    force: true,
  });
  assert.equal(fs.readFileSync(target, "utf8"), SENTINEL_MARKDOWN);
  assert.ok(result.backupPath, "backup path expected");
  assert.equal(fs.readFileSync(result.backupPath!, "utf8"), HANDWRITTEN_MARKDOWN);
});

test("overwrites MindGate-generated files without force and keeps a backup", () => {
  const dir = makeTempDir();
  const first = writeRulesFile({
    projectDir: dir,
    targetFile: "AGENTS.md",
    markdown: SENTINEL_MARKDOWN,
  });
  assert.equal(first.backupPath, null);

  const second = writeRulesFile({
    projectDir: dir,
    targetFile: "AGENTS.md",
    markdown: `${SENTINEL_MARKDOWN}\nupdated\n`,
  });
  assert.ok(second.backupPath, "a backup should exist even for generated files");
  assert.equal(
    fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8"),
    `${SENTINEL_MARKDOWN}\nupdated\n`
  );
});

test("fails cleanly when project_dir does not exist", () => {
  const dir = makeTempDir();
  const missing = path.join(dir, "does-not-exist");
  assert.throws(
    () =>
      writeRulesFile({
        projectDir: missing,
        targetFile: "AGENTS.md",
        markdown: SENTINEL_MARKDOWN,
      }),
    RulesWriteError
  );
});

test("fails cleanly when project_dir is a file, not a directory", () => {
  const dir = makeTempDir();
  const file = path.join(dir, "a-file.txt");
  fs.writeFileSync(file, "x", "utf8");
  assert.throws(
    () =>
      writeRulesFile({
        projectDir: file,
        targetFile: "AGENTS.md",
        markdown: SENTINEL_MARKDOWN,
      }),
    RulesWriteError
  );
});
