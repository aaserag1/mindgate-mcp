import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";

import {
  isNodeVersionPatched,
  isBunVersionPatched,
  lockBrotliDecompressor,
} from "../src/security/node2shellGuard.js";

test("isNodeVersionPatched enforces the documented minimums", () => {
  // Node 22 line
  assert.equal(isNodeVersionPatched("22.23.3"), false);
  assert.equal(isNodeVersionPatched("22.23.4"), true);
  assert.equal(isNodeVersionPatched("v22.24.0"), true);
  // Node 24 line
  assert.equal(isNodeVersionPatched("24.22.0"), false);
  assert.equal(isNodeVersionPatched("24.22.1"), true);
  assert.equal(isNodeVersionPatched("v24.23.0"), true);
  // Node 26 line
  assert.equal(isNodeVersionPatched("26.12.0"), false);
  assert.equal(isNodeVersionPatched("26.12.1"), true);
  assert.equal(isNodeVersionPatched("v26.13.0"), true);
  // EOL / unsupported lines
  assert.equal(isNodeVersionPatched("20.19.0"), false);
  assert.equal(isNodeVersionPatched("21.7.3"), false);
  assert.equal(isNodeVersionPatched("23.5.0"), false);
  assert.equal(isNodeVersionPatched("25.1.0"), false);
  // Future majors are considered patched
  assert.equal(isNodeVersionPatched("28.0.0"), true);
  // Pre-release suffixes are stripped before comparison
  assert.equal(isNodeVersionPatched("22.23.4-rc.1"), true);
  // Garbage input is treated as vulnerable (fail-closed)
  assert.equal(isNodeVersionPatched("not-a-version"), false);
  assert.equal(isNodeVersionPatched(""), false);
});

test("isBunVersionPatched enforces >= 1.4.4", () => {
  assert.equal(isBunVersionPatched("1.4.3"), false);
  assert.equal(isBunVersionPatched("1.4.4"), true);
  assert.equal(isBunVersionPatched("v1.4.4"), true);
  assert.equal(isBunVersionPatched("1.5.0"), true);
  assert.equal(isBunVersionPatched("2.0.0"), true);
  assert.equal(isBunVersionPatched("1.3.9"), false);
  assert.equal(isBunVersionPatched("garbage"), false);
});

test("lockBrotliDecompressor neutralizes the public Brotli API", () => {
  const locked = lockBrotliDecompressor();
  assert.equal(locked, true);

  assert.throws(() => zlib.createBrotliDecompress(), /Brotli decompression is disabled/);
  assert.throws(
    () => zlib.brotliDecompressSync(Buffer.from([0x1b])),
    /Brotli decompression is disabled/
  );
  // One-shot async variant
  assert.throws(
    () => zlib.brotliDecompress(Buffer.from([0x1b]), () => {}),
    /Brotli decompression is disabled/
  );
  // The streaming class must also be blocked (it bypassed the v1.1.0 lock)
  assert.throws(
    () => new zlib.BrotliDecompress(),
    /Brotli decompression is disabled/
  );

  // Compression APIs remain available (they are not attack surface)
  assert.equal(typeof zlib.createBrotliCompress, "function");
});
