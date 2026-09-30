import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  productionTwinCertificateMatches,
  productionTwinDispatchRequired,
  selectReusableProductionTwinCertificate,
} from "../release/production-twin-certificate.mjs";

const workflowPath = ".github/workflows/production-twin-certification.yml";
const executorPath = "tooling/release/production-twin-certification.sh";
const promotionPath = ".github/workflows/production-oci-promotion.yml";

const sourceSha = "a".repeat(40);
const treeSha = "b".repeat(40);
const imageDigest = `sha256:${"c".repeat(64)}`;
const candidateArtifactDigest = `sha256:${"d".repeat(64)}`;
const lockfileDigest = `sha256:${"e".repeat(64)}`;

function expected(overrides = {}) {
  return {
    expectedSha: sourceSha,
    treeSha,
    imageRepository: "ghcr.io/luizanunciostoca/morro-digital-v2",
    imageDigest,
    imageRunId: "123456",
    candidateArtifactDigest,
    lockfileDigest,
    ...overrides,
  };
}

function evidence(overrides = {}) {
  const identity = expected(overrides);
  return {
    contract: "MORRO-PRODUCTION-TWIN-CERTIFICATION",
    contractVersion: 1,
    status: "pass",
    expectedSha: identity.expectedSha,
    treeSha: identity.treeSha,
    candidate: {
      runId: "777",
      artifactDigest: identity.candidateArtifactDigest,
      lockfileDigest: identity.lockfileDigest,
    },
    image: {
      repository: identity.imageRepository,
      digest: identity.imageDigest,
      runId: identity.imageRunId,
      immutable: true,
    },
    productionSample: { schemaCount: 13, totalTables: 91 },
    twin: {
      noEgress: true,
      runtimeProbe: "docker-exec-loopback",
      syntheticReleaseIdentity: true,
      runtimePredeploy: { status: "pass", domainCount: 13, totalTables: 91 },
      paymentsPredeploy: { status: "pass", checkoutMode: "test" },
    },
    persistence: {
      write: "stored",
      readback: "replayed",
      reloadReadback: "replayed",
      newSessionReadback: "replayed",
      redeployReadback: "replayed",
      survivedRedeploy: true,
    },
    safety: {
      productionMutation: false,
      renderMutation: false,
      railwayTouched: false,
      productionCredentialsConfirmed: false,
      subscriptionsEnabled: false,
      plaintextUploaded: false,
    },
    result: "PRODUCTION_TWIN_CERTIFICATION = PASS",
  };
}

test("accepts only the complete exact candidate identity", () => {
  assert.equal(productionTwinCertificateMatches(evidence(), expected()), true);

  for (const [field, mismatched] of [
    ["expectedSha", "f".repeat(40)],
    ["treeSha", "1".repeat(40)],
    ["imageRepository", "ghcr.io/example/other-image"],
    ["imageDigest", `sha256:${"2".repeat(64)}`],
    ["imageRunId", "999999"],
    ["candidateArtifactDigest", `sha256:${"3".repeat(64)}`],
    ["lockfileDigest", `sha256:${"4".repeat(64)}`],
  ]) {
    assert.equal(
      productionTwinCertificateMatches(
        evidence(),
        expected({ [field]: mismatched }),
      ),
      false,
      `certificate must reject mismatched ${field}`,
    );
  }
});

test("rejects certificates that weaken isolation or safety boundaries", () => {
  const mutations = [
    (value) => {
      value.safety.railwayTouched = true;
    },
    (value) => {
      value.twin.noEgress = false;
    },
    (value) => {
      value.twin.runtimeProbe = "host-port";
    },
    (value) => {
      value.twin.syntheticReleaseIdentity = false;
    },
  ];

  for (const mutate of mutations) {
    const unsafe = evidence();
    mutate(unsafe);
    assert.equal(productionTwinCertificateMatches(unsafe, expected()), false);
  }
});

test("reuses only an exact certificate and dispatches when none matches", () => {
  const stale = evidence({ imageDigest: `sha256:${"5".repeat(64)}` });
  const exact = evidence();
  const selected = selectReusableProductionTwinCertificate(
    [
      { runId: "101", evidence: stale },
      { runId: "202", evidence: exact },
    ],
    expected(),
  );

  assert.equal(selected?.runId, "202");
  assert.equal(
    productionTwinDispatchRequired(
      [{ runId: "101", evidence: stale }],
      expected(),
    ),
    true,
  );
  assert.equal(
    productionTwinDispatchRequired(
      [{ runId: "202", evidence: exact }],
      expected(),
    ),
    false,
  );
});

test("production twin executor is syntactically valid and no-egress", () => {
  const syntax = spawnSync("bash", ["-n", executorPath], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);

  const source = readFileSync(executorPath, "utf8");
  for (const required of [
    'CONTRACT="MORRO-PRODUCTION-TWIN-CERTIFICATION"',
    'IMAGE_REPOSITORY="ghcr.io/luizanunciostoca/morro-digital-v2"',
    'MYSQL_ALIAS="morro-digital-v2-production-mysql"',
    "morro-digital-candidate-$expected_sha",
    "release-candidate-manifest.json",
    "candidate_artifact_digest",
    "lockfile_digest",
    "production-mysql-backup-restore-proof-",
    "production-mysql-backup-restore-evidence.json",
    "production-mysql-backup.sql.gz.enc",
    "openssl enc -d -aes-256-cbc",
    'docker pull "$image_path"',
    'docker network create --internal "$network"',
    '--network-alias "$MYSQL_ALIAS"',
    'docker run --rm --network none "$image_path"',
    'docker exec "$app_container"',
    "MORRO_RELEASE_VERSION=$expected_sha",
    "MORRO_DEPLOYMENT_ID=production-twin-",
    "TWIN_RELEASE_IDENTITY_INVALID",
    ".release.sha == $sha",
    ".release.version == $version",
    ".release.deploymentId == $deployment",
    ".release.imageRunId == $imageRun",
    'runtimeProbe:"docker-exec-loopback"',
    "syntheticReleaseIdentity:true",
    'Origin: "http://127.0.0.1:3000"',
    'date -u +%Y-%m-%dT%H:%M:%S.000Z',
    'probe:"analytics-write"',
    "production-runtime-database-predeploy.mjs",
    "payments-migrate.mjs",
    "/healthz",
    "/readyz",
    "/api/analytics/v1/events",
    'docker rm -f "$app_container"',
    "noEgress:true",
    'authHelperNetwork:"none"',
    "survivedRedeploy:true",
    "productionMutation:false",
    "renderMutation:false",
    "railwayTouched:false",
    'paymentsMode:"test"',
    "productionCredentialsConfirmed:false",
    "subscriptionsEnabled:false",
    "plaintextUploaded:false",
  ]) {
    assert.ok(
      source.includes(required),
      `missing production twin contract: ${required}`,
    );
  }

  for (const forbidden of [
    "RENDER_PRODUCTION_API_KEY",
    "RAILWAY_",
    "railway.app",
    "api.render.com/v1/services",
    "morro-digital-v2.onrender.com",
    "MERCADO_PAGO_CHECKOUT_MODE=production",
    "MERCADO_PAGO_PRODUCTION_CREDENTIALS_CONFIRMED=true",
    "PAYMENTS_SUBSCRIPTIONS_ENABLED=true",
    "-p 127.0.0.1:18080:3000",
    "http://127.0.0.1:18080",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `unsafe production twin marker: ${forbidden}`,
    );
  }
});

test("production twin workflow requires the candidate and encrypted DR identities", () => {
  const source = readFileSync(workflowPath, "utf8");
  for (const required of [
    "name: Production Twin Certification",
    "candidate_run_id:",
    "confirm_twin:",
    "Type CERTIFY",
    "permissions:",
    "actions: read",
    "packages: read",
    "environment:",
    "name: production",
    "PRODUCTION_MYSQL_DR_ENCRYPTION_KEY_V1",
    "CANDIDATE_RUN_ID: ${{ inputs.candidate_run_id }}",
    "bash tooling/release/production-twin-certification.sh",
    "production-twin-certification-${{ github.run_id }}",
    "production-twin-certification-evidence.json",
    "retention-days: 90",
  ]) {
    assert.ok(
      source.includes(required),
      `missing twin workflow contract: ${required}`,
    );
  }

  assert.ok(!source.includes("RENDER_PRODUCTION_API_KEY"));
  assert.ok(!source.includes("RAILWAY_"));
});

test("production cutover verifies exact certificate identity before reuse", () => {
  const source = readFileSync(promotionPath, "utf8");
  for (const required of [
    "production-twin-certification.yml",
    "production-twin-certification-",
    "morro-digital-candidate-$EXPECTED_SHA",
    "candidate_artifact_digest",
    "lockfile_digest",
    "production-twin-expected.json",
    "production-twin-certificate.mjs verify",
    '-f candidate_run_id="$candidate_run_id"',
    "goldenDigestCertified:true",
    "twinCertification",
  ]) {
    assert.ok(
      source.includes(required),
      `missing promotion twin gate: ${required}`,
    );
  }
});
