import assert from "node:assert/strict";
import { githubApi } from "../control-state/status.mjs";
import {
  buildIntegrationQueue,
  buildSchedulerPlan,
  loadSchedulerPolicy,
} from "./scheduler.mjs";
import { collectLivePullWork } from "./scheduler-live.mjs";
import {
  activeClaimIdleFinding,
  classifyClaimMissionState,
} from "./dispatch-runtime.mjs";

const SHA = /^[0-9a-f]{40}$/u;
const BOOKKEEPING = new Set([
  ".github/morro-control/claims.json",
  ".github/morro-control/events.ndjson",
]);
const PRIORITY = { P0: 0, P1: 1, P2: 2, P3: 3 };

function decodeJsonContent(value) {
  assert.equal(value?.encoding, "base64", "RECONCILE_CONTENT_ENCODING_INVALID");
  return JSON.parse(Buffer.from(value.content, "base64").toString("utf8"));
}

function manifestPath(id) {
  return ".morro/changesets/" + id + ".json";
}

function isMergeAncestor(compare, candidate) {
  return (
    ["ahead", "identical"].includes(compare?.status) &&
    compare?.base_commit?.sha === candidate &&
    compare?.merge_base_commit?.sha === candidate
  );
}

export async function collectClaimObservations({
  repository,
  registry,
  mainSha,
  api = githubApi,
}) {
  assert.match(mainSha ?? "", SHA, "CLAIM_OBSERVATION_MAIN_INVALID");
  const root = "repos/" + repository;
  const owner = repository.split("/")[0];
  const observations = {};
  for (const [id, claim] of Object.entries(registry?.claims ?? {})) {
    try {
      const refs = await api(
        root + "/git/matching-refs/heads/" + encodeURIComponent(claim.branch),
      );
      const exactRef = "refs/heads/" + claim.branch;
      const branchPresent =
        Array.isArray(refs) && refs.some((ref) => ref?.ref === exactRef);
      const closed = await api(
        root +
          "/pulls?state=closed&base=main&head=" +
          encodeURIComponent(owner + ":" + claim.branch) +
          "&per_page=100",
      );
      const merged = (Array.isArray(closed) ? closed : [])
        .filter(
          (pr) =>
            pr?.merged_at &&
            SHA.test(pr?.merge_commit_sha ?? "") &&
            pr?.head?.ref === claim.branch,
        )
        .sort((a, b) => Date.parse(b.merged_at) - Date.parse(a.merged_at));
      let mergeEvidence = null;
      for (const pr of merged) {
        const compare = await api(
          root + "/compare/" + pr.merge_commit_sha + "..." + mainSha,
        );
        if (!isMergeAncestor(compare, pr.merge_commit_sha)) continue;
        const files = await api(
          root + "/pulls/" + pr.number + "/files?per_page=100",
        );
        const names = (Array.isArray(files) ? files : [])
          .map((file) => file?.filename)
          .filter(Boolean);
        const bookkeeping = new Set([...BOOKKEEPING, manifestPath(id)]);
        const materialFiles = names.filter((name) => !bookkeeping.has(name));
        mergeEvidence = {
          prNumber: pr.number,
          mergeSha: pr.merge_commit_sha,
          mergedAt: pr.merged_at,
          materialChange: materialFiles.length > 0,
          materialFiles,
        };
        break;
      }
      observations[id] = {
        source: "GITHUB_LIVE",
        branchPresent,
        mergeEvidence,
        workerStarted: null,
        executorHealthy: null,
        error: null,
      };
    } catch (error) {
      observations[id] = {
        source: "GITHUB_LIVE",
        branchPresent: null,
        mergeEvidence: null,
        workerStarted: null,
        executorHealthy: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return observations;
}

export function summarizeClaims(
  registry,
  liveWork,
  changeSets = {},
  claimObservations = {},
  now = new Date().toISOString(),
) {
  const byId = new Map(
    (liveWork?.items ?? [])
      .filter((item) => item?.changeSet?.id)
      .map((item) => [item.changeSet.id, item]),
  );
  return Object.entries(registry?.claims ?? {}).map(([id, claim]) => {
    const live = byId.get(id);
    const observation = claimObservations[id] ?? {};
    const manifest = changeSets[id] ?? live?.changeSet ?? null;
    const missionState = classifyClaimMissionState({
      claim,
      manifest,
      openPr: Boolean(live),
      branchPresent: observation.branchPresent ?? null,
      mergeEvidence: observation.mergeEvidence ?? null,
      workerStarted: observation.workerStarted ?? null,
      superseded: observation.superseded === true,
      now,
    });
    const idleFinding = activeClaimIdleFinding({
      missionState,
      executorHealthy: observation.executorHealthy ?? null,
    });
    return {
      id,
      declaredStatus: claim?.status ?? null,
      branch: claim?.branch ?? null,
      authorityAnchorSha: claim?.baseSha ?? null,
      candidateBaseSha: manifest?.baseSha ?? null,
      missionState,
      prNumber: live?.prNumber ?? null,
      headSha: live?.headSha ?? null,
      branchPresent: observation.branchPresent ?? null,
      mergeEvidence: observation.mergeEvidence ?? null,
      workerStarted: observation.workerStarted ?? null,
      executorHealthy: observation.executorHealthy ?? null,
      observationError: observation.error ?? null,
      authoritativeForWrite: [
        "CLAIMED_AWAITING_DISPATCH",
        "ACTIVE_WORK",
      ].includes(missionState),
      finding: idleFinding,
    };
  });
}

export function reconcileBacklogProjection({
  backlog,
  changeSets = {},
  registry = {},
  liveWork,
}) {
  const liveById = new Map(
    (liveWork?.items ?? [])
      .filter((item) => item?.changeSet?.id)
      .map((item) => [item.changeSet.id, item]),
  );
  const derivedItems = (backlog?.items ?? []).map((item) => {
    const manifest = changeSets[item.id] ?? null;
    const claim = registry?.claims?.[item.id] ?? null;
    const live = liveById.get(item.id) ?? null;
    const contradictions = [];
    if (manifest?.state === "MERGED") {
      if (item.implementation === "MISSING")
        contradictions.push("MERGED_BUT_IMPLEMENTATION_MISSING");
      if (item.integration === "MISSING")
        contradictions.push("MERGED_BUT_INTEGRATION_MISSING");
      if (item.proof === "MISSING")
        contradictions.push("MERGED_BUT_PROOF_MISSING");
      if (["READY", "BLOCKED"].includes(item.state))
        contradictions.push("MERGED_BUT_BACKLOG_NONTERMINAL");
      if (claim) contradictions.push("MERGED_CHANGESET_HAS_ACTIVE_CLAIM");
    }
    const dependencyStates = (item.dependencies ?? []).map(
      (id) => changeSets[id]?.state ?? null,
    );
    if (
      item.state === "BLOCKED" &&
      dependencyStates.length > 0 &&
      dependencyStates.every((state) => state === "MERGED")
    )
      contradictions.push("DEPENDENCIES_MERGED_BUT_BACKLOG_BLOCKED");
    if (
      claim &&
      manifest &&
      manifest.state !== "MERGED" &&
      ![
        "IMPLEMENTING",
        "LOCAL_PROVEN",
        "REMOTE_PROVEN",
        "COMPOSITION_PROVEN",
        "POLICY_SATISFIED",
        "MERGE_READY",
      ].includes(manifest.state)
    )
      contradictions.push("ACTIVE_CLAIM_ON_NONWRITE_CHANGESET");
    if (live && manifest && live.changeSet?.state !== manifest.state)
      contradictions.push("LIVE_PR_CHANGESET_STATE_DIVERGED");
    const unresolved = contradictions.filter((code) =>
      [
        "MERGED_CHANGESET_HAS_ACTIVE_CLAIM",
        "ACTIVE_CLAIM_ON_NONWRITE_CHANGESET",
        "LIVE_PR_CHANGESET_STATE_DIVERGED",
      ].includes(code),
    );
    const effective =
      manifest?.state === "MERGED"
        ? {
            state: "MERGED",
            implementation: "COMPLETE",
            integration: "COMPLETE",
            proof: "COMPLETE",
          }
        : manifest
          ? {
              state: manifest.state,
              implementation:
                item.implementation === "MISSING"
                  ? "IN_PROGRESS"
                  : item.implementation,
              integration: item.integration,
              proof: item.proof,
            }
          : {
              state: item.state,
              implementation: item.implementation,
              integration: item.integration,
              proof: item.proof,
            };
    return {
      id: item.id,
      versioned: item,
      effective,
      canonicalChangeSetState: manifest?.state ?? null,
      activeClaimStatus: claim?.status ?? null,
      livePrNumber: live?.prNumber ?? null,
      contradictions,
      unresolved,
      reconciled: contradictions.length > 0 && unresolved.length === 0,
    };
  });
  const drift = derivedItems
    .filter((item) => item.contradictions.length > 0)
    .map((item) => ({
      id: item.id,
      contradictions: item.contradictions,
      unresolved: item.unresolved,
      reconciled: item.reconciled,
    }));
  const unresolvedDrift = drift.filter((item) => item.unresolved.length > 0);
  return {
    derivedItems,
    drift,
    unresolvedDrift,
    schedulingSafe: unresolvedDrift.length === 0,
  };
}

export function assertProjectionSchedulable(projection) {
  assert.equal(
    projection?.backlog?.schedulingSafe,
    true,
    "CONTROL_PROJECTION_DRIFT",
  );
  return projection;
}

function dependenciesSatisfied(item, changeSets) {
  return (item?.dependencies ?? []).every(
    (id) => changeSets[id]?.state === "MERGED",
  );
}

function buildMissionState({
  mainSha,
  claims,
  backlogReconciliation,
  schedulerPlan,
  integrationQueue,
  changeSets,
}) {
  const nextReadyNodes = backlogReconciliation.derivedItems
    .filter(
      (item) =>
        item.effective?.state === "READY" &&
        dependenciesSatisfied(item.versioned, changeSets),
    )
    .map((item) => item.id);
  const criticalPath = backlogReconciliation.derivedItems
    .filter((item) => item.effective?.state !== "MERGED")
    .sort(
      (a, b) =>
        (PRIORITY[a.versioned?.priority] ?? 99) -
          (PRIORITY[b.versioned?.priority] ?? 99) || a.id.localeCompare(b.id),
    )
    .map((item) => item.id);
  const authorityConflicts = backlogReconciliation.unresolvedDrift.map(
    (item) => item.id,
  );
  const claimBlockers = claims
    .filter((claim) =>
      ["ORPHANED", "STALE", "SUPERSEDED"].includes(claim.missionState),
    )
    .map((claim) => claim.id);
  const findings = claims
    .map((claim) => claim.finding && { ...claim.finding, id: claim.id })
    .filter(Boolean);
  const unknowns = claims
    .filter((claim) => claim.observationError)
    .map((claim) => "claim-observation:" + claim.id);
  return {
    schemaVersion: 1,
    kind: "TDP_DERIVED_MISSION_STATE",
    authority: "DERIVED_NOT_CANONICAL",
    currentMain: mainSha,
    claims: claims.map((claim) => ({
      id: claim.id,
      state: claim.missionState,
      authorityAnchorSha: claim.authorityAnchorSha,
      candidateBaseSha: claim.candidateBaseSha,
    })),
    blockers: [...new Set([...authorityConflicts, ...claimBlockers])],
    findings,
    dependencies: criticalPath.map((id) => ({
      id,
      dependencies:
        backlogReconciliation.derivedItems.find((item) => item.id === id)
          ?.versioned?.dependencies ?? [],
    })),
    nextReadyNodes,
    dispatchableNodes: (schedulerPlan?.grants ?? []).map((grant) => grant.id),
    integrationQueue,
    humanProtectedGates: [],
    evidenceValidity: "DERIVED_BY_EVIDENCE_DEPENDENCY_GRAPH",
    criticalPath,
    authorityConflicts,
    unknowns,
  };
}

export function buildLiveProjection({
  mainSha,
  backlog,
  registry,
  releaseState,
  liveWork,
  policy,
  changeSets = {},
  claimObservations = {},
  now = new Date().toISOString(),
}) {
  assert.match(mainSha ?? "", SHA, "RECONCILE_MAIN_SHA_INVALID");
  assert.equal(liveWork?.mainSha, mainSha, "RECONCILE_LIVE_MAIN_MISMATCH");
  const queue = buildIntegrationQueue({
    mainSha,
    workItems: liveWork.items,
    policy,
  });
  const schedulerPlan = buildSchedulerPlan({
    mainSha,
    workItems: liveWork.items,
    policy,
  });
  const claims = summarizeClaims(
    registry,
    liveWork,
    changeSets,
    claimObservations,
    now,
  );
  const staleClaims = claims.filter((claim) =>
    ["STALE", "ORPHANED", "SUPERSEDED"].includes(claim.missionState),
  );
  const backlogReconciliation = reconcileBacklogProjection({
    backlog,
    changeSets,
    registry,
    liveWork,
  });
  const missionState = buildMissionState({
    mainSha,
    claims,
    backlogReconciliation,
    schedulerPlan,
    integrationQueue: queue,
    changeSets,
  });
  return {
    schemaVersion: 1,
    kind: "TDP_LIVE_CONTROL_PROJECTION",
    authority: "GITHUB_LIVE_RECOMPUTED",
    currentMain: mainSha,
    backlog: {
      source: "VERSIONED_DESIRED_STATE",
      versionedAnchor: backlog?.updatedFromMainSha ?? null,
      versionedAnchorValid: SHA.test(backlog?.updatedFromMainSha ?? ""),
      anchorMatchesMain: backlog?.updatedFromMainSha === mainSha,
      anchorSemantics: "SOURCE_PROVENANCE_NOT_CURRENT_MAIN_LOCK",
      items: Array.isArray(backlog?.items) ? backlog.items : [],
      derivedItems: backlogReconciliation.derivedItems,
      drift: backlogReconciliation.drift,
      unresolvedDrift: backlogReconciliation.unresolvedDrift,
      schedulingSafe: backlogReconciliation.schedulingSafe,
    },
    claims: {
      source: "VERSIONED_REGISTRY_PLUS_LIVE_GITHUB_OBSERVATIONS",
      items: claims,
      staleCandidates: staleClaims.map((claim) => claim.id),
      awaitingDispatch: claims
        .filter((claim) => claim.missionState === "CLAIMED_AWAITING_DISPATCH")
        .map((claim) => claim.id),
      activeWork: claims
        .filter((claim) => claim.missionState === "ACTIVE_WORK")
        .map((claim) => claim.id),
      postMergeClosure: claims
        .filter((claim) => claim.missionState === "POST_MERGE_CLOSURE")
        .map((claim) => claim.id),
    },
    schedulerPlan,
    integrationQueue: queue,
    missionState,
    release: {
      source: "VERSIONED_RELEASE_FACTS_PLUS_LIVE_MAIN",
      currentMain: mainSha,
      candidateSha: releaseState?.candidateSha ?? null,
      stagingSha: releaseState?.stagingSha ?? null,
      productionSha: releaseState?.productionSha ?? null,
      artifactDigest: releaseState?.artifactDigest ?? null,
      ociDigest: releaseState?.ociDigest ?? null,
    },
    openPullRequests: liveWork.items.map((item) => ({
      prNumber: item.prNumber,
      changeSetId: item.changeSet?.id ?? null,
      objective: item.changeSet?.objective ?? null,
      state: item.changeSet?.state ?? null,
      headSha: item.headSha ?? null,
      invalid: item.invalid ?? null,
    })),
  };
}

export async function collectLiveProjection({
  repository = "luizanunciostoca/touristic-digital-platform",
  api = githubApi,
} = {}) {
  const policy = await loadSchedulerPolicy();
  const liveWork = await collectLivePullWork({ repository, api, policy });
  const root = "repos/" + repository + "/contents/";
  const read = async (path) =>
    decodeJsonContent(
      await api(root + path + "?ref=" + encodeURIComponent(liveWork.mainSha)),
    );
  const [backlog, registry, releaseState] = await Promise.all([
    read(".github/morro-control/backlog.json"),
    read(".github/morro-control/claims.json"),
    read(".github/morro-control/release-state.json"),
  ]);
  const ids = [
    ...new Set([
      ...(backlog?.items ?? []).map((item) => item.id),
      ...Object.keys(registry?.claims ?? {}),
    ]),
  ];
  const changeSetEntries = await Promise.all(
    ids.map(async (id) => {
      try {
        return [id, await read(manifestPath(id))];
      } catch {
        return [id, null];
      }
    }),
  );
  const changeSets = Object.fromEntries(changeSetEntries);
  const claimObservations = await collectClaimObservations({
    repository,
    registry,
    mainSha: liveWork.mainSha,
    api,
  });
  const latest = await api("repos/" + repository + "/commits/main");
  assert.equal(
    latest?.sha,
    liveWork.mainSha,
    "MAIN_CHANGED_DURING_RECONCILIATION",
  );
  return buildLiveProjection({
    mainSha: liveWork.mainSha,
    backlog,
    registry,
    releaseState,
    liveWork,
    policy,
    changeSets,
    claimObservations,
  });
}

export async function runReconcileCli(args = []) {
  const repositoryIndex = args.indexOf("--repo");
  const repository =
    repositoryIndex >= 0
      ? args[repositoryIndex + 1]
      : (process.env.GITHUB_REPOSITORY ??
        "luizanunciostoca/touristic-digital-platform");
  return collectLiveProjection({ repository });
}
