import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("root workflow provides base-controlled trust reconciliation", async () => {
  const workflow = await read(".github/workflows/morro-claim-guard.yml");
  assert.match(workflow, /name: base-controlled-trust-root-reconciliation/);
  assert.match(workflow, /Checkout trusted base[\s\S]*pull_request\.base\.sha/);
  assert.match(
    workflow,
    /Checkout candidate as data[\s\S]*pull_request\.head\.sha/,
  );
  assert.match(workflow, /CLAIM_GUARD_AUTHORITY: ORCHESTRATOR/);
  assert.match(
    workflow,
    /node trusted\/tooling\/fabric\/claim-guard\.mjs candidate/,
  );
  assert.match(workflow, /morro-claim-guard\.yml'[\s\S]*required=false/);
});

test("scheduler freezes immutable roots and verifies routed trust evidence", async () => {
  const scheduler = await read("tooling/mdctl/scheduler-live.mjs");
  assert.match(
    scheduler,
    /TRUST_ROOT_WORKFLOW = "\.github\/workflows\/morro-claim-guard\.yml"/,
  );
  assert.match(
    scheduler,
    /TRUST_ROOT_RECONCILIATION_JOB =\s*"base-controlled-trust-root-reconciliation"/,
  );
  assert.match(scheduler, /TRUSTED_IMMUTABLE_FILES/);
  assert.match(scheduler, /TRUSTED_ROUTABLE_FILES/);
  assert.match(scheduler, /TRUSTED_IMMUTABLE_FILE_DIVERGED/);
  assert.match(scheduler, /TRUST_ROOT_RECONCILIATION_STEP/);
  assert.match(scheduler, /reasonPrefix \+ "_STEP_INVALID"/);
  assert.match(scheduler, /reasonPrefix: "TRUST_ROOT_RECONCILIATION"/);
  assert.match(
    scheduler,
    /authority: "BASE_CONTROLLED_TRUST_ROOT_RECONCILIATION"/,
  );
});

test("scheduler reanchor admission stays exact-head trusted and bounded", async () => {
  const scheduler = await read("tooling/mdctl/scheduler-live.mjs");
  assert.match(scheduler, /trustedReanchorTransientPaths/);
  assert.match(
    scheduler,
    /trust\?\.authority !== "TRUSTED_CLAIM_GUARD_EXACT_HEAD"/,
  );
  assert.match(scheduler, /candidateClaim\?\.baseSha !== mainSha/);
  assert.match(scheduler, /candidateChangeSet\?\.baseSha !== mainSha/);
  assert.match(scheduler, /"\.github\/morro-control\/claims\.json"/);
  assert.match(scheduler, /"\.github\/morro-control\/events\.ndjson"/);
  assert.doesNotMatch(scheduler, /allowUntrustedReanchor|callerTransientPaths/);
});

// Execute the exact workflow proof against real Git objects, never a mock git.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("routing proof accepts only the two finite additive trigger entries", async () => {
  const workflow = await read(".github/workflows/morro-claim-guard.yml");
  const source = workflow
    .match(/python3 -I - <<'PY_ROUTING'\n([\s\S]*?)          PY_ROUTING/)[1]
    .split("\n")
    .map((line) => line.slice(10))
    .join("\n");
  const path = ".github/workflows/morro-claim-guard-trust-bootstrap.yml";
  const profilePath = ".github/workflows/morro-agent-profiles.yml";
  const additions = '      - "tooling/ci/**"\n      - "turbo.json"\n';
  const current = await read(path);
  const original = current.replace(additions, "");
  assert.notEqual(original, current);
  const profiles = await read(profilePath);
  const cases = [
    ["both", current, profiles, null],
    ["mode", current, profiles, "ROUTING_FILE_MODE_INVALID"],
    ["symlink", current, profiles, "ROUTING_FILE_MODE_INVALID"],
    ["profile mode", current, profiles, "ROUTING_FILE_MODE_INVALID"],
    [
      "ci only",
      original.replace("    paths:\n", '    paths:\n      - "tooling/ci/**"\n'),
      profiles,
      null,
    ],
    [
      "turbo only",
      original.replace("    paths:\n", '    paths:\n      - "turbo.json"\n'),
      profiles,
      null,
    ],
    ["unchanged", original, profiles, "ROUTING_DELTA_NOT_APPROVED"],
    [
      "broad glob",
      current.replace('"turbo.json"', '"**"'),
      profiles,
      "ROUTING_DELTA_NOT_APPROVED",
    ],
    [
      "neighbor",
      current.replace('"turbo.json"', '"turbo.json.backup"'),
      profiles,
      "ROUTING_DELTA_NOT_APPROVED",
    ],
    [
      "event",
      current.replace("pull_request:", "pull_request_target:"),
      profiles,
      "ROUTING_DELTA_NOT_APPROVED",
    ],
    [
      "pin",
      current.replace(
        "3d3c42e5aac5ba805825da76410c181273ba90b1",
        "0".repeat(40),
      ),
      profiles,
      "ROUTING_DELTA_NOT_APPROVED",
    ],
    [
      "reorder",
      current.replace(
        additions,
        additions.split("\n").slice(0, 2).reverse().join("\n") + "\n",
      ),
      profiles,
      "ROUTING_DELTA_NOT_APPROVED",
    ],
    [
      "permission",
      current.replace("contents: read", "contents: write"),
      profiles,
      "ROUTING_DELTA_NOT_APPROVED",
    ],
    [
      "step",
      current + "\n# altered steps\n",
      profiles,
      "ROUTING_DELTA_NOT_APPROVED",
    ],
    [
      "exclusion",
      current.replace('"turbo.json"', '"!turbo.json"'),
      profiles,
      "ROUTING_DELTA_NOT_APPROVED",
    ],
    [
      "duplicate",
      current.replace(additions, additions + additions),
      profiles,
      "ROUTING_DELTA_NOT_APPROVED",
    ],
    ["profiles", current, profiles + "\n", "PROFILES_CHANGED"],
    ["wrong base", current, profiles, "IDENTITY_MISMATCH"],
    ["wrong head", current, profiles, "IDENTITY_MISMATCH"],
  ];
  for (const [name, bootstrap, profile, expected] of cases) {
    const dir = mkdtempSync(join(tmpdir(), "tdp-routing-proof-"));
    try {
      const hashes = {};
      for (const repo of ["trusted", "candidate"]) {
        const cwd = join(dir, repo);
        mkdirSync(join(cwd, ".github/workflows"), { recursive: true });
        writeFileSync(
          join(cwd, path),
          repo === "trusted" ? original : bootstrap,
        );
        writeFileSync(
          join(cwd, profilePath),
          repo === "trusted" ? profiles : profile,
        );
        const git = (...args) =>
          execFileSync("git", args, {
            cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          }).trim();
        git("init");
        git("add", ".");
        if (
          repo === "candidate" &&
          ["mode", "symlink", "profile mode"].includes(name)
        ) {
          const target = name === "profile mode" ? profilePath : path;
          const blob = git("hash-object", target);
          git(
            "update-index",
            "--cacheinfo",
            name === "symlink" ? "120000" : "100755",
            blob,
            target,
          );
        }
        git(
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.invalid",
          "commit",
          "-m",
          "fixture",
        );
        hashes[repo] = git("rev-parse", "HEAD");
      }
      const result = spawnSync("python3", ["-I", "-"], {
        cwd: dir,
        input: source,
        encoding: "utf8",
        env: {
          ...process.env,
          EXPECTED_BASE_SHA:
            name === "wrong base" ? "0".repeat(40) : hashes.trusted,
          EXPECTED_CANDIDATE_SHA:
            name === "wrong head" ? "0".repeat(40) : hashes.candidate,
        },
      });
      if (expected) {
        assert.notEqual(result.status, 0, name);
        assert.ok(
          result.stderr.includes(expected),
          name + ": " + result.stderr,
        );
      } else {
        assert.equal(result.status, 0, name + ": " + result.stderr);
        assert.match(result.stdout, /EXACT_ADDITIVE_ROUTING_PROOF_PASS/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
