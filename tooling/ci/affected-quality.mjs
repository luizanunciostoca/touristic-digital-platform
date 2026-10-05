#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

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

export function runAffectedQuality(baseSha, tasks = DEFAULT_TASKS) {
  const args = buildAffectedTurboArgs(baseSha, tasks);
  execFileSync("pnpm", args, { stdio: "inherit" });
  return { baseSha, tasks: [...tasks], result: "PASS" };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const baseSha = process.argv[2] || process.env.CI_IMPACT_BASE;
  runAffectedQuality(baseSha);
}
