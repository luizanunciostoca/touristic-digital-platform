#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const manifest = JSON.parse(
  readFileSync(new URL("./test-impact-manifest.json", import.meta.url), "utf8"),
);
const riskRank = new Map(
  manifest.riskOrder.map((risk, index) => [risk, index]),
);

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function normalizeGlob(value) {
  return value.replaceAll("\\", "/");
}

function matches(path, rule) {
  const normalized = normalizeGlob(rule);
  if (!normalized.includes("*"))
    return path === normalized || path.startsWith(normalized);
  const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped
    .replaceAll("**", "\0")
    .replaceAll("*", "[^/]*")
    .replaceAll("\0", ".*");
  return new RegExp(`^${pattern}$`, "u").test(path);
}

function domainMatches(file, config) {
  return (
    (!config.extensions ||
      config.extensions.some((extension) => file.endsWith(extension))) &&
    config.paths.some((rule) => matches(file, rule)) &&
    !(config.excludePaths ?? []).some((rule) => matches(file, rule))
  );
}

function changedFiles(base, head) {
  const output = git("diff", "--name-only", `${base}...${head}`);
  return output ? output.split("\n").filter(Boolean) : [];
}

function highestRisk(current, next) {
  return (riskRank.get(next) ?? 999) > (riskRank.get(current) ?? -1)
    ? next
    : current;
}

export function analyzeFiles(
  files,
  { base = null, head = "HEAD", releaseCandidate = false } = {},
) {
  const domains = [];
  const suites = new Set();
  let risk = "LOW";
  let needsBrowser = false;
  let needsVisual = false;
  let needsDatabase = false;
  let needsDependencyAudit = false;
  let needsFullSecurity = false;

  for (const [name, config] of Object.entries(manifest.domains)) {
    if (!files.some((file) => domainMatches(file, config))) {
      continue;
    }
    domains.push(name);
    risk = highestRisk(risk, config.risk);
    config.suites.forEach((suite) => suites.add(suite));
    needsBrowser ||= Boolean(config.needsBrowser);
    needsVisual ||= Boolean(config.needsVisual);
    needsDatabase ||= Boolean(config.needsDatabase);
    needsDependencyAudit ||= Boolean(config.needsDependencyAudit);
    needsFullSecurity ||= Boolean(config.needsFullSecurity);
  }

  const unknownFiles = files.filter(
    (file) =>
      !Object.values(manifest.domains).some((config) =>
        domainMatches(file, config),
      ),
  );
  const needsFullRegression =
    releaseCandidate ||
    unknownFiles.length > 0 ||
    risk === "CRITICAL" ||
    domains.length === 0;
  const nonRuntime =
    !needsFullRegression &&
    domains.length > 0 &&
    domains.every((name) => manifest.domains[name].nonRuntime === true);

  return {
    base,
    head,
    files,
    risk: needsFullRegression && unknownFiles.length > 0 ? "CRITICAL" : risk,
    domains,
    suites: [...suites].sort(),
    needsBrowser: needsFullRegression || needsBrowser,
    needsVisual: needsFullRegression || needsVisual,
    needsDatabase: needsFullRegression || needsDatabase,
    needsContainer: files.some((file) =>
      /(^|\/)(Dockerfile|docker-compose)/u.test(file),
    ),
    needsDependencyAudit: needsFullRegression || needsDependencyAudit,
    needsFullSecurity: needsFullRegression || needsFullSecurity,
    needsFullRegression,
    nonRuntime,
    unknownFiles,
    failClosedReason:
      unknownFiles.length > 0
        ? "unmapped changed paths"
        : domains.length === 0
          ? "no affected domain could be proven"
          : null,
  };
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const base = process.argv[2] || process.env.CI_IMPACT_BASE;
  const head = process.argv[3] || process.env.CI_IMPACT_HEAD || "HEAD";
  let report;
  try {
    if (!base) throw new Error("CI impact base ref is required");
    report = analyzeFiles(changedFiles(base, head), {
      base,
      head,
      releaseCandidate: process.env.CI_RELEASE_CANDIDATE === "true",
    });
  } catch (error) {
    report = {
      base: base ?? null,
      head,
      files: [],
      risk: "CRITICAL",
      domains: [],
      suites: [],
      needsBrowser: true,
      needsVisual: true,
      needsDatabase: true,
      needsContainer: true,
      needsDependencyAudit: true,
      needsFullSecurity: true,
      needsFullRegression: true,
      nonRuntime: false,
      unknownFiles: [],
      failClosedReason: error instanceof Error ? error.message : String(error),
    };
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("node:fs");
    for (const [key, value] of Object.entries({
      risk: report.risk,
      domains: JSON.stringify(report.domains),
      suites: JSON.stringify(report.suites),
      needs_browser: String(report.needsBrowser),
      needs_visual: String(report.needsVisual),
      needs_database: String(report.needsDatabase),
      needs_dependency_audit: String(report.needsDependencyAudit),
      needs_full_security: String(report.needsFullSecurity),
      needs_full_regression: String(report.needsFullRegression),
      non_runtime: String(report.nonRuntime),
    })) {
      appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
  }
}
