import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Ledger } from "../src/ledger.js";
import { commit, draw, verify, runAlgorithm } from "../src/lottery.js";
import { canonicalStringify } from "../src/canonicalJson.js";

// Recompute an entry's hash the exact way Ledger.append() does, so a test
// can simulate a SOPHISTICATED tamper attempt (one that also patches the
// entry's own stored hash to match) — isolating whether verify()'s own
// checks catch it independently of chain integrity, not just relying on
// the cruder "forgot to update the hash" case.
function rehash(entry) {
  const { hash: _old, ...content } = entry;
  entry.hash = createHash("sha256").update(canonicalStringify(content)).digest("hex");
}

const APPLICANTS = ["a01", "a02", "a03", "a04", "a05", "a06", "a07", "a08"];

// Deterministic, network-free ANU stand-in — same {value, source} contract
// quantumRandomUint16 returns, so draw()/verify() can't tell the difference.
function fixedAnu(values, source = "test-fixed") {
  let i = 0;
  return async () => ({ value: values[i++ % values.length], source });
}

// Deterministic, network-free NIST stand-in — same {value, source} contract
// nistRandomHex returns.
function fixedNist(hexValue, source = "test-fixed") {
  return async () => ({ value: hexValue, source });
}

const NIST_A = "aa".repeat(64);
const NIST_B = "bb".repeat(64);

test("commit() produces a stable hash for the same payload", () => {
  const l1 = new Ledger();
  const l2 = new Ledger();
  const params = { applicantIds: APPLICANTS, numWinners: 3, targetTime: "2026-08-23T00:00:00Z" };
  const c1 = commit(l1, params);
  const c2 = commit(l2, params);
  assert.equal(c1.data.commitmentHash, c2.data.commitmentHash);
});

test("commit() produces a different hash if the applicant list differs", () => {
  const l = new Ledger();
  const c1 = commit(l, { applicantIds: APPLICANTS, numWinners: 3, targetTime: "t" });
  const c2 = commit(new Ledger(), { applicantIds: [...APPLICANTS, "a09"], numWinners: 3, targetTime: "t" });
  assert.notEqual(c1.data.commitmentHash, c2.data.commitmentHash);
});

test("runAlgorithm() is fully deterministic given the same seed", () => {
  const w1 = runAlgorithm(12345, APPLICANTS, 3);
  const w2 = runAlgorithm(12345, APPLICANTS, 3);
  assert.deepEqual(w1, w2);
});

test("runAlgorithm() picks exactly numWinners distinct applicants from the real list", () => {
  const w = runAlgorithm(999, APPLICANTS, 3);
  assert.equal(w.length, 3);
  assert.equal(new Set(w).size, 3); // no duplicates
  for (const winner of w) assert.ok(APPLICANTS.includes(winner));
});

test("end-to-end: legitimate commit + draw verifies clean (network-free via injected sources)", async () => {
  const ledger = new Ledger();
  const commitEntry = commit(ledger, { applicantIds: APPLICANTS, numWinners: 3, targetTime: "t" });
  await draw(ledger, commitEntry, fixedAnu([111, 222, 333, 444]), fixedNist(NIST_A));

  const result = verify(ledger);
  assert.equal(result.valid, true);
  assert.equal(result.winners.length, 3);
});

test("same injected sources -> identical seed and identical winners, run twice independently", async () => {
  const runOnce = async () => {
    const ledger = new Ledger();
    const commitEntry = commit(ledger, { applicantIds: APPLICANTS, numWinners: 3, targetTime: "t" });
    const drawEntry = await draw(ledger, commitEntry, fixedAnu([1, 2, 3, 4]), fixedNist(NIST_A));
    return drawEntry.data;
  };
  const first = await runOnce();
  const second = await runOnce();
  assert.equal(first.seed, second.seed);
  assert.deepEqual(first.winners, second.winners);
});

test("changing ONLY the NIST contribution (ANU held fixed) changes the seed — both sources genuinely participate", async () => {
  const ledgerA = new Ledger();
  const commitA = commit(ledgerA, { applicantIds: APPLICANTS, numWinners: 3, targetTime: "t" });
  const drawA = await draw(ledgerA, commitA, fixedAnu([1, 2, 3, 4]), fixedNist(NIST_A));

  const ledgerB = new Ledger();
  const commitB = commit(ledgerB, { applicantIds: APPLICANTS, numWinners: 3, targetTime: "t" });
  const drawB = await draw(ledgerB, commitB, fixedAnu([1, 2, 3, 4]), fixedNist(NIST_B));

  assert.notEqual(drawA.data.seed, drawB.data.seed);
});

test("ANU down, NIST up: draw still succeeds and verifies, grounded in NIST's real entropy rather than pure PRNG", async () => {
  const ledger = new Ledger();
  const commitEntry = commit(ledger, { applicantIds: APPLICANTS, numWinners: 2, targetTime: "t" });
  await draw(ledger, commitEntry, fixedAnu([9, 9, 9, 9], "math-random-fallback"), fixedNist(NIST_A, "nist-beacon"));
  assert.equal(verify(ledger).valid, true);
});

test("NIST down, ANU up: draw still succeeds and verifies, grounded in ANU's real entropy", async () => {
  const ledger = new Ledger();
  const commitEntry = commit(ledger, { applicantIds: APPLICANTS, numWinners: 2, targetTime: "t" });
  await draw(ledger, commitEntry, fixedAnu([1, 2, 3, 4], "anu-qrng"), fixedNist("00".repeat(64), "math-random-fallback"));
  assert.equal(verify(ledger).valid, true);
});

test("both sources down: still produces a well-formed, internally-consistent, verifiable draw (degraded, not broken)", async () => {
  const ledger = new Ledger();
  const commitEntry = commit(ledger, { applicantIds: APPLICANTS, numWinners: 2, targetTime: "t" });
  await draw(ledger, commitEntry, fixedAnu([5, 6, 7, 8], "math-random-fallback"), fixedNist(NIST_B, "math-random-fallback"));
  assert.equal(verify(ledger).valid, true);
});

test("a draw entry missing its NIST contribution entirely is caught, not silently accepted", async () => {
  const ledger = new Ledger();
  const commitEntry = commit(ledger, { applicantIds: APPLICANTS, numWinners: 3, targetTime: "t" });
  await draw(ledger, commitEntry, fixedAnu([1, 2, 3, 4]), fixedNist(NIST_A));

  const drawEntry = ledger.entries.find((e) => e.type === "draw");
  delete drawEntry.data.nistDraw;
  rehash(drawEntry);
  assert.equal(ledger.verifyChain().valid, true, "sanity check: chain integrity alone should NOT catch this");

  const result = verify(ledger);
  assert.equal(result.valid, false);
  assert.match(result.reason, /NIST/);
});

test("tampering the winner list without recomputing the hash is caught", async () => {
  const ledger = new Ledger();
  const commitEntry = commit(ledger, { applicantIds: APPLICANTS, numWinners: 3, targetTime: "t" });
  await draw(ledger, commitEntry, fixedAnu([1, 2, 3, 4]), fixedNist(NIST_A));

  ledger.entries.find((e) => e.type === "draw").data.winners = ["a01", "a02", "a03"];
  const result = verify(ledger);
  assert.equal(result.valid, false);
  assert.match(result.reason, /entry content does not match|tampered/);
});

test("tampering the seed without recomputing from the raw entropy is caught, even if the ledger hash is patched to match", async () => {
  const ledger = new Ledger();
  const commitEntry = commit(ledger, { applicantIds: APPLICANTS, numWinners: 3, targetTime: "t" });
  await draw(ledger, commitEntry, fixedAnu([1, 2, 3, 4]), fixedNist(NIST_A));

  // A more sophisticated tamper attempt: also patch the entry's own
  // stored hash to match the new (wrong) seed, so ledger.verifyChain()
  // alone would NOT catch it — this isolates whether verify()'s
  // independent seed-vs-raw-entropy recomputation is the thing doing the
  // catching, not just chain integrity.
  const drawEntry = ledger.entries.find((e) => e.type === "draw");
  drawEntry.data.seed = 42;
  rehash(drawEntry);
  assert.equal(ledger.verifyChain().valid, true, "sanity check: chain integrity alone should NOT catch this");

  const result = verify(ledger);
  assert.equal(result.valid, false);
  assert.match(result.reason, /seed/);
});

test("a draw entry pointing at the wrong commitment is caught, isolated from chain integrity", async () => {
  const ledger = new Ledger();
  const commitEntry = commit(ledger, { applicantIds: APPLICANTS, numWinners: 3, targetTime: "t" });
  await draw(ledger, commitEntry, fixedAnu([1, 2, 3, 4]), fixedNist(NIST_A));

  const drawEntry = ledger.entries.find((e) => e.type === "draw");
  drawEntry.data.commitmentHash = "deadbeef".repeat(8);
  rehash(drawEntry); // sophisticated tamper: chain integrity alone would NOT catch this
  assert.equal(ledger.verifyChain().valid, true, "sanity check: chain integrity alone should NOT catch this");

  const result = verify(ledger);
  assert.equal(result.valid, false);
  assert.match(result.reason, /commitment/);
});
