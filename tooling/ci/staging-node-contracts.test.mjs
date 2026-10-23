import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateExternalNodeObservation,
  requireOciAcceptance,
  requireNodePublicationAuthority,
  assertObservationAfterBarrier,
  validateNodePreflight,
  configurationFingerprint,
} from "./staging-node-contracts.mjs";
import {
  fixture,
  preflightFixture,
  sha,
  tree,
  now,
} from "./staging-node-test-fixtures.mjs";

test("typed connector observation validates structure without manufacturing authority", () => {
  const { evidence, expected } = fixture();
  const result = validateExternalNodeObservation(evidence, expected, { now });
  assert.equal(result.contractValid, true);
  assert.equal(result.originAuthenticated, false);
  assert.equal(result.publicationAuthorized, false);
  assert.notEqual(result.providerDeploymentId, result.runtimeIdentity);
  assert.throws(
    () => requireNodePublicationAuthority(result),
    /EXTERNAL_EVIDENCE_AUTHORITY_NOT_CONFIGURED/,
  );
});
const cases = [
  [
    "missing provider ID",
    (e) => {
      delete e.provider.deploymentId;
    },
  ],
  [
    "wrong provider commit",
    (e) => {
      e.provider.commitSha = "f".repeat(40);
    },
  ],
  [
    "provider not live",
    (e) => {
      e.provider.status = "build_in_progress";
    },
  ],
  [
    "provider predates dispatch",
    (e) => {
      e.provider.createdAt = "2026-10-23T04:17:59Z";
    },
  ],
  [
    "configuration drift",
    (e) => {
      e.provider.configurationFingerprint = "sha256:" + "f".repeat(64);
    },
  ],
  [
    "runtime unhealthy",
    (e) => {
      e.runtime.healthy = false;
    },
  ],
  [
    "runtime observed before live",
    (e) => {
      e.runtime.observedAt = "2026-10-23T04:18:59Z";
    },
  ],
  [
    "wrong caller",
    (e) => {
      e.workflow.callerRunId = 11;
    },
  ],
  [
    "wrong attempt",
    (e) => {
      e.workflow.runAttempt = 2;
    },
  ],
  [
    "artifact attempt mismatch",
    (e) => {
      e.artifact.runAttempt = 2;
    },
  ],
  [
    "artifact ID mismatch",
    (e) => {
      e.artifact.id = 100;
    },
  ],
  [
    "OCI mixed into Node",
    (e) => {
      e.imageDigest = "sha256:" + "e".repeat(64);
    },
  ],
  [
    "production eligible Node",
    (e) => {
      e.productionEligible = true;
    },
  ],
  [
    "Pages eligible Node",
    (e) => {
      e.pagesEligible = true;
    },
  ],
  [
    "false CI provider attestation",
    (e) => {
      e.origin.verifiedByActions = true;
    },
  ],
  [
    "unknown external evidence",
    (e) => {
      e.externalEvidence.unknowns = ["unverified-source"];
    },
  ],
  [
    "external conflict",
    (e) => {
      e.externalEvidence.conflicts = ["different-deploy"];
    },
  ],
  [
    "unverified external status",
    (e) => {
      e.externalEvidence.items[0].status = "INFERRED";
    },
  ],
  [
    "wrong external producer",
    (e) => {
      e.externalEvidence.items[0].producer = "caller";
    },
  ],
  [
    "duplicate external item",
    (e) => {
      e.externalEvidence.items.push(
        structuredClone(e.externalEvidence.items[0]),
      );
    },
  ],
  [
    "stale external evidence",
    (e) => {
      e.externalEvidence.items[0].freshnessSeconds = 1;
    },
  ],
  [
    "replayed reservation",
    (_e, x) => {
      x.reservationConsumed = true;
    },
  ],
  [
    "ambiguous artifact",
    (_e, x) => {
      x.artifactCount = 2;
    },
  ],
  [
    "old same-SHA runtime",
    (e, x) => {
      x.previousRuntime = { releaseSha: sha, identity: e.runtime.identity };
    },
  ],
];
for (const [name, mutate] of cases)
  test(name + " fails closed", () => {
    const { evidence, expected } = fixture();
    mutate(evidence, expected);
    assert.throws(() =>
      validateExternalNodeObservation(evidence, expected, { now }),
    );
  });
for (const consumer of ["production", "pages", "oci"])
  test("Node rejected by " + consumer + " before dispatch", () => {
    const { evidence } = fixture();
    let dispatched = 0;
    assert.throws(() => {
      requireOciAcceptance(evidence, consumer);
      dispatched++;
    }, /OCI_ACCEPTANCE_REQUIRED/);
    assert.equal(dispatched, 0);
  });
test("valid immutable OCI evidence remains eligible", () => {
  assert.equal(
    requireOciAcceptance(
      {
        mode: "oci-immutable",
        productionEligible: true,
        pagesEligible: true,
        imageDigest: "sha256:" + "e".repeat(64),
        imageRunId: "42",
      },
      "production",
    ),
    true,
  );
});
test("intervening provider deployment fails current runtime acceptance", () => {
  const f = fixture();
  f.evidence.provider.latestDeploymentId = "dep-intervening";
  assert.throws(
    () => validateExternalNodeObservation(f.evidence, f.expected, { now }),
    /NODE_INTERVENING_DEPLOYMENT/,
  );
});
test("verify queued behind OCI rejects fresh-in-age provider observation made before its lock barrier", () => {
  const f = fixture();
  f.expected.verificationBarrier = {
    ...f.expected.verificationBarrier,
    recordedAt: "2026-10-23T04:19:35Z",
  };
  assert.throws(
    () => validateExternalNodeObservation(f.evidence, f.expected, { now }),
    /NODE_PROVIDER_OBSERVATION_PREDATES_VERIFICATION_BARRIER/,
  );
});
test("verify queued behind OCI rejects runtime observation made before its lock barrier", () => {
  const f = fixture();
  f.evidence.origin.observedAt = "2026-10-23T04:19:50Z";
  f.evidence.externalEvidence.items[0].observedAt =
    f.evidence.origin.observedAt;
  f.expected.verificationBarrier = {
    ...f.expected.verificationBarrier,
    recordedAt: "2026-10-23T04:19:45Z",
  };
  assert.throws(
    () => validateExternalNodeObservation(f.evidence, f.expected, { now }),
    /NODE_RUNTIME_OBSERVATION_PREDATES_VERIFICATION_BARRIER/,
  );
});
test("receipt observed before verifier lock barrier fails even if provider/runtime queries are later", () => {
  const f = fixture();
  assert.throws(
    () =>
      assertObservationAfterBarrier(
        f.evidence,
        "2026-10-23T04:19:19Z",
        f.expected.verificationBarrier,
      ),
    /NODE_RECEIPT_PREDATES_VERIFICATION_BARRIER/,
  );
});

test("staged policy stays disabled and cannot authorize production or Pages", () => {
  const policy = JSON.parse(
    readFileSync(new URL("./staging-node-exception.json", import.meta.url)),
  );
  assert.equal(policy.enabled, false);
  assert.equal(policy.maximumDeployments, 1);
  assert.equal(policy.productionEligible, false);
  assert.equal(policy.pagesEligible, false);
});

test("preflight accepts the fixed service with candidate-bound recovery evidence", () => {
  const f = preflightFixture();
  assert.equal(validateNodePreflight(f, sha), f);
});
for (const [field, value, code] of [
  ["serviceId", "srv-other", "NODE_SNAPSHOT_SERVICE"],
  ["runtime", "docker", "NODE_SNAPSHOT_RUNTIME"],
  ["url", "https://example.invalid", "NODE_SNAPSHOT_URL"],
  ["repository", "https://example.invalid/repo", "NODE_SNAPSHOT_REPOSITORY"],
  ["branch", "other", "NODE_SNAPSHOT_BRANCH"],
  ["autoDeploy", true, "NODE_AUTODEPLOY_FORBIDDEN"],
  ["diskId", "dsk-other", "NODE_DISK_CHANGED"],
  ["diskMountPath", "/other", "NODE_DISK_MOUNT_CHANGED"],
  ["diskSizeGB", 2, "NODE_DISK_SIZE_CHANGED"],
  ["plan", "standard", "NODE_PLAN_CHANGED"],
  ["region", "oregon", "NODE_REGION_CHANGED"],
  ["instances", 2, "NODE_INSTANCE_COUNT_CHANGED"],
  ["healthCheckPath", "/healthz", "NODE_HEALTH_PATH_CHANGED"],
  ["buildCommand", "other", "NODE_BUILD_CHANGED"],
  ["preDeployCommand", "other", "NODE_PREDEPLOY_CHANGED"],
  ["startCommand", "other", "NODE_START_CHANGED"],
])
  test(
    "preflight rejects changed " + field + " even with a matching fingerprint",
    () => {
      const f = preflightFixture();
      f.serviceSnapshot[field] = value;
      f.configurationFingerprint = configurationFingerprint(f.serviceSnapshot);
      assert.throws(() => validateNodePreflight(f, sha), new RegExp(code));
    },
  );
test("preflight rejects fingerprint mismatch", () => {
  const f = preflightFixture();
  f.configurationFingerprint = "sha256:" + "e".repeat(64);
  assert.throws(
    () => validateNodePreflight(f, sha),
    /NODE_SNAPSHOT_FINGERPRINT/,
  );
});
for (const [field, value, code] of [
  ["status", "UNKNOWN", "NODE_RECOVERY_NOT_PROVEN"],
  ["candidateSha", tree, "NODE_RECOVERY_CANDIDATE"],
  ["retainedBackup", false, "NODE_BACKUP_NOT_RETAINED"],
  ["wrapperAndPredeployCovered", false, "NODE_MUTATION_CLOSURE_REQUIRED"],
  ["codeRollbackDoesNotUndoData", false, "NODE_DATA_RECOVERY_REQUIRED"],
  ["backupRef", "", "NODE_RECOVERY_REFERENCE_REQUIRED"],
  ["restoreRef", "", "NODE_RECOVERY_REFERENCE_REQUIRED"],
  ["rollbackRef", "", "NODE_RECOVERY_REFERENCE_REQUIRED"],
  ["mutationInventoryRef", "", "NODE_RECOVERY_REFERENCE_REQUIRED"],
])
  test("preflight rejects missing or mismatched recovery " + field, () => {
    const f = preflightFixture();
    f.recovery[field] = value;
    assert.throws(() => validateNodePreflight(f, sha), new RegExp(code));
  });
for (const [name, mutate, code] of [
  [
    "deployment",
    (f) => {
      delete f.previousProviderDeploymentId;
    },
    "NODE_PREVIOUS_DEPLOY_REQUIRED",
  ],
  [
    "commit",
    (f) => {
      f.previousRuntime.releaseSha = "invalid";
    },
    "NODE_PREVIOUS_SHA_REQUIRED",
  ],
  [
    "runtime",
    (f) => {
      f.previousRuntime.identity = "";
    },
    "NODE_PREVIOUS_RUNTIME_REQUIRED",
  ],
])
  test("preflight requires previous " + name + " identity for rollback", () => {
    const f = preflightFixture();
    mutate(f);
    assert.throws(() => validateNodePreflight(f, sha), new RegExp(code));
  });
