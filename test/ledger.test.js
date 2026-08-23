import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger } from "../src/ledger.js";

test("empty ledger verifies trivially", () => {
  const l = new Ledger();
  assert.deepEqual(l.verifyChain(), { valid: true, brokenAt: null, reason: null });
});

test("a legitimate multi-entry chain verifies clean", () => {
  const l = new Ledger();
  l.append("commit", { x: 1 });
  l.append("draw", { y: 2 });
  l.append("reveal", { z: 3 });
  assert.equal(l.verifyChain().valid, true);
});

test("each entry's hash actually depends on the previous entry's hash", () => {
  const l = new Ledger();
  const first = l.append("commit", { x: 1 });
  const second = l.append("draw", { y: 2 });
  assert.equal(second.prevHash, first.hash);
});

test("mutating an entry's data without recomputing its hash is caught, at the right index", () => {
  const l = new Ledger();
  l.append("commit", { x: 1 });
  l.append("draw", { y: 2 });
  l.entries[1].data.y = 999; // tamper, leave the stored hash stale
  const result = l.verifyChain();
  assert.equal(result.valid, false);
  assert.equal(result.brokenAt, 1);
});

test("mutating an entry's stored hash directly is also caught", () => {
  const l = new Ledger();
  l.append("commit", { x: 1 });
  l.entries[0].hash = "0".repeat(64);
  assert.equal(l.verifyChain().valid, false);
});

test("splicing out a middle entry breaks the chain from that point forward, not silently", () => {
  const l = new Ledger();
  l.append("commit", { x: 1 });
  l.append("draw", { y: 2 });
  l.append("reveal", { z: 3 });
  l.entries.splice(1, 1); // remove the middle entry
  const result = l.verifyChain();
  assert.equal(result.valid, false);
});
