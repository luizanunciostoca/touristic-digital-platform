import assert from "node:assert/strict";
import { githubApi } from "../control-state/status.mjs";
import { buildIntegrationQueue, loadSchedulerPolicy } from "./scheduler.mjs";
import { collectLivePullWork } from "./scheduler-live.mjs";

const SHA = /^[0-9a-f]{40}$/u;

function decodeJsonContent(value) {
  assert.equal(value?.encoding, "base64", "RECONCILE_CONTENT_ENCODING_INVALID");
  return JSON.parse(Buffer.from(value.content, "base64").toString("utf8"));
}

function summarizeClaims(registry, liveWork) {
  const byId = new Map(
    liveWork.items
      .filter((item) => item?.changeSet?.id)
      .map((item) => [item.changeSet.id, item]),
  );
  return Object.entries(registry?.claims ?? {}).map(([id, claim]) => {
    const live = byId.get(id);
    return {
      id,
      declaredStatus: claim?.status ?? null,
      branch: claim?.branch ?? null,
      baseSha: claim?.baseSha ?? null,
      liveState: live ? "OPEN_PR" : "NO_OPEN_PR",
      prNumber: live?.prNumber ?? null,
      headSha: live?.headSha ?? null,
      authoritativeForWrite: Boolean(live),
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
}) {
  assert.match(mainSha ?? "", SHA, "RECONCILE_MAIN_SHA_INVALID");
  assert.equal(liveWork?.mainSha, mainSha, "RECONCILE_LIVE_MAIN_MISMATCH");
  const queue = buildIntegrationQueue({
    mainSha,
    workItems: liveWork.items,
    policy,
  });
  const claims = summarizeClaims(registry, liveWork);
  const staleClaims = claims.filter(
    (claim) => claim.liveState === "NO_OPEN_PR",
  );
  const backlogReconciliation = reconcileBacklogProjection({
    backlog,
    changeSets,
    registry,
    liveWork,
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
      source: "VERSIONED_REGISTRY_PLUS_LIVE_OPEN_PRS",
      items: claims,
      staleCandidates: staleClaims.map((claim) => claim.id),
    },
    integrationQueue: queue,
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
  const changeSetEntries = await Promise.all(
    (backlog?.items ?? []).map(async (item) => {
      try {
        return [item.id, await read(".morro/changesets/" + item.id + ".json")];
      } catch {
        return [item.id, null];
      }
    }),
  );
  const changeSets = Object.fromEntries(changeSetEntries);
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
