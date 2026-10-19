#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runAffectedProof } from "./affected-task-proof.mjs";

const SHA = /^[0-9a-f]{40}$/u;
const DEFAULT_TASKS = ["lint", "typecheck", "test", "build"];

export function buildAffectedTurboArgs(baseSha, tasks = DEFAULT_TASKS) {
  assert.match(baseSha ?? "", SHA, "AFFECTED_QUALITY_BASE_SHA_INVALID");
  assert.ok(
    Array.isArray(tasks) && tasks.length > 0,
    "AFFECTED_QUALITY_TASKS_REQUIRED",
  );
  for (const task of tasks) {
    assert.match(task, /^[a-z][a-z0-9:-]*$/u, "AFFECTED_QUALITY_TASK_INVALID");
  }
  return ["exec", "turbo", "run", ...tasks, "--filter=...[" + baseSha + "]"];
}

// Consumer selection is an internal runtime contract, never a CLI filter or
// caller-supplied report. Ownership of generic CI tooling alone grants no app.
const PERFORMANCE_CONSUMER = Object.freeze({
  name: "@touristic/morro-digital-platform",
  packageJson: "apps/morro-digital-platform/package.json",
});
const FAST_PROFILES = new Set([
  "BUGFIX_FAST",
  "UI_BUGFIX_FAST",
  "DB_BUGFIX_FAST",
  "CONTRACT_BUGFIX",
]);
function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

export function resolveExactAffectedSelection(
  baseSha,
  headSha = git("rev-parse", "HEAD"),
) {
  assert.match(baseSha ?? "", SHA, "AFFECTED_QUALITY_BASE_SHA_INVALID");
  assert.match(headSha ?? "", SHA, "AFFECTED_QUALITY_HEAD_SHA_INVALID");
  assert.equal(
    git("rev-parse", "HEAD"),
    headSha,
    "AFFECTED_QUALITY_HEAD_MISMATCH",
  );
  assert.equal(
    git("status", "--porcelain=v1", "--untracked-files=normal"),
    "",
    "AFFECTED_QUALITY_DIRTY_WORKTREE",
  );
  const remote = git(
    "ls-remote",
    "--exit-code",
    "origin",
    "refs/heads/main",
  ).split(/\s+/u);
  assert.equal(remote.length, 2, "AFFECTED_QUALITY_REMOTE_BASE_INVALID");
  assert.equal(
    remote[1],
    "refs/heads/main",
    "AFFECTED_QUALITY_REMOTE_BASE_INVALID",
  );
  if (
    process.env.GITHUB_EVENT_NAME === "push" &&
    process.env.GITHUB_REF === "refs/heads/main"
  ) {
    let event;
    try {
      event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    } catch {
      throw new Error("AFFECTED_QUALITY_PUSH_EVENT_INVALID");
    }
    assert.equal(
      event?.ref,
      "refs/heads/main",
      "AFFECTED_QUALITY_PUSH_REF_MISMATCH",
    );
    assert.equal(event?.before, baseSha, "AFFECTED_QUALITY_PUSH_BASE_MISMATCH");
    assert.equal(event?.after, headSha, "AFFECTED_QUALITY_PUSH_HEAD_MISMATCH");
    assert.equal(
      process.env.GITHUB_SHA,
      headSha,
      "AFFECTED_QUALITY_EVENT_SHA_MISMATCH",
    );
    assert.equal(remote[0], headSha, "AFFECTED_QUALITY_REMOTE_HEAD_STALE");
  } else {
    assert.equal(remote[0], baseSha, "AFFECTED_QUALITY_BASE_STALE");
  }
  execFileSync("git", ["merge-base", "--is-ancestor", baseSha, headSha], {
    stdio: "ignore",
  });
  const analyzer = fileURLToPath(
    new URL("./impact-analyzer.mjs", import.meta.url),
  );
  const report = JSON.parse(
    execFileSync(process.execPath, [analyzer, baseSha, headSha], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    }),
  );
  assert.equal(
    report.base,
    baseSha,
    "AFFECTED_QUALITY_REPORT_IDENTITY_INVALID",
  );
  assert.equal(
    report.head,
    headSha,
    "AFFECTED_QUALITY_REPORT_IDENTITY_INVALID",
  );
  assert.ok(
    !report.classificationBlocked &&
      !report.failClosedReason &&
      !report.nonRuntime &&
      !report.needsFullRegression &&
      FAST_PROFILES.has(report.qualityProfile),
    "AFFECTED_QUALITY_PROFILE_NOT_AFFECTED",
  );
  assert.ok(
    Array.isArray(report.domains) && Array.isArray(report.files),
    "AFFECTED_QUALITY_REPORT_INVALID",
  );
  const targets = new Set();
  if (report.domains.includes("performance-assets")) {
    const target = PERFORMANCE_CONSUMER;
    const entry = git("ls-tree", headSha, "--", target.packageJson);
    assert.match(
      entry,
      /^100(?:644|755) blob [a-f0-9]{40}\t/u,
      "AFFECTED_QUALITY_CONSUMER_PACKAGE_NOT_REGULAR",
    );
    assert.equal(
      entry.split("\t")[1],
      target.packageJson,
      "AFFECTED_QUALITY_CONSUMER_PACKAGE_NOT_REGULAR",
    );
    const packageJson = JSON.parse(
      git("show", `${headSha}:${target.packageJson}`),
    );
    assert.equal(
      packageJson.name,
      target.name,
      "AFFECTED_QUALITY_CONSUMER_NAME_MISMATCH",
    );
    for (const task of DEFAULT_TASKS)
      assert.ok(
        typeof packageJson.scripts?.[task] === "string" &&
          packageJson.scripts[task].trim(),
        "AFFECTED_QUALITY_CONSUMER_TASK_MISSING",
      );
    targets.add(target.name);
  }
  const args = buildAffectedTurboArgs(baseSha);
  for (const target of targets) args.push(`--filter=${target}`);
  return {
    baseSha,
    headSha,
    treeSha: git("rev-parse", `${headSha}^{tree}`),
    report,
    args,
    targets: [...targets],
  };
}

export function runAffectedQuality(baseSha) {
  const selection = resolveExactAffectedSelection(baseSha);
  const proof = runAffectedProof(
    { mode: "AFFECTED", affectedQualityArgs: selection.args },
    selection.report.domains,
    "native",
  );
  assert.equal(
    git("rev-parse", "HEAD"),
    selection.headSha,
    "AFFECTED_QUALITY_HEAD_CHANGED_AFTER_PROOF",
  );
  assert.equal(
    git("status", "--porcelain=v1", "--untracked-files=normal"),
    "",
    "AFFECTED_QUALITY_DIRTY_AFTER_PROOF",
  );
  const result = {
    baseSha: selection.baseSha,
    headSha: selection.headSha,
    treeSha: selection.treeSha,
    targets: selection.targets,
    ...proof,
    result: "PASS",
  };
  console.log(JSON.stringify(result));
  return result;
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    assert.ok(process.argv.length <= 3, "AFFECTED_QUALITY_ARGUMENTS_INVALID");
    const baseSha = process.argv[2] || process.env.CI_IMPACT_BASE;
    runAffectedQuality(baseSha);
  } catch (error) {
    console.error(
      String(error?.message ?? error).match(/[A-Z][A-Z0-9_:.-]{2,160}/u)?.[0] ??
        "AFFECTED_QUALITY_FAILED",
    );
    process.exitCode = 2;
  }
}
