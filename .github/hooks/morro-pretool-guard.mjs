import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateClaimContext } from "../../tooling/fabric/claim-guard.mjs";

const WRITE_TOOLS = new Set([
  "create",
  "edit",
  "str_replace_editor",
  "apply_patch",
]);

const PATH_KEY = /(?:^|_)(?:file|filename|path|target)(?:_?path)?$/iu;
const PATCH_KEY = /(?:patch|diff|input)$/iu;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  }).trim();
}

function isGitAncestor(root, ancestor, descendant) {
  try {
    execFileSync(
      "git",
      ["-C", root, "merge-base", "--is-ancestor", ancestor, descendant],
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

export function extractPatchPaths(text) {
  if (typeof text !== "string") return [];

  const paths = new Set();
  const patterns = [
    /^\*\*\* (?:Add|Update|Delete) File:\s+(.+?)\s*$/gmu,
    /^\+\+\+\s+b\/(.+?)\s*$/gmu,
    /^---\s+a\/(.+?)\s*$/gmu,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      paths.add(match[1]);
    }
  }

  return [...paths];
}

export function extractToolPaths(toolArgs) {
  const paths = new Set();

  function visit(value, key = "") {
    if (typeof value === "string") {
      if (PATH_KEY.test(key)) paths.add(value);
      if (PATCH_KEY.test(key)) {
        for (const path of extractPatchPaths(value)) paths.add(path);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
      return;
    }

    if (value && typeof value === "object") {
      for (const [childKey, childValue] of Object.entries(value)) {
        visit(childValue, childKey);
      }
    }
  }

  visit(toolArgs);
  return [...paths];
}

export function normalizeRepoPath(root, cwd, rawPath) {
  assert.equal(typeof rawPath, "string", "HOOK_PATH_INVALID");
  assert.ok(rawPath.trim(), "HOOK_PATH_EMPTY");

  const cleaned = rawPath.startsWith("file://")
    ? new URL(rawPath).pathname
    : rawPath;
  const absolutePath = isAbsolute(cleaned)
    ? resolve(cleaned)
    : resolve(cwd || root, cleaned);
  const repoRelative = relative(root, absolutePath);

  assert.ok(
    repoRelative &&
      repoRelative !== ".." &&
      !repoRelative.startsWith(`..${sep}`) &&
      !isAbsolute(repoRelative),
    "HOOK_PATH_OUTSIDE_REPOSITORY",
  );

  return repoRelative.split(sep).join("/");
}

function commandFromArgs(toolArgs) {
  if (!toolArgs || typeof toolArgs !== "object") return "";
  for (const key of ["command", "cmd", "script"]) {
    if (typeof toolArgs[key] === "string") return toolArgs[key];
  }
  return "";
}

export function classifyBashCommand(command, branch) {
  if (typeof command !== "string" || !command.trim()) {
    return "BASH_COMMAND_MISSING";
  }

  if (/\bgit\s+push\b[^\n]*(?:--force(?:-with-lease)?|\s-f(?:\s|$))/iu.test(command)) {
    return "FORCE_PUSH_FORBIDDEN";
  }

  if (
    /\bgit\s+push\b/iu.test(command) &&
    (branch === "main" || /(?:refs\/heads\/main|\bmain\b)/u.test(command))
  ) {
    return "DIRECT_MAIN_PUSH_FORBIDDEN";
  }

  if (/\bgh\s+pr\s+merge\b/iu.test(command)) {
    return "MERGE_AUTHORITY_REQUIRED";
  }

  if (/\bgit\s+merge\b/iu.test(command)) {
    return "INTEGRATOR_AUTHORITY_REQUIRED";
  }

  if (
    /\bgit\s+(?:reset\s+--hard|clean\s+-[^\n]*f|checkout\s+--\s+\.)\b/iu.test(
      command,
    )
  ) {
    return "DESTRUCTIVE_GIT_COMMAND_FORBIDDEN";
  }

  if (
    /(?:^|[;&|]\s*)(?:rm|mv|cp|touch|mkdir|rmdir)\b/iu.test(command) ||
    /\bsed\s+-i\b/iu.test(command) ||
    /\bperl\s+-p?i\b/iu.test(command) ||
    /\bgit\s+apply\b/iu.test(command) ||
    /(?:^|[;&|]\s*)patch\b/iu.test(command) ||
    /(?:^|[^>])>>?\s*[^&]/u.test(command) ||
    /\btee\s+(?:-[A-Za-z]+\s+)*[^|;&]+/iu.test(command)
  ) {
    return "SHELL_WRITE_REQUIRES_STRUCTURED_EDIT_TOOL";
  }

  if (
    /\b(?:drop\s+(?:database|table)|truncate\s+table)\b/iu.test(command) ||
    /\b(?:prisma|drizzle|knex)\b[^\n]*\bmigrate\b[^\n]*\bdeploy\b/iu.test(
      command,
    )
  ) {
    return "DESTRUCTIVE_DATABASE_ACTION_REQUIRES_OWNER_APPROVAL";
  }

  if (
    /api\.render\.com[^\n]*\/deploy/iu.test(command) ||
    /\b(?:production|prod)\b[^\n]*\bdeploy\b/iu.test(command)
  ) {
    return "PRODUCTION_DEPLOY_REQUIRES_RELEASE_AUTHORITY";
  }

  return null;
}

function loadManifestForBranch(root, branch) {
  const directory = resolve(root, ".morro/changesets");
  const matches = [];

  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".json") || name === "schema.example.json") continue;
    const manifest = JSON.parse(
      readFileSync(resolve(directory, name), "utf8"),
    );
    if (manifest.branch === branch) matches.push(manifest);
  }

  assert.equal(matches.length, 1, "ACTIVE_CHANGESET_RESOLUTION_FAILED");
  return matches[0];
}

function resolveCurrentBaseSha(root) {
  for (const ref of ["origin/main", "main"]) {
    try {
      const sha = git(root, ["rev-parse", ref]);
      if (SHA_PATTERN.test(sha)) return sha;
    } catch {
      // Continue to the next local representation of current main.
    }
  }

  throw new Error("CURRENT_MAIN_SHA_UNAVAILABLE");
}

function changedWorktreeFiles(root) {
  const paths = new Set();
  for (const args of [
    ["diff", "--name-only", "HEAD"],
    ["diff", "--cached", "--name-only"],
    ["ls-files", "--others", "--exclude-standard"],
  ]) {
    const raw = git(root, args);
    if (!raw) continue;
    for (const path of raw.split("\n").filter(Boolean)) paths.add(path);
  }
  return [...paths];
}

function validatePathsAgainstActiveClaim({
  root,
  branch,
  changedFiles,
  authority = "WORKER",
}) {
  const manifest = loadManifestForBranch(root, branch);
  const registry = JSON.parse(
    readFileSync(resolve(root, ".github/morro-control/claims.json"), "utf8"),
  );
  const currentBaseSha = resolveCurrentBaseSha(root);

  return validateClaimContext({
    registry,
    manifest,
    branch,
    currentBaseSha,
    changedFiles,
    authority,
    isAncestor: (ancestor, descendant) =>
      isGitAncestor(root, ancestor, descendant),
  });
}

export function evaluatePreToolUse(payload, runtime = {}) {
  assert.ok(payload && typeof payload === "object", "HOOK_PAYLOAD_INVALID");
  const toolName = payload.toolName;
  assert.equal(typeof toolName, "string", "HOOK_TOOL_NAME_INVALID");

  const root = runtime.root ?? git(payload.cwd || ".", ["rev-parse", "--show-toplevel"]);
  const branch = runtime.branch ?? git(root, ["branch", "--show-current"]);
  assert.ok(branch, "HOOK_BRANCH_UNAVAILABLE");

  const validate =
    runtime.validatePaths ??
    ((changedFiles) =>
      validatePathsAgainstActiveClaim({
        root,
        branch,
        changedFiles,
      }));

  if (WRITE_TOOLS.has(toolName)) {
    if (branch === "main") {
      return {
        permissionDecision: "deny",
        permissionDecisionReason: "DIRECT_MAIN_WRITE_FORBIDDEN",
      };
    }

    const rawPaths = extractToolPaths(payload.toolArgs);
    if (rawPaths.length === 0) {
      return {
        permissionDecision: "deny",
        permissionDecisionReason: "WRITE_TARGET_PATH_UNRESOLVED",
      };
    }

    const changedFiles = [
      ...new Set(
        rawPaths.map((path) =>
          normalizeRepoPath(root, payload.cwd || root, path),
        ),
      ),
    ];
    validate(changedFiles);

    return { permissionDecision: "allow" };
  }

  if (toolName === "bash") {
    const command = commandFromArgs(payload.toolArgs);
    const denied = classifyBashCommand(command, branch);
    if (denied) {
      return {
        permissionDecision: "deny",
        permissionDecisionReason: denied,
      };
    }

    if (/\bgit\s+(?:commit|push)\b/iu.test(command)) {
      validate(runtime.changedFiles ?? changedWorktreeFiles(root));
    }

    return { permissionDecision: "allow" };
  }

  return { permissionDecision: "allow" };
}

function diagnosticCode(cause) {
  const message =
    cause &&
    typeof cause === "object" &&
    "message" in cause &&
    typeof cause.message === "string"
      ? cause.message
      : "";

  return (
    message.match(/[A-Z][A-Z0-9_:.-]{2,160}/u)?.[0] ??
    "UNEXPECTED_PRETOOL_GUARD_ERROR"
  );
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const payload = JSON.parse(readFileSync(0, "utf8"));
    process.stdout.write(JSON.stringify(evaluatePreToolUse(payload)));
  } catch (cause) {
    process.stdout.write(
      JSON.stringify({
        permissionDecision: "deny",
        permissionDecisionReason: diagnosticCode(cause),
      }),
    );
  }
}
