import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { evaluateAntiRecurrence } from "./guard-evaluator.mjs";
import {
  validateBootstrapReport,
  validateEvidenceManifest,
} from "./validate-config.mjs";

const SHA = "a".repeat(40);

test("validator accepts the canonical TDP-MAX projection", () => {
  const result = spawnSync(
    process.execPath,
    ["tooling/tdp-max/validate-config.mjs"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /TDP_MAX_CONFIG_VALID/u);
});

test("bootstrap READY rejects blocked and not-proven checks", () => {
  for (const status of ["BLOCKED", "NOT_PROVEN", "WARN"]) {
    assert.throws(
      () =>
        validateBootstrapReport({
          schemaVersion: 1,
          mainSha: SHA,
          checks: { authority: status },
          result: "READY",
        }),
      /TDP_MAX_FALSE_READY/u,
    );
  }
});

test("COMPLETE requires exact candidate, evidence, zero unknowns and zero conflicts", () => {
  const base = {
    schemaVersion: 1,
    initialMain: SHA,
    finalMain: SHA,
    candidateSha: SHA,
    artifactDigest: null,
    evidence: [
      {
        id: "exact-head",
        kind: "git",
        status: "VERIFIED",
        source: "github",
        sha: SHA,
      },
    ],
    unknowns: [],
    conflicts: [],
    verdict: "COMPLETE",
  };
  validateEvidenceManifest(base);
  assert.throws(
    () => validateEvidenceManifest({ ...base, candidateSha: null }),
    /CANDIDATE_REQUIRED/u,
  );
  assert.throws(
    () => validateEvidenceManifest({ ...base, evidence: [] }),
    /EVIDENCE_REQUIRED/u,
  );
  assert.throws(
    () => validateEvidenceManifest({ ...base, unknowns: ["x"] }),
    /COMPLETE_UNKNOWNS/u,
  );
  assert.throws(
    () => validateEvidenceManifest({ ...base, conflicts: ["x"] }),
    /COMPLETE_CONFLICTS/u,
  );
  assert.throws(
    () =>
      validateEvidenceManifest({
        ...base,
        evidence: [{ ...base.evidence[0], status: "STALE" }],
      }),
    /UNVERIFIED_EVIDENCE/u,
  );
});

test("evidence identities require immutable digest and exact SHA formats", () => {
  assert.throws(
    () =>
      validateEvidenceManifest({
        schemaVersion: 1,
        initialMain: SHA,
        finalMain: SHA,
        candidateSha: SHA,
        artifactDigest: "latest",
        evidence: [],
        unknowns: [],
        conflicts: [],
        verdict: "PARTIAL",
      }),
    /ARTIFACT_DIGEST/u,
  );
  assert.throws(
    () =>
      validateEvidenceManifest({
        schemaVersion: 1,
        initialMain: SHA,
        finalMain: SHA,
        candidateSha: SHA,
        artifactDigest: null,
        evidence: [
          {
            id: "x",
            kind: "git",
            status: "VERIFIED",
            source: "github",
            sha: "main",
          },
        ],
        unknowns: [],
        conflicts: [],
        verdict: "PARTIAL",
      }),
    /ITEM_SHA/u,
  );
});

test("stale-head is detected", () => {
  assert.deepEqual(
    evaluateAntiRecurrence({ evidenceSha: "a", currentMainSha: "b" }),
    ["STALE_HEAD"],
  );
});

test("green CI without semantic proof is detected", () => {
  assert.deepEqual(
    evaluateAntiRecurrence({
      workflowConclusion: "success",
      requirementProven: false,
      jobsRun: 1,
    }),
    ["FALSE_CI_GREEN"],
  );
});

test("wrong runtime target is detected", () => {
  assert.deepEqual(
    evaluateAntiRecurrence({
      expectedEnvironment: "production",
      observedEnvironment: "staging",
    }),
    ["WRONG_RENDER_TARGET"],
  );
});

test("AI cannot become final authority", () => {
  assert.deepEqual(evaluateAntiRecurrence({ finalAuthority: "COPILOT" }), [
    "AI_AS_AUTHORITY",
  ]);
});

test("one failed transport cannot imply tablet unreachable when another is healthy", () => {
  assert.deepEqual(
    evaluateAntiRecurrence({
      tabletDeclaredUnreachable: true,
      validTransportHealthy: [false, true],
    }),
    ["REMOTE_TRANSPORT_MISCLASSIFIED"],
  );
});

test("older DR pass is stale after a newer unreconciled failure", () => {
  assert.deepEqual(
    evaluateAntiRecurrence({
      drEvidence: [
        { observedAt: "2026-01-01T00:00:00Z", status: "PASS" },
        { observedAt: "2026-01-02T00:00:00Z", status: "FAIL" },
      ],
      drReconciled: false,
    }),
    ["STALE_DR_PROOF"],
  );
});

test("no-jobs success is detected independently", () => {
  assert.deepEqual(
    evaluateAntiRecurrence({
      workflowConclusion: "success",
      requirementProven: true,
      jobsRun: 0,
    }),
    ["NO_JOBS_RUN"],
  );
});

test("production promotion cannot use technical readiness as authorization", () => {
  assert.deepEqual(
    evaluateAntiRecurrence({
      technicallyReady: true,
      authorizedToRelease: false,
      attemptedProductionPromotion: true,
    }),
    ["TECHNICALLY_READY_NOT_AUTHORIZED"],
  );
});

test("executor dispatch fails closed when authentication is unavailable", () => {
  assert.deepEqual(
    evaluateAntiRecurrence({
      executorDispatchSelected: true,
      executorInstalled: true,
      executorAuthenticated: false,
    }),
    ["EXECUTOR_AUTH_UNAVAILABLE"],
  );
  assert.deepEqual(
    evaluateAntiRecurrence({
      executorDispatchSelected: true,
      executorInstalled: true,
      executorAuthenticated: true,
    }),
    [],
  );
});

test("remote success requires exit zero and postcondition", () => {
  assert.deepEqual(
    evaluateAntiRecurrence({
      remoteDeclaredSuccessful: true,
      remoteExitCode: 0,
      postconditionVerified: false,
    }),
    ["REMOTE_RESULT_FALSE_POSITIVE"],
  );
});
