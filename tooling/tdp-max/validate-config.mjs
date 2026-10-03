import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONFIG_ROOT = ".github/morro-control/tdp-max";
const CONTROL_IDS = [
  "stale-head",
  "false-ci-green",
  "wrong-runtime-target",
  "ai-as-authority",
  "termux-transport-misclassification",
  "stale-dr-proof",
];

function requireValue(condition, code) {
  if (!condition) throw new Error(`TDP_MAX_CONFIG_INVALID:${code}`);
}

async function readJson(root, path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

export async function loadTdpMaxDocuments(root = process.cwd()) {
  const [
    authorityMap,
    antiRecurrence,
    bootstrapSchema,
    evidenceSchema,
    finalGate,
    exampleEvidence,
    packageJson,
    ciGovernanceSource,
  ] = await Promise.all([
    readJson(root, `${CONFIG_ROOT}/authority-map.json`),
    readJson(root, `${CONFIG_ROOT}/anti-recurrence.json`),
    readJson(root, `${CONFIG_ROOT}/bootstrap.schema.json`),
    readJson(root, `${CONFIG_ROOT}/evidence.schema.json`),
    readJson(root, `${CONFIG_ROOT}/final-gate.json`),
    readJson(root, `${CONFIG_ROOT}/examples/evidence-manifest.example.json`),
    readJson(root, "package.json"),
    readFile(resolve(root, "tooling/quality/check-ci-governance.mjs"), "utf8"),
  ]);
  return {
    authorityMap,
    antiRecurrence,
    bootstrapSchema,
    evidenceSchema,
    finalGate,
    exampleEvidence,
    packageJson,
    ciGovernanceSource,
  };
}

function hasAll(values, required) {
  return required.every((value) => values.includes(value));
}

function control(documents, id) {
  return documents.antiRecurrence.controls.find((item) => item.id === id);
}

export function validateTdpMaxDocuments(documents) {
  const {
    authorityMap,
    antiRecurrence,
    bootstrapSchema,
    evidenceSchema,
    finalGate,
    exampleEvidence,
    packageJson,
    ciGovernanceSource,
  } = documents;

  requireValue(authorityMap.schemaVersion === 1, "AUTHORITY_SCHEMA");
  requireValue(
    authorityMap.controlArchitecture === "CONTROL_PLANE_V3_2" &&
      authorityMap.projectionRole === "GUARD_ONLY",
    "CONTROL_ARCHITECTURE",
  );
  requireValue(
    authorityMap.canonicalFiles?.lifecycle === ".morro/fabric.json" &&
      authorityMap.canonicalFiles?.ownership === ".morro/ownership.json" &&
      authorityMap.canonicalFiles?.riskProof === ".morro/risk-policy.json",
    "CANONICAL_FILES",
  );
  requireValue(
    authorityMap.termuxContract?.repository ===
      "luizanunciostoca/morro-termux-control" &&
      authorityMap.termuxContract?.path === "CHATGPT-START-HERE.md" &&
      authorityMap.termuxContract?.liveReadRequired === true,
    "TERMUX_CONTRACT",
  );
  requireValue(
    authorityMap.automatedReviewMustRemainAdvisory === true,
    "AUTOMATED_REVIEW_ROLE",
  );

  requireValue(antiRecurrence.schemaVersion === 1, "CONTROL_SCHEMA");
  requireValue(
    antiRecurrence.controls.length === CONTROL_IDS.length &&
      CONTROL_IDS.every((id) => control(documents, id)?.enabled === true),
    "CONTROL_SET",
  );

  requireValue(
    bootstrapSchema.$schema ===
      "https://json-schema.org/draft/2020-12/schema" &&
      bootstrapSchema.additionalProperties === false &&
      hasAll(bootstrapSchema.required ?? [], [
        "claimId",
        "observedMainSha",
        "workspace",
        "authorities",
        "transport",
      ]) &&
      bootstrapSchema.properties?.workspace?.properties?.isolated?.const ===
        true,
    "BOOTSTRAP_SCHEMA",
  );

  requireValue(
    evidenceSchema.$schema ===
      "https://json-schema.org/draft/2020-12/schema" &&
      evidenceSchema.additionalProperties === false &&
      hasAll(evidenceSchema.required ?? [], [
        "baseSha",
        "candidateSha",
        "validatorSha",
        "exactHead",
        "environment",
        "checks",
      ]) &&
      evidenceSchema.properties?.exactHead?.const === true &&
      !evidenceSchema.properties?.checks?.items?.properties?.status?.enum?.includes(
        "SKIPPED",
      ),
    "EVIDENCE_SCHEMA",
  );

  requireValue(exampleEvidence.exactHead === true, "EXAMPLE_EXACT_HEAD");
  requireValue(
    exampleEvidence.checks?.every(
      (item) => item.status === "PASS" || item.status === "FAIL",
    ),
    "EXAMPLE_CHECK_STATUS",
  );

  requireValue(
    finalGate.requires?.exactHeadIntegration === true &&
      finalGate.requires?.semanticProof === true &&
      finalGate.requires?.independentProof === true &&
      finalGate.requires?.mergedReadback === true &&
      finalGate.requires?.lifecycleReconciliation === true &&
      finalGate.productionPublication === false,
    "FINAL_GATE",
  );

  requireValue(
    typeof packageJson.scripts?.["tdp-max:check"] === "string",
    "PACKAGE_SCRIPT",
  );
  requireValue(
    ciGovernanceSource.includes(
      'import { validateTdpMaxConfig } from "../tdp-max/validate-config.mjs";',
    ) && ciGovernanceSource.includes("await validateTdpMaxConfig(root);"),
    "CI_GOVERNANCE_INTEGRATION",
  );

  return {
    schemaVersion: 1,
    kind: "TDP_MAX_CONFIG_PROOF",
    status: "pass",
    controls: [...CONTROL_IDS].sort(),
  };
}

export async function validateTdpMaxConfig(root = process.cwd()) {
  return validateTdpMaxDocuments(await loadTdpMaxDocuments(root));
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  try {
    console.log(JSON.stringify(await validateTdpMaxConfig()));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
