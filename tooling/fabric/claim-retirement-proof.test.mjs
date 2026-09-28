import assert from "node:assert/strict";
import test from "node:test";

import {
  collectClaimRetirementEvidence,
  removedClaimIds,
  validateClaimRetirements,
} from "./claim-retirement-proof.mjs";

const BASE = "a".repeat(40);
const MERGE = "b".repeat(40);

function claim(overrides = {}) {
  return {
    owner: "WORKER",
    reviewer: "AUTOMATED-INDEPENDENT-PROOF",
    branch: "infra/example",
    baseSha: BASE,
    paths: ["tooling/example.mjs"],
    domains: ["ci-governance"],
    risk: "P1",
    status: "IMPLEMENTING",
    expiresAt: "2099-01-01T00:00:00Z",
    ...overrides,
  };
}

function registry(claims) {
  return {
    schemaVersion: 1,
    registryAuthority: "ORCHESTRATOR",
    claims,
  };
}

test("no retirement passes and preserves all base claims", () => {
  const base = registry({ "MD-ONE": claim() });
  const candidate = structuredClone(base);
  assert.deepEqual(removedClaimIds(base, candidate), []);
  assert.deepEqual(
    validateClaimRetirements({
      baseRegistry: base,
      candidateRegistry: candidate,
      now: Date.parse("2026-09-28T00:00:00Z"),
    }).removedClaims,
    [],
  );
});

test("claim deletion without evidence fails closed", () => {
  const base = registry({ "MD-ONE": claim() });
  const candidate = registry({});
  assert.throws(
    () =>
      validateClaimRetirements({
        baseRegistry: base,
        candidateRegistry: candidate,
        evidenceById: {},
        now: Date.parse("2026-09-28T00:00:00Z"),
      }),
    /CLAIM_RETIREMENT_EVIDENCE_MISSING/u,
  );
});

test("surviving claim cannot be silently changed during retirement", () => {
  const base = registry({
    "MD-ONE": claim(),
    "MD-TWO": claim({ branch: "infra/two" }),
  });
  const candidate = registry({
    "MD-TWO": claim({ branch: "infra/two", owner: "OTHER" }),
  });
  assert.throws(
    () =>
      validateClaimRetirements({
        baseRegistry: base,
        candidateRegistry: candidate,
        evidenceById: {
          "MD-ONE": {
            id: "MD-ONE",
            reason: "ORPHANED",
            branch: "infra/example",
            baseSha: BASE,
            branchExists: false,
            pullRequestCount: 0,
          },
        },
        now: Date.parse("2026-09-28T00:00:00Z"),
      }),
    /SURVIVING_CLAIM_MUTATION_FORBIDDEN_DURING_RETIREMENT/u,
  );
});

test("expired claim retirement requires actual expiry", () => {
  const expired = claim({ expiresAt: "2026-09-27T00:00:00Z" });
  const base = registry({ "MD-ONE": expired });
  const candidate = registry({});
  const evidence = {
    "MD-ONE": {
      id: "MD-ONE",
      reason: "EXPIRED",
      branch: expired.branch,
      baseSha: BASE,
    },
  };
  assert.equal(
    validateClaimRetirements({
      baseRegistry: base,
      candidateRegistry: candidate,
      evidenceById: evidence,
      now: Date.parse("2026-09-28T00:00:00Z"),
    }).retirements[0].reason,
    "EXPIRED",
  );

  expired.expiresAt = "2026-10-01T00:00:00Z";
  assert.throws(
    () =>
      validateClaimRetirements({
        baseRegistry: registry({ "MD-ONE": expired }),
        candidateRegistry: candidate,
        evidenceById: evidence,
        now: Date.parse("2026-09-28T00:00:00Z"),
      }),
    /CLAIM_RETIREMENT_NOT_EXPIRED/u,
  );
});

test("merged claim retirement requires canonical ancestor proof", () => {
  const base = registry({ "MD-ONE": claim() });
  const candidate = registry({});
  const evidence = {
    id: "MD-ONE",
    reason: "MERGED_PR",
    branch: "infra/example",
    baseSha: BASE,
    prNumber: 123,
    mergeSha: MERGE,
    mergeShaAncestorOfBase: true,
    claimBaseAncestorOfMerge: true,
    historicalManifestMatches: true,
  };
  assert.equal(
    validateClaimRetirements({
      baseRegistry: base,
      candidateRegistry: candidate,
      evidenceById: { "MD-ONE": evidence },
      now: Date.parse("2026-09-28T00:00:00Z"),
    }).retirements[0].prNumber,
    123,
  );

  assert.throws(
    () =>
      validateClaimRetirements({
        baseRegistry: base,
        candidateRegistry: candidate,
        evidenceById: {
          "MD-ONE": { ...evidence, mergeShaAncestorOfBase: false },
        },
        now: Date.parse("2026-09-28T00:00:00Z"),
      }),
    /CLAIM_RETIREMENT_MERGE_NOT_ANCESTOR/u,
  );
});

test("orphan retirement requires missing branch and zero pull requests", () => {
  const base = registry({ "MD-ONE": claim() });
  const candidate = registry({});
  const valid = {
    id: "MD-ONE",
    reason: "ORPHANED",
    branch: "infra/example",
    baseSha: BASE,
    branchExists: false,
    pullRequestCount: 0,
  };
  assert.equal(
    validateClaimRetirements({
      baseRegistry: base,
      candidateRegistry: candidate,
      evidenceById: { "MD-ONE": valid },
      now: Date.parse("2026-09-28T00:00:00Z"),
    }).retirements[0].reason,
    "ORPHANED",
  );
  assert.throws(
    () =>
      validateClaimRetirements({
        baseRegistry: base,
        candidateRegistry: candidate,
        evidenceById: {
          "MD-ONE": { ...valid, branchExists: true },
        },
        now: Date.parse("2026-09-28T00:00:00Z"),
      }),
    /CLAIM_RETIREMENT_ORPHAN_BRANCH_EXISTS/u,
  );
  assert.throws(
    () =>
      validateClaimRetirements({
        baseRegistry: base,
        candidateRegistry: candidate,
        evidenceById: {
          "MD-ONE": { ...valid, pullRequestCount: 1 },
        },
        now: Date.parse("2026-09-28T00:00:00Z"),
      }),
    /CLAIM_RETIREMENT_ORPHAN_PR_EXISTS/u,
  );
});

function fakeFetch(routes) {
  return async (url) => {
    const key = String(url);
    const value = routes.find(([pattern]) => key.includes(pattern))?.[1];
    if (value === undefined) {
      return new Response(JSON.stringify({ message: "not mocked" }), {
        status: 404,
      });
    }
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

test("canonical collector proves merged PR ancestry through GitHub", async () => {
  const evidence = await collectClaimRetirementEvidence("MD-ONE", claim(), {
    repository: "owner/repo",
    expectedBaseSha: BASE,
    token: "test-token",
    now: Date.parse("2026-09-28T00:00:00Z"),
    fetchImpl: fakeFetch([
      [
        "/pulls?",
        [
          {
            number: 123,
            state: "closed",
            merged_at: "2026-09-27T00:00:00Z",
            merge_commit_sha: MERGE,
            head: { ref: "infra/example" },
            base: { ref: "main" },
          },
        ],
      ],
      [
        `/compare/${MERGE}...${BASE}`,
        {
          status: "ahead",
          base_commit: { sha: MERGE },
          merge_base_commit: { sha: MERGE },
        },
      ],
    ]),
  });
  assert.deepEqual(evidence, {
    id: "MD-ONE",
    reason: "MERGED_PR",
    branch: "infra/example",
    baseSha: BASE,
    prNumber: 123,
    mergeSha: MERGE,
    mergeShaAncestorOfBase: true,
  });
});

test("canonical collector proves orphan only with no PR and no branch", async () => {
  const evidence = await collectClaimRetirementEvidence("MD-ONE", claim(), {
    repository: "owner/repo",
    expectedBaseSha: BASE,
    token: "test-token",
    now: Date.parse("2026-09-28T00:00:00Z"),
    fetchImpl: fakeFetch([
      ["/pulls?", []],
      ["/git/matching-refs/heads/", []],
    ]),
  });
  assert.deepEqual(evidence, {
    id: "MD-ONE",
    reason: "ORPHANED",
    branch: "infra/example",
    baseSha: BASE,
    branchExists: false,
    pullRequestCount: 0,
  });
});

test("unmerged closed PR is not treated as orphan evidence", async () => {
  await assert.rejects(
    () =>
      collectClaimRetirementEvidence("MD-ONE", claim(), {
        repository: "owner/repo",
        expectedBaseSha: BASE,
        token: "test-token",
        now: Date.parse("2026-09-28T00:00:00Z"),
        fetchImpl: fakeFetch([
          [
            "/pulls?",
            [
              {
                number: 123,
                state: "closed",
                merged_at: null,
                merge_commit_sha: null,
                head: { ref: "infra/example" },
                base: { ref: "main" },
              },
            ],
          ],
        ]),
      }),
    /CLAIM_RETIREMENT_NO_CANONICAL_EVIDENCE/u,
  );
});
