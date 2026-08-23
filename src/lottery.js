/**
 * lottery.js — the actual protocol: pre-commit, draw, reveal, verify.
 *
 * Precisely what "commit" means here, worth being exact about: this is
 * NOT the classic commit-reveal pattern (hide a secret you chose, so an
 * adversary can't react to it before you reveal it — e.g. rock-paper-
 * scissors over a network). There's no operator-chosen secret to hide —
 * the whole point is that the operator doesn't control the entropy at
 * all; it comes from an independent third party (ANU's QRNG server) they
 * can't predict either. What "commit" does here is PRE-COMMITMENT: lock
 * the deterministic parameters (who's eligible, how many winners, which
 * algorithm, when the draw happens) in public, in the clear, BEFORE the
 * unpredictable entropy exists — so nothing about which inputs get used
 * can be quietly changed after an operator sees whether they like the
 * outcome. Pre-commitment (can't change your inputs after the fact) +
 * genuinely external unpredictable entropy (can't choose favorable inputs
 * before the fact either, because nobody could know what favorable would
 * even mean yet) together close the loop neither one closes alone.
 */
import { createHash } from "node:crypto";
import { canonicalStringify } from "./canonicalJson.js";
import { quantumRandomUint16 } from "./quantumRng.js";

const ALGORITHM = "fisher-yates-mulberry32-v1";
const SEED_DRAWS = 4; // independent real-entropy draws combined into one seed

function sha256(str) {
  return createHash("sha256").update(str).digest("hex");
}

// mulberry32 — a small, well-known, fully deterministic PRNG. Used only
// AFTER a real-entropy seed has been drawn and published; everything from
// here on is deterministic and independently re-runnable by any verifier
// who has the same seed, which is exactly the point — the unpredictability
// lives entirely in the seed, not in this function.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fisherYates(list, rng) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function runAlgorithm(seed, applicantIds, numWinners) {
  const rng = mulberry32(seed);
  const shuffled = fisherYates(applicantIds, rng);
  return shuffled.slice(0, numWinners);
}

/** Step 1 — publish parameters in the clear, before any entropy is drawn. */
export function commit(ledger, { applicantIds, numWinners, targetTime }) {
  const payload = { applicantIds, numWinners, algorithm: ALGORITHM, targetTime };
  const commitmentHash = sha256(canonicalStringify(payload));
  return ledger.append("commit", { ...payload, commitmentHash });
}

/**
 * Step 2 — at (or after) targetTime, pull real entropy and run the
 * (now-locked-in) deterministic algorithm. rngImpl is injectable so the
 * demo/tests can force the fallback path deterministically without
 * needing the network — production use omits it and gets the real
 * quantumRandomUint16 default.
 */
export async function draw(ledger, commitEntry, rngImpl = quantumRandomUint16) {
  const draws = [];
  for (let i = 0; i < SEED_DRAWS; i++) draws.push(await rngImpl());

  const seed = parseInt(sha256(canonicalStringify(draws.map((d) => d.value))).slice(0, 8), 16);
  const winners = runAlgorithm(seed, commitEntry.data.applicantIds, commitEntry.data.numWinners);

  return ledger.append("draw", {
    commitmentHash: commitEntry.data.commitmentHash,
    rawDraws: draws,
    seed,
    winners,
  });
}

/**
 * Step 3 — anyone, independently, with only the ledger, can confirm:
 * (a) the ledger itself hasn't been tampered with (hash chain intact),
 * (b) the draw entry's seed really is what those exact raw QRNG values
 *     hash to (nobody swapped in a different seed after seeing the draws),
 * (c) re-running the PUBLIC, LOCKED-IN algorithm on that seed reproduces
 *     the exact recorded winner list (nobody hand-picked different
 *     winners and just wrote them down).
 * All three must hold, or this returns why not.
 */
export function verify(ledger) {
  const chainCheck = ledger.verifyChain();
  if (!chainCheck.valid) return { valid: false, reason: `ledger tampered: ${chainCheck.reason} at entry ${chainCheck.brokenAt}` };

  const commitEntry = ledger.entries.find((e) => e.type === "commit");
  const drawEntry = ledger.entries.find((e) => e.type === "draw");
  if (!commitEntry || !drawEntry) return { valid: false, reason: "missing commit or draw entry" };

  const expectedCommitmentHash = sha256(canonicalStringify({
    applicantIds: commitEntry.data.applicantIds,
    numWinners: commitEntry.data.numWinners,
    algorithm: commitEntry.data.algorithm,
    targetTime: commitEntry.data.targetTime,
  }));
  if (expectedCommitmentHash !== commitEntry.data.commitmentHash) {
    return { valid: false, reason: "commit entry's own commitmentHash doesn't match its recorded parameters" };
  }
  if (drawEntry.data.commitmentHash !== commitEntry.data.commitmentHash) {
    return { valid: false, reason: "draw entry references a different commitment than what's on record" };
  }

  const expectedSeed = parseInt(sha256(canonicalStringify(drawEntry.data.rawDraws.map((d) => d.value))).slice(0, 8), 16);
  if (expectedSeed !== drawEntry.data.seed) {
    return { valid: false, reason: "recorded seed doesn't match what the recorded raw QRNG draws actually hash to" };
  }

  const expectedWinners = runAlgorithm(expectedSeed, commitEntry.data.applicantIds, commitEntry.data.numWinners);
  const winnersMatch = JSON.stringify(expectedWinners) === JSON.stringify(drawEntry.data.winners);
  if (!winnersMatch) {
    return { valid: false, reason: "re-running the locked-in algorithm on the recorded seed does not reproduce the recorded winners" };
  }

  return { valid: true, reason: null, winners: drawEntry.data.winners, seed: expectedSeed };
}

export { runAlgorithm, ALGORITHM };
