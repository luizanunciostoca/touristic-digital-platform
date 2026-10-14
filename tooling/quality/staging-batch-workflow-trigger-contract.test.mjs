import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const workflowFile = ".github/workflows/render-staging-blueprint-contract.yml";
const workflowSource = readFileSync(workflowFile, "utf8");
const requiredInputs = [
  "apps/morro-digital-platform/tooling/legacy-commercial-publication-batch.mjs",
  "apps/morro-digital-platform/tooling/legacy-commercial-publication-batch.test.mjs",
  "apps/morro-digital-platform/tooling/legacy-commercial-draft-verify-core.mjs",
  "tooling/quality/legacy-commercial-publication-marker-contract.test.mjs",
  "tooling/quality/staging-batch-workflow-trigger-contract.test.mjs",
];

function prTriggerPaths(source) {
  const anchor = "on:\n  workflow_dispatch:\n  pull_request:\n    paths:\n";
  const index = source.indexOf(anchor);
  assert.ok(index >= 0, "STAGING_PR_TRIGGER_REQUIRED");
  const paths = [];
  for (const line of source.slice(index + anchor.length).split(/\r?\n/u)) {
    if (line.startsWith("      - ")) {
      paths.push(line.slice("      - ".length).trim());
      continue;
    }
    if (!line.trim()) continue;
    break;
  }
  return paths;
}

test("staging publication batch changes actually trigger staging workflow", () => {
  const paths = prTriggerPaths(workflowSource);
  for (const path of requiredInputs) {
    assert.ok(existsSync(path), "STAGING_TRIGGER_SOURCE_MISSING:" + path);
    assert.equal(
      paths.filter((item) => item === path).length,
      1,
      "STAGING_TRIGGER_NOT_SELECTED:" + path,
    );
  }
  assert.ok(
    paths.includes(workflowFile),
    "STAGING_WORKFLOW_SELF_TRIGGER_MISSING",
  );
});

test("staging workflow runs deterministic trigger and historical marker proofs", () => {
  assert.match(
    workflowSource,
    /node --test tooling\/quality\/legacy-commercial-publication-marker-contract\.test\.mjs tooling\/quality\/staging-batch-workflow-trigger-contract\.test\.mjs/u,
  );
  assert.match(
    workflowSource,
    /- name: Validate staging Blueprint invariants/u,
  );
  assert.match(
    workflowSource,
    /- name: Reject missing or misbound staging database domains/u,
  );
});
