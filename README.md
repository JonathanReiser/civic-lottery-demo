# Civic Lottery Demo

A small, real, working demonstration of **pre-commitment + independently-sourced
real entropy + a public, verifiable record** — the pattern behind provably-fair
selection for jury pools, oversubscribed housing/visa lotteries, or election
audit sampling. Built as a follow-on from
[governance-playground](https://github.com/JonathanReiser/governance-playground)'s
quantum-instinct-layer work (same `quantumRng.js` pattern, same real ANU QRNG
entropy source), applied to a civic-fairness problem instead of a geopolitical
simulation.

That sibling project has since gone further — its instinct layer now has a
Tier 2 (`python-bridge/`) that runs the same circuit on **real IBM quantum
hardware**, verified live (`ibm_marrakesh`, real job ids). This repo's own
entropy sourcing (ANU QRNG + NIST Beacon) is still classical hardware
generating physically real randomness, not a QPU — a genuinely different, and
for this use case sufficient, kind of "real." See governance-playground's
README for the Tier 1/Tier 2 distinction spelled out precisely.

It has since acquired a sibling of its own:
[civic-budget-demo](https://github.com/JonathanReiser/civic-budget-demo)
reuses this repo's `ledger.js`, `canonicalJson.js`, `quantumRng.js` and
`nistBeacon.js` verbatim, and applies them to a *decision* rather than a
selection — a participatory budget round, where the interesting problem
turns out not to be proving the count was honest but showing what the
easy-to-understand counting rule costs in fairness.

## Status: working prototype, not a deployed system

Everything in this repo runs for real — real hashing, real entropy, real
tamper-detection, verified against a real (and, while building it, a really
failing) external API. What it is *not*: legally reviewed, tested against
real applicant PII, accessibility-audited, or run by any actual institution.
Treat it as a demonstration of the protocol and a starting point for someone
who wanted to build the real thing, not as something ready to hand real
people's housing or visa applications to. See "What's real here and what's a
stand-in" below for the specific gaps.

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

- **Real**: the ANU QRNG + NIST Beacon network calls, the cryptographic hash
  chain, the commit/draw/verify math, input validation (`commit()` rejects
  an empty roll, duplicate applicants, `numWinners` outside a sane range —
  see `test/lottery.test.js`), and the tamper-detection (see `demo.js` step
  4 — it doesn't just claim tampering is caught, it tampers a copy and
  proves `verify()` catches it).
- **Stand-in**: the "public ledger" is a local hash chain
  (`src/ledger.js`), not a real blockchain deployment. governance-playground
  already demonstrates real Solidity/Hardhat/Sepolia deployment elsewhere in
  this research program; the thing worth demonstrating fresh here is the
  commit-reveal protocol itself. Swapping `Ledger.append()` for an actual
  on-chain transaction is a real but separable next step — the property that
  matters (each entry's hash depends on everything before it, so altering any
  past entry is detectable) is genuine here, just backed by a local chain
  instead of a distributed one.
- **Not attempted at all — real deployment gaps, not coding gaps**: no
  handling of real applicant PII (a real deployment touches names,
  addresses, SSNs — a completely different privacy/security posture than
  this demo's fictional roster), no legal review of whether this satisfies
  any actual jurisdiction's procurement or records-retention rules, no
  accessibility audit (Section 508 / WCAG, relevant the moment a real
  government agency runs this), no dispute-resolution process for a
  rejected applicant, no rate-limit/quota handling for ANU or NIST at real
  civic scale, no institutional partner. These aren't a backlog to work
  through alone — they need an actual agency, actual counsel, and an actual
  accessibility review before this touches a real person's housing
  application.

## A real failure hit this while building it — and led to hardening it

Running `demo.js` live, only 1 of 4 entropy draws actually reached ANU's
server — the other 3 got `HTTP 500` and fell back to a PRNG, honestly labeled
`math-random-fallback` in the output, not silently swapped. Confirmed via
direct `curl` that ANU's API was returning 500 consistently at the time
(including after a 20s cooldown), not a bug in this code. The demo still
produced a fully valid, independently verifiable result — the fallback design
working exactly as intended under a real, unplanned failure, not a
hypothetical one.

That outage is also the reason `src/nistBeacon.js` exists: relying on exactly
one external entropy provider means that provider's downtime fully controls
the fallback rate. The seed is now combined from **two independent real
sources** — ANU's QRNG and [NIST's public Randomness
Beacon](https://beacon.nist.gov/) (confirmed live 2026-08-23: a real 512-bit
value every 60 seconds, CORS-open, and — worth noting — already itself a
hash-chained public ledger, each pulse referencing the previous one,
government-run instead of self-hosted). Neither source alone controls the
final seed. Proof this isn't hypothetical: rerunning the demo after adding
NIST as a second source, **ANU was still down** (1/4 real again) — but NIST
was up and contributed a real pulse (`#1914796`), so the draw stayed grounded
in genuine external entropy instead of falling all the way back to a plain
PRNG. Exactly the failure mode this hardening exists for, caught live.

## Running it

```bash
npm test   # 44 automated tests, no network calls, no dependencies
npm run demo   # the real end-to-end flow, real ANU + NIST network calls
```

**Interactive, click-through version:** [The Sealed Drawing](https://claude.ai/code/artifact/f565d166-9b88-4789-ac88-e54daed32a11)
— the same protocol (real SHA-256, a real hash chain, real tamper-detection
you can try yourself), running in the browser via the Web Crypto API. A
sandboxed page can't reach ANU/NIST's live servers, so it uses the browser's
own cryptographic RNG for entropy instead of this repo's dual external
sources — the page says so explicitly rather than implying it's the
network-connected version.

## Files

- `src/quantumRng.js` — real entropy source #1 (ANU QRNG + honest PRNG fallback)
- `src/nistBeacon.js` — real entropy source #2 (NIST Randomness Beacon + honest PRNG fallback)
- `src/canonicalJson.js` — deterministic serialization (hashing needs this;
  plain `JSON.stringify` key-ordering isn't guaranteed stable across machines)
- `src/ledger.js` — hash-chained append-only log, stands in for "on-chain"
- `src/lottery.js` — the actual commit / draw / verify protocol, combining both sources
- `demo.js` — runs the real flow end-to-end, then proves tamper-detection
  works by tampering a copy and showing `verify()` catches it
- `test/` — 44 tests, network-free (injected fake entropy sources)
