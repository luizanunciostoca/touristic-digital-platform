import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  assertFreshnessWindow,
  buildActivationRecord,
  buildGuardProof,
  buildTrustedFailureLearningProof,
  canonicalFreshnessSeconds,
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

function secureDetectorsSource() {
  return `
export const detectors = Object.freeze({
  STALE_HEAD: ({ observation }) =>
    observation.expectedHead === observation.observedHead ? "PASS" : "BLOCK",
});
`;
}

function secureEngineSource() {
  return `
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { detectors as canonicalDetectors } from "./detectors.mjs";

const activationRegistry = () => JSON.parse(readFileSync(
  new URL("../../.github/morro-control/failures/guard-activations.json", import.meta.url),
  "utf8",
));
const antiRecurrenceRegistry = () => JSON.parse(readFileSync(
  new URL("../../.github/morro-control/tdp-max/anti-recurrence.json", import.meta.url),
  "utf8",
)).failures;
function activationFor(proof) {
  return {
    guardId: proof.guardId,
    state: "ACTIVE_GUARD",
    candidateSha: proof.candidateSha,
    candidateBinding: proof.candidateBinding,
    regressionTest: proof.regressionTest,
    independentProof: proof.independentProof,
    independentProofCandidateSha: proof.independentProofCandidateSha,
    freshness: proof.freshness,
    freshnessSeconds: proof.freshnessSeconds,
    observedAt: proof.observedAt,
    expiresAt: proof.expiresAt,
    validatorRevision: proof.validatorRevision,
    activatedAt: proof.activatedAt,
    repository: proof.repository,
    runId: proof.runId,
    runAttempt: proof.runAttempt,
    workflow: proof.workflow,
    job: proof.job,
    assertion: proof.assertion,
  };
}
function canonical(proof) {
  return activationRegistry().activations.some((item) =>
    isDeepStrictEqual(item, activationFor(proof)));
}
export function recordOccurrence(existing, occurrence) {
  if (!existing) {
    return {
      ...occurrence,
      fingerprint: "sha256:" + createHash("sha256")
        .update(occurrence.occurrenceId).digest("hex"),
      state: "OBSERVED",
      occurrenceIds: [occurrence.occurrenceId],
      occurrences: [],
      metrics: { guardEffectiveness: "UNKNOWN" },
    };
  }
  if (existing.state === "ACTIVE_GUARD") {
    if (!canonical(existing.guardProof))
      throw new Error("GUARD_ACTIVATION_NOT_CANONICAL");
    return {
      ...existing,
      state: "ROOT_CAUSE_CONFIRMED",
      recurrenceAfterGuard: true,
    };
  }
  return existing;
}
export function promoteGuard(incident, proof) {
  if (incident.state !== "PREVENTION_PROVEN" || !incident.rootCause)
    throw new Error("GUARD_PROMOTION_PRECONDITION");
  if (!canonical(proof)) throw new Error("GUARD_PROOF_SOURCE_UNVERIFIED");
  return {
    ...incident,
    state: "ACTIVE_GUARD",
    guardProof: proof,
  };
}
export function evaluateGuards({
  operation,
  domain,
  detectors,
  registry,
  observation = {},
}) {
  const canonical = antiRecurrenceRegistry();
  if (registry !== undefined && !isDeepStrictEqual(registry, canonical))
    throw new Error("GUARD_REGISTRY_OVERRIDE_FORBIDDEN");
  detectors ??= canonicalDetectors;
  for (const [name, detector] of Object.entries(detectors))
    if (detector !== canonicalDetectors[name])
      throw new Error("GUARD_DETECTOR_OVERRIDE_FORBIDDEN");
  return canonical
    .filter((guard) =>
      (guard.operations ?? ["*"]).includes("*") ||
      (guard.operations ?? []).includes(operation) ||
      (guard.domains ?? []).includes(domain))
    .map((guard) => {
      const detector = detectors[guard.class];
      if (!detector) return { id: guard.id, class: guard.class, result: "NOT_PROVEN" };
      return {
        id: guard.id,
        class: guard.class,
        result: detector({ operation, domain, observation }),
      };
    });
}
`;
}

function maliciousEngineSource() {
  return `
import { readFileSync } from "node:fs";
for (const attack of [
  () => process.exit(0),
  () => process.env,
  () => console.log("forged proof"),
  () => readFileSync("/etc/passwd", "utf8"),
  () => ({}).constructor.constructor("return process")(),
]) {
  try { attack(); } catch {}
}
export function recordOccurrence() {
  return {
    state: "ACTIVE_GUARD",
    guardId: "AR-001",
    guardActivationAt: "2026-10-04T00:00:00.000Z",
  };
}
export function promoteGuard(incident) {
  return { ...incident, state: "ACTIVE_GUARD" };
}
export function evaluateGuards({ observation }) {
  return [
    {
      id: "AR-001",
      class: "STALE_HEAD",
      result: observation.expectedHead === observation.observedHead ? "PASS" : "BLOCK",
    },
  ];
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
    secure ? secureEngineSource() : maliciousEngineSource(),
  );
  write(
    root,
    "tooling/failure-learning/detectors.mjs",
    secureDetectorsSource(),
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
  const workflowRef = REPOSITORY + "/" + WORKFLOW_PATH + "@refs/heads/main";
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "pull_request_target",
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_WORKFLOW: WORKFLOW_NAME,
    GITHUB_JOB: JOB_NAME,
    GITHUB_RUN_ID: "42",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_WORKFLOW_REF: workflowRef,
    GITHUB_REF: "refs/heads/main",
    GITHUB_BASE_REF: "main",
    GITHUB_HEAD_REF: "infra/learning",
    EXPECTED_REPOSITORY: REPOSITORY,
    EXPECTED_HEAD_REPOSITORY: REPOSITORY,
    EXPECTED_BASE_REPOSITORY: REPOSITORY,
    EXPECTED_WORKFLOW: WORKFLOW_NAME,
    EXPECTED_JOB: JOB_NAME,
    EXPECTED_RUN_ID: "42",
    EXPECTED_RUN_ATTEMPT: "1",
    EXPECTED_WORKFLOW_REF: workflowRef,
    EXPECTED_CANDIDATE_SHA: f.candidate,
    EVENT_CANDIDATE_SHA: f.candidate,
    EXPECTED_BASE_SHA: f.base,
    EVENT_BASE_SHA: f.base,
    EXPECTED_BRANCH: "infra/learning",
    EVENT_BRANCH: "infra/learning",
    EXPECTED_BASE_BRANCH: "main",
    TRUSTED_VALIDATOR_SHA: f.base,
    TRUSTED_VALIDATOR_TREE_SHA: "a".repeat(40),
    MANIFEST_PATH: f.manifestPath,
  };
}

test("trusted context requires exact pull_request_target run identity", () => {
  const f = {
    candidate: "b".repeat(40),
    base: "a".repeat(40),
    manifestPath: ".morro/changesets/MD-TDP-LEARNING-001.json",
  };
  const valid = envFor(f);
  assert.equal(trustedContext(valid).runAttempt, 1);
  for (const patch of [
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_REPOSITORY: "other/repo" },
    { EXPECTED_HEAD_REPOSITORY: "contributor/repo" },
    { GITHUB_WORKFLOW: "candidate-selected" },
    { GITHUB_JOB: "candidate-selected" },
    { GITHUB_RUN_ID: "0" },
    { EXPECTED_RUN_ATTEMPT: "2" },
    { GITHUB_WORKFLOW_REF: "attacker/workflow@refs/heads/main" },
    { GITHUB_HEAD_REF: "other-branch" },
    { EVENT_CANDIDATE_SHA: "d".repeat(40) },
    { EVENT_BASE_SHA: "d".repeat(40) },
    { TRUSTED_VALIDATOR_SHA: "d".repeat(40) },
    { EXPECTED_BRANCH: "other-branch" },
  ]) {
    assert.throws(() => trustedContext({ ...valid, ...patch }));
  }
});

test("freshness window uses the canonical engineering snapshot limit", () => {
  const freshnessSeconds = canonicalFreshnessSeconds();
  assert.equal(freshnessSeconds, 600);
  const context = {
    candidateSha: "b".repeat(40),
    runId: "42",
    runAttempt: 1,
    workflow: WORKFLOW_PATH,
    job: JOB_NAME,
    assertion: ASSERTION,
  };
  const now = Date.now();
  const proof = buildGuardProof(
    context,
    "sha256:" + "c".repeat(64),
    freshnessSeconds,
    now,
  );
  assert.equal(
    Date.parse(proof.expiresAt),
    Date.parse(proof.observedAt) + 600_000,
  );
  assertFreshnessWindow(proof, freshnessSeconds, now);
  assert.throws(() =>
    assertFreshnessWindow(
      {
        ...proof,
        expiresAt: new Date(Date.parse(proof.expiresAt) + 1000).toISOString(),
      },
      freshnessSeconds,
      now,
    ),
  );
  assert.throws(() =>
    assertFreshnessWindow(proof, freshnessSeconds, now + 600_001),
  );

  const futureObservedAt = new Date(now + 1000).toISOString();
  assert.throws(
    () =>
      assertFreshnessWindow(
        {
          ...proof,
          observedAt: futureObservedAt,
          activatedAt: futureObservedAt,
          expiresAt: new Date(
            now + 1000 + freshnessSeconds * 1000,
          ).toISOString(),
        },
        freshnessSeconds,
        now,
      ),
    /GUARD_OBSERVATION_IN_FUTURE/u,
  );
});

test("activation record binds every freshness and run field", () => {
  const context = {
    candidateSha: "b".repeat(40),
    runId: "42",
    runAttempt: 1,
    workflow: WORKFLOW_PATH,
    job: JOB_NAME,
    assertion: ASSERTION,
  };
  const proof = buildGuardProof(
    context,
    "sha256:" + "c".repeat(64),
    canonicalFreshnessSeconds(),
  );
  const activation = buildActivationRecord(proof);
  assert.equal(activation.candidateSha, context.candidateSha);
  assert.equal(activation.candidateBinding, context.candidateSha);
  assert.equal(activation.independentProofCandidateSha, context.candidateSha);
  assert.equal(activation.runAttempt, 1);
  assert.equal(activation.assertion, ASSERTION);
  assert.equal(activation.validatorRevision, proof.validatorRevision);
  assert.equal(activation.observedAt, proof.observedAt);
  assert.equal(activation.freshnessSeconds, 600);
  assert.equal(activation.expiresAt, proof.expiresAt);
});

test("semantic probe rejects self-activation and binds AR-001 exact-head behavior", async (t) => {
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
  assert.deepEqual(result.semanticChecks, {
    exactHead: "PASS",
    staleHead: "BLOCK",
    rejectedMutations: [
      "guardId",
      "candidateSha",
      "candidateBinding",
      "regressionTest",
      "independentProof",
      "independentProofCandidateSha",
      "freshness",
      "freshnessSeconds",
      "observedAt",
      "expiresAt",
      "validatorRevision",
      "activatedAt",
      "repository",
      "runId",
      "runAttempt",
      "workflow",
      "job",
      "assertion",
    ],
    persistedActivationMutationRejected: true,
  });
});

test("candidate self-activation is rejected before sandbox execution", (t) => {
  const f = fixture(t, { selfActivate: true });
  const context = trustedContext(envFor(f));
  assert.throws(
    () => validateCandidateContract(f.root, context),
    /CANDIDATE_SELF_ACTIVATION_FORBIDDEN/u,
  );
});

test("missing candidate proof source fails closed", (t) => {
  const f = fixture(t);
  rmSync(resolve(f.root, "tooling/failure-learning/engine.mjs"));
  const context = trustedContext(envFor(f));
  assert.throws(() => validateCandidateContract(f.root, context));
});

test("hostile candidate cannot access the parent or forge a proof", async (t) => {
  const f = fixture(t, { secure: false });
  const context = trustedContext(envFor(f));
  await assert.rejects(
    () => buildTrustedFailureLearningProof(f.root, f.manifestPath, envFor(f)),
    /TDP_FAILURE_LEARNING_SANDBOX_REJECTED|SANDBOX_CHILD_REJECTED_CANDIDATE/u,
  );
  assert.equal(typeof process.env, "object");
});

test("final proof is parent-authored, fresh, and never activates production", async (t) => {
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
  assert.equal(proof.freshnessSeconds, canonicalFreshnessSeconds());
  assert.equal(
    Date.parse(proof.expiresAt),
    Date.parse(proof.observedAt) + proof.freshnessSeconds * 1000,
  );
  assert.equal(proof.activationTemplate.candidateSha, f.candidate);
  assert.equal(proof.activationTemplate.observedAt, proof.observedAt);
});

test("workflow is base-controlled and runs only trusted validator sources", () => {
  const workflow = readFileSync(
    resolve(
      import.meta.dirname,
      "../../.github/workflows/failure-learning-independent-proof.yml",
    ),
    "utf8",
  );
  assert.match(workflow, /^\s*pull_request_target:/mu);
  assert.match(
    workflow,
    /permissions:\s*\n\s+contents:\s*read\s*\n\s*\nconcurrency:/mu,
  );
  assert.equal(
    [...workflow.matchAll(/persist-credentials:\s*false/gu)].length,
    2,
  );
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/u,
  );
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/u,
  );
  assert.match(workflow, /EXPECTED_HEAD_REPOSITORY:/u);
  assert.match(workflow, /EXPECTED_BASE_BRANCH:/u);
  for (const proofPath of [
    "tooling/quality/failure-learning-proof-trusted.mjs",
    "tooling/quality/failure-learning-proof-trusted.test.mjs",
    "tooling/tdp-max/tdp-max-v2.mjs",
    ".github/morro-control/tdp-max/anti-recurrence.json",
    ".github/workflows/failure-learning-independent-proof.yml",
  ]) {
    assert.ok(workflow.includes('"' + proofPath + '"'), proofPath);
  }
  assert.match(workflow, /--experimental-vm-modules --test trusted\//u);
  assert.match(
    workflow,
    /tooling\/quality\/failure-learning-proof-trusted\.mjs/u,
  );
  assert.doesNotMatch(workflow, /node\s+candidate\//u);
});
