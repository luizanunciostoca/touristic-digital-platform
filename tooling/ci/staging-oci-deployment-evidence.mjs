import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { candidateIdentity } from "../release/oci-proof.mjs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function deploymentEvidence(env) {
  assert.match(env.EXPECTED_SHA ?? "", /^[a-f0-9]{40}$/u);
  assert.match(env.IMAGE_DIGEST ?? "", /^sha256:[a-f0-9]{64}$/u);
  assert.match(env.IMAGE_RUN_ID ?? "", /^[1-9][0-9]*$/u);
  assert.equal(
    env.IMAGE_REPOSITORY,
    "ghcr.io/luizanunciostoca/morro-digital-v2",
  );
  assert.equal(env.TARGET_URL, "https://morro-digital-v2-staging.onrender.com");
  const requestedDeployId = /^dep-[a-z0-9]+$/u.test(env.DEPLOY_ID ?? "")
    ? env.DEPLOY_ID
    : "unknown";
  const verified =
    env.RUNTIME_OUTCOME === "success" &&
    env.LIVE_IMAGE_RUN_ID === env.IMAGE_RUN_ID &&
    env.LIVE_RELEASE_SHA === env.EXPECTED_SHA;
  return {
    expected_sha: env.EXPECTED_SHA,
    image: env.IMAGE_REPOSITORY,
    target_url: env.TARGET_URL,
    digest: env.IMAGE_DIGEST,
    image_run_id: env.IMAGE_RUN_ID,
    // Compatibility alias used by existing acceptance workflows: request only.
    render_deploy_id: requestedDeployId,
    render_deploy_id_semantics: "request_receipt_not_live_binding",
    requested_render_deploy_id: requestedDeployId,
    runtime_identity: verified ? "verified" : "unverified",
    live_release_sha: verified ? env.LIVE_RELEASE_SHA : "unknown",
    live_image_run_id: verified ? env.LIVE_IMAGE_RUN_ID : "unknown",
    // A deploy-hook receipt identifies a request, not the deployment serving HTTP.
    live_render_deploy_id: "unknown",
    provider_deployment_binding: "not_verified",
  };
}

// Explicit staging-only provider admission. The Actions contract above remains
// unchanged; CircleCI identities must never be coerced into Actions run IDs.
const CIRCLE_PROJECT = "418769eb-78ac-4cd3-a2d4-98fcca743a54";
const CIRCLE_ORGANIZATION = "72434fbd-ebe2-4b61-9831-ee418c893f14";
const REPOSITORY = "luizanunciostoca/touristic-digital-platform";
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const INDEX_TYPES = new Set([
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
]);
const MANIFEST_TYPES = new Set([
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
]);
const CONFIG_TYPES = new Set([
  "application/vnd.oci.image.config.v1+json",
  "application/vnd.docker.container.image.v1+json",
]);

// Docker's containerd store can report a target/index ID instead of a config
// ID. Preserve that identity explicitly; never relabel it as a config digest.
function dockerIdentity(image) {
  assert.match(image?.Id ?? "", DIGEST, "CIRCLE_IMAGE_ID_REQUIRED");
  const result = { dockerImageId: image.Id, dockerImageIdKind: "config" };
  if (image.Descriptor) {
    const { digest, mediaType } = image.Descriptor;
    assert.match(digest ?? "", DIGEST, "CIRCLE_DESCRIPTOR_DIGEST_INVALID");
    const kind = INDEX_TYPES.has(mediaType)
      ? "index"
      : MANIFEST_TYPES.has(mediaType)
        ? "manifest"
        : null;
    assert(kind, "CIRCLE_DESCRIPTOR_TYPE_INVALID");
    result.dockerDescriptorDigest = digest;
    result.dockerDescriptorKind = kind;
    if (image.Id === digest) result.dockerImageIdKind = kind;
  }
  return result;
}

function readRegistryDocument(directory, file, expectedDigest) {
  assert.match(expectedDigest ?? "", DIGEST, "CIRCLE_REGISTRY_DIGEST_INVALID");
  const raw = readFileSync(join(directory, file));
  const digestOf = (bytes) =>
    "sha256:" + createHash("sha256").update(bytes).digest("hex");
  // Some CLI versions append one newline to the raw registry response.
  const bytes =
    digestOf(raw) === expectedDigest
      ? raw
      : raw.at(-1) === 10 && digestOf(raw.subarray(0, -1)) === expectedDigest
        ? raw.subarray(0, -1)
        : null;
  assert(bytes, "CIRCLE_REGISTRY_DOCUMENT_SUBSTITUTED");
  const document = JSON.parse(bytes.toString("utf8"));
  assert.equal(document.schemaVersion, 2, "CIRCLE_REGISTRY_SCHEMA_INVALID");
  return { document, size: bytes.length };
}

function registryTarget(directory) {
  const digest = readFileSync(
    join(directory, "registry-digest.txt"),
    "utf8",
  ).trim();
  const { document } = readRegistryDocument(
    directory,
    "registry-manifest.json",
    digest,
  );
  if (MANIFEST_TYPES.has(document.mediaType))
    return { digest, runtimeDigest: digest };
  assert(INDEX_TYPES.has(document.mediaType), "CIRCLE_REGISTRY_TYPE_INVALID");
  assert(Array.isArray(document.manifests), "CIRCLE_INDEX_MANIFESTS_REQUIRED");
  const runtime = document.manifests.filter(
    (entry) =>
      entry.platform?.os === "linux" &&
      entry.platform.architecture === "amd64" &&
      !entry.artifactType &&
      entry.annotations?.["vnd.docker.reference.type"] !==
        "attestation-manifest",
  );
  assert.equal(runtime.length, 1, "CIRCLE_RUNTIME_PLATFORM_AMBIGUOUS");
  assert(
    MANIFEST_TYPES.has(runtime[0].mediaType),
    "CIRCLE_RUNTIME_MANIFEST_TYPE_INVALID",
  );
  assert.match(
    runtime[0].digest ?? "",
    DIGEST,
    "CIRCLE_RUNTIME_DIGEST_INVALID",
  );
  assert(
    Number.isSafeInteger(runtime[0].size) && runtime[0].size > 0,
    "CIRCLE_RUNTIME_SIZE_INVALID",
  );
  return {
    digest,
    runtimeDigest: runtime[0].digest,
    runtimeSize: runtime[0].size,
  };
}

export function circleCIRegistryRuntimeDigest(directory) {
  return registryTarget(directory).runtimeDigest;
}

function assertRegistryBinding(build, publication) {
  assert.match(
    publication.imageConfigDigest ?? "",
    DIGEST,
    "CIRCLE_CONFIG_DIGEST_REQUIRED",
  );
  assert.match(
    publication.registryRuntimeManifestDigest ?? "",
    DIGEST,
    "CIRCLE_RUNTIME_DIGEST_INVALID",
  );
  const expected = {
    config: publication.imageConfigDigest,
    manifest: publication.registryRuntimeManifestDigest,
    index: publication.registryObservedDigest,
  };
  assert(
    Object.hasOwn(expected, build.dockerImageIdKind),
    "CIRCLE_IMAGE_ID_KIND_INVALID",
  );
  assert.equal(
    build.dockerDescriptorDigest === undefined,
    build.dockerDescriptorKind === undefined,
    "CIRCLE_DESCRIPTOR_PAIR_REQUIRED",
  );
  if (build.dockerImageIdKind !== "config") {
    assert.equal(
      build.dockerDescriptorDigest,
      build.dockerImageId,
      "CIRCLE_DESCRIPTOR_ID_MISMATCH",
    );
    assert.equal(
      build.dockerDescriptorKind,
      build.dockerImageIdKind,
      "CIRCLE_DESCRIPTOR_ID_MISMATCH",
    );
  }
  assert.equal(
    expected[build.dockerImageIdKind],
    build.dockerImageId,
    "CIRCLE_REGISTRY_IMAGE_SUBSTITUTED",
  );
  if (build.dockerDescriptorDigest !== undefined) {
    assert(
      ["index", "manifest"].includes(build.dockerDescriptorKind),
      "CIRCLE_DESCRIPTOR_TYPE_INVALID",
    );
    assert.equal(
      expected[build.dockerDescriptorKind],
      build.dockerDescriptorDigest,
      "CIRCLE_REGISTRY_DESCRIPTOR_SUBSTITUTED",
    );
  }
}

export function circleCISourceIdentity(
  root = process.cwd(),
  env = process.env,
) {
  const git = (...args) =>
    execFileSync("git", ["-c", `safe.directory=${root}`, "-C", root, ...args], {
      encoding: "utf8",
    }).trim();
  assert.equal(env.CIRCLE_BRANCH, "main", "CIRCLE_PROTECTED_MAIN_REQUIRED");
  assert.match(
    env.EXPECTED_SOURCE_SHA ?? "",
    SHA,
    "CIRCLE_EXPECTED_SOURCE_REQUIRED",
  );
  assert.equal(
    env.CIRCLE_SHA1,
    env.EXPECTED_SOURCE_SHA,
    "CIRCLE_EXPECTED_SOURCE_MISMATCH",
  );
  const sourceSha = git("rev-parse", "HEAD");
  assert.equal(sourceSha, env.CIRCLE_SHA1, "CIRCLE_CHECKOUT_MISMATCH");
  assert.equal(
    git("status", "--porcelain", "--untracked-files=all"),
    "",
    "CIRCLE_SOURCE_DIRTY",
  );
  assert.equal(
    git(
      "ls-remote",
      "--exit-code",
      `https://github.com/${REPOSITORY}.git`,
      "refs/heads/main",
    ).split(/\s+/u)[0],
    sourceSha,
    "CIRCLE_MAIN_DRIFT",
  );
  const digest = (path) =>
    "sha256:" +
    createHash("sha256")
      .update(readFileSync(join(root, path)))
      .digest("hex");
  return {
    repository: REPOSITORY,
    sourceSha,
    treeSha: git("rev-parse", "HEAD^{tree}"),
    lockfileDigest: digest("pnpm-lock.yaml"),
    dockerfileDigest: digest("Dockerfile"),
    configBlob: git("rev-parse", "HEAD:tooling/ci/circleci-native-pilot.yml"),
  };
}

export function circleCIStageRecord(
  stage,
  directory,
  env = process.env,
  readSource = circleCISourceIdentity,
) {
  assert.ok(
    [
      "staging-quality",
      "staging-build-image",
      "staging-publish-image",
    ].includes(stage),
    "CIRCLE_STAGE_INVALID",
  );
  const source = readSource(process.cwd(), env);
  assert.match(env.CIRCLE_WORKFLOW_ID ?? "", UUID, "CIRCLE_WORKFLOW_INVALID");
  assert.match(
    env.CIRCLE_BUILD_NUM ?? "",
    /^[1-9][0-9]*$/u,
    "CIRCLE_BUILD_NUMBER_INVALID",
  );
  const jobUrl = `https://app.circleci.com/jobs/circleci/${CIRCLE_ORGANIZATION}/${CIRCLE_PROJECT}/${env.CIRCLE_BUILD_NUM}`;
  assert.equal(env.CIRCLE_BUILD_URL, jobUrl, "CIRCLE_JOB_URL_INVALID");
  const hash = (file) =>
    "sha256:" +
    createHash("sha256")
      .update(readFileSync(join(directory, file)))
      .digest("hex");
  const json = (file) =>
    JSON.parse(readFileSync(join(directory, file), "utf8"));
  const record = {
    ...source,
    jobUrl,
    workflowId: env.CIRCLE_WORKFLOW_ID,
    imageRunId: `circleci:${env.CIRCLE_WORKFLOW_ID}`,
    exitCode: 0,
    skipped: false,
    logDigest: hash(stage + ".log"),
    observedAt: new Date().toISOString(),
  };
  if (stage !== "staging-quality") {
    record.archiveDigest = hash("image.tar.gz");
    const image = json("image-inspect.json")[0];
    Object.assign(record, dockerIdentity(image));
    assert.equal(
      image.Config.Env.find((value) => value.startsWith("MORRO_RELEASE_SHA=")),
      `MORRO_RELEASE_SHA=${source.sourceSha}`,
      "CIRCLE_IMAGE_SOURCE_MISMATCH",
    );
    assert.equal(
      image.Config.Env.find((value) =>
        value.startsWith("MORRO_RELEASE_IMAGE_RUN_ID="),
      ),
      `MORRO_RELEASE_IMAGE_RUN_ID=${record.imageRunId}`,
      "CIRCLE_IMAGE_RUN_MISMATCH",
    );
    assert.ok(
      ["65532", "65532:65532", "nonroot"].includes(image.Config.User),
      "CIRCLE_NONROOT_REQUIRED",
    );
  }
  if (stage === "staging-publish-image") {
    const build = json("staging-build-image.json");
    assert.equal(
      record.archiveDigest,
      build.archiveDigest,
      "CIRCLE_ARCHIVE_SUBSTITUTED",
    );
    for (const key of [
      "dockerImageId",
      "dockerImageIdKind",
      "dockerDescriptorDigest",
      "dockerDescriptorKind",
    ])
      assert.equal(record[key], build[key], "CIRCLE_IMAGE_REBUILT:" + key);
    const target = registryTarget(directory);
    const runtimeManifest = readRegistryDocument(
      directory,
      "registry-runtime-manifest.json",
      target.runtimeDigest,
    );
    if (target.runtimeSize !== undefined)
      assert.equal(
        runtimeManifest.size,
        target.runtimeSize,
        "CIRCLE_RUNTIME_SIZE_MISMATCH",
      );
    assert(
      MANIFEST_TYPES.has(runtimeManifest.document.mediaType),
      "CIRCLE_RUNTIME_MANIFEST_TYPE_INVALID",
    );
    assert(
      CONFIG_TYPES.has(runtimeManifest.document.config?.mediaType),
      "CIRCLE_CONFIG_TYPE_INVALID",
    );
    const digest = target.digest;
    record.registryObservedDigest = digest;
    record.registryRuntimeManifestDigest = target.runtimeDigest;
    record.imageConfigDigest = runtimeManifest.document.config.digest;
    assertRegistryBinding(build, record);
    const runtime = json("health.json");
    assert.equal(runtime.status, "live", "CIRCLE_IMAGE_SMOKE_FAILED");
    assert.equal(
      runtime.release?.sha,
      source.sourceSha,
      "CIRCLE_SMOKE_SOURCE_MISMATCH",
    );
    assert.equal(
      runtime.release.imageRunId,
      record.imageRunId,
      "CIRCLE_SMOKE_RUN_MISMATCH",
    );
    record.registryObservedDigest = digest;
    record.runtimeSourceSha = source.sourceSha;
    record.runtimeImageRunId = record.imageRunId;
    record.nonroot = true;
    record.scans = {};
    for (const [kind, field] of [
      ["secrets", "Secrets"],
      ["vulnerabilities", "Vulnerabilities"],
    ]) {
      const filename = `image-${kind}.json`,
        report = json(filename);
      assert.equal(
        report.ArtifactName,
        `ghcr.io/luizanunciostoca/morro-digital-v2@${digest}`,
        "CIRCLE_SCAN_ARTIFACT_MISMATCH",
      );
      assert.equal(
        report.ArtifactType,
        "container_image",
        "CIRCLE_SCAN_TYPE_INVALID",
      );
      assert.equal(
        report.Metadata?.ImageID,
        record.imageConfigDigest,
        "CIRCLE_SCAN_IMAGE_CONFIG_MISMATCH",
      );
      assert.ok(
        Array.isArray(report.Results) &&
          (kind === "secrets" || report.Results.length > 0),
        "CIRCLE_SCAN_RESULTS_MISSING",
      );
      const findings = report.Results.flatMap((result) => result[field] ?? []);
      assert.equal(findings.length, 0, "CIRCLE_SCAN_BLOCKING_FINDINGS");
      record.scans[kind] = {
        completed: true,
        digest,
        blockingFindings: 0,
        reportDigest: hash(filename),
        ...(kind === "vulnerabilities" ? { includesUnfixed: true } : {}),
      };
    }
  }
  writeFileSync(
    join(directory, stage + ".json"),
    JSON.stringify(record, null, 2) + "\n",
    { flag: "wx" },
  );
  return record;
}

export function verifyCircleCIArchive(
  directory,
  env = process.env,
  readSource = circleCISourceIdentity,
) {
  const source = readSource(process.cwd(), env);
  const build = JSON.parse(
    readFileSync(join(directory, "staging-build-image.json"), "utf8"),
  );
  for (const key of [
    "sourceSha",
    "treeSha",
    "lockfileDigest",
    "dockerfileDigest",
    "configBlob",
  ]) {
    assert.equal(
      build[key],
      source[key],
      "CIRCLE_ARCHIVE_SOURCE_MISMATCH:" + key,
    );
  }
  assert.equal(
    build.workflowId,
    env.CIRCLE_WORKFLOW_ID,
    "CIRCLE_ARCHIVE_WORKFLOW_MISMATCH",
  );
  assert.equal(build.exitCode, 0, "CIRCLE_BUILD_FAILED");
  assert.equal(build.skipped, false, "CIRCLE_BUILD_SKIPPED");
  const digest =
    "sha256:" +
    createHash("sha256")
      .update(readFileSync(join(directory, "image.tar.gz")))
      .digest("hex");
  assert.equal(digest, build.archiveDigest, "CIRCLE_ARCHIVE_SUBSTITUTED");
  const image = JSON.parse(
    readFileSync(join(directory, "image-inspect.json"), "utf8"),
  )[0];
  const loaded = dockerIdentity(image);
  for (const key of [
    "dockerImageId",
    "dockerImageIdKind",
    "dockerDescriptorDigest",
    "dockerDescriptorKind",
  ])
    assert.equal(loaded[key], build[key], "CIRCLE_IMAGE_REBUILT:" + key);
  assert.equal(
    image.Config.Env.find((value) => value.startsWith("MORRO_RELEASE_SHA=")),
    `MORRO_RELEASE_SHA=${source.sourceSha}`,
    "CIRCLE_IMAGE_SOURCE_MISMATCH",
  );
  assert.equal(
    image.Config.Env.find((value) =>
      value.startsWith("MORRO_RELEASE_IMAGE_RUN_ID="),
    ),
    `MORRO_RELEASE_IMAGE_RUN_ID=circleci:${env.CIRCLE_WORKFLOW_ID}`,
    "CIRCLE_IMAGE_RUN_MISMATCH",
  );
  return {
    archiveDigest: digest,
    ...loaded,
    sourceSha: source.sourceSha,
  };
}

export function circleCIStagingImageEvidence(bundle, live) {
  assert.equal(bundle?.schemaVersion, 1, "CIRCLE_SCHEMA_INVALID");
  assert.equal(bundle.environment, "staging", "CIRCLE_STAGING_ONLY");
  assert.match(live?.mainSha ?? "", SHA, "CIRCLE_LIVE_MAIN_REQUIRED");
  assert.match(live.configBlob ?? "", SHA, "CIRCLE_CONFIG_BLOB_REQUIRED");
  const provider = bundle.provider;
  assert.equal(provider?.projectId, CIRCLE_PROJECT, "CIRCLE_PROJECT_MISMATCH");
  assert.equal(
    provider.organizationId,
    CIRCLE_ORGANIZATION,
    "CIRCLE_ORG_MISMATCH",
  );
  assert.match(provider.workflowId ?? "", UUID, "CIRCLE_WORKFLOW_INVALID");
  assert.equal(provider.branch, "main", "CIRCLE_PROTECTED_MAIN_REQUIRED");
  assert.equal(provider.controllerSha, live.mainSha, "CIRCLE_CONTROLLER_DRIFT");
  assert.equal(
    provider.configPath,
    "tooling/ci/circleci-native-pilot.yml",
    "CIRCLE_CONFIG_PATH_MISMATCH",
  );
  assert.equal(
    provider.configBlob,
    live.configBlob,
    "CIRCLE_CONFIG_BLOB_MISMATCH",
  );
  assert.equal(provider.status, "success", "CIRCLE_WORKFLOW_NOT_SUCCESSFUL");
  assert.equal(provider.sshEnabled, false, "CIRCLE_SSH_FORBIDDEN");
  const identity = candidateIdentity(bundle.identity);
  assert.equal(identity.repository, REPOSITORY, "CIRCLE_REPOSITORY_MISMATCH");
  assert.equal(identity.sourceSha, live.mainSha, "CIRCLE_SOURCE_DRIFT");
  assert.equal(identity.treeSha, live.treeSha, "CIRCLE_TREE_DRIFT");
  assert.equal(
    identity.lockfileDigest,
    live.lockfileDigest,
    "CIRCLE_LOCKFILE_DRIFT",
  );
  const runId = `circleci:${provider.workflowId}`;
  assert.equal(provider.jobs?.length, 3, "CIRCLE_JOB_SET_INVALID");
  assert.equal(
    new Set(provider.jobs.map((job) => job.id)).size,
    3,
    "CIRCLE_JOB_ID_REUSED",
  );
  assert.equal(
    new Set(provider.jobs.map((job) => job.number)).size,
    3,
    "CIRCLE_BUILD_NUMBER_REUSED",
  );
  for (const name of [
    "staging-quality",
    "staging-build-image",
    "staging-publish-image",
  ]) {
    const jobs = provider.jobs?.filter((job) => job.name === name) ?? [];
    assert.equal(jobs.length, 1, "CIRCLE_JOB_MISSING_OR_AMBIGUOUS:" + name);
    const job = jobs[0];
    assert.match(job.id ?? "", UUID, "CIRCLE_JOB_ID_INVALID");
    assert.equal(job.status, "success", "CIRCLE_JOB_NOT_SUCCESSFUL:" + name);
    assert.ok(
      Number.isSafeInteger(job.number) && job.number > 0,
      "CIRCLE_BUILD_NUMBER_INVALID",
    );
    const jobUrl = `https://app.circleci.com/jobs/circleci/${CIRCLE_ORGANIZATION}/${CIRCLE_PROJECT}/${job.number}`;
    const workflowUrl = `https://app.circleci.com/workflow/${provider.workflowId}/job/${job.id}`;
    const statuses =
      live.statuses?.filter(
        (entry) => entry.context === `ci/circleci: ${name}`,
      ) ?? [];
    for (const entry of statuses)
      assert.ok(
        Number.isSafeInteger(entry.id) && entry.id > 0,
        "CIRCLE_STATUS_ID_INVALID",
      );
    const status = statuses.sort((a, b) => b.id - a.id)[0];
    assert.equal(
      status?.state,
      "success",
      "CIRCLE_AUTHENTICATED_JOB_STATUS_REQUIRED:" + name,
    );
    assert.equal(
      status.creator?.login,
      "circleci-app[bot]",
      "CIRCLE_STATUS_ACTOR_MISMATCH",
    );
    assert.equal(
      status.creator.id,
      127350680,
      "CIRCLE_STATUS_ACTOR_ID_MISMATCH",
    );
    assert.equal(status.target_url, workflowUrl, "CIRCLE_STATUS_URL_MISMATCH");
    const record = bundle.records?.[name];
    assert.equal(record?.jobUrl, jobUrl, "CIRCLE_RECORD_JOB_URL_MISMATCH");
    assert.equal(
      record.sourceSha,
      identity.sourceSha,
      "CIRCLE_RECORD_SOURCE_MISMATCH",
    );
    assert.equal(
      record.treeSha,
      identity.treeSha,
      "CIRCLE_RECORD_TREE_MISMATCH",
    );
    assert.equal(
      record.lockfileDigest,
      identity.lockfileDigest,
      "CIRCLE_RECORD_LOCKFILE_MISMATCH",
    );
    assert.equal(
      record.workflowId,
      provider.workflowId,
      "CIRCLE_RECORD_WORKFLOW_MISMATCH",
    );
    assert.equal(
      record.configBlob,
      live.configBlob,
      "CIRCLE_RECORD_CONFIG_MISMATCH",
    );
    assert.equal(record.imageRunId, runId, "CIRCLE_RECORD_RUN_ID_MISMATCH");
    assert.equal(record.exitCode, 0, "CIRCLE_RECORD_FAILED");
    assert.equal(record.skipped, false, "CIRCLE_RECORD_SKIPPED");
    assert.match(record.logDigest ?? "", DIGEST, "CIRCLE_LOG_DIGEST_MISSING");
    const age = Date.parse(live.observedAt) - Date.parse(record.observedAt);
    assert.ok(
      Number.isFinite(age) && age >= 0 && age <= 86400000,
      "CIRCLE_EVIDENCE_STALE_OR_FUTURE",
    );
  }
  const build = bundle.records["staging-build-image"];
  const publication = bundle.records["staging-publish-image"];
  assert.match(
    build.archiveDigest ?? "",
    DIGEST,
    "CIRCLE_ARCHIVE_DIGEST_REQUIRED",
  );
  assert.equal(
    publication.archiveDigest,
    build.archiveDigest,
    "CIRCLE_ARCHIVE_SUBSTITUTED",
  );
  assert.match(
    build.dockerImageId ?? "",
    DIGEST,
    "CIRCLE_IMAGE_CONFIG_REQUIRED",
  );
  assert.equal(
    publication.dockerImageId,
    build.dockerImageId,
    "CIRCLE_IMAGE_REBUILT",
  );
  for (const key of [
    "dockerImageIdKind",
    "dockerDescriptorDigest",
    "dockerDescriptorKind",
  ])
    assert.equal(publication[key], build[key], "CIRCLE_IMAGE_REBUILT:" + key);
  assertRegistryBinding(build, publication);
  assert.equal(
    publication.registryObservedDigest,
    identity.digest,
    "CIRCLE_REGISTRY_DIGEST_MISMATCH",
  );
  assert.equal(
    publication.runtimeSourceSha,
    identity.sourceSha,
    "CIRCLE_SMOKE_SOURCE_MISMATCH",
  );
  assert.equal(
    publication.runtimeImageRunId,
    runId,
    "CIRCLE_SMOKE_RUN_MISMATCH",
  );
  assert.equal(publication.nonroot, true, "CIRCLE_NONROOT_REQUIRED");
  for (const scan of ["secrets", "vulnerabilities"]) {
    const result = publication.scans?.[scan];
    assert.equal(result?.completed, true, "CIRCLE_SCAN_MISSING");
    assert.equal(result.digest, identity.digest, "CIRCLE_SCAN_DIGEST_MISMATCH");
    assert.equal(result.blockingFindings, 0, "CIRCLE_SCAN_BLOCKING_FINDINGS");
    assert.match(
      result.reportDigest ?? "",
      DIGEST,
      "CIRCLE_SCAN_REPORT_REQUIRED",
    );
  }
  assert.equal(
    publication.scans.vulnerabilities.includesUnfixed,
    true,
    "CIRCLE_UNFIXED_SCAN_REQUIRED",
  );
  return {
    state: "STAGING_IMAGE_PROVEN_RUNTIME_ACCEPTANCE_PENDING",
    environment: "staging",
    provider: "circleci",
    imageRunId: runId,
    identity,
    serviceId: "srv-da4hb6c9v7es7386ttt0",
    workspaceId: "tea-d9p09oks728c7381s990",
    runtimeAccepted: false,
    productionAuthorized: false,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv[2] === "--circleci-runtime-manifest") {
    assert.equal(process.argv.length, 4, "CIRCLE_REGISTRY_ARGUMENT_REQUIRED");
    console.log(circleCIRegistryRuntimeDigest(process.argv[3]));
  } else if (process.argv[2] === "--circleci-verify-archive") {
    assert.equal(process.argv.length, 4, "CIRCLE_ARCHIVE_ARGUMENT_REQUIRED");
    console.log(
      JSON.stringify(verifyCircleCIArchive(process.argv[3]), null, 2),
    );
  } else if (process.argv[2] === "--circleci-stage-record") {
    assert.equal(process.argv.length, 5, "CIRCLE_STAGE_ARGUMENTS_REQUIRED");
    console.log(
      JSON.stringify(
        circleCIStageRecord(process.argv[3], process.argv[4]),
        null,
        2,
      ),
    );
  } else if (process.argv[2] === "--circleci-staging-image") {
    assert.equal(process.argv.length, 5, "CIRCLE_INPUT_FILES_REQUIRED");
    console.log(
      JSON.stringify(
        circleCIStagingImageEvidence(
          JSON.parse(readFileSync(process.argv[3], "utf8")),
          JSON.parse(readFileSync(process.argv[4], "utf8")),
        ),
        null,
        2,
      ),
    );
  } else {
    const result = deploymentEvidence(process.env);
    writeFileSync(
      "oci-deployment-evidence.txt",
      Object.entries(result)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n",
    );
  }
}
