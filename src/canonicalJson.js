/**
 * canonicalJson.js — deterministic JSON serialization.
 *
 * Plain JSON.stringify is NOT safe for hashing: two independent verifiers
 * (or the same code run twice) can produce objects with keys in different
 * insertion order and get different byte strings — and therefore different
 * hashes — for data that's semantically identical. That would make honest
 * re-verification fail for the wrong reason (a serialization quirk, not
 * real tampering), which defeats the entire point of a hash-chained
 * ledger. This sorts object keys recursively before stringifying so the
 * same data always produces the same bytes, on any machine, any time.
 */
export function canonicalStringify(value) {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }
  return value;
}
