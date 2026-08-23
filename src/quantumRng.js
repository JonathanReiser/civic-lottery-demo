/**
 * quantumRng.js — real quantum entropy for the civic lottery's draw step.
 *
 * Same pattern as governance-playground's frontend/src/lib/quantumRng.js
 * (built 2026-08-23, same session as this demo) — sources randomness from
 * the ANU Quantum Random Numbers Server (qrng.anu.edu.au), a public API
 * backed by a physical experiment (laser vacuum-fluctuation measurement),
 * not a relabeled PRNG. Falls back to Math.random() on any failure, and
 * always says which one actually happened — never silently wears a label
 * it didn't earn.
 *
 * WHY THIS MATTERS HERE SPECIFICALLY (see README.md for the full argument):
 * commit-reveal alone stops the lottery operator from changing an input
 * AFTER committing to it — it does not stop them from choosing which input
 * to commit to in the first place, if they generated that input
 * themselves. A PRNG-sourced seed is, in principle, something a motivated
 * operator could pre-compute many candidates of and pick a favorable one
 * from before ever publishing a commitment. A real, independent third
 * party's physical measurement can't be known by anyone — including the
 * operator — before it happens. That's the actual load-bearing property,
 * not just a nicer statistical distribution.
 */

const ANU_QRNG_URL = "https://qrng.anu.edu.au/API/jsonI.php?length=1&type=uint16";
const UINT16_RANGE = 65536;

/**
 * One real (or honestly-labeled fallback) random integer in [0, 65535].
 * Returns the raw integer (not a float) because the lottery seed wants
 * real entropy bits, not a pre-divided probability — callers combine
 * several of these into a larger seed (see lottery.js's drawSeed()).
 *
 * @returns {Promise<{value: number, source: "anu-qrng"|"math-random-fallback", detail?: string}>}
 */
export async function quantumRandomUint16({
  fetchImpl = typeof fetch === "function" ? fetch : undefined,
  fallbackRng = Math.random,
  timeoutMs = 5000,
} = {}) {
  const fallback = (detail) => ({ value: Math.floor(fallbackRng() * UINT16_RANGE), source: "math-random-fallback", detail });

  if (typeof fetchImpl !== "function") {
    return fallback("no fetch implementation available in this environment");
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetchImpl(ANU_QRNG_URL, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) return fallback(`ANU QRNG HTTP ${response.status}`);

    const body = await response.json();
    const raw = body?.data?.[0];
    if (body?.success !== true || typeof raw !== "number" || !Number.isFinite(raw)) {
      return fallback("ANU QRNG returned an unexpected response shape");
    }
    if (raw < 0 || raw > UINT16_RANGE - 1) {
      return fallback(`ANU QRNG value ${raw} out of the expected uint16 range`);
    }

    return { value: raw, source: "anu-qrng" };
  } catch (err) {
    const reason = err?.name === "AbortError" ? `ANU QRNG request timed out after ${timeoutMs}ms` : `ANU QRNG request failed: ${err.message}`;
    return fallback(reason);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
