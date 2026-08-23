import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalStringify } from "../src/canonicalJson.js";

test("same data, different key insertion order, produces identical bytes", () => {
  const a = { z: 1, a: 2, m: { y: 1, b: 2 } };
  const b = { a: 2, m: { b: 2, y: 1 }, z: 1 };
  assert.equal(canonicalStringify(a), canonicalStringify(b));
});

test("arrays preserve order (order is semantically meaningful, unlike object keys)", () => {
  assert.notEqual(canonicalStringify([1, 2, 3]), canonicalStringify([3, 2, 1]));
});

test("nested arrays of objects are sorted at every level", () => {
  const a = [{ b: 1, a: 2 }, { d: 1, c: 2 }];
  const b = [{ a: 2, b: 1 }, { c: 2, d: 1 }];
  assert.equal(canonicalStringify(a), canonicalStringify(b));
});
