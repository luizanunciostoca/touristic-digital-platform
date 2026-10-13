#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  lstatSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { buildAffectedTurboArgs } from "./affected-quality.mjs";
import { buildClaimGuardProof } from "../fabric/claim-guard.mjs";
import {
  removedClaimIds,
  assertCanonicalRetirementTransition,
  buildClaimRetirementProof,
} from "../fabric/claim-retirement-proof.mjs";
import {
  chooseWorkspaceRuntime,
  probeWorkspaceRuntime,
} from "../workspace/morro-workspace.mjs";

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

function splitZero(output) {
  return output.split("\0").filter(Boolean);
}

export function changedFiles(baseSha, head = "HEAD") {
  const output = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "--diff-filter=ACDMRTUXB",
      "-z",
      baseSha + "..." + head,
    ],
    { encoding: "utf8" },
  );
  return splitZero(output);
}

export function workingCandidateFiles(baseSha) {
  const tracked = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACDMRTUXB", "-z", baseSha],
    { encoding: "utf8" },
  );
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  );
  return [...new Set([...splitZero(tracked), ...splitZero(untracked)])];
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

function execute(command, args, runtime = "native") {
  console.log([runtime, command, ...args].join(" "));
  const mappedCommand =
    runtime === "debian-proot" && command === process.execPath
      ? "node"
      : command;
  const result =
    runtime === "debian-proot"
      ? spawnSync(
          "proot-distro",
          [
            "login",
            "debian",
            "--",
            "bash",
            "-lc",
            'cd "$1"; shift; exec "$@"',
            "_",
            process.cwd(),
            mappedCommand,
            ...args,
          ],
          { stdio: "inherit" },
        )
      : spawnSync(mappedCommand, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("FAST_GATE_COMMAND_FAILED");
}

function workspaceRuntime() {
  const probes = ["native", "debian-proot"].map((runtime) =>
    probeWorkspaceRuntime(process.cwd(), runtime),
  );
  const selection = chooseWorkspaceRuntime(probes);
  assert.equal(selection.result, "PASS", "WORKSPACE_BOOTSTRAP_INCOMPLETE");
  return selection;
}

function affectedFormat(files, write = false, runtime = "native") {
  const existing = files.filter((file) => existsSync(file));
  if (existing.length > 0) {
    execute(
      "pnpm",
      [
        "exec",
        "prettier",
        write ? "--write" : "--check",
        "--ignore-unknown",
        ...existing,
      ],
      runtime,
    );
  }
}

export function nonRuntimeTests(domains) {
  const patterns = new Set();
  if (
    domains.some((domain) =>
      ["ci-tooling", "cicd", "control-plane"].includes(domain),
    )
  ) {
    patterns.add("tooling/ci/*.test.mjs");
    patterns.add("tooling/control-state/*.test.mjs");
  }
  if (domains.includes("control-plane")) {
    patterns.add("tooling/mdctl/*.test.mjs");
    patterns.add("tooling/tdp-max/*.test.mjs");
    patterns.add("tooling/failure-learning/*.test.mjs");
  }
  if (
    domains.some((domain) => ["governance", "control-plane"].includes(domain))
  ) {
    patterns.add("tooling/fabric/*.test.mjs");
    patterns.add("tooling/workspace/*.test.mjs");
    patterns.add(".github/agents/*.test.mjs");
    patterns.add(".github/hooks/*.test.mjs");
  }
  if (patterns.size === 0) return [];
  const output = execFileSync("git", ["ls-files", "-z", "--", ...patterns], {
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean);
}

export function chooseCanonicalBase(remoteSha, localRepresentations) {
  assert.match(remoteSha ?? "", SHA, "FAST_GATE_REMOTE_MAIN_INVALID");
  assert.ok(
    Array.isArray(localRepresentations) &&
      localRepresentations.some((entry) => entry?.sha === remoteSha),
    "FAST_GATE_LOCAL_MAIN_STALE",
  );
  return remoteSha;
}

function resolveExactBase(requestedRef = null) {
  const remoteLine = git(
    "ls-remote",
    "--exit-code",
    "origin",
    "refs/heads/main",
  );
  const remoteSha = remoteLine.split(/\s+/u)[0];
  assert.match(remoteSha ?? "", SHA, "FAST_GATE_REMOTE_MAIN_INVALID");

  const localRepresentations = [];
  for (const ref of ["refs/heads/main", "refs/remotes/origin/main"]) {
    try {
      localRepresentations.push({
        ref,
        sha: git("rev-parse", ref + "^{commit}"),
      });
    } catch {
      // A representation may legitimately be absent; at least one must match remote.
    }
  }
  chooseCanonicalBase(remoteSha, localRepresentations);

  if (requestedRef) {
    const requestedSha = git("rev-parse", requestedRef + "^{commit}");
    assert.equal(requestedSha, remoteSha, "FAST_GATE_BASE_STALE");
  }

  execFileSync("git", ["merge-base", "--is-ancestor", remoteSha, "HEAD"], {
    stdio: "ignore",
  });
  return remoteSha;
}

function isGitAncestor(ancestor, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function assertOwnershipCoverage(files, ownership) {
  assert.ok(Array.isArray(ownership?.domains), "FAST_GATE_OWNERSHIP_INVALID");
  const prefixes = ownership.domains.flatMap((domain) =>
    Array.isArray(domain?.pathPrefixes) ? domain.pathPrefixes : [],
  );
  const uncovered = files.filter(
    (file) =>
      !prefixes.some((prefix) =>
        prefix.endsWith("/") ? file.startsWith(prefix) : file === prefix,
      ),
  );
  assert.deepEqual(uncovered, [], "FAST_GATE_OWNERSHIP_UNCOVERED");
  return { covered: files.length };
}

function assertGitBoundInput(path, ref, verifyWorktree = false) {
  const [metadata, trackedPath] = git("ls-tree", ref, "--", path).split("\t");
  const entry = /^(100644|100755) blob ([0-9a-f]{40})$/u.exec(metadata);
  assert.ok(
    entry && trackedPath === path,
    "FAST_GATE_INPUT_NOT_REGULAR:" + path,
  );
  if (verifyWorktree) {
    let current = process.cwd();
    for (const part of path.split("/")) {
      current = join(current, part);
      assert.equal(
        lstatSync(current).isSymbolicLink(),
        false,
        "FAST_GATE_INPUT_SYMLINK:" + path,
      );
    }
    assert.equal(
      lstatSync(current).isFile(),
      true,
      "FAST_GATE_INPUT_NOT_REGULAR:" + path,
    );
    assert.equal(
      git("hash-object", "--no-filters", "--", path),
      entry[2],
      "FAST_GATE_INPUT_CONTENT_MISMATCH:" + path,
    );
  }
}

export async function validateAdmission(
  baseSha,
  headSha,
  files,
  { env = process.env, fetchImpl = fetch, now = Date.now() } = {},
) {
  assert.match(baseSha ?? "", SHA, "FAST_GATE_BASE_SHA_INVALID");
  assert.match(headSha ?? "", SHA, "FAST_GATE_HEAD_SHA_INVALID");
  assert.equal(git("rev-parse", "HEAD"), headSha, "FAST_GATE_HEAD_MISMATCH");
  assert.equal(
    git("status", "--porcelain", "--untracked-files=all"),
    "",
    "FAST_GATE_EXACT_HEAD_REQUIRES_CLEAN_WORKTREE",
  );
  assert.ok(isGitAncestor(baseSha, headSha), "FAST_GATE_BASE_NOT_ANCESTOR");
  assert.deepEqual(
    [...files].sort(),
    changedFiles(baseSha, headSha).sort(),
    "FAST_GATE_CHANGED_FILES_MISMATCH",
  );
  const branch = git("branch", "--show-current");
  assert.ok(branch && branch !== "main", "FAST_GATE_BRANCH_INVALID");
  const registryPath = ".github/morro-control/claims.json";
  const ledgerPath = ".github/morro-control/events.ndjson";
  assertGitBoundInput(registryPath, headSha, true);
  assertGitBoundInput(registryPath, baseSha);
  const registry = json(registryPath);
  const baseRegistry = JSON.parse(git("show", `${baseSha}:${registryPath}`));

  // Retirement removes its claim by design. Resolve this transition before
  // requiring an active claim on the candidate branch.
  if (removedClaimIds(baseRegistry, registry).length > 0) {
    const {
      removed: [claimId],
    } = assertCanonicalRetirementTransition(baseRegistry, registry);
    const expected = structuredClone(baseRegistry);
    delete expected.claims[claimId];
    assert.deepEqual(
      registry,
      expected,
      "FAST_GATE_RETIREMENT_REGISTRY_DIVERGED",
    );
    const manifestPath = `.morro/changesets/${claimId}.json`;
    assert.deepEqual(
      [...files].sort(),
      [registryPath, ledgerPath, manifestPath].sort(),
      "FAST_GATE_RETIREMENT_SCOPE_INVALID",
    );
    for (const path of [ledgerPath, manifestPath, ".morro/ownership.json"]) {
      assertGitBoundInput(path, headSha, true);
      assertGitBoundInput(path, baseSha);
    }
    assert.equal(
      json(manifestPath).branch,
      branch,
      "FAST_GATE_RETIREMENT_BRANCH_MISMATCH",
    );
    const ownership = assertOwnershipCoverage(
      files,
      json(".morro/ownership.json"),
    );
    const temporary = mkdtempSync(join(tmpdir(), "tdp-retirement-base-"));
    const trustedRoot = join(temporary, "trusted");
    let attached = false;
    try {
      git("worktree", "add", "--quiet", "--detach", trustedRoot, baseSha);
      attached = true;
      const proof = await buildClaimRetirementProof(
        trustedRoot,
        process.cwd(),
        {
          ...env,
          EXPECTED_BASE_SHA: baseSha,
          EXPECTED_CANDIDATE_SHA: headSha,
        },
        { fetchImpl, now },
      );
      return { ...proof, claimId, retirement: true, ownership };
    } finally {
      if (attached) git("worktree", "remove", "--force", trustedRoot);
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  const matching = Object.entries(registry?.claims ?? {}).filter(
    ([, claim]) => claim?.branch === branch,
  );
  assert.equal(matching.length, 1, "FAST_GATE_ACTIVE_CLAIM_RESOLUTION_FAILED");
  const [claimId] = matching[0];
  const manifestPath = `.morro/changesets/${claimId}.json`;
  const manifest = json(manifestPath);
  const authority =
    files.includes(registryPath) || files.includes(ledgerPath)
      ? "ORCHESTRATOR"
      : ["COMPOSITION_PROVEN", "POLICY_SATISFIED", "MERGE_READY"].includes(
            manifest.state,
          )
        ? "INTEGRATOR"
        : "WORKER";
  const claim = buildClaimGuardProof(process.cwd(), {
    EXPECTED_CANDIDATE_SHA: headSha,
    EXPECTED_BASE_SHA: baseSha,
    EXPECTED_BRANCH: branch,
    MANIFEST_PATH: manifestPath,
    CLAIM_GUARD_AUTHORITY: authority,
  });
  const ownership = assertOwnershipCoverage(
    files,
    json(".morro/ownership.json"),
  );
  return { ...claim, ownership };
}

function diffCheckWorking(baseSha) {
  execFileSync("git", ["diff", "--check", baseSha], { stdio: "inherit" });
}

function diffCheck(baseSha, headSha) {
  execFileSync("git", ["diff", "--check", baseSha + "..." + headSha], {
    stdio: "inherit",
  });
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const baseIndex = process.argv.indexOf("--base");
    const baseRef = baseIndex >= 0 ? process.argv[baseIndex + 1] : null;
    const prepare = process.argv.includes("--prepare");
    const admission = process.argv.includes("--admission");
    const explicitCertify = process.argv.includes("--certify");
    const selectedModes = [prepare, admission, explicitCertify].filter(Boolean);
    assert.ok(selectedModes.length <= 1, "FAST_GATE_MODE_CONFLICT");
    const certify = explicitCertify || (!prepare && !admission);
    const baseSha = resolveExactBase(baseRef);
    const headSha = git("rev-parse", "HEAD");

    if (prepare) {
      const files = workingCandidateFiles(baseSha);
      if (files.length === 0) {
        console.log(
          JSON.stringify({
            baseSha,
            headSha,
            files: [],
            mode: "PREPARED_NO_CHANGES",
          }),
        );
        process.exit(0);
      }
      affectedFormat(files, true);
      diffCheckWorking(baseSha);
      execute("pnpm", ["secret-patterns:check"]);
      console.log(
        JSON.stringify({ baseSha, headSha, files, mode: "PREPARED" }, null, 2),
      );
      process.exit(0);
    }

    assert.equal(
      git("status", "--porcelain=v1", "--untracked-files=normal"),
      "",
      "FAST_GATE_EXACT_HEAD_REQUIRES_CLEAN_WORKTREE",
    );
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
          treeSha: git("rev-parse", "HEAD^{tree}"),
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

    const authority = await validateAdmission(baseSha, headSha, files);
    const workspace = workspaceRuntime();
    affectedFormat(files, false, workspace.runtime);
    diffCheck(baseSha, headSha);
    execute("pnpm", ["secret-patterns:check"], workspace.runtime);

    if (admission) {
      console.log(
        JSON.stringify({
          mode: "ADMISSION_PASS",
          baseSha,
          headSha,
          treeSha: git("rev-parse", "HEAD^{tree}"),
          claimId: authority.claimId,
          ownershipCovered: authority.ownership.covered,
          workspaceRuntime: workspace.runtime,
          workspaceFallbackUsed: workspace.fallbackUsed,
        }),
      );
      process.exit(0);
    }

    if (plan.mode === "DEEP_PROOF") {
      execute("pnpm", ["check"], workspace.runtime);
    } else if (plan.mode === "NON_RUNTIME") {
      const tests = nonRuntimeTests(report.domains);
      if (tests.length > 0)
        execute(process.execPath, ["--test", ...tests], workspace.runtime);
    } else {
      execute("pnpm", plan.affectedQualityArgs, workspace.runtime);
    }

    assert.equal(
      git("status", "--porcelain=v1", "--untracked-files=normal"),
      "",
      "FAST_GATE_CERTIFY_DIRTY_AFTER_PROOF",
    );
    if (certify) {
      console.log(
        JSON.stringify({
          mode: "CERTIFIED",
          baseSha,
          headSha,
          treeSha: git("rev-parse", "HEAD^{tree}"),
          claimId: authority.claimId,
          workspaceRuntime: workspace.runtime,
          workspaceFallbackUsed: workspace.fallbackUsed,
        }),
      );
    }
  } catch (error) {
    const code =
      String(error?.message ?? error).match(/[A-Z][A-Z0-9_:.-]{2,160}/u)?.[0] ??
      "FAST_GATE_FAILED";
    console.error(code);
    process.exitCode = 2;
  }
}
