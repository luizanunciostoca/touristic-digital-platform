import assert from "node:assert/strict";
import test from "node:test";
import { deploymentEvidence } from "./staging-oci-deployment-evidence.mjs";

const env = {
  EXPECTED_SHA: "a".repeat(40),
  IMAGE_DIGEST: "sha256:" + "b".repeat(64),
  IMAGE_RUN_ID: "123",
  LIVE_IMAGE_RUN_ID: "123",
  LIVE_RELEASE_SHA: "a".repeat(40),
  RUNTIME_OUTCOME: "success",
  DEPLOY_ID: "dep-firstattempt",
  IMAGE_REPOSITORY: "ghcr.io/luizanunciostoca/morro-digital-v2",
  TARGET_URL: "https://morro-digital-v2-staging.onrender.com",
};

test("runtime success never attributes a replacement deployment to the original request", () => {
  const result = deploymentEvidence(env);
  assert.equal(result.runtime_identity, "verified");
  assert.equal(result.requested_render_deploy_id, "dep-firstattempt");
  assert.equal(result.live_render_deploy_id, "unknown");
  assert.equal(result.provider_deployment_binding, "not_verified");
  assert.equal(result.render_deploy_id, result.requested_render_deploy_id);
  assert.equal(
    result.render_deploy_id_semantics,
    "request_receipt_not_live_binding",
  );
  assert.equal(result.image, env.IMAGE_REPOSITORY);
  assert.equal(result.target_url, env.TARGET_URL);
});
test("legacy acceptance fields remain present without claiming provider binding", () => {
  const result = deploymentEvidence(env);
  for (const field of [
    "expected_sha",
    "image",
    "digest",
    "image_run_id",
    "live_image_run_id",
    "target_url",
    "render_deploy_id",
  ])
    assert.equal(typeof result[field], "string", field);
  assert.equal(result.provider_deployment_binding, "not_verified");
});
for (const override of [
  { RUNTIME_OUTCOME: "failure" },
  { LIVE_IMAGE_RUN_ID: "456" },
  { LIVE_RELEASE_SHA: "c".repeat(40) },
  { LIVE_RELEASE_SHA: undefined },
]) {
  test(`incomplete or mismatched proof stays unverified: ${JSON.stringify(override)}`, () => {
    assert.equal(
      deploymentEvidence({ ...env, ...override }).runtime_identity,
      "unverified",
    );
  });
}
test("invalid receipt cannot inject extra evidence lines", () => {
  assert.equal(
    deploymentEvidence({
      ...env,
      DEPLOY_ID: "dep-foo\nlive_render_deploy_id=forged",
    }).requested_render_deploy_id,
    "unknown",
  );
});

const workflow = "11111111-2222-4333-8444-555555555555";
const project = "418769eb-78ac-4cd3-a2d4-98fcca743a54";
const organization = "72434fbd-ebe2-4b61-9831-ee418c893f14";
const digest = "sha256:" + "b".repeat(64);
function externalFixture() {
  const jobs = [
    "staging-quality",
    "staging-build-image",
    "staging-publish-image",
  ].map((name, i) => ({
    name,
    id: `00000000-0000-4000-8000-00000000000${i}`,
    number: i + 1,
    status: "success",
  }));
  const live = {
    mainSha: "a".repeat(40),
    treeSha: "c".repeat(40),
    configBlob: "d".repeat(40),
    lockfileDigest: "sha256:" + "e".repeat(64),
    observedAt: "2026-11-08T12:00:00Z",
    statuses: jobs.map((job, i) => ({
      id: i + 1,
      context: `ci/circleci: ${job.name}`,
      state: "success",
      creator: { login: "circleci-app[bot]", id: 127350680 },
      target_url: `https://app.circleci.com/workflow/${workflow}/job/${job.id}`,
    })),
  };
  const records = Object.fromEntries(
    jobs.map((job) => [
      job.name,
      {
        jobUrl: `https://app.circleci.com/jobs/circleci/${organization}/${project}/${job.number}`,
        sourceSha: live.mainSha,
        treeSha: live.treeSha,
        lockfileDigest: live.lockfileDigest,
        workflowId: workflow,
        configBlob: live.configBlob,
        imageRunId: `circleci:${workflow}`,
        exitCode: 0,
        skipped: false,
        logDigest: digest,
        observedAt: "2026-11-08T11:59:00Z",
      },
    ]),
  );
  Object.assign(records["staging-build-image"], {
    archiveDigest: digest,
    imageConfigDigest: digest,
  });
  Object.assign(records["staging-publish-image"], {
    archiveDigest: digest,
    imageConfigDigest: digest,
    registryObservedDigest: digest,
    runtimeSourceSha: live.mainSha,
    runtimeImageRunId: `circleci:${workflow}`,
    nonroot: true,
    scans: {
      secrets: {
        completed: true,
        digest,
        blockingFindings: 0,
        reportDigest: digest,
      },
      vulnerabilities: {
        completed: true,
        digest,
        blockingFindings: 0,
        reportDigest: digest,
        includesUnfixed: true,
      },
    },
  });
  return {
    live,
    bundle: {
      schemaVersion: 1,
      environment: "staging",
      provider: {
        projectId: project,
        organizationId: organization,
        workflowId: workflow,
        controllerSha: live.mainSha,
        branch: "main",
        configPath: "tooling/ci/circleci-native-pilot.yml",
        configBlob: live.configBlob,
        status: "success",
        sshEnabled: false,
        jobs,
      },
      identity: {
        repository: "luizanunciostoca/touristic-digital-platform",
        sourceSha: live.mainSha,
        treeSha: live.treeSha,
        lockfileDigest: live.lockfileDigest,
        image: "ghcr.io/luizanunciostoca/morro-digital-v2",
        digest,
      },
      records,
    },
  };
}
const { circleCIStagingImageEvidence } =
  await import("./staging-oci-deployment-evidence.mjs");
test("real external identity format is distinct from Actions and never claims runtime or production acceptance", () => {
  const f = externalFixture();
  const r = circleCIStagingImageEvidence(f.bundle, f.live);
  assert.equal(r.imageRunId, `circleci:${workflow}`);
  assert.equal(r.state, "STAGING_IMAGE_PROVEN_RUNTIME_ACCEPTANCE_PENDING");
  assert.equal(r.runtimeAccepted, false);
  assert.equal(r.productionAuthorized, false);
});
const rejected = [
  ["production scope", (f) => (f.bundle.environment = "production")],
  ["another project", (f) => (f.bundle.provider.projectId = "another")],
  [
    "another organization",
    (f) => (f.bundle.provider.organizationId = "another"),
  ],
  ["untrusted branch", (f) => (f.bundle.provider.branch = "candidate")],
  [
    "stale controller",
    (f) => (f.bundle.provider.controllerSha = "f".repeat(40)),
  ],
  ["changed config", (f) => (f.bundle.provider.configBlob = "f".repeat(40))],
  [
    "wrong config path",
    (f) => (f.bundle.provider.configPath = ".circleci/config.yml"),
  ],
  ["incomplete workflow", (f) => (f.bundle.provider.status = "running")],
  ["SSH execution", (f) => (f.bundle.provider.sshEnabled = true)],
  ["mismatched source", (f) => (f.bundle.identity.sourceSha = "f".repeat(40))],
  ["mismatched tree", (f) => (f.live.treeSha = "f".repeat(40))],
  [
    "mismatched lockfile",
    (f) => (f.live.lockfileDigest = "sha256:" + "f".repeat(64)),
  ],
  [
    "different repository",
    (f) => (f.bundle.identity.repository = "another/project"),
  ],
  ["missing job", (f) => f.bundle.provider.jobs.pop()],
  [
    "ambiguous job",
    (f) => f.bundle.provider.jobs.push(f.bundle.provider.jobs[0]),
  ],
  ["job not successful", (f) => (f.bundle.provider.jobs[0].status = "failed")],
  [
    "reused job ID",
    (f) => (f.bundle.provider.jobs[1].id = f.bundle.provider.jobs[0].id),
  ],
  [
    "reused build number",
    (f) =>
      (f.bundle.provider.jobs[1].number = f.bundle.provider.jobs[0].number),
  ],
  ["missing authenticated status", (f) => (f.live.statuses = [])],
  [
    "forged actor",
    (f) => (f.live.statuses[0].creator.login = "github-actions[bot]"),
  ],
  ["wrong actor numeric identity", (f) => (f.live.statuses[0].creator.id = 1)],
  [
    "another workflow status",
    (f) =>
      (f.live.statuses[0].target_url =
        "https://app.circleci.com/workflow/other/job/other"),
  ],
  [
    "missing archive binding",
    (f) => delete f.bundle.records["staging-build-image"].archiveDigest,
  ],
  [
    "substituted archive",
    (f) =>
      (f.bundle.records["staging-publish-image"].archiveDigest =
        "sha256:" + "f".repeat(64)),
  ],
  [
    "rebuilt image",
    (f) =>
      (f.bundle.records["staging-publish-image"].imageConfigDigest =
        "sha256:" + "f".repeat(64)),
  ],
  [
    "registry substitution",
    (f) =>
      (f.bundle.records["staging-publish-image"].registryObservedDigest =
        "sha256:" + "f".repeat(64)),
  ],
  [
    "wrong runtime source",
    (f) =>
      (f.bundle.records["staging-publish-image"].runtimeSourceSha = "f".repeat(
        40,
      )),
  ],
  [
    "root runtime",
    (f) => (f.bundle.records["staging-publish-image"].nonroot = false),
  ],
  [
    "missing secret scan",
    (f) => delete f.bundle.records["staging-publish-image"].scans.secrets,
  ],
  [
    "unfixed vulnerabilities excluded",
    (f) =>
      (f.bundle.records[
        "staging-publish-image"
      ].scans.vulnerabilities.includesUnfixed = false),
  ],
  [
    "blocking vulnerability",
    (f) =>
      (f.bundle.records[
        "staging-publish-image"
      ].scans.vulnerabilities.blockingFindings = 1),
  ],
  [
    "blocking embedded secret",
    (f) =>
      (f.bundle.records[
        "staging-publish-image"
      ].scans.secrets.blockingFindings = 1),
  ],
  [
    "wrong scanned digest",
    (f) =>
      (f.bundle.records["staging-publish-image"].scans.secrets.digest =
        "sha256:" + "f".repeat(64)),
  ],
  [
    "missing scanner report hash",
    (f) =>
      delete f.bundle.records["staging-publish-image"].scans.secrets
        .reportDigest,
  ],
];
for (const [name, mutate] of rejected)
  test(`external admission rejects ${name}`, () => {
    const f = externalFixture();
    mutate(f);
    assert.throws(() => circleCIStagingImageEvidence(f.bundle, f.live));
  });
for (const stage of [
  "staging-quality",
  "staging-build-image",
  "staging-publish-image",
]) {
  for (const [field, bad] of Object.entries({
    sourceSha: "f".repeat(40),
    treeSha: "f".repeat(40),
    lockfileDigest: "sha256:" + "f".repeat(64),
    workflowId: "another",
    configBlob: "f".repeat(40),
    imageRunId: "424242",
    exitCode: 1,
    skipped: true,
    logDigest: undefined,
    observedAt: "2026-11-01T00:00:00Z",
  }))
    test(`external ${stage} refuses invalid ${field}`, () => {
      const f = externalFixture();
      f.bundle.records[stage][field] = bad;
      assert.throws(() => circleCIStagingImageEvidence(f.bundle, f.live));
    });
}
test("a newer failed or pending status invalidates older green proof, regardless of caller array ordering", () => {
  for (const state of ["failure", "pending", "error"]) {
    const f = externalFixture();
    f.live.statuses.push({ ...f.live.statuses[0], id: 100, state });
    assert.throws(() => circleCIStagingImageEvidence(f.bundle, f.live));
  }
});

const { mkdtempSync, writeFileSync, rmSync, readFileSync } =
  await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { createHash } = await import("node:crypto");
const { circleCIStageRecord, verifyCircleCIArchive, circleCISourceIdentity } =
  await import("./staging-oci-deployment-evidence.mjs");
function archiveFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "tdp-circle-archive-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const f = externalFixture();
  const source = {
    repository: f.bundle.identity.repository,
    sourceSha: f.live.mainSha,
    treeSha: f.live.treeSha,
    lockfileDigest: f.live.lockfileDigest,
    configBlob: f.live.configBlob,
    dockerfileDigest: digest,
  };
  const env = {
    CIRCLE_WORKFLOW_ID: workflow,
    CIRCLE_BUILD_NUM: "2",
    CIRCLE_BUILD_URL: `https://app.circleci.com/jobs/circleci/${organization}/${project}/2`,
  };
  const image = [
    {
      Id: digest,
      Config: {
        User: "65532:65532",
        Env: [
          `MORRO_RELEASE_SHA=${source.sourceSha}`,
          `MORRO_RELEASE_IMAGE_RUN_ID=circleci:${workflow}`,
        ],
      },
    },
  ];
  const json = (name, value) =>
    writeFileSync(join(directory, name), JSON.stringify(value));
  writeFileSync(join(directory, "image.tar.gz"), "immutable archive fixture");
  json("image-inspect.json", image);
  writeFileSync(
    join(directory, "staging-build-image.log"),
    "build completed once",
  );
  const record = circleCIStageRecord(
    "staging-build-image",
    directory,
    env,
    () => source,
  );
  return { directory, source, env, image, json, record };
}
test("archive receipt hashes actual bytes and refuses mutation before publication", (t) => {
  const f = archiveFixture(t);
  assert.equal(
    verifyCircleCIArchive(f.directory, f.env, () => f.source).archiveDigest,
    f.record.archiveDigest,
  );
  writeFileSync(join(f.directory, "image.tar.gz"), "substituted bytes");
  assert.throws(
    () => verifyCircleCIArchive(f.directory, f.env, () => f.source),
    /ARCHIVE_SUBSTITUTED/,
  );
});
test("loaded image config substitution is refused before publisher use", (t) => {
  const f = archiveFixture(t);
  f.image[0].Id = "sha256:" + "f".repeat(64);
  f.json("image-inspect.json", f.image);
  assert.throws(
    () => verifyCircleCIArchive(f.directory, f.env, () => f.source),
    /IMAGE_REBUILT/,
  );
});
test("another workflow or protected source cannot consume the archive", (t) => {
  const f = archiveFixture(t);
  assert.throws(
    () =>
      verifyCircleCIArchive(
        f.directory,
        { ...f.env, CIRCLE_WORKFLOW_ID: "different" },
        () => f.source,
      ),
    /WORKFLOW_MISMATCH/,
  );
  assert.throws(
    () =>
      verifyCircleCIArchive(f.directory, f.env, () => ({
        ...f.source,
        treeSha: "f".repeat(40),
      })),
    /SOURCE_MISMATCH/,
  );
});
test("record writer cannot overwrite previously frozen provenance", (t) => {
  const f = archiveFixture(t);
  assert.throws(
    () =>
      circleCIStageRecord(
        "staging-build-image",
        f.directory,
        f.env,
        () => f.source,
      ),
    /EEXIST/,
  );
});
test("publisher record requires exact registry config, semantic runtime and executed scans", (t) => {
  const f = archiveFixture(t);
  const env = {
    ...f.env,
    CIRCLE_BUILD_NUM: "3",
    CIRCLE_BUILD_URL: `https://app.circleci.com/jobs/circleci/${organization}/${project}/3`,
  };
  f.json("registry-manifest.json", { config: { digest } });
  writeFileSync(join(f.directory, "registry-digest.txt"), digest);
  writeFileSync(
    join(f.directory, "staging-publish-image.log"),
    "pushed exact archive",
  );
  f.json("health.json", {
    status: "live",
    release: { sha: f.source.sourceSha, imageRunId: `circleci:${workflow}` },
  });
  for (const kind of ["secrets", "vulnerabilities"])
    f.json(`image-${kind}.json`, {
      ArtifactName: `ghcr.io/luizanunciostoca/morro-digital-v2@${digest}`,
      ArtifactType: "container_image",
      Metadata: { ImageID: digest },
      Results:
        kind === "secrets" ? [] : [{ Target: "alpine", Vulnerabilities: [] }],
    });
  const record = circleCIStageRecord(
    "staging-publish-image",
    f.directory,
    env,
    () => f.source,
  );
  assert.equal(record.archiveDigest, f.record.archiveDigest);
  assert.equal(record.scans.vulnerabilities.includesUnfixed, true);
  assert.equal(record.nonroot, true);
});
test("source recording refuses candidate branches before accessing Git or credentials", () => {
  assert.throws(
    () =>
      circleCISourceIdentity("/nonexistent", { CIRCLE_BRANCH: "candidate" }),
    /PROTECTED_MAIN_REQUIRED/,
  );
});

const { createRequire } = await import("node:module");
const yaml = createRequire(import.meta.url)("js-yaml");
const nativeConfig = () =>
  yaml.load(
    readFileSync(
      new URL("./circleci-native-pilot.yml", import.meta.url),
      "utf8",
    ),
  );
test("publisher context is main-only, approval-dependent and isolated from quality/build jobs", () => {
  const c = nativeConfig(),
    jobs = c.workflows["build-once-staging-image"].jobs;
  const publication = jobs.find((j) => j["staging-publish-image"])[
    "staging-publish-image"
  ];
  assert.equal(publication.context, "tdp-staging-publisher");
  assert.equal(publication.filters.branches.only, "main");
  assert.deepEqual(publication.requires, [
    "authorize-staging-image-publication",
  ]);
  for (const name of ["staging-quality", "staging-build-image"])
    assert.equal(jobs.find((j) => j[name])[name].context, undefined);
  const candidate = c.workflows["verify-claimed-release-candidate"].jobs;
  assert.deepEqual(candidate, ["staging-quality"]);
  assert.equal(c.parameters.mode.default, "verify");
  assert.equal(c.parameters.expected_sha.default, "");
});
test("release uses full canonical quality, immutable tooling, one Docker build and digest scans", () => {
  const c = nativeConfig();
  const commands = Object.values(c.jobs).flatMap((j) =>
    j.steps.filter((s) => s.run).map((s) => s.run.command),
  );
  assert(commands.some((s) => s.includes("pnpm check | tee")));
  assert.equal(
    commands.filter((s) =>
      s.includes("docker build --pull --target production"),
    ).length,
    1,
  );
  assert(commands.some((s) => s.includes("--ignore-unfixed=false")));
  assert(commands.some((s) => s.includes("--scanners secret")));
  assert(commands.some((s) => s.includes("--format cyclonedx")));
  for (const cmd of commands) assert(cmd.length < 2048);
  for (const job of Object.values(c.jobs))
    if (job.docker) assert.match(job.docker[0].image, /@sha256:[a-f0-9]{64}$/u);
  assert(
    commands
      .filter((s) => s.includes("aquasec/trivy:"))
      .every((s) => s.includes("aquasec/trivy:0.70.0@sha256:")),
  );
});
test("artifact replacement is checked before credential access and failed secret reports are private", () => {
  const steps = nativeConfig().jobs["staging-publish-image"].steps;
  const verify = steps.findIndex(
    (s) => s.run?.name === "Validate artifact before publisher access",
  );
  const publish = steps.findIndex(
    (s) => s.run?.name === "Publish exact archive and bind observed manifest",
  );
  assert(verify < publish);
  assert(steps[verify].run.command.includes("--circleci-verify-archive"));
  const scan = steps.find(
    (s) =>
      s.run?.name ===
      "Scan exact digest without excluding unfixed vulnerabilities",
  ).run.command;
  assert(scan.includes("/private/image-secrets.json"));
  assert(scan.includes("trap"));
  assert(
    scan.indexOf('cp "$private_scan/image-secrets.json"') >
      scan.indexOf("--scanners secret"),
  );
  const all = JSON.stringify(nativeConfig());
  assert(!all.includes("RENDER_API_KEY"));
  assert(!all.includes("production-oci"));
});
