import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertScopeExpansionAuthorized,
  buildChangeEnvelope,
} from "../mdctl/change-envelope.mjs";
import {
  buildCandidateIdentity,
  buildClaimIdentity,
  classifyRunAgainstCandidate,
  evaluateMainAdvance,
} from "../mdctl/candidate-identity.mjs";
import {
  evidenceSatisfiesRequirement,
  invalidateEvidence,
} from "../mdctl/evidence-graph.mjs";
import {
  buildDispatchRequest,
  classifyClaimMissionState,
  dispatchWithReadback,
} from "../mdctl/dispatch-runtime.mjs";
import { buildLiveProjection } from "../mdctl/reconcile.mjs";
import { evidenceInvalidationPlan } from "../mdctl/task-lifecycle.mjs";

const A = "a".repeat(40),
  B = "b".repeat(40),
  C = "c".repeat(40);
const template = JSON.parse(
  readFileSync(".morro/changesets/MD-TDP-V32-OPT-001.json", "utf8"),
);
const cs = (id = "MD-X") => ({
  ...structuredClone(template),
  id,
  objective: "protocol-" + id.toLowerCase(),
  baseSha: A,
  branch: "feat/" + id.toLowerCase(),
  state: "IMPLEMENTING",
  owns: { paths: ["tooling/mdctl/**"], contracts: ["TDP"] },
  dependencies: [],
});
const ev = (o = {}) => ({
  id: "proof",
  type: "CODE_BOUND",
  status: "PASS",
  assertion: "ok",
  source: "local",
  candidateSha: A,
  treeSha: B,
  validatorRevision: "v1",
  environment: "test",
  toolchain: "node22",
  dependencies: ["candidate"],
  observedAt: "2026-10-07T00:00:00Z",
  freshnessSeconds: 3600,
  ...o,
});

test("V3.2 identity and evidence primitives compose fail-closed", () => {
  const runtime = ev({
    id: "runtime",
    type: "RUNTIME_BOUND",
    candidateSha: null,
    treeSha: null,
    environment: "staging",
    dependencies: ["config"],
  });
  assert.deepEqual(
    invalidateEvidence([ev(), runtime], { kind: "CANDIDATE_MUTATION" }).map(
      (x) => x.status,
    ),
    ["SUPERSEDED", "PASS"],
  );
  assert.equal(
    evidenceSatisfiesRequirement(ev(), {
      candidateSha: A,
      treeSha: B,
      now: "2026-10-07T00:30:00Z",
    }),
    true,
  );
  assert.equal(
    evidenceSatisfiesRequirement(ev(), { now: "2026-10-07T02:00:01Z" }),
    false,
  );
  const reuse = evidenceInvalidationPlan({
    certifiedCandidateSha: A,
    certifiedTreeSha: B,
    currentCandidateSha: C,
    currentTreeSha: C,
    evidenceNodes: [ev(), runtime],
    mutationDependencies: [],
  });
  assert.deepEqual(
    [reuse.invalidated, reuse.preserved],
    [["proof"], ["runtime"]],
  );

  const claim = buildClaimIdentity("MD-X", {
    owner: "x",
    reviewer: "y",
    paths: ["tooling/mdctl/**"],
    domains: ["control-plane"],
    risk: "P1",
    baseSha: A,
  });
  const candidate = buildCandidateIdentity({
    baseSha: A,
    headSha: B,
    treeSha: C,
    branch: "feat/x",
  });
  const advance = (path) =>
    evaluateMainAdvance({
      claimIdentity: claim,
      candidateIdentity: candidate,
      candidateLocks: { paths: ["tooling/mdctl/**"] },
      mainAdvance: { mainSha: C, semanticLocks: { paths: [path] } },
    });
  assert.equal(advance("docs/**").restartImplementation, false);
  assert.equal(advance("tooling/mdctl/x.mjs").restartImplementation, true);
  assert.equal(
    classifyRunAgainstCandidate({
      runHeadSha: A,
      currentHeadSha: B,
      status: "in_progress",
    }).state,
    "SUPERSEDED",
  );

  const current = cs(),
    ownership = {
      domains: [{ id: "ci-release", pathPrefixes: ["tooling/mdctl/"] }],
    },
    riskPolicy = {
      criticalPaths: [],
      highPaths: [],
      lowExtensions: [],
      semanticRiskFloor: { critical: "critical" },
    };
  const envelope = buildChangeEnvelope({
    rootCause: "drift",
    semanticImpact: "control",
    probablePaths: ["tooling/mdctl/reconcile.mjs"],
    contracts: ["critical"],
    changeSet: current,
    ownership,
    riskPolicy,
  });
  assert.equal(envelope.riskFloor, "critical");
  assert.throws(
    () =>
      assertScopeExpansionAuthorized({
        currentEnvelope: envelope,
        requestedPaths: ["tooling/mdctl/x.mjs"],
        expandedChangeSet: cs("MD-Y"),
      }),
    /CHANGESET_MISMATCH/u,
  );
});

test("V3.2 mission projection and dispatch require exact readback", async () => {
  const scheduleItem = {
    changeSet: cs(),
    ready: true,
    writerActive: false,
    openPr: false,
    dependenciesSatisfied: true,
    priority: "P0",
    behindBy: 0,
    baseIsAncestorOfMain: true,
    statsKnown: true,
    changedFiles: 0,
    changedLines: 0,
    invalid: null,
  };
  const projection = buildLiveProjection({
    mainSha: A,
    backlog: { items: [] },
    registry: { claims: {} },
    releaseState: {},
    liveWork: { mainSha: A, items: [] },
    scheduleItems: [scheduleItem],
  });
  assert.deepEqual(projection.missionState.dispatchableNodes, ["MD-X"]);
  assert.equal(
    classifyClaimMissionState({
      claim: { expiresAt: "2020-01-01T00:00:00Z" },
      manifest: {},
      mergeEvidence: { materialChange: true },
    }),
    "POST_MERGE_CLOSURE",
  );

  const workspace = { ready: true, exactBaseSha: A, path: "/w" };
  const request = buildDispatchRequest({
    grant: { changeSetId: "MD-X", exactBaseSha: A },
    workspace,
    executor: "chatgpt-control",
  });
  const result = await dispatchWithReadback({
    request,
    adapter: {
      dispatch: async () => ({ accepted: true }),
      readback: async () => ({
        dispatchId: request.dispatchId,
        workerStarted: true,
        exactBaseSha: A,
      }),
    },
  });
  assert.equal(result.status, "PASS");
  assert.equal(
    (
      await dispatchWithReadback({
        request,
        receipts: [result.receipt],
        adapter: { dispatch: async () => ({}), readback: async () => ({}) },
      })
    ).code,
    "DUPLICATE_DISPATCH",
  );
});
