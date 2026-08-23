/**
 * nistBeacon.js — a second, independent real entropy source.
 *
 * Confirmed live 2026-08-23 while building this: https://beacon.nist.gov/
 * beacon/2.0/pulse/last returns a real, current pulse — 512-bit
 * `localRandomValue` as hex, a 60-second cadence, CORS-open
 * (access-control-allow-origin: *), and each pulse cryptographically
 * references the previous one (`listValues[type=previous]`) — NIST's
 * beacon is, itself, already a hash-chained public ledger, government-
 * operated instead of self-hosted.
 *
 * WHY A SECOND SOURCE AT ALL: today's real ANU outage (see README.md) is
 * the argument, not a hypothetical. Relying on exactly one external
 * entropy provider means that provider's downtime — or, worse, a future
 * compromise or quiet bias — fully controls the fallback rate. Combining
 * two INDEPENDENT real sources via XOR means neither one alone controls
 * the final seed: if ANU is down, NIST's real entropy still grounds the
 * draw in something genuinely unpredictable rather than falling all the
 * way back to a plain PRNG; same in reverse.
 *
 * NIST's beacon updates only once per 60 seconds (period: 60000) — unlike
 * ANU, calling it multiple times in quick succession returns the SAME
 * pulse. That's fine here: lottery.js calls this once per draw, not once
 * per seed-component, precisely because of that cadence.
 */

const NIST_BEACON_URL = "https://beacon.nist.gov/beacon/2.0/pulse/last";

/**
 * One real (or honestly-labeled fallback) entropy value from NIST's
 * beacon, as a hex string (the full 512-bit localRandomValue).
 *
 * @returns {Promise<{value: string, source: "nist-beacon"|"math-random-fallback", detail?: string}>}
 */
export async function nistRandomHex({
  fetchImpl = typeof fetch === "function" ? fetch : undefined,
  fallbackRng = Math.random,
  timeoutMs = 5000,
} = {}) {
  const fallback = (detail) => {
    // 128 hex chars, same length as a real localRandomValue, so downstream
    // combining code never has to special-case the fallback's shape.
    const hex = Array.from({ length: 128 }, () => Math.floor(fallbackRng() * 16).toString(16)).join("");
    return { value: hex, source: "math-random-fallback", detail };
  };

  if (typeof fetchImpl !== "function") {
    return fallback("no fetch implementation available in this environment");
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetchImpl(NIST_BEACON_URL, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) return fallback(`NIST beacon HTTP ${response.status}`);

    const body = await response.json();
    const raw = body?.pulse?.localRandomValue;
    if (typeof raw !== "string" || !/^[0-9A-Fa-f]{128}$/.test(raw)) {
      return fallback("NIST beacon returned an unexpected response shape");
    }

    return { value: raw, source: "nist-beacon", pulseIndex: body.pulse.pulseIndex, timeStamp: body.pulse.timeStamp };
  } catch (err) {
    const reason = err?.name === "AbortError" ? `NIST beacon request timed out after ${timeoutMs}ms` : `NIST beacon request failed: ${err.message}`;
    return fallback(reason);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
