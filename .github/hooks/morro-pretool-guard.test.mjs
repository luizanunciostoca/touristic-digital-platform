import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  classifyBashCommand,
  evaluatePreToolUse,
  extractPatchPaths,
  extractToolPaths,
  normalizeRepoPath,
} from "./morro-pretool-guard.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("hook configuration is versioned preToolUse command enforcement", () => {
  const config = JSON.parse(
    readFileSync(resolve(here, "morro-claim-guard.json"), "utf8"),
  );

  assert.equal(config.version, 1);
  assert.equal(config.disableAllHooks, false);
  assert.ok(Array.isArray(config.hooks?.preToolUse));
  assert.equal(config.hooks.preToolUse.length, 1);
  assert.equal(config.hooks.preToolUse[0].type, "command");
  assert.match(config.hooks.preToolUse[0].matcher, /create/u);
  assert.match(config.hooks.preToolUse[0].matcher, /bash/u);
  assert.equal(
    config.hooks.preToolUse[0].bash,
    "node .github/hooks/morro-pretool-guard.mjs",
  );
});

test("extract edit target paths from structured tool args", () => {
  assert.deepEqual(
    extractToolPaths({
      file_path: "tooling/fabric/claim-guard.mjs",
      replacement: "content",
    }),
    ["tooling/fabric/claim-guard.mjs"],
  );
});

test("extract patch targets from add and update patch formats", () => {
  const patch = `*** Begin Patch
*** Update File: tooling/fabric/claim-guard.mjs
*** Add File: .github/hooks/example.json
*** End Patch
`;
  assert.deepEqual(extractPatchPaths(patch).sort(), [
    ".github/hooks/example.json",
    "tooling/fabric/claim-guard.mjs",
  ]);
});

test("normalize repository-relative path and reject traversal", () => {
  assert.equal(
    normalizeRepoPath(
      "/workspace/repo",
      "/workspace/repo",
      "tooling/fabric/claim-guard.mjs",
    ),
    "tooling/fabric/claim-guard.mjs",
  );

  assert.throws(
    () =>
      normalizeRepoPath("/workspace/repo", "/workspace/repo", "../outside.txt"),
    /HOOK_PATH_OUTSIDE_REPOSITORY/u,
  );
});

test("force push and direct-main push fail closed", () => {
  assert.equal(
    classifyBashCommand("git push --force origin feature", "feature"),
    "FORCE_PUSH_FORBIDDEN",
  );
  assert.equal(
    classifyBashCommand("git push origin main", "feature"),
    "DIRECT_MAIN_PUSH_FORBIDDEN",
  );
  assert.equal(
    classifyBashCommand("git push origin feature", "main"),
    "DIRECT_MAIN_PUSH_FORBIDDEN",
  );
});

test("merge and destructive shell write bypasses are denied", () => {
  assert.equal(
    classifyBashCommand("gh pr merge 123 --merge", "feature"),
    "MERGE_AUTHORITY_REQUIRED",
  );
  assert.equal(
    classifyBashCommand("git merge origin/main", "feature"),
    "INTEGRATOR_AUTHORITY_REQUIRED",
  );
  assert.equal(
    classifyBashCommand("cat input > tooling/fabric/file.mjs", "feature"),
    "SHELL_WRITE_REQUIRES_STRUCTURED_EDIT_TOOL",
  );
});

test("destructive database and direct production deployment are denied", () => {
  assert.equal(
    classifyBashCommand("mysql -e 'DROP DATABASE prod'", "feature"),
    "DESTRUCTIVE_DATABASE_ACTION_REQUIRES_OWNER_APPROVAL",
  );
  assert.equal(
    classifyBashCommand(
      "curl -X POST https://api.render.com/v1/services/srv-x/deploy",
      "feature",
    ),
    "PRODUCTION_DEPLOY_REQUIRES_RELEASE_AUTHORITY",
  );
});

test("read-only shell commands are allowed by classifier", () => {
  assert.equal(classifyBashCommand("pnpm test", "feature"), null);
  assert.equal(classifyBashCommand("git status --short", "feature"), null);
});

test("structured edit on main is denied before claim validation", () => {
  const result = evaluatePreToolUse(
    {
      cwd: "/workspace/repo",
      toolName: "edit",
      toolArgs: { path: "AGENTS.md" },
    },
    {
      root: "/workspace/repo",
      branch: "main",
      validatePaths: () => {
        throw new Error("validator must not run");
      },
    },
  );

  assert.deepEqual(result, {
    permissionDecision: "deny",
    permissionDecisionReason: "DIRECT_MAIN_WRITE_FORBIDDEN",
  });
});

test("structured edit on claimed branch validates intended path", () => {
  const seen = [];
  const result = evaluatePreToolUse(
    {
      cwd: "/workspace/repo",
      toolName: "edit",
      toolArgs: { path: "tooling/fabric/claim-guard.mjs" },
    },
    {
      root: "/workspace/repo",
      branch: "infra/control-plane-v3.2-stage-c-safety-20260927",
      validatePaths: (paths) => seen.push(...paths),
    },
  );

  assert.deepEqual(result, { permissionDecision: "allow" });
  assert.deepEqual(seen, ["tooling/fabric/claim-guard.mjs"]);
});

test("unresolved write target fails closed", () => {
  const result = evaluatePreToolUse(
    {
      cwd: "/workspace/repo",
      toolName: "edit",
      toolArgs: { replacement: "content only" },
    },
    {
      root: "/workspace/repo",
      branch: "feature",
      validatePaths: () => {},
    },
  );

  assert.deepEqual(result, {
    permissionDecision: "deny",
    permissionDecisionReason: "WRITE_TARGET_PATH_UNRESOLVED",
  });
});

test("commit and push revalidate current worktree claim", () => {
  const seen = [];
  const result = evaluatePreToolUse(
    {
      cwd: "/workspace/repo",
      toolName: "bash",
      toolArgs: { command: "git commit -m 'safe change'" },
    },
    {
      root: "/workspace/repo",
      branch: "feature",
      changedFiles: ["tooling/fabric/claim-guard.mjs"],
      validatePaths: (paths) => seen.push(...paths),
    },
  );

  assert.deepEqual(result, { permissionDecision: "allow" });
  assert.deepEqual(seen, ["tooling/fabric/claim-guard.mjs"]);
});
