#!/usr/bin/env node
/**
 * demo.js — runs the full real protocol end to end, then proves the
 * tamper-detection actually works rather than just claiming it does.
 *
 * Real ANU QRNG network calls, no mocking — same "verified live, not just
 * argued" standard as the rest of this research program.
 */
import { Ledger } from "./src/ledger.js";
import { commit, draw, verify } from "./src/lottery.js";

const APPLICANTS = [
  "applicant-01-alvarez", "applicant-02-chen", "applicant-03-diallo",
  "applicant-04-eriksson", "applicant-05-farah", "applicant-06-garcia",
  "applicant-07-huang", "applicant-08-ibrahim", "applicant-09-jansen",
  "applicant-10-kowalski", "applicant-11-lindqvist", "applicant-12-mensah",
];
const NUM_WINNERS = 4;

function line() { console.log("─".repeat(72)); }

async function main() {
  console.log("Affordable Housing Unit Lottery — District 4 (demo, fictional applicants)\n");

  const ledger = new Ledger();

  line();
  console.log("STEP 1 — PRE-COMMIT (published before any entropy is drawn)");
  line();
  const commitEntry = commit(ledger, {
    applicantIds: APPLICANTS,
    numWinners: NUM_WINNERS,
    targetTime: new Date().toISOString(),
  });
  console.log(`Applicants (${APPLICANTS.length}):`, APPLICANTS.join(", "));
  console.log(`Winners to draw: ${NUM_WINNERS}`);
  console.log(`Algorithm (locked in): ${commitEntry.data.algorithm}`);
  console.log(`Commitment hash: ${commitEntry.data.commitmentHash}`);
  console.log(`Ledger entry #${commitEntry.index}, recorded at ${commitEntry.timestamp}`);

  line();
  console.log("STEP 2 — DRAW (real entropy pulled live from ANU's QRNG server)");
  line();
  const drawEntry = await draw(ledger, commitEntry);
  console.log("Raw draws pulled:");
  for (const d of drawEntry.data.rawDraws) {
    console.log(`  value=${d.value.toString().padStart(5)}  source=${d.source}${d.detail ? `  (${d.detail})` : ""}`);
  }
  const realCount = drawEntry.data.rawDraws.filter((d) => d.source === "anu-qrng").length;
  console.log(`\n${realCount}/${drawEntry.data.rawDraws.length} draws sourced from real quantum entropy (rest, if any, honestly-labeled PRNG fallback).`);
  console.log(`Combined seed: ${drawEntry.data.seed}`);
  console.log(`Winners: ${drawEntry.data.winners.join(", ")}`);

  line();
  console.log("STEP 3 — VERIFY (independently, from the ledger alone)");
  line();
  const result = verify(ledger);
  console.log(result.valid ? "✅ VALID — ledger intact, seed matches raw draws, winners match the locked-in algorithm." : `❌ INVALID — ${result.reason}`);

  line();
  console.log("STEP 4 — PROVE TAMPER-DETECTION ACTUALLY WORKS (not just claimed)");
  line();
  console.log("Simulating an operator who swaps in a favored applicant after seeing the real draw...\n");

  const tamperedLedger = new Ledger();
  tamperedLedger.entries = ledger.entries.map((e) => structuredClone(e));
  const tamperedDrawIndex = tamperedLedger.entries.findIndex((e) => e.type === "draw");
  const before = tamperedLedger.entries[tamperedDrawIndex].data.winners[0];
  tamperedLedger.entries[tamperedDrawIndex].data.winners[0] = "applicant-99-favored-friend";
  console.log(`Swapped winner[0]: "${before}" -> "applicant-99-favored-friend" (hash NOT recomputed, exactly what a real tamper attempt would do)`);

  const tamperedResult = verify(tamperedLedger);
  console.log(tamperedResult.valid ? "❌ TAMPER WENT UNDETECTED — this would be a real bug." : `✅ CAUGHT — ${tamperedResult.reason}`);

  line();
  console.log(tamperedResult.valid
    ? "\nSomething is wrong with the verification logic — this should never print in a working demo."
    : "\nThe legitimate ledger verifies clean; the tampered copy is caught and says exactly why. That's the whole protocol.");
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
