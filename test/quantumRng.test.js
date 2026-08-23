import { test } from "node:test";
import assert from "node:assert/strict";
import { quantumRandomUint16 } from "../src/quantumRng.js";

const anuResponse = (data, overrides = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({ type: "uint16", length: 1, data, success: true, ...overrides }),
});

test("converts ANU's raw uint16 straight through, labels the source honestly", async () => {
  const fetchImpl = async () => anuResponse([12345]);
  const result = await quantumRandomUint16({ fetchImpl });
  assert.equal(result.value, 12345);
  assert.equal(result.source, "anu-qrng");
  assert.equal(result.detail, undefined);
});

test("falls back on a non-ok HTTP status", async () => {
  const fetchImpl = async () => ({ ok: false, status: 503 });
  const result = await quantumRandomUint16({ fetchImpl, fallbackRng: () => 0.5 });
  assert.equal(result.source, "math-random-fallback");
  assert.equal(result.value, Math.floor(0.5 * 65536));
  assert.match(result.detail, /503/);
});

test("falls back when success is not true", async () => {
  const fetchImpl = async () => anuResponse([100], { success: false });
  const result = await quantumRandomUint16({ fetchImpl, fallbackRng: () => 0.1 });
  assert.equal(result.source, "math-random-fallback");
});

test("falls back on an out-of-range value", async () => {
  const fetchImpl = async () => anuResponse([99999]);
  const result = await quantumRandomUint16({ fetchImpl, fallbackRng: () => 0.1 });
  assert.equal(result.source, "math-random-fallback");
  assert.match(result.detail, /out of the expected uint16 range/);
});

test("falls back when fetch throws", async () => {
  const fetchImpl = async () => { throw new Error("ENOTFOUND"); };
  const result = await quantumRandomUint16({ fetchImpl, fallbackRng: () => 0.1 });
  assert.equal(result.source, "math-random-fallback");
  assert.match(result.detail, /ENOTFOUND/);
});

test("falls back with no crash when no fetch implementation exists", async () => {
  const result = await quantumRandomUint16({ fetchImpl: null, fallbackRng: () => 0.1 });
  assert.equal(result.source, "math-random-fallback");
  assert.match(result.detail, /no fetch implementation/);
});

test("aborts and falls back on timeout", async () => {
  const fetchImpl = (_url, { signal } = {}) =>
    new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  const result = await quantumRandomUint16({ fetchImpl, fallbackRng: () => 0.1, timeoutMs: 10 });
  assert.equal(result.source, "math-random-fallback");
  assert.match(result.detail, /timed out/);
});
