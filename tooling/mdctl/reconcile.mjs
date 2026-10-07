import assert from "node:assert/strict";
import { githubApi } from "../control-state/status.mjs";
import {
  buildIntegrationQueue,
  buildSchedulerPlan,
  loadSchedulerPolicy,
} from "./scheduler.mjs";
import {
  collectLivePullWork,
  evaluateDependenciesAtMain,
} from "./scheduler-live.mjs";
import {
  activeClaimIdleFinding,
  classifyClaimMissionState,
} from "./dispatch-runtime.mjs";

const SHA = /^[0-9a-f]{40}$/u;

function decodeJsonContent(value) {
  assert.equal(value?.encoding, "base64", "RECONCILE_CONTENT_ENCODING_INVALID");
  return JSON.parse(Buffer.from(value.content, "base64").toString("utf8"));
}

export async function collectClaimObservations({
  repository,
  registry,
  mainSha,
  api = githubApi,
}) {
  const root = "repos/" + repository;
  const owner = repository.split("/")[0];
  const observations = {};
  for (const [id, claim] of Object.entries(registry?.claims ?? {})) {
    try {
      const [refs, closed] = await Promise.all([
        api(
          root + "/git/matching-refs/heads/" + encodeURIComponent(claim.branch),
        ),
        api(
          root +
            "/pulls?state=closed&base=main&head=" +
            encodeURIComponent(owner + ":" + claim.branch) +
            "&per_page=100",
        ),
      ]);
      let mergeEvidence = null;
      for (const pr of (Array.isArray(closed) ? closed : [])
        .filter(
          (item) => item?.merged_at && SHA.test(item?.merge_commit_sha ?? ""),
        )
        .sort((a, b) => Date.parse(b.merged_at) - Date.parse(a.merged_at))) {
        const comparison = await api(
          root + "/compare/" + pr.merge_commit_sha + "..." + mainSha,
        );
        if (
          !["ahead", "identical"].includes(comparison?.status) ||
          comparison?.base_commit?.sha !== pr.merge_commit_sha ||
          comparison?.merge_base_commit?.sha !== pr.merge_commit_sha
        )
          continue;
        const files = await api(
          root + "/pulls/" + pr.number + "/files?per_page=100",
        );
        const bookkeeping = new Set([
          ".github/morro-control/claims.json",
          ".github/morro-control/events.ndjson",
          ".morro/changesets/" + id + ".json",
        ]);
        const materialFiles = (Array.isArray(files) ? files : [])
          .map((file) => file?.filename)
          .filter((path) => path && !bookkeeping.has(path));
        mergeEvidence = {
          prNumber: pr.number,
          mergeSha: pr.merge_commit_sha,
          materialChange: materialFiles.length > 0,
        };
        break;
      }
      observations[id] = {
        branchPresent:
          Array.isArray(refs) &&
          refs.some((ref) => ref?.ref === "refs/heads/" + claim.branch),
        mergeEvidence,
        workerStarted: null,
        executorHealthy: null,
        error: null,
      };
    } catch (error) {
      observations[id] = {
        branchPresent: null,
        mergeEvidence: null,
        workerStarted: null,
        executorHealthy: null,
        error: String(error?.message ?? error),
      };
    }
  }
  return observations;
}

function summarizeClaims(
  registry,
  liveWork,
  changeSets,
  observations,
  scheduleItems,
  now,
) {
  const live = new Map(
    (liveWork?.items ?? [])
      .filter((item) => item?.changeSet?.id)
      .map((item) => [item.changeSet.id, item]),
  );
  const scheduled = new Map(
    scheduleItems.map((item) => [item.changeSet.id, item]),
  );
  return Object.entries(registry?.claims ?? {}).map(([id, claim]) => {
    const item = live.get(id);
    const planned = scheduled.get(id);
    const observation = observations[id] ?? {};
    const manifest = changeSets[id] ?? item?.changeSet ?? null;
    const missionState = classifyClaimMissionState({
      claim,
      manifest,
      openPr: Boolean(item),
      branchPresent: observation.branchPresent,
      mergeEvidence: observation.mergeEvidence,
      workerStarted: observation.workerStarted,
      superseded: observation.superseded === true,
      now,
    });
    return {
      id,
      declaredStatus: claim?.status ?? null,
      branch: claim?.branch ?? null,
      authorityAnchorSha: claim?.baseSha ?? null,
      candidateBaseSha:
        item?.changeSet?.baseSha ?? planned?.changeSet?.baseSha ?? null,
      missionState,
      prNumber: item?.prNumber ?? null,
      headSha: item?.headSha ?? null,
      branchPresent: observation.branchPresent ?? null,
      mergeEvidence: observation.mergeEvidence ?? null,
      observationError: observation.error ?? null,
      authoritativeForWrite: [
        "CLAIMED_AWAITING_DISPATCH",
        "ACTIVE_WORK",
      ].includes(missionState),
      finding: activeClaimIdleFinding({
        missionState,
        executorHealthy: observation.executorHealthy,
      }),
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

export function buildLiveProjection({
  mainSha,
  backlog,
  registry,
  releaseState,
  liveWork,
  policy,
  changeSets = {},
  claimObservations = {},
  scheduleItems = [],
  now = new Date().toISOString(),
}) {
  assert.match(mainSha ?? "", SHA, "RECONCILE_MAIN_SHA_INVALID");
  assert.equal(liveWork?.mainSha, mainSha, "RECONCILE_LIVE_MAIN_MISMATCH");
  const integrationQueue = buildIntegrationQueue({
    mainSha,
    workItems: liveWork.items,
    policy,
  });
  const schedulerPlan = buildSchedulerPlan({
    mainSha,
    workItems: [...liveWork.items, ...scheduleItems],
    policy,
  });
  const claims = summarizeClaims(
    registry,
    liveWork,
    changeSets,
    claimObservations,
    scheduleItems,
    now,
  );
  const backlogReconciliation = reconcileBacklogProjection({
    backlog,
    changeSets,
    registry,
    liveWork,
  });
  const authorityConflicts = backlogReconciliation.unresolvedDrift.map(
    (item) => item.id,
  );
  const criticalPath = backlogReconciliation.derivedItems
    .filter((item) => item.effective?.state !== "MERGED")
    .map((item) => item.id);
  const missionState = {
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
    blockers: [
      ...new Set([
        ...authorityConflicts,
        ...claims
          .filter((claim) =>
            ["ORPHANED", "STALE", "SUPERSEDED"].includes(claim.missionState),
          )
          .map((claim) => claim.id),
      ]),
    ],
    findings: claims
      .filter((claim) => claim.finding)
      .map((claim) => ({ ...claim.finding, id: claim.id })),
    dependencies: scheduleItems.map((item) => ({
      id: item.changeSet.id,
      dependencies: item.changeSet.dependencies ?? [],
    })),
    nextReadyNodes: scheduleItems.map((item) => item.changeSet.id),
    dispatchableNodes: schedulerPlan.grants.map((grant) => grant.id),
    integrationQueue,
    humanProtectedGates: [],
    evidenceValidity: "DERIVED_BY_EVIDENCE_DEPENDENCY_GRAPH",
    criticalPath,
    authorityConflicts,
    unknowns: claims
      .filter((claim) => claim.observationError)
      .map((claim) => "claim-observation:" + claim.id),
  };
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
      ...backlogReconciliation,
    },
    claims: {
      source: "VERSIONED_REGISTRY_PLUS_LIVE_GITHUB_OBSERVATIONS",
      items: claims,
      staleCandidates: claims
        .filter((claim) =>
          ["STALE", "ORPHANED", "SUPERSEDED"].includes(claim.missionState),
        )
        .map((claim) => claim.id),
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
    integrationQueue,
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

async function collectScheduleItems({
  backlog,
  changeSets,
  registry,
  liveWork,
  repository,
  mainSha,
  api,
}) {
  const open = new Set(
    liveWork.items.map((item) => item?.changeSet?.id).filter(Boolean),
  );
  const items = [];
  for (const backlogItem of backlog?.items ?? []) {
    const manifest = changeSets[backlogItem.id];
    const claim = registry?.claims?.[backlogItem.id];
    if (
      backlogItem.state !== "READY" ||
      !manifest ||
      manifest.state !== "IMPLEMENTING" ||
      !claim ||
      open.has(backlogItem.id)
    )
      continue;
    const changeSet = { ...manifest, baseSha: mainSha };
    const dependencies = await evaluateDependenciesAtMain({
      changeSet,
      repository,
      mainSha,
      api,
    });
    items.push({
      changeSet,
      openPr: false,
      writerActive: false,
      ready: true,
      dependenciesSatisfied: dependencies.satisfied,
      unresolvedDependencies: dependencies.unresolved,
      priority: claim.risk ?? "P1",
      behindBy: 0,
      baseIsAncestorOfMain: true,
      statsKnown: true,
      changedFiles: 0,
      changedLines: 0,
      invalid: null,
    });
  }
  return items;
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
  const changeSets = Object.fromEntries(
    await Promise.all(
      ids.map(async (id) => {
        try {
          return [id, await read(".morro/changesets/" + id + ".json")];
        } catch {
          return [id, null];
        }
      }),
    ),
  );
  const [claimObservations, scheduleItems] = await Promise.all([
    collectClaimObservations({
      repository,
      registry,
      mainSha: liveWork.mainSha,
      api,
    }),
    collectScheduleItems({
      backlog,
      changeSets,
      registry,
      liveWork,
      repository,
      mainSha: liveWork.mainSha,
      api,
    }),
  ]);
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
    scheduleItems,
  });
}

export async function runReconcileCli(args = []) {
  const repositoryIndex = args.indexOf("--repo");
  const repository =
    repositoryIndex >= 0
      ? args[repositoryIndex + 1]
      : (process.env.GITHUB_REPOSITORY ??
        "luizanunciostoca/touristic-digital-platform");
  const projection = await collectLiveProjection({ repository });
  return projection;
}
