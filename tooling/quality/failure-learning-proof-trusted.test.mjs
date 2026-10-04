import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import {
  ACTIVATION_PATH,
  ASSERTION,
  JOB_NAME,
  REPOSITORY,
  WORKFLOW_NAME,
  WORKFLOW_PATH,
  buildActivationRecord,
  buildGuardProof,
  buildTrustedFailureLearningProof,
  currentValidatorRevision,
  runTrustedSemanticProbe,
  trustedContext,
  validateCandidateContract,
} from "./failure-learning-proof-trusted.mjs";

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  }).trim();
}
function write(root, path, content) {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
function secureEngineSource() {
  return `
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const registry = () => JSON.parse(readFileSync(new URL("../../.github/morro-control/failures/guard-activations.json", import.meta.url), "utf8"));
export function fingerprint(input) {
  return "sha256:" + createHash("sha256").update(JSON.stringify({
    failureClass: input.failureClass,
    domain: input.domain,
    environment: input.environment,
    operation: input.operation ?? null,
    expected: input.expected,
    observed: input.observed,
  })).digest("hex");
}
function canonical(proof) {
  return registry().activations.find((item) =>
    item.guardId === proof.guardId &&
    item.state === "ACTIVE_GUARD" &&
    item.candidateSha === proof.candidateBinding &&
    item.regressionTest === proof.regressionTest &&
    item.independentProof === proof.independentProof &&
    item.independentProofCandidateSha === proof.independentProofCandidateSha &&
    item.freshness === proof.freshness &&
    item.validatorRevision === proof.validatorRevision &&
    item.activatedAt === proof.activatedAt &&
    item.repository === proof.repository &&
    item.runId === proof.runId &&
    item.runAttempt === proof.runAttempt &&
    item.workflow === proof.workflow &&
    item.job === proof.job &&
    item.assertion === proof.assertion
  );
}
export function promoteGuard(incident, proof) {
  if (!canonical(proof)) throw new Error("GUARD_PROOF_SOURCE_UNVERIFIED");
  return {
    ...incident,
    state: "ACTIVE_GUARD",
    guardId: proof.guardId,
    guardActivationAt: proof.activatedAt,
    guardRevision: proof.validatorRevision,
    proofReference: proof.independentProof,
    candidateBinding: proof.candidateBinding,
    regressionTestReference: proof.regressionTest,
  };
}
export function recordOccurrence(existing, occurrence) {
  if (!existing) {
    return {
      ...occurrence,
      fingerprint: fingerprint(occurrence),
      state: "OBSERVED",
      occurrenceIds: [occurrence.occurrenceId],
      occurrences: [],
      firstOccurrence: occurrence.observedAt,
      lastOccurrence: occurrence.observedAt,
      metrics: { occurrencesBeforeGuard: 1, occurrencesAfterGuard: 0, preventedCount: 0, falsePositiveCount: 0, guardEffectiveness: "UNKNOWN" },
    };
  }
  if (existing.state === "ACTIVE_GUARD") {
    const proof = {
      guardId: existing.guardId,
      regressionTest: existing.regressionTestReference,
      independentProof: existing.proofReference,
      independentProofCandidateSha: existing.candidateBinding,
      candidateBinding: existing.candidateBinding,
      freshness: "FRESH",
      validatorRevision: existing.guardRevision,
      activatedAt: existing.guardActivationAt,
      repository: "luizanunciostoca/touristic-digital-platform",
      runId: "42",
      runAttempt: 1,
      workflow: ".github/workflows/failure-learning-independent-proof.yml",
      job: "trusted-failure-learning-proof",
      assertion: "GUARD_PREVENTION_PROVEN",
    };
    if (!canonical(proof)) throw new Error("GUARD_ACTIVATION_NOT_CANONICAL");
    return {
      ...existing,
      state: "ROOT_CAUSE_CONFIRMED",
      recurrenceAfterGuard: true,
      metrics: { ...existing.metrics, occurrencesAfterGuard: 1, guardEffectiveness: "INEFFECTIVE" },
    };
  }
  return existing;
}
`;
}
function insecureEngineSource() {
  return `
import { createHash } from "node:crypto";
export function fingerprint(input) {
  return "sha256:" + createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
export function promoteGuard(incident, proof) {
  return { ...incident, state: "ACTIVE_GUARD", guardId: proof.guardId, guardActivationAt: proof.activatedAt };
}
export function recordOccurrence(existing, occurrence) {
  if (!existing) return { ...occurrence, fingerprint: fingerprint(occurrence), state: "OBSERVED", occurrenceIds: [occurrence.occurrenceId], occurrences: [], metrics: {} };
  return { ...existing, state: "ROOT_CAUSE_CONFIRMED", recurrenceAfterGuard: true, metrics: { guardEffectiveness: "INEFFECTIVE" } };
}
`;
}

function fixture(t, { secure = true, selfActivate = false } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "tdp-learning-proof-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q", "-b", "infra/learning");
  git(root, "config", "user.name", "TDP Trusted Proof Test");
  git(root, "config", "user.email", "tdp-proof@example.invalid");
  write(root, "README.md", "base\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  const manifestPath = ".morro/changesets/MD-TDP-LEARNING-001.json";
  const manifest = {
    schemaVersion: 2,
    id: "MD-TDP-LEARNING-001",
    objective: "closed-loop-failure-learning",
    baseSha: base,
    branch: "infra/learning",
    state: "IMPLEMENTING",
    risk: "high",
    scope: "PLATFORM",
    owns: {
      paths: [
        "tooling/failure-learning/**",
        ".github/morro-control/failures/**",
        manifestPath,
      ],
      contracts: [],
    },
    reads: { contracts: [] },
    produces: { events: [], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
    dependencies: [],
    requiredEvidence: [
      "source-authentication",
      "guard-specific-semantic-proof",
      "canonical-activation",
      "automated-independent-proof",
      "exact-head-identity",
    ],
    requiredCapabilities: ["github:read"],
    contextPack: { maxBytes: 65536, include: ["changeset"] },
    proof: {
      budget: { maxCommands: 1, maxSeconds: 300 },
      commands: [
        {
          id: "learning",
          argv: ["node", "--test", "tooling/failure-learning/engine.test.mjs"],
          timeoutSeconds: 300,
        },
      ],
      requiredRemoteEvidence: [
        "source-authentication",
        "guard-specific-semantic-proof",
        "canonical-activation",
        "automated-independent-proof",
        "exact-head-identity",
      ],
    },
    stopAt: "REMOTE_PROVEN",
  };
  write(root, manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  write(
    root,
    "tooling/failure-learning/engine.mjs",
    secure ? secureEngineSource() : insecureEngineSource(),
  );
  write(
    root,
    "tooling/failure-learning/activation-authority.mjs",
    'export const authority = "ORCHESTRATOR";\n',
  );
  write(root, "tooling/failure-learning/engine.test.mjs", "export {};\n");
  const activation = {
    schemaVersion: 1,
    authority: "ORCHESTRATOR",
    activations: selfActivate ? [{ guardId: "AR-001" }] : [],
  };
  write(root, ACTIVATION_PATH, JSON.stringify(activation, null, 2) + "\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "candidate");
  const candidate = git(root, "rev-parse", "HEAD");
  return { root, base, candidate, manifestPath };
}

function envFor(f) {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_WORKFLOW: WORKFLOW_NAME,
    GITHUB_JOB: JOB_NAME,
    GITHUB_RUN_ID: "42",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_WORKFLOW_REF:
      REPOSITORY + "/" + WORKFLOW_PATH + "@refs/pull/1/merge",
    EXPECTED_CANDIDATE_SHA: f.candidate,
    EXPECTED_BASE_SHA: f.base,
    EXPECTED_BRANCH: "infra/learning",
    TRUSTED_VALIDATOR_SHA: f.base,
    TRUSTED_VALIDATOR_TREE_SHA: "a".repeat(40),
    MANIFEST_PATH: f.manifestPath,
  };
}

test("trusted context rejects source substitutions", () => {
  const f = {
    candidate: "b".repeat(40),
    base: "a".repeat(40),
    manifestPath: ".morro/changesets/MD-TDP-LEARNING-001.json",
  };
  const valid = {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_WORKFLOW: WORKFLOW_NAME,
    GITHUB_JOB: JOB_NAME,
    GITHUB_RUN_ID: "42",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_WORKFLOW_REF:
      REPOSITORY + "/" + WORKFLOW_PATH + "@refs/pull/1/merge",
    EXPECTED_CANDIDATE_SHA: f.candidate,
    EXPECTED_BASE_SHA: f.base,
    EXPECTED_BRANCH: "infra/learning",
    TRUSTED_VALIDATOR_SHA: f.base,
    TRUSTED_VALIDATOR_TREE_SHA: "c".repeat(40),
    MANIFEST_PATH: f.manifestPath,
  };
  assert.equal(trustedContext(valid).runAttempt, 1);
  for (const patch of [
    { GITHUB_REPOSITORY: "other/repo" },
    { GITHUB_JOB: "candidate-selected" },
    { GITHUB_RUN_ID: "0" },
    { GITHUB_RUN_ATTEMPT: "00" },
    { TRUSTED_VALIDATOR_SHA: "d".repeat(40) },
  ])
    assert.throws(() => trustedContext({ ...valid, ...patch }));
});

test("proof record binds candidate, validator, run and semantic assertion", () => {
  const context = {
    repository: REPOSITORY,
    candidateSha: "b".repeat(40),
    baseSha: "a".repeat(40),
    runId: "42",
    runAttempt: 1,
    workflow: WORKFLOW_PATH,
    job: JOB_NAME,
    assertion: ASSERTION,
  };
  const proof = buildGuardProof(
    context,
    "sha256:" + "c".repeat(64),
    "2026-10-04T05:01:00Z",
  );
  const activation = buildActivationRecord(proof);
  assert.equal(activation.candidateSha, context.candidateSha);
  assert.equal(activation.runAttempt, 1);
  assert.equal(activation.assertion, ASSERTION);
  assert.equal(activation.validatorRevision, proof.validatorRevision);
});

test("trusted semantic probe accepts only canonical activation behavior", async (t) => {
  const f = fixture(t);
  const context = trustedContext(envFor(f));
  validateCandidateContract(f.root, context);
  const result = await runTrustedSemanticProbe(
    f.root,
    context,
    currentValidatorRevision(),
  );
  assert.equal(result.activation.state, "ACTIVE_GUARD");
  assert.equal(result.activation.candidateSha, f.candidate);
});

test("trusted probe rejects candidate that accepts caller-authored proof", async (t) => {
  const f = fixture(t, { secure: false });
  const context = trustedContext(envFor(f));
  await assert.rejects(
    () => runTrustedSemanticProbe(f.root, context, currentValidatorRevision()),
    /CALLER_PROOF_MUST_NOT_ACTIVATE_GUARD|Missing expected exception/u,
  );
});

test("candidate cannot self-activate a guard before trusted proof", (t) => {
  const f = fixture(t, { selfActivate: true });
  const context = trustedContext(envFor(f));
  assert.throws(
    () => validateCandidateContract(f.root, context),
    /CANDIDATE_SELF_ACTIVATION_FORBIDDEN/u,
  );
});

test("full trusted proof emits all specific assertions without activating production state", async (t) => {
  const f = fixture(t);
  const proof = await buildTrustedFailureLearningProof(
    f.root,
    f.manifestPath,
    envFor(f),
  );
  assert.equal(proof.status, "pass");
  assert.equal(proof.candidateSha, f.candidate);
  assert.equal(proof.assertions.sourceAuthentication, "PASS");
  assert.equal(proof.assertions.guardSpecificSemanticProof, "PASS");
  assert.equal(proof.assertions.canonicalActivation, "PASS");
  assert.equal(proof.activationState, "PROVEN_NOT_ACTIVATED");
  assert.equal(proof.activationTemplate.activatedAt, null);
});
