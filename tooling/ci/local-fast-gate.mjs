#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAffectedTurboArgs } from "./affected-quality.mjs";

const SHA = /^[0-9a-f]{40}$/u;
const FAST_PROFILES = new Set([
  "BUGFIX_FAST",
  "UI_BUGFIX_FAST",
  "DB_BUGFIX_FAST",
  "CONTRACT_BUGFIX",
]);

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function changedFiles(baseSha, head = "HEAD") {
  const output = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "--diff-filter=ACMRTUXB",
      "-z",
      baseSha + "..." + head,
    ],
    { encoding: "utf8" },
  );
  return output.split("\0").filter(Boolean);
}

function analyzeExactHead(baseSha, head = "HEAD") {
  const analyzer = fileURLToPath(
    new URL("./impact-analyzer.mjs", import.meta.url),
  );
  return JSON.parse(
    execFileSync(process.execPath, [analyzer, baseSha, head], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    }),
  );
}

export function fastGatePlan(report, baseSha) {
  assert.ok(report && typeof report === "object", "FAST_GATE_REPORT_REQUIRED");
  assert.match(baseSha ?? "", SHA, "FAST_GATE_BASE_SHA_INVALID");

  if (
    report.classificationBlocked ||
    report.qualityProfile === "CLASSIFICATION_BLOCK" ||
    report.failClosedReason
  ) {
    return {
      mode: "CLASSIFICATION_BLOCK",
      qualityProfile: "CLASSIFICATION_BLOCK",
      baseSha,
      needsBrowser: false,
      needsDatabase: false,
      affectedQualityArgs: null,
      reason: report.failClosedReason ?? "classification blocked",
    };
  }
  if (report.needsFullRegression || report.qualityProfile === "DEEP_PROOF") {
    return {
      mode: "DEEP_PROOF",
      qualityProfile: report.qualityProfile,
      baseSha,
      needsBrowser: report.needsBrowser,
      needsDatabase: report.needsDatabase,
      affectedQualityArgs: null,
      reason: null,
    };
  }
  if (report.nonRuntime || report.qualityProfile === "NON_RUNTIME") {
    return {
      mode: "NON_RUNTIME",
      qualityProfile: report.qualityProfile,
      baseSha,
      needsBrowser: false,
      needsDatabase: false,
      affectedQualityArgs: null,
      reason: null,
    };
  }
  assert.ok(
    FAST_PROFILES.has(report.qualityProfile),
    "FAST_GATE_PROFILE_UNSUPPORTED",
  );
  return {
    mode: "AFFECTED",
    qualityProfile: report.qualityProfile,
    baseSha,
    needsBrowser: Boolean(report.needsBrowser),
    needsDatabase: Boolean(report.needsDatabase),
    affectedQualityArgs: buildAffectedTurboArgs(baseSha),
    reason: null,
  };
}

function execute(command, args) {
  console.log([command, ...args].join(" "));
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("FAST_GATE_COMMAND_FAILED");
}

function affectedFormat(files) {
  const existing = files.filter((file) => existsSync(file));
  if (existing.length > 0) {
    execute("pnpm", [
      "exec",
      "prettier",
      "--check",
      "--ignore-unknown",
      ...existing,
    ]);
  }
}

function nonRuntimeTests(domains) {
  const patterns = new Set();
  if (
    domains.some((domain) =>
      ["ci-tooling", "cicd", "control-plane"].includes(domain),
    )
  ) {
    patterns.add("tooling/ci/*.test.mjs");
    patterns.add("tooling/control-state/*.test.mjs");
  }
  if (
    domains.some((domain) => ["governance", "control-plane"].includes(domain))
  ) {
    patterns.add("tooling/fabric/*.test.mjs");
    patterns.add(".github/agents/*.test.mjs");
    patterns.add(".github/hooks/*.test.mjs");
  }
  if (patterns.size === 0) return [];
  const output = execFileSync("git", ["ls-files", "-z", "--", ...patterns], {
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean);
}

function resolveExactBase(ref) {
  const baseSha = git("rev-parse", ref + "^{commit}");
  assert.match(baseSha, SHA, "FAST_GATE_BASE_RESOLUTION_FAILED");
  execFileSync("git", ["merge-base", "--is-ancestor", baseSha, "HEAD"], {
    stdio: "ignore",
  });
  return baseSha;
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const baseIndex = process.argv.indexOf("--base");
    const baseRef =
      baseIndex >= 0 ? process.argv[baseIndex + 1] : "origin/main";
    assert.ok(baseRef, "FAST_GATE_BASE_REQUIRED");
    assert.equal(
      git("status", "--porcelain=v1", "--untracked-files=normal"),
      "",
      "FAST_GATE_EXACT_HEAD_REQUIRES_CLEAN_WORKTREE",
    );
    const baseSha = resolveExactBase(baseRef);
    const headSha = git("rev-parse", "HEAD");
    const files = changedFiles(baseSha, headSha);
    if (files.length === 0) {
      console.log(
        JSON.stringify({ baseSha, headSha, files: [], mode: "NO_CHANGES" }),
      );
      process.exit(0);
    }
    const report = analyzeExactHead(baseSha, headSha);
    const plan = fastGatePlan(report, baseSha);
    console.log(
      JSON.stringify(
        {
          baseSha,
          headSha,
          files,
          domains: report.domains,
          risk: report.risk,
          ...plan,
        },
        null,
        2,
      ),
    );
    if (plan.mode === "CLASSIFICATION_BLOCK") {
      throw new Error("FAST_GATE_CLASSIFICATION_BLOCKED");
    }
    if (process.argv.includes("--plan")) process.exit(0);

    affectedFormat(files);
    execute("pnpm", ["secret-patterns:check"]);

    if (plan.mode === "DEEP_PROOF") {
      execute("pnpm", ["check"]);
    } else if (plan.mode === "NON_RUNTIME") {
      const tests = nonRuntimeTests(report.domains);
      if (tests.length > 0) execute(process.execPath, ["--test", ...tests]);
    } else {
      execute("pnpm", plan.affectedQualityArgs);
    }
  } catch (error) {
    const code =
      String(error?.message ?? error).match(/[A-Z][A-Z0-9_:.-]{2,160}/u)?.[0] ??
      "FAST_GATE_FAILED";
    console.error(code);
    process.exitCode = 2;
  }
}
