import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const SHA = /^[0-9a-f]{40}$/u;
const ID = /^MD-[A-Z0-9-]+$/u;
const REGISTRY_PATH = ".github/morro-control/claims.json";
const EVIDENCE_DIR = ".morro/claim-retirements";

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

function isAncestor(root, ancestor, descendant) {
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

function jsonAt(root, ref, path) {
  return JSON.parse(git(root, ["show", `${ref}:${path}`]));
}

function evidencePaths(root, headSha) {
  const output = git(root, [
    "ls-tree",
    "-r",
    "--name-only",
    headSha,
    "--",
    EVIDENCE_DIR,
  ]);
  return output
    ? output
        .split("\n")
        .filter((path) => path.endsWith(".json"))
        .sort()
    : [];
}

function repositoryOwner(env = process.env) {
  const repository = String(env.GITHUB_REPOSITORY ?? "").trim();
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) {
    return repository.split("/")[0];
  }
  return "luizanunciostoca";
}

export function validateMergedPrRetirement({
  root,
  baseSha,
  claimId,
  claim,
  evidence,
  owner = repositoryOwner(),
}) {
  assert.match(claimId, ID, "RETIREMENT_CLAIM_ID_INVALID");
  assert.equal(evidence?.id, claimId, "RETIREMENT_EVIDENCE_ID_MISMATCH");
  assert.equal(evidence?.reason, "MERGED_PR", "RETIREMENT_REASON_UNSUPPORTED");
  assert.ok(
    Number.isInteger(evidence?.prNumber) && evidence.prNumber > 0,
    "RETIREMENT_PR_NUMBER_INVALID",
  );
  assert.match(
    evidence?.mergeSha ?? "",
    SHA,
    "RETIREMENT_MERGE_SHA_INVALID",
  );
  assert.match(claim?.baseSha ?? "", SHA, "RETIREMENT_CLAIM_BASE_INVALID");
  assert.equal(
    typeof claim?.branch,
    "string",
    "RETIREMENT_CLAIM_BRANCH_INVALID",
  );
  assert.ok(claim.branch.length > 0, "RETIREMENT_CLAIM_BRANCH_INVALID");

  assert.ok(
    isAncestor(root, evidence.mergeSha, baseSha),
    "RETIREMENT_MERGE_NOT_IN_BASE",
  );
  assert.ok(
    isAncestor(root, claim.baseSha, evidence.mergeSha),
    "RETIREMENT_CLAIM_BASE_NOT_ANCESTOR",
  );

  const parentLine = git(root, [
    "rev-list",
    "--parents",
    "-n",
    "1",
    evidence.mergeSha,
  ]);
  assert.equal(
    parentLine.split(/\s+/u).length,
    3,
    "RETIREMENT_EVIDENCE_NOT_MERGE_COMMIT",
  );

  const subject = git(root, ["show", "-s", "--format=%s", evidence.mergeSha]);
  assert.equal(
    subject,
    `Merge pull request #${evidence.prNumber} from ${owner}/${claim.branch}`,
    "RETIREMENT_MERGE_SUBJECT_MISMATCH",
  );

  const historical = jsonAt(
    root,
    evidence.mergeSha,
    `.morro/changesets/${claimId}.json`,
  );
  assert.equal(historical?.id, claimId, "RETIREMENT_MANIFEST_ID_MISMATCH");
  assert.equal(
    historical?.branch,
    claim.branch,
    "RETIREMENT_MANIFEST_BRANCH_MISMATCH",
  );
  assert.equal(
    historical?.baseSha,
    claim.baseSha,
    "RETIREMENT_MANIFEST_BASE_MISMATCH",
  );

  return {
    id: claimId,
    reason: evidence.reason,
    prNumber: evidence.prNumber,
    mergeSha: evidence.mergeSha,
    branch: claim.branch,
  };
}

export function validateClaimRetirements(
  root = ".",
  { baseSha, headSha, env = process.env } = {},
) {
  assert.match(baseSha ?? "", SHA, "RETIREMENT_BASE_SHA_INVALID");
  assert.match(headSha ?? "", SHA, "RETIREMENT_HEAD_SHA_INVALID");
  assert.ok(
    isAncestor(root, baseSha, headSha),
    "RETIREMENT_BASE_NOT_ANCESTOR",
  );

  const baseRegistry = jsonAt(root, baseSha, REGISTRY_PATH);
  const candidateRegistry = jsonAt(root, headSha, REGISTRY_PATH);
  assert.equal(
    baseRegistry?.registryAuthority,
    "ORCHESTRATOR",
    "RETIREMENT_BASE_REGISTRY_AUTHORITY_INVALID",
  );
  assert.equal(
    candidateRegistry?.registryAuthority,
    "ORCHESTRATOR",
    "RETIREMENT_CANDIDATE_REGISTRY_AUTHORITY_INVALID",
  );

  const deleted = Object.keys(baseRegistry.claims ?? {})
    .filter((id) => !(id in (candidateRegistry.claims ?? {})))
    .sort();

  if (deleted.length === 0) {
    return {
      contract: "MORRO-CLAIM-RETIREMENT",
      status: "pass",
      baseSha,
      headSha,
      retired: [],
    };
  }

  const documents = evidencePaths(root, headSha)
    .map((path) => ({ path, value: jsonAt(root, headSha, path) }))
    .filter(({ value }) => value?.baseSha === baseSha);

  assert.ok(documents.length > 0, "RETIREMENT_EVIDENCE_MISSING");

  const entries = [];
  for (const { path, value } of documents) {
    assert.equal(value?.version, 1, "RETIREMENT_EVIDENCE_VERSION_INVALID");
    assert.match(
      value?.changeSetId ?? "",
      ID,
      "RETIREMENT_CHANGESET_ID_INVALID",
    );
    assert.equal(value?.baseSha, baseSha, "RETIREMENT_EVIDENCE_BASE_MISMATCH");
    assert.ok(
      Array.isArray(value?.retirements),
      "RETIREMENT_EVIDENCE_LIST_INVALID",
    );
    for (const entry of value.retirements) {
      entries.push({ ...entry, evidencePath: path });
    }
  }

  const byId = new Map();
  for (const entry of entries) {
    assert.match(entry?.id ?? "", ID, "RETIREMENT_EVIDENCE_ID_INVALID");
    assert.equal(
      byId.has(entry.id),
      false,
      "RETIREMENT_EVIDENCE_DUPLICATE",
    );
    byId.set(entry.id, entry);
  }

  assert.deepEqual(
    [...byId.keys()].sort(),
    deleted,
    "RETIREMENT_EVIDENCE_SET_MISMATCH",
  );

  const owner = repositoryOwner(env);
  const retired = deleted.map((id) =>
    validateMergedPrRetirement({
      root,
      baseSha,
      claimId: id,
      claim: baseRegistry.claims[id],
      evidence: byId.get(id),
      owner,
    }),
  );

  return {
    contract: "MORRO-CLAIM-RETIREMENT",
    status: "pass",
    baseSha,
    headSha,
    retired,
  };
}
