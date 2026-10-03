import assert from "node:assert/strict";
import test from "node:test";

import {
  loadTdpMaxDocuments,
  validateTdpMaxDocuments,
} from "./validate-config.mjs";

const canonical = await loadTdpMaxDocuments();

function changed(mutator) {
  const copy = structuredClone(canonical);
  mutator(copy);
  return copy;
}

function disable(id) {
  return changed((documents) => {
    const entry = documents.antiRecurrence.controls.find(
      (item) => item.id === id,
    );
    entry.enabled = false;
  });
}

test("canonical TDP-MAX configuration passes", () => {
  const proof = validateTdpMaxDocuments(canonical);
  assert.equal(proof.status, "pass");
  assert.equal(proof.controls.length, 6);
});

test("stale-head regression is rejected", () => {
  assert.throws(
    () => validateTdpMaxDocuments(disable("stale-head")),
    /CONTROL_SET/u,
  );
});

test("false-CI-green regression is rejected", () => {
  assert.throws(
    () => validateTdpMaxDocuments(disable("false-ci-green")),
    /CONTROL_SET/u,
  );
});

test("wrong-runtime-target regression is rejected", () => {
  assert.throws(
    () => validateTdpMaxDocuments(disable("wrong-runtime-target")),
    /CONTROL_SET/u,
  );
});

test("AI-as-authority regression is rejected", () => {
  assert.throws(
    () => validateTdpMaxDocuments(disable("ai-as-authority")),
    /CONTROL_SET/u,
  );
});

test("Termux transport misclassification regression is rejected", () => {
  assert.throws(
    () =>
      validateTdpMaxDocuments(disable("termux-transport-misclassification")),
    /CONTROL_SET/u,
  );
});

test("stale DR proof regression is rejected", () => {
  assert.throws(
    () => validateTdpMaxDocuments(disable("stale-dr-proof")),
    /CONTROL_SET/u,
  );
});
