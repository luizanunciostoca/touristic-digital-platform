import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("root workflow provides base-controlled trust reconciliation", async () => {
  const workflow = await read(".github/workflows/morro-claim-guard.yml");
  assert.match(workflow, /name: base-controlled-trust-root-reconciliation/);
  assert.match(workflow, /Checkout trusted base[\s\S]*pull_request\.base\.sha/);
  assert.match(
    workflow,
    /Checkout candidate as data[\s\S]*pull_request\.head\.sha/,
  );
  assert.match(workflow, /CLAIM_GUARD_AUTHORITY: ORCHESTRATOR/);
  assert.match(
    workflow,
    /node trusted\/tooling\/fabric\/claim-guard\.mjs candidate/,
  );
  assert.match(workflow, /morro-claim-guard\.yml'[\s\S]*required=false/);
});

test("scheduler freezes immutable roots and verifies routed trust evidence", async () => {
  const scheduler = await read("tooling/mdctl/scheduler-live.mjs");
  assert.match(
    scheduler,
    /TRUST_ROOT_WORKFLOW = "\.github\/workflows\/morro-claim-guard\.yml"/,
  );
  assert.match(
    scheduler,
    /TRUST_ROOT_RECONCILIATION_JOB =\s*"base-controlled-trust-root-reconciliation"/,
  );
  assert.match(scheduler, /TRUSTED_IMMUTABLE_FILES/);
  assert.match(scheduler, /TRUSTED_ROUTABLE_FILES/);
  assert.match(scheduler, /TRUSTED_IMMUTABLE_FILE_DIVERGED/);
  assert.match(scheduler, /TRUST_ROOT_RECONCILIATION_STEP/);
  assert.match(scheduler, /reasonPrefix \+ "_STEP_INVALID"/);
  assert.match(scheduler, /reasonPrefix: "TRUST_ROOT_RECONCILIATION"/);
  assert.match(
    scheduler,
    /authority: "BASE_CONTROLLED_TRUST_ROOT_RECONCILIATION"/,
  );
});

test("scheduler reanchor admission stays exact-head trusted and bounded", async () => {
  const scheduler = await read("tooling/mdctl/scheduler-live.mjs");
  assert.match(scheduler, /trustedReanchorTransientPaths/);
  assert.match(
    scheduler,
    /trust\?\.authority !== "TRUSTED_CLAIM_GUARD_EXACT_HEAD"/,
  );
  assert.match(
    scheduler,
    /candidateClaim\?\.baseSha !== mainSha/,
  );
  assert.match(
    scheduler,
    /candidateChangeSet\?\.baseSha !== mainSha/,
  );
  assert.match(
    scheduler,
    /"\.github\/morro-control\/claims\.json"/,
  );
  assert.match(
    scheduler,
    /"\.github\/morro-control\/events\.ndjson"/,
  );
  assert.doesNotMatch(scheduler, /allowUntrustedReanchor|callerTransientPaths/);
});
