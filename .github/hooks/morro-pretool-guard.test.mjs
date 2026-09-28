import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  authorityForManifestState,
  classifyBashCommand,
  evaluatePreToolUse,
  extractPatchPaths,
  extractToolPaths,
  normalizeRepoPath,
  parseGitInvocations,
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

test("normalize repository-relative path and reject traversal or symlink escape", () => {
  const parent = mkdtempSync(resolve(tmpdir(), "morro-pretool-path-"));
  const root = resolve(parent, "repo");
  const owned = resolve(root, "tooling/fabric/claim-guard.mjs");
  const outside = resolve(parent, "outside");

  mkdirSync(dirname(owned), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(owned, "fixture\n");
  symlinkSync(outside, resolve(root, "escape"), "dir");
  symlinkSync(
    resolve(outside, "missing-dir"),
    resolve(root, "dangling"),
    "dir",
  );

  try {
    assert.equal(
      normalizeRepoPath(root, root, "tooling/fabric/claim-guard.mjs"),
      "tooling/fabric/claim-guard.mjs",
    );
    assert.throws(
      () => normalizeRepoPath(root, root, "../outside.txt"),
      /HOOK_PATH_OUTSIDE_REPOSITORY/u,
    );
    assert.throws(
      () => normalizeRepoPath(root, root, "escape/new-file.txt"),
      /HOOK_PATH_SYMLINK_COMPONENT_FORBIDDEN/u,
    );
    assert.throws(
      () => normalizeRepoPath(root, root, "dangling/new-file.txt"),
      /HOOK_PATH_SYMLINK_COMPONENT_FORBIDDEN/u,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
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
  assert.equal(
    classifyBashCommand(
      "git -c core.hooksPath=/tmp push origin main",
      "feature",
    ),
    "DIRECT_MAIN_PUSH_FORBIDDEN",
  );
  assert.equal(
    classifyBashCommand(
      "git -c advice.detachedHead=false push --force origin feature",
      "feature",
    ),
    "FORCE_PUSH_FORBIDDEN",
  );
});

test("unsupported shell composition fails closed", () => {
  for (const command of [
    "git status | git push origin main",
    "echo $(git push origin main)",
    "echo `git push origin main`",
    "cat <(git status)",
    "(git push origin main)",
    "git status & git push origin main",
  ]) {
    assert.equal(
      classifyBashCommand(command, "feature"),
      "UNSUPPORTED_SHELL_COMPOSITION_FORBIDDEN",
    );
  }
});

test("merge and destructive shell write bypasses are denied", () => {
  assert.equal(
    classifyBashCommand("gh pr merge 123 --merge", "feature"),
    "MERGE_AUTHORITY_REQUIRED",
  );
  assert.equal(
    classifyBashCommand(
      "git -c merge.conflictstyle=zdiff3 merge origin/main",
      "feature",
    ),
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

test("inline interpreter wrappers fail closed while read-only commands remain allowed", () => {
  assert.equal(
    classifyBashCommand(
      "node -e \"require('fs').writeFileSync('x','y')\"",
      "feature",
    ),
    "INLINE_INTERPRETER_FORBIDDEN",
  );
  assert.equal(
    classifyBashCommand("python -c \"open('x','w').write('y')\"", "feature"),
    "INLINE_INTERPRETER_FORBIDDEN",
  );
  assert.equal(
    classifyBashCommand('bash -c "echo y > x"', "feature"),
    "INLINE_INTERPRETER_FORBIDDEN",
  );
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
  const parent = mkdtempSync(resolve(tmpdir(), "morro-pretool-edit-"));
  const root = resolve(parent, "repo");
  const target = resolve(root, "tooling/fabric/claim-guard.mjs");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, "fixture\n");

  try {
    const seen = [];
    const result = evaluatePreToolUse(
      {
        cwd: root,
        toolName: "edit",
        toolArgs: { path: "tooling/fabric/claim-guard.mjs" },
      },
      {
        root,
        branch: "infra/control-plane-v3.2-stage-c-safety-20260927",
        validatePaths: (paths) => seen.push(...paths),
      },
    );

    assert.deepEqual(result, { permissionDecision: "allow" });
    assert.deepEqual(seen, ["tooling/fabric/claim-guard.mjs"]);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
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

test("commit and push revalidate current worktree claim even with git global options", () => {
  const seen = [];
  const result = evaluatePreToolUse(
    {
      cwd: "/workspace/repo",
      toolName: "bash",
      toolArgs: {
        command: "git -c core.hooksPath=/tmp commit -m 'safe change'",
      },
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

test("git global options are parsed before the protected subcommand", () => {
  assert.deepEqual(
    parseGitInvocations(
      "git -c core.hooksPath=/tmp -C /workspace/repo push origin feature",
    ),
    [{ subcommand: "push", args: ["origin", "feature"] }],
  );
});

test("hook derives worker versus integrator authority from lifecycle state", () => {
  assert.equal(authorityForManifestState("IMPLEMENTING"), "WORKER");
  assert.equal(authorityForManifestState("REMOTE_PROVEN"), "WORKER");
  assert.equal(authorityForManifestState("COMPOSITION_PROVEN"), "INTEGRATOR");
  assert.equal(authorityForManifestState("POLICY_SATISFIED"), "INTEGRATOR");
  assert.equal(authorityForManifestState("MERGE_READY"), "INTEGRATOR");
});
