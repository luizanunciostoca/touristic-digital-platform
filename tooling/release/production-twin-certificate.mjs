import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const RUN_PATTERN = /^[0-9]+$/u;

function text(value) {
  return String(value ?? "").trim();
}

function exactIdentity(expected) {
  const identity = Object.freeze({
    expectedSha: text(expected.expectedSha),
    treeSha: text(expected.treeSha),
    imageRepository: text(expected.imageRepository),
    imageDigest: text(expected.imageDigest),
    imageRunId: text(expected.imageRunId),
    candidateArtifactDigest: text(expected.candidateArtifactDigest),
    lockfileDigest: text(expected.lockfileDigest),
  });

  if (!SHA_PATTERN.test(identity.expectedSha)) {
    throw new Error("TWIN_EXPECTED_SHA_INVALID");
  }
  if (!SHA_PATTERN.test(identity.treeSha)) {
    throw new Error("TWIN_TREE_SHA_INVALID");
  }
  if (!identity.imageRepository) {
    throw new Error("TWIN_IMAGE_REPOSITORY_REQUIRED");
  }
  if (!DIGEST_PATTERN.test(identity.imageDigest)) {
    throw new Error("TWIN_IMAGE_DIGEST_INVALID");
  }
  if (!RUN_PATTERN.test(identity.imageRunId)) {
    throw new Error("TWIN_IMAGE_RUN_ID_INVALID");
  }
  if (!DIGEST_PATTERN.test(identity.candidateArtifactDigest)) {
    throw new Error("TWIN_CANDIDATE_ARTIFACT_DIGEST_INVALID");
  }
  if (!DIGEST_PATTERN.test(identity.lockfileDigest)) {
    throw new Error("TWIN_LOCKFILE_DIGEST_INVALID");
  }
  return identity;
}

export function productionTwinCertificateMatches(evidence, expected) {
  let identity;
  try {
    identity = exactIdentity(expected);
  } catch {
    return false;
  }

  return Boolean(
    evidence?.contract === "MORRO-PRODUCTION-TWIN-CERTIFICATION" &&
    evidence?.contractVersion === 1 &&
    evidence?.status === "pass" &&
    evidence?.result === "PRODUCTION_TWIN_CERTIFICATION = PASS" &&
    evidence?.expectedSha === identity.expectedSha &&
    evidence?.treeSha === identity.treeSha &&
    evidence?.candidate?.artifactDigest === identity.candidateArtifactDigest &&
    evidence?.candidate?.lockfileDigest === identity.lockfileDigest &&
    evidence?.image?.repository === identity.imageRepository &&
    evidence?.image?.digest === identity.imageDigest &&
    text(evidence?.image?.runId) === identity.imageRunId &&
    evidence?.image?.immutable === true &&
    evidence?.productionSample?.schemaCount === 13 &&
    evidence?.productionSample?.totalTables === 91 &&
    evidence?.twin?.runtimePredeploy?.status === "pass" &&
    evidence?.twin?.runtimePredeploy?.domainCount === 13 &&
    evidence?.twin?.runtimePredeploy?.totalTables === 91 &&
    evidence?.twin?.paymentsPredeploy?.status === "pass" &&
    evidence?.twin?.paymentsPredeploy?.checkoutMode === "test" &&
    evidence?.twin?.noEgress === true &&
    evidence?.twin?.runtimeProbe === "docker-exec-loopback" &&
    evidence?.twin?.syntheticReleaseIdentity === true &&
    evidence?.persistence?.write === "stored" &&
    evidence?.persistence?.readback === "replayed" &&
    evidence?.persistence?.reloadReadback === "replayed" &&
    evidence?.persistence?.newSessionReadback === "replayed" &&
    evidence?.persistence?.redeployReadback === "replayed" &&
    evidence?.persistence?.survivedRedeploy === true &&
    evidence?.safety?.productionMutation === false &&
    evidence?.safety?.renderMutation === false &&
    evidence?.safety?.railwayTouched === false &&
    evidence?.safety?.productionCredentialsConfirmed === false &&
    evidence?.safety?.subscriptionsEnabled === false &&
    evidence?.safety?.plaintextUploaded === false,
  );
}

export function selectReusableProductionTwinCertificate(candidates, expected) {
  for (const candidate of candidates ?? []) {
    if (
      productionTwinCertificateMatches(candidate?.evidence, expected) &&
      RUN_PATTERN.test(text(candidate?.runId))
    ) {
      return Object.freeze({
        runId: text(candidate.runId),
        evidence: candidate.evidence,
      });
    }
  }
  return null;
}

export function productionTwinDispatchRequired(candidates, expected) {
  return selectReusableProductionTwinCertificate(candidates, expected) === null;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main(argv = process.argv.slice(2)) {
  const [command, evidencePath, expectedPath] = argv;
  if (command !== "verify" || !evidencePath || !expectedPath) {
    throw new Error("USAGE: verify <evidence.json> <expected.json>");
  }
  const evidence = readJson(evidencePath);
  const expected = readJson(expectedPath);
  if (!productionTwinCertificateMatches(evidence, expected)) {
    throw new Error("PRODUCTION_TWIN_CERTIFICATE_IDENTITY_MISMATCH");
  }
  process.stdout.write("PRODUCTION_TWIN_CERTIFICATE = PASS\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch {
    process.stderr.write("PRODUCTION_TWIN_CERTIFICATE_FAILED\n");
    process.exitCode = 1;
  }
}
