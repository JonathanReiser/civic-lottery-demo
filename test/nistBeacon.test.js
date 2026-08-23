import { test } from "node:test";
import assert from "node:assert/strict";
import { nistRandomHex } from "../src/nistBeacon.js";

const VALID_HEX = "ab".repeat(64); // 128 hex chars, matching a real localRandomValue's length

const pulseResponse = (localRandomValue, overrides = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({ pulse: { localRandomValue, pulseIndex: 1914795, ...overrides } }),
});

test("returns NIST's real pulse value straight through, labeled honestly", async () => {
  const fetchImpl = async () => pulseResponse(VALID_HEX);
  const result = await nistRandomHex({ fetchImpl });
  assert.equal(result.value, VALID_HEX);
  assert.equal(result.source, "nist-beacon");
  assert.equal(result.pulseIndex, 1914795);
});

test("falls back on a non-ok HTTP status, produces a same-length hex string", async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });
  const result = await nistRandomHex({ fetchImpl, fallbackRng: () => 0.5 });
  assert.equal(result.source, "math-random-fallback");
  assert.equal(result.value.length, 128);
  assert.match(result.detail, /500/);
});

test("falls back when localRandomValue is missing or malformed", async () => {
  const missing = await nistRandomHex({ fetchImpl: async () => pulseResponse(undefined), fallbackRng: () => 0.1 });
  assert.equal(missing.source, "math-random-fallback");

  const malformed = await nistRandomHex({ fetchImpl: async () => pulseResponse("not-hex-at-all"), fallbackRng: () => 0.1 });
  assert.equal(malformed.source, "math-random-fallback");
});

test("falls back when fetch throws", async () => {
  const fetchImpl = async () => { throw new Error("ECONNRESET"); };
  const result = await nistRandomHex({ fetchImpl, fallbackRng: () => 0.1 });
  assert.equal(result.source, "math-random-fallback");
  assert.match(result.detail, /ECONNRESET/);
});

test("falls back with no crash when no fetch implementation exists", async () => {
  const result = await nistRandomHex({ fetchImpl: null, fallbackRng: () => 0.1 });
  assert.equal(result.source, "math-random-fallback");
  assert.match(result.detail, /no fetch implementation/);
});

test("aborts and falls back on timeout", async () => {
  const fetchImpl = (_url, { signal } = {}) =>
    new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  const result = await nistRandomHex({ fetchImpl, fallbackRng: () => 0.1, timeoutMs: 10 });
  assert.equal(result.source, "math-random-fallback");
  assert.match(result.detail, /timed out/);
});
