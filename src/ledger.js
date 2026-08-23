/**
 * ledger.js — a minimal hash-chained append-only log.
 *
 * Standing in for "publish this on-chain" without needing a real
 * blockchain deployment for what's fundamentally a protocol demo, not a
 * distributed-systems one — governance-playground already demonstrates
 * real Solidity/Hardhat/Sepolia deployment elsewhere in this research
 * program; the thing worth demonstrating fresh here is the commit-reveal
 * + real-entropy protocol itself. The property that actually matters
 * (each entry's hash depends on everything before it, so altering any
 * past entry is detectable) is real here, not simulated — just backed by
 * a local hash chain instead of a distributed one. Swapping this for an
 * actual on-chain publish (append() -> a contract call, one transaction
 * per entry) would be a real but separable next step; see README.md.
 */
import { createHash } from "node:crypto";
import { canonicalStringify } from "./canonicalJson.js";

const GENESIS_HASH = "0".repeat(64);

export class Ledger {
  constructor() {
    this.entries = [];
  }

  sha256(str) {
    return createHash("sha256").update(str).digest("hex");
  }

  /** Append one entry. Returns the entry, including its own hash. */
  append(type, data) {
    const prevHash = this.entries.length > 0 ? this.entries.at(-1).hash : GENESIS_HASH;
    const index = this.entries.length;
    const timestamp = new Date().toISOString();
    const content = { index, timestamp, type, data, prevHash };
    const hash = this.sha256(canonicalStringify(content));
    const entry = { ...content, hash };
    this.entries.push(entry);
    return entry;
  }

  /**
   * Replay the entire chain from scratch and confirm every entry's hash
   * is exactly what it should be given its own content and the PREVIOUS
   * entry's hash. Any tampering with any past entry — content or hash —
   * breaks the chain from that point forward, and this says exactly
   * where.
   */
  verifyChain() {
    let expectedPrevHash = GENESIS_HASH;
    for (const entry of this.entries) {
      const { hash: storedHash, ...content } = entry;
      if (content.prevHash !== expectedPrevHash) {
        return { valid: false, brokenAt: entry.index, reason: "prevHash does not match the actual preceding entry" };
      }
      const recomputedHash = this.sha256(canonicalStringify(content));
      if (recomputedHash !== storedHash) {
        return { valid: false, brokenAt: entry.index, reason: "entry content does not match its own recorded hash" };
      }
      expectedPrevHash = storedHash;
    }
    return { valid: true, brokenAt: null, reason: null };
  }
}
