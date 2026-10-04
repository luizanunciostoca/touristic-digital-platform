#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const manifest = JSON.parse(
  readFileSync(new URL("./test-impact-manifest.json", import.meta.url), "utf8"),
);
const riskRank = new Map(
  manifest.riskOrder.map((risk, index) => [risk, index]),
);

const PACKAGE_DEPENDENCY_KEYS = new Set([
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "overrides",
  "workspaces",
  "pnpm",
]);
const PACKAGE_ENVIRONMENT_KEYS = new Set([
  "engines",
  "packageManager",
  "os",
  "cpu",
]);
const PACKAGE_METADATA_KEYS = new Set([
  "name",
  "version",
  "private",
  "description",
  "license",
  "repository",
  "keywords",
  "author",
  "homepage",
]);
const PACKAGE_CHANGE_KINDS = new Set([
  "dependencies",
  "environment",
  "scripts",
  "metadata",
  "unknown",
]);

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

function isPackageJson(file) {
  return file === "package.json" || file.endsWith("/package.json");
}

function jsonAt(ref, file) {
  return JSON.parse(git("show", ref + ":" + file));
}

export function classifyPackageJsonChange(before, after) {
  if (
    !before ||
    !after ||
    typeof before !== "object" ||
    typeof after !== "object" ||
    Array.isArray(before) ||
    Array.isArray(after)
  ) {
    return "unknown";
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed = [...keys].filter(
    (key) => !isDeepStrictEqual(before[key], after[key]),
  );
  if (changed.length === 0) return "metadata";
  if (changed.some((key) => PACKAGE_DEPENDENCY_KEYS.has(key)))
    return "dependencies";
  if (changed.some((key) => PACKAGE_ENVIRONMENT_KEYS.has(key)))
    return "environment";
  if (
    changed.includes("scripts") &&
    changed.every((key) => key === "scripts" || PACKAGE_METADATA_KEYS.has(key))
  ) {
    return "scripts";
  }
  if (changed.every((key) => PACKAGE_METADATA_KEYS.has(key))) return "metadata";
  return "unknown";
}

function collectPackageJsonChanges(files, base, head) {
  const result = {};
  for (const file of files.filter(isPackageJson)) {
    try {
      result[file] = classifyPackageJsonChange(
        jsonAt(base, file),
        jsonAt(head, file),
      );
    } catch {
      result[file] = "unknown";
    }
  }
  return result;
}

export function isSerializedControlTransition(files) {
  const required = new Set([
    ".github/morro-control/claims.json",
    ".github/morro-control/events.ndjson",
  ]);
  const manifests = files.filter((file) =>
    /^\.morro\/changesets\/MD-[A-Z0-9-]+\.json$/u.test(file),
  );
  return (
    files.length === 3 &&
    manifests.length === 1 &&
    [...required].every((file) => files.includes(file))
  );
}

function highestRisk(current, next) {
  return (riskRank.get(next) ?? 999) > (riskRank.get(current) ?? -1)
    ? next
    : current;
}

export function analyzeFiles(
  files,
  {
    base = null,
    head = "HEAD",
    releaseCandidate = false,
    packageJsonChanges = {},
  } = {},
) {
  const domains = [];
  const suites = new Set();
  const serializedControlTransitionOnly = isSerializedControlTransition(files);
  let risk = "LOW";
  let needsBrowser = false;
  let needsVisual = false;
  let needsDatabase = false;
  let needsDependencyAudit = false;
  let needsFullSecurity = false;

  const addDomain = (name) => {
    if (domains.includes(name)) return;
    const config = manifest.domains[name];
    if (!config) throw new Error("Unknown impact domain: " + name);
    domains.push(name);
    risk = highestRisk(risk, config.risk);
    config.suites.forEach((suite) => suites.add(suite));
    needsBrowser ||= Boolean(config.needsBrowser);
    needsVisual ||= Boolean(config.needsVisual);
    needsDatabase ||= Boolean(config.needsDatabase);
    needsDependencyAudit ||= Boolean(config.needsDependencyAudit);
    needsFullSecurity ||= Boolean(config.needsFullSecurity);
  };

  for (const [name, config] of Object.entries(manifest.domains)) {
    const affected = files.some((file) => {
      if (name === "dependencies" && isPackageJson(file)) {
        const semantic = packageJsonChanges[file];
        if (
          semantic &&
          PACKAGE_CHANGE_KINDS.has(semantic) &&
          !["dependencies", "unknown"].includes(semantic)
        ) {
          return false;
        }
      }
      return domainMatches(file, config);
    });
    if (affected) addDomain(name);
  }

  for (const [file, semantic] of Object.entries(packageJsonChanges)) {
    if (!files.includes(file) || !isPackageJson(file)) continue;
    if (!PACKAGE_CHANGE_KINDS.has(semantic)) continue;
    if (semantic === "scripts") addDomain("package-scripts");
    else if (semantic === "environment") addDomain("package-environment");
    else if (semantic === "metadata") addDomain("package-metadata");
  }

  const unknownFiles = files.filter((file) => {
    if (isPackageJson(file) && packageJsonChanges[file]) return false;
    return !Object.values(manifest.domains).some((config) =>
      domainMatches(file, config),
    );
  });
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
    serializedControlTransitionOnly,
    packageJsonChanges,
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
    const files = changedFiles(base, head);
    report = analyzeFiles(files, {
      base,
      head,
      releaseCandidate: process.env.CI_RELEASE_CANDIDATE === "true",
      packageJsonChanges: collectPackageJsonChanges(files, base, head),
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
      serializedControlTransitionOnly: false,
      packageJsonChanges: {},
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
      serialized_control_transition_only: String(
        report.serializedControlTransitionOnly,
      ),
    })) {
      appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
  }
}
