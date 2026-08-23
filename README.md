# Civic Lottery Demo

A small, real, working demonstration of **pre-commitment + independently-sourced
real entropy + a public, verifiable record** — the pattern behind provably-fair
selection for jury pools, oversubscribed housing/visa lotteries, or election
audit sampling. Built as a follow-on from
[governance-playground](../governance-playground)'s quantum-instinct-layer work
(same `quantumRng.js` pattern, same real ANU QRNG entropy source), applied to
a civic-fairness problem instead of a geopolitical simulation.

## The problem this solves

A city picks 4 winners out of 12 applicants for something scarce (housing,
visas, jury duty). How does anyone outside the city government know the
lottery wasn't secretly rigged?

**A statistically good random number generator doesn't answer this.** The
classic failure mode isn't bad randomness — it's an operator quietly running
the lottery multiple times in private and only publishing the run they liked
("grinding"). The 1970 U.S. draft lottery is the canonical real example of a
related failure: the drum wasn't mixed properly, and later-in-year birthdates
were measurably more likely to be drawn — a real, statistically detectable
non-randomness in a process whose entire legitimacy rested on being random.

## The protocol

Not classic commit-reveal (hiding a secret you chose, so an opponent can't
react to it — rock-paper-scissors over a network). There's no operator secret
here to hide; the entropy comes from an independent third party (ANU's
Quantum Random Numbers Server, a physical laser vacuum-fluctuation
measurement) the operator doesn't control either. What this protocol actually
does is **pre-commitment**:

```
1. COMMIT   — publish, in the clear, before any entropy exists:
              the applicant list, how many winners, which algorithm,
              when the draw happens. Locked in publicly.

2. DRAW     — at/after that time, pull real entropy from ANU's QRNG
              (falls back to a PRNG, honestly labeled, if ANU is
              unreachable — see "A real failure hit this while building
              it" below). Run the now-locked-in deterministic algorithm.
              Publish the raw entropy values + resulting winners.

3. VERIFY   — anyone, independently, with only the published record:
              recompute the commitment hash, recompute the seed from the
              raw entropy values, re-run the public algorithm, confirm
              it reproduces the exact recorded winners. All three must
              hold.
```

Pre-commitment (can't change your inputs after seeing the outcome) + genuinely
external unpredictable entropy (can't choose favorable inputs before the fact
either, because nobody — including the operator — could know what "favorable"
would even mean yet) close a loop neither one closes alone.

## Why real quantum entropy specifically, not just a good PRNG

A PRNG-sourced seed is, in principle, something a motivated operator could
pre-compute many candidates of before ever publishing a commitment, and only
commit to a favorable one. A real, independent third party's physical
measurement can't be known by anyone — including the operator — before it
happens. That's the load-bearing property. Pre-commitment alone stops
changing your mind *after* the fact; genuinely external entropy stops
choosing favorably *before* it, too.

## What's real here and what's a stand-in

- **Real**: the ANU QRNG network calls, the cryptographic hash chain, the
  commit/draw/verify math, the tamper-detection (see `demo.js` step 4 — it
  doesn't just claim tampering is caught, it tampers a copy and proves
  `verify()` catches it).
- **Stand-in**: the "public ledger" is a local hash chain
  (`src/ledger.js`), not a real blockchain deployment. governance-playground
  already demonstrates real Solidity/Hardhat/Sepolia deployment elsewhere in
  this research program; the thing worth demonstrating fresh here is the
  commit-reveal protocol itself. Swapping `Ledger.append()` for an actual
  on-chain transaction is a real but separable next step — the property that
  matters (each entry's hash depends on everything before it, so altering any
  past entry is detectable) is genuine here, just backed by a local chain
  instead of a distributed one.

## A real failure hit this while building it

Running `demo.js` live, only 1 of 4 entropy draws actually reached ANU's
server — the other 3 got `HTTP 500` and fell back to a PRNG, honestly labeled
`math-random-fallback` in the output, not silently swapped. Confirmed via
direct `curl` that ANU's API was returning 500 consistently at the time
(including after a 20s cooldown), not a bug in this code. The demo still
produced a fully valid, independently verifiable result — this is the
fallback design working exactly as intended under a real, unplanned failure,
not a hypothetical one.

## Running it

```bash
npm test   # 26 automated tests, no network calls, no dependencies
npm run demo   # the real end-to-end flow, real ANU network calls
```

## Files

- `src/quantumRng.js` — real entropy source (ANU QRNG + honest PRNG fallback)
- `src/canonicalJson.js` — deterministic serialization (hashing needs this;
  plain `JSON.stringify` key-ordering isn't guaranteed stable across machines)
- `src/ledger.js` — hash-chained append-only log, stands in for "on-chain"
- `src/lottery.js` — the actual commit / draw / verify protocol
- `demo.js` — runs the real flow end-to-end, then proves tamper-detection
  works by tampering a copy and showing `verify()` catches it
- `test/` — 26 tests, network-free (injected fake entropy sources)
