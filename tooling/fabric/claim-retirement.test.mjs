import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { validateClaimRetirements } from "./claim-retirement.mjs";

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  }).trim();
}

function writeJson(root, path, value) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(value, null, 2) + "\n");
}

function fixture(t, { evidence = true, prNumber = 7 } = {}) {
  const root = mkdtempSync(join(tmpdir(), "claim-retirement-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["config", "user.email", "test@example.com"]);

  writeFileSync(join(root, "README.md"), "base\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "base"]);
  const claimBaseSha = git(root, ["rev-parse", "HEAD"]);

  const id = "MD-TEST-RETIRE";
  const branch = "feat/test-retirement";
  writeJson(root, ".github/morro-control/claims.json", {
    schemaVersion: 1,
    registryAuthority: "ORCHESTRATOR",
    claims: {
      [id]: {
        owner: "TEST",
        reviewer: "AUTOMATED-INDEPENDENT-PROOF",
        branch,
        baseSha: claimBaseSha,
        paths: [".morro/changesets/MD-TEST-RETIRE.json"],
        domains: ["ci-governance"],
        risk: "P1",
        status: "IMPLEMENTING",
        expiresAt: "2099-01-01T00:00:00Z",
      },
    },
  });
  writeJson(root, ".morro/changesets/MD-TEST-RETIRE.json", {
    id,
    baseSha: claimBaseSha,
    branch,
    state: "IMPLEMENTING",
    risk: "high",
    owns: {
      paths: [".morro/changesets/MD-TEST-RETIRE.json"],
      contracts: [],
    },
    reads: { contracts: [] },
    produces: { events: [], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
    dependencies: [],
    requiredEvidence: ["automated-independent-proof"],
    stopAt: "REMOTE_PROVEN",
  });
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "register claim"]);

  git(root, ["checkout", "-b", branch]);
  writeFileSync(join(root, "feature.txt"), "feature\n");
  git(root, ["add", "feature.txt"]);
  git(root, ["commit", "-m", "feature work"]);
  git(root, ["checkout", "main"]);
  git(root, [
    "merge",
    "--no-ff",
    branch,
    "-m",
    "Merge pull request #7 from luizanunciostoca/feat/test-retirement",
  ]);
  const mergeSha = git(root, ["rev-parse", "HEAD"]);
  const baseSha = mergeSha;

  git(root, ["checkout", "-b", "infra/retire"]);
  writeJson(root, ".github/morro-control/claims.json", {
    schemaVersion: 1,
    registryAuthority: "ORCHESTRATOR",
    claims: {},
  });
  if (evidence) {
    writeJson(root, ".morro/claim-retirements/MD-TEST-GC.json", {
      version: 1,
      changeSetId: "MD-TEST-GC",
      baseSha,
      retirements: [
        {
          id,
          reason: "MERGED_PR",
          prNumber,
          mergeSha,
        },
      ],
    });
  }
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "retire merged claim"]);
  const headSha = git(root, ["rev-parse", "HEAD"]);

  return { root, baseSha, headSha, id, mergeSha };
}

test("accepts an exact merged-PR retirement", (t) => {
  const value = fixture(t);
  const proof = validateClaimRetirements(value.root, {
    baseSha: value.baseSha,
    headSha: value.headSha,
    env: {
      GITHUB_REPOSITORY: "luizanunciostoca/touristic-digital-platform",
    },
  });
  assert.equal(proof.status, "pass");
  assert.equal(proof.retired.length, 1);
  assert.equal(proof.retired[0].id, value.id);
  assert.equal(proof.retired[0].mergeSha, value.mergeSha);
});

test("fails closed when a deleted claim has no evidence", (t) => {
  const value = fixture(t, { evidence: false });
  assert.throws(
    () =>
      validateClaimRetirements(value.root, {
        baseSha: value.baseSha,
        headSha: value.headSha,
      }),
    /RETIREMENT_EVIDENCE_MISSING/u,
  );
});

test("rejects a PR number that does not match the merge subject", (t) => {
  const value = fixture(t, { prNumber: 8 });
  assert.throws(
    () =>
      validateClaimRetirements(value.root, {
        baseSha: value.baseSha,
        headSha: value.headSha,
        env: {
          GITHUB_REPOSITORY: "luizanunciostoca/touristic-digital-platform",
        },
      }),
    /RETIREMENT_MERGE_SUBJECT_MISMATCH/u,
  );
});

test("rejects evidence for a claim that was not deleted", (t) => {
  const value = fixture(t);
  const path = join(
    value.root,
    ".morro/claim-retirements/MD-TEST-GC.json",
  );
  const evidence = JSON.parse(
    git(value.root, [
      "show",
      `${value.headSha}:.morro/claim-retirements/MD-TEST-GC.json`,
    ]),
  );
  evidence.retirements.push({
    id: "MD-NOT-DELETED",
    reason: "MERGED_PR",
    prNumber: 9,
    mergeSha: value.mergeSha,
  });
  writeFileSync(path, JSON.stringify(evidence, null, 2) + "\n");
  git(value.root, ["add", path]);
  git(value.root, ["commit", "-m", "tamper retirement evidence"]);
  const headSha = git(value.root, ["rev-parse", "HEAD"]);

  assert.throws(
    () =>
      validateClaimRetirements(value.root, {
        baseSha: value.baseSha,
        headSha,
      }),
    /RETIREMENT_EVIDENCE_SET_MISMATCH/u,
  );
});
