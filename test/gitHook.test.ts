import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findGitRoot, installGitHook, uninstallGitHook } from "../src/gitHook.js";

const tmpRepo = path.join(os.tmpdir(), `mindgate-githook-test-${Date.now()}`);

before(() => {
  fs.mkdirSync(path.join(tmpRepo, ".git", "hooks"), { recursive: true });
});

after(() => {
  try {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  } catch {
    // cleanup
  }
});

test("findGitRoot identifies repository root containing .git", () => {
  const subDir = path.join(tmpRepo, "src", "nested");
  fs.mkdirSync(subDir, { recursive: true });
  const root = findGitRoot(subDir);
  assert.equal(root, path.resolve(tmpRepo));
});

test("installGitHook creates post-commit hook and is idempotent", () => {
  const res1 = installGitHook(tmpRepo, "D:/mock/dist/index.js");
  assert.equal(res1.success, true);
  assert.ok(fs.existsSync(res1.hookPath));

  const content = fs.readFileSync(res1.hookPath, "utf8");
  assert.ok(content.includes("# --- mindgate:post-commit:start ---"));
  assert.ok(content.includes("capture-commit"));

  // Second install should be idempotent
  const res2 = installGitHook(tmpRepo);
  assert.equal(res2.success, true);
  assert.ok(res2.message.includes("already installed"));
});

test("uninstallGitHook cleanly removes post-commit hook", () => {
  const unres = uninstallGitHook(tmpRepo);
  assert.equal(unres.success, true);
  assert.ok(!fs.existsSync(unres.hookPath));
});
