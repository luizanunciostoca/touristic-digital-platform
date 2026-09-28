import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeFiles } from "./impact-analyzer.mjs";

export const suiteManifest = JSON.parse(
  readFileSync(new URL("./scheduled-suites.json", import.meta.url), "utf8"),
);

const impactManifest = JSON.parse(
  readFileSync(new URL("./test-impact-manifest.json", import.meta.url), "utf8"),
);
const knownReportSuites = new Set([
  ...suiteManifest.suites.map((suite) => suite.workflow),
  ...Object.values(impactManifest.domains).flatMap((domain) => domain.suites),
]);

export function matchesPath(file, pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const glob = escaped
    .replaceAll("**/", "\0")
    .replaceAll("**", "\u0001")
    .replaceAll("*", "[^/]*")
    .replaceAll("\0", "(?:.*/)?")
    .replaceAll("\u0001", ".*");
  return new RegExp(`^${glob}$`, "u").test(file);
}

export function selectSuites(report, manifest = suiteManifest) {
  const all = manifest.suites.map((suite) => suite.workflow);
  if (
    !report ||
    !Array.isArray(report.files) ||
    !Array.isArray(report.suites) ||
    !Array.isArray(report.domains) ||
    !report.domains.every(
      (domain) =>
        typeof domain === "string" &&
        Object.hasOwn(impactManifest.domains, domain),
    ) ||
    !Array.isArray(report.unknownFiles) ||
    typeof report.needsFullRegression !== "boolean" ||
    typeof report.nonRuntime !== "boolean" ||
    !report.files.every((file) => typeof file === "string") ||
    !report.suites.every(
      (suite) => typeof suite === "string" && knownReportSuites.has(suite),
    ) ||
    !report.unknownFiles.every((file) => typeof file === "string") ||
    report.needsFullRegression ||
    report.unknownFiles.length > 0 ||
    report.failClosedReason ||
    report.files.length === 0
  )
    return all;
  // Evaluate each newly managed runtime file independently: a covered file
  // in the same PR must never mask a second file with unknown suite coverage.
  for (const file of report.files) {
    const fileImpact = analyzeFiles([file]);
    if (fileImpact.needsFullRegression || fileImpact.unknownFiles.length > 0)
      return all;
    const requiresCoverage = fileImpact.domains.some(
      (domain) => impactManifest.domains[domain]?.requiresScheduledSuite,
    );
    if (
      requiresCoverage &&
      !manifest.suites.some(
        (suite) =>
          fileImpact.suites.includes(suite.workflow) ||
          suite.paths.some((pattern) => matchesPath(file, pattern)),
      )
    )
      return all;
  }
  return manifest.suites
    .filter(
      (suite) =>
        report.suites.includes(suite.workflow) ||
        suite.paths.length === 0 ||
        report.files.some((file) =>
          suite.paths.some((pattern) => matchesPath(file, pattern)),
        ),
    )
    .map((suite) => suite.workflow);
}

export function verifySuiteResults(selected, needs, manifest = suiteManifest) {
  if (!Array.isArray(selected) || selected.length !== new Set(selected).size)
    throw new Error("Invalid or duplicate selected suite identity");
  const known = new Set(manifest.suites.map((suite) => suite.workflow));
  if (selected.some((suite) => !known.has(suite)))
    throw new Error("Unknown selected suite identity");
  for (const required of ["impact", "core-quality"]) {
    if (needs?.[required]?.result !== "success")
      throw new Error(`Required ${required} did not succeed`);
  }
  for (const suite of manifest.suites) {
    const expected = selected.includes(suite.workflow) ? "success" : "skipped";
    const actual = needs?.[suite.jobId]?.result;
    if (actual !== expected)
      throw new Error(
        `${suite.workflow}: expected ${expected}, got ${actual ?? "missing"}`,
      );
  }
  return {
    selected: selected.length,
    total: manifest.suites.length,
    result: "PASS",
  };
}

export function buildQualityProof(selected, needs, sourceSha) {
  if (typeof sourceSha !== "string" || !/^[0-9a-f]{40}$/.test(sourceSha))
    throw new Error("Quality proof requires an exact source SHA");
  verifySuiteResults(selected, needs);
  return { schemaVersion: 1, sourceSha, selected, needs, result: "PASS" };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv[2] === "--verify") {
    const selected = JSON.parse(process.env.CI_SELECTED_SUITES || "null");
    const needs = JSON.parse(process.env.CI_JOB_RESULTS || "null");
    const proof = buildQualityProof(selected, needs, process.env.GITHUB_SHA);
    writeFileSync(
      "ci-quality-proof.json",
      JSON.stringify(proof, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        result: proof.result,
        sourceSha: proof.sourceSha,
        selected: selected.length,
      }),
    );
  } else {
    const report = JSON.parse(
      readFileSync(process.argv[2] || "ci-impact-report.json", "utf8"),
    );
    const selected = selectSuites(report);
    const evidence = {
      sourceHead: report.head,
      failClosed:
        report.needsFullRegression ||
        selected.length === suiteManifest.suites.length,
      selected,
    };
    console.log(JSON.stringify(evidence, null, 2));
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `scheduled_suites=${JSON.stringify(selected)}\n`,
      );
  }
}
