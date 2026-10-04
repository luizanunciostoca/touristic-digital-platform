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

export function buildLiveProjection({
  mainSha,
  backlog,
  registry,
  releaseState,
  liveWork,
  policy,
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
