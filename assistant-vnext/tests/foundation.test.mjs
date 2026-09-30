import test from "node:test";
import assert from "node:assert/strict";
import { deepFreeze, sha256Json } from "../dist/core/runtime.js";
import { deriveAuthenticatedUserType } from "../dist/context/profile.js";

test("foundation hashes deterministically regardless of key order", () => {
  assert.equal(sha256Json({ b: 2, a: 1 }), sha256Json({ a: 1, b: 2 }));
});

test("foundation deep freezes nested values", () => {
  const value = deepFreeze({ a: { b: 1 } });
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.a), true);
});

test("user type is never fabricated", () => {
  assert.equal(deriveAuthenticatedUserType("unknown", false), "unknown");
  assert.equal(deriveAuthenticatedUserType("anonymous", false), "anonymous");
  assert.equal(deriveAuthenticatedUserType("resident", true), "authenticated_resident");
});
