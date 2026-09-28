import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PROFILE_IDS = Object.freeze([
  "release-engineer",
  "platform-backend",
  "database-persistence",
  "auth-tenant-security",
  "commerce-payments",
  "ticketing-financial",
  "business-control-center-crm",
  "assistant-search-map",
  "frontend-ux-accessibility",
  "analytics-notifications-pwa",
  "security-auditor",
  "test-engineer",
]);

const KEYS = Object.freeze([
  "name",
  "description",
  "target",
  "tools",
  "disable-model-invocation",
  "user-invocable",
]);

const READ_ONLY = new Set(["release-engineer", "security-auditor"]);
const PROOF_CAPABLE = new Set([
  "business-control-center-crm",
  "assistant-search-map",
  "frontend-ux-accessibility",
  "analytics-notifications-pwa",
  "test-engineer",
]);

export function validateProfile(text, filename) {
  assert.equal(typeof text, "string", "PROFILE_TEXT_REQUIRED");
  assert.ok(text.length < 30000, "PROFILE_TOO_LARGE");

  const sections = text.split(/^---\r?$/mu);
  assert.equal(sections[0], "", "FRONTMATTER_REQUIRED");
  assert.equal(sections.length, 3, "FRONTMATTER_BOUNDARIES_INVALID");

  const header = Object.create(null);
  for (const line of sections[1].trim().split(/\r?\n/u)) {
    const match = /^([a-z][a-z-]*): (.+)$/u.exec(line);
    assert.ok(match, "FRONTMATTER_SUBSET_INVALID");
    const [, key, value] = match;
    assert.ok(KEYS.includes(key), "UNKNOWN_PROFILE_PROPERTY");
    assert.ok(!Object.hasOwn(header, key), "DUPLICATE_PROFILE_PROPERTY");
    header[key] = value.trim();
  }

  assert.deepEqual(
    Object.keys(header).sort(),
    [...KEYS].sort(),
    "PROFILE_PROPERTIES_MISMATCH",
  );

  const id = filename.replace(/\.agent\.md$/u, "");
  assert.ok(PROFILE_IDS.includes(id), "UNEXPECTED_PROFILE");
  assert.equal(filename, `${id}.agent.md`, "PROFILE_FILENAME_INVALID");
  assert.ok(header.name.length > 0, "PROFILE_NAME_REQUIRED");
  assert.ok(header.description.length >= 20, "DESCRIPTION_REQUIRED");
  assert.equal(header.target, "github-copilot", "TARGET_INVALID");
  assert.equal(
    header["disable-model-invocation"],
    "true",
    "MODEL_INVOCATION_MUST_BE_DISABLED",
  );
  assert.equal(header["user-invocable"], "true", "USER_INVOCABLE_REQUIRED");

  const readOnly = READ_ONLY.has(id);
  const tools = readOnly
    ? ["read", "search"]
    : ["read", "search", "edit", "execute"];
  assert.deepEqual(JSON.parse(header.tools), tools, "TOOLS_ALLOWLIST_INVALID");

  const body = sections[2];
  for (const required of [
    "AGENTS.md",
    "## Scope",
    "## Required skills",
    "## Workflow",
    "## Forbidden",
    "## Output contract",
  ]) {
    assert.ok(body.includes(required), `PROFILE_CONTRACT_MISSING:${required}`);
  }

  const workflowMatch = /## Workflow\s+([\s\S]*?)\n## Forbidden/u.exec(body);
  assert.ok(workflowMatch, "WORKFLOW_SECTION_INVALID");
  const workflowItems = workflowMatch[1]
    .split(/\r?\n/u)
    .map((line) => /^\s*\d+\.\s+(.+?)\s*$/u.exec(line)?.[1] ?? null)
    .filter(Boolean);

  const hasAuthorityHandoff = readOnly
    ? workflowItems.some((item) => /^Remain read-only(?:[:.;]|$)/u.test(item))
    : PROOF_CAPABLE.has(id)
      ? workflowItems.includes(
          "Implementation agents stop at `REMOTE_PROVEN`; independent auditors stop at proof verdict and hand off to the Integrator.",
        )
      : workflowItems.includes(
          "Stop the implementation lane at `REMOTE_PROVEN` and hand off to independent proof/integration.",
        );

  assert.ok(hasAuthorityHandoff, "ROLE_AUTHORITY_CONTRACT_MISSING");

  const skills = [...body.matchAll(/`(\.github\/skills\/[^`]+)`/gu)].map(
    (match) => match[1],
  );
  assert.ok(skills.length >= 2, "SKILL_REFERENCES_REQUIRED");

  for (const skill of skills) {
    assert.match(skill, /^\.github\/skills\/morro-[a-z0-9-]+\/SKILL\.md$/u);
  }

  return { id, name: header.name, skills };
}

function assertRepositoryRegularFile(root, relativePath, failureCode) {
  const rootReal = realpathSync(root);
  const expectedPath = resolve(rootReal, relativePath);
  const lexicalPath = resolve(root, relativePath);

  assert.ok(lstatSync(lexicalPath).isFile(), failureCode);
  assert.equal(
    realpathSync(lexicalPath),
    expectedPath,
    `${failureCode}_SYMLINK`,
  );
}

export function validateDirectory(root) {
  const rootReal = realpathSync(root);
  const directory = resolve(rootReal, ".github/agents");
  assert.equal(realpathSync(directory), directory, "AGENT_DIR_SYMLINK");

  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".agent.md"))
    .sort();

  assert.deepEqual(
    files,
    PROFILE_IDS.map((id) => `${id}.agent.md`).sort(),
    "PROFILE_SET_MISMATCH",
  );

  const names = new Set();
  for (const filename of files) {
    const path = resolve(directory, filename);
    assert.ok(lstatSync(path).isFile(), "PROFILE_NOT_REGULAR_FILE");

    const profile = validateProfile(readFileSync(path, "utf8"), filename);
    assert.ok(!names.has(profile.name), "DUPLICATE_PROFILE_NAME");
    names.add(profile.name);

    for (const skill of profile.skills) {
      assertRepositoryRegularFile(rootReal, skill, "SKILL_MISSING");
    }
  }

  assert.ok(
    lstatSync(resolve(directory, "README.md")).isFile(),
    "AGENT_README_MISSING",
  );
  return { count: files.length, mode: "MANUAL_SELECTION_ONLY" };
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
    "UNEXPECTED_VALIDATION_ERROR"
  );
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const targetRoot = resolve(process.argv[2] ?? ".");
    const result = validateDirectory(targetRoot);

    const dirty = execFileSync(
      "git",
      ["-C", targetRoot, "status", "--porcelain", "--untracked-files=all"],
      { encoding: "utf8" },
    ).trim();
    assert.equal(dirty, "", "DIRTY_CANDIDATE_WORKTREE");

    const headSha = execFileSync(
      "git",
      ["-C", targetRoot, "rev-parse", "HEAD"],
      { encoding: "utf8" },
    ).trim();
    const treeSha = execFileSync(
      "git",
      ["-C", targetRoot, "rev-parse", "HEAD^{tree}"],
      { encoding: "utf8" },
    ).trim();

    if (process.env.EXPECTED_CANDIDATE_SHA) {
      assert.equal(
        headSha,
        process.env.EXPECTED_CANDIDATE_SHA,
        "CANDIDATE_SHA_MISMATCH",
      );
    }

    console.log(
      JSON.stringify({
        contract: "MORRO-TRUSTED-AGENT-PROFILES",
        status: "pass",
        validatorSource: "BASE_CONTROLLED",
        ...result,
        headSha,
        treeSha,
        trustedValidatorSha: process.env.TRUSTED_VALIDATOR_SHA ?? null,
        runId: process.env.GITHUB_RUN_ID ?? null,
        checkedAt: new Date().toISOString(),
        runtimeAcceptance: "NOT_RUN",
      }),
    );
  } catch (cause) {
    console.error(
      `MORRO_TRUSTED_AGENT_PROFILES_FAILED:${diagnosticCode(cause)}`,
    );
    process.exitCode = 1;
  }
}
