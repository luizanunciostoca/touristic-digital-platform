import assert from "node:assert/strict";
import test from "node:test";

import {
  addedClaimIds,
  collectClaimRetirementEvidence,
  removedClaimIds,
  validateCandidateRetirementManifest,
  validateClaimRetirements,
  validateRetirementEvents,
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

test("retirement rejects a transition with zero removals", () => {
  const base = registry({ "MD-ONE": claim() });
  const candidate = structuredClone(base);
  assert.deepEqual(removedClaimIds(base, candidate), []);
  assert.throws(
    () =>
      validateClaimRetirements({
        baseRegistry: base,
        candidateRegistry: candidate,
        now: Date.parse("2026-09-28T00:00:00Z"),
      }),
    /CLAIM_RETIREMENT_EXACTLY_ONE_REMOVAL_REQUIRED/u,
  );
});

test("retirement rejects a transition with multiple removals", () => {
  const base = registry({
    "MD-ONE": claim(),
    "MD-TWO": claim({ branch: "infra/two" }),
  });
  const candidate = registry({});
  assert.deepEqual(removedClaimIds(base, candidate), ["MD-ONE", "MD-TWO"]);
  assert.throws(
    () =>
      validateClaimRetirements({
        baseRegistry: base,
        candidateRegistry: candidate,
        evidenceById: {},
        now: Date.parse("2026-09-28T00:00:00Z"),
      }),
    /CLAIM_RETIREMENT_EXACTLY_ONE_REMOVAL_REQUIRED/u,
  );
});

test("retirement forbids adding any claim in the same transition", () => {
  const base = registry({ "MD-ONE": claim() });
  const candidate = registry({
    "MD-NEW": claim({ branch: "infra/new" }),
  });
  assert.deepEqual(addedClaimIds(base, candidate), ["MD-NEW"]);
  assert.throws(
    () =>
      validateClaimRetirements({
        baseRegistry: base,
        candidateRegistry: candidate,
        evidenceById: {},
        now: Date.parse("2026-09-28T00:00:00Z"),
      }),
    /CLAIM_ADDITION_FORBIDDEN_DURING_RETIREMENT/u,
  );
});

test("candidate retirement manifest binds state to evidence and exact base", () => {
  const valid = { id: "MD-ONE", state: "MERGED", baseSha: BASE };
  const options = {
    claimId: "MD-ONE",
    expectedBaseSha: BASE,
    canonicalManifest: valid,
    evidence: { reason: "MERGED_PR" },
  };
  assert.equal(
    validateCandidateRetirementManifest(valid, options).state,
    "MERGED",
  );
  assert.throws(
    () =>
      validateCandidateRetirementManifest(
        { ...valid, state: "LOCAL_PROVEN" },
        options,
      ),
    /CLAIM_RETIREMENT_IMPLEMENTATION_STATE_INVALID/u,
  );
  assert.throws(
    () =>
      validateCandidateRetirementManifest(
        { ...valid, baseSha: MERGE },
        options,
      ),
    /CLAIM_RETIREMENT_MANIFEST_BASE_MISMATCH/u,
  );
  assert.throws(
    () =>
      validateCandidateRetirementManifest({ ...valid, id: "MD-TWO" }, options),
    /CLAIM_RETIREMENT_MANIFEST_ID_MISMATCH/u,
  );
  assert.throws(
    () =>
      validateCandidateRetirementManifest(valid, {
        ...options,
        evidence: { reason: "CALLER_ASSERTED" },
      }),
    /CLAIM_RETIREMENT_REASON_INVALID/u,
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
    materialPaths: ["tooling/example.mjs"],
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
        "/pulls/123/files?",
        [{ filename: "tooling/example.mjs", status: "modified" }],
      ],
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
    materialPaths: ["tooling/example.mjs"],
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

test("PR targeting another base branch prevents orphan classification", async () => {
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
                number: 456,
                state: "closed",
                merged_at: null,
                merge_commit_sha: null,
                head: { ref: "infra/example" },
                base: { ref: "release-candidate" },
              },
            ],
          ],
        ]),
      }),
    /CLAIM_RETIREMENT_NO_CANONICAL_EVIDENCE/u,
  );
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

function mergedRoutes(files) {
  return [
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
    ["/pulls/123/files?", files],
    [
      "/compare/",
      {
        status: "ahead",
        base_commit: { sha: MERGE },
        merge_base_commit: { sha: MERGE },
      },
    ],
  ];
}

test("expired implemented claim uses material merge evidence before expiry fallback", async () => {
  const evidence = await collectClaimRetirementEvidence(
    "MD-ONE",
    claim({ expiresAt: "2026-09-27T00:00:00Z" }),
    {
      repository: "owner/repo",
      expectedBaseSha: BASE,
      token: "test-token",
      now: Date.parse("2026-09-28T00:00:00Z"),
      fetchImpl: fakeFetch(
        mergedRoutes([{ filename: "tooling/example.mjs", status: "modified" }]),
      ),
    },
  );
  assert.equal(evidence.reason, "MERGED_PR");
  assert.deepEqual(evidence.materialPaths, ["tooling/example.mjs"]);
});

test("acquisition-only merged PR cannot prove implementation", async () => {
  await assert.rejects(
    collectClaimRetirementEvidence(
      "MD-ONE",
      claim({
        paths: [
          "tooling/example.mjs",
          ".github/morro-control/claims.json",
          ".github/morro-control/events.ndjson",
          ".morro/changesets/MD-ONE.json",
        ],
      }),
      {
        repository: "owner/repo",
        expectedBaseSha: BASE,
        token: "test-token",
        now: Date.parse("2026-09-28T00:00:00Z"),
        fetchImpl: fakeFetch(
          mergedRoutes(
            [
              ".github/morro-control/claims.json",
              ".github/morro-control/events.ndjson",
              ".morro/changesets/MD-ONE.json",
            ].map((filename) => ({ filename, status: "modified" })),
          ),
        ),
      },
    ),
    /CLAIM_RETIREMENT_NO_CANONICAL_EVIDENCE/u,
  );
});

test("unfinished administrative release preserves canonical state", () => {
  const canonicalManifest = {
    id: "MD-ONE",
    state: "IMPLEMENTING",
    baseSha: MERGE,
    branch: "infra/example",
  };
  const candidate = {
    ...canonicalManifest,
    baseSha: BASE,
    branch: "infra/release",
  };
  assert.equal(
    validateCandidateRetirementManifest(candidate, {
      claimId: "MD-ONE",
      expectedBaseSha: BASE,
      canonicalManifest,
      evidence: { reason: "EXPIRED" },
    }).state,
    "IMPLEMENTING",
  );
});

test("expired acquisition-only claim releases without implementation evidence", async () => {
  const evidence = await collectClaimRetirementEvidence(
    "MD-ONE",
    claim({ expiresAt: "2026-09-27T00:00:00Z" }),
    {
      repository: "owner/repo",
      expectedBaseSha: BASE,
      token: "test-token",
      now: Date.parse("2026-09-28T00:00:00Z"),
      fetchImpl: fakeFetch(
        mergedRoutes([
          { filename: ".morro/changesets/MD-ONE.json", status: "added" },
        ]),
      ),
    },
  );
  assert.equal(evidence.reason, "EXPIRED");
  assert.equal(evidence.materialPaths, undefined);
});

test("unowned merge does not prove this claim while owned deletion does", async () => {
  const options = {
    repository: "owner/repo",
    expectedBaseSha: BASE,
    token: "test-token",
    now: Date.parse("2026-09-28T00:00:00Z"),
  };
  await assert.rejects(
    collectClaimRetirementEvidence("MD-ONE", claim(), {
      ...options,
      fetchImpl: fakeFetch(
        mergedRoutes([{ filename: "other/scope.mjs", status: "modified" }]),
      ),
    }),
    /CLAIM_RETIREMENT_NO_CANONICAL_EVIDENCE/u,
  );
  const evidence = await collectClaimRetirementEvidence("MD-ONE", claim(), {
    ...options,
    fetchImpl: fakeFetch(
      mergedRoutes([{ filename: "tooling/example.mjs", status: "removed" }]),
    ),
  });
  assert.equal(evidence.reason, "MERGED_PR");
});

test("material file pagination is complete and provider errors fail closed", async () => {
  const options = {
    repository: "owner/repo",
    expectedBaseSha: BASE,
    token: "test-token",
    now: Date.parse("2026-09-28T00:00:00Z"),
  };
  const routes = mergedRoutes([]);
  routes.splice(
    1,
    1,
    [
      "/files?per_page=100&page=1",
      Array.from({ length: 100 }, (_, i) => ({
        filename: "unowned/" + i,
        status: "modified",
      })),
    ],
    [
      "/files?per_page=100&page=2",
      [{ filename: "tooling/example.mjs", status: "modified" }],
    ],
  );
  assert.equal(
    (
      await collectClaimRetirementEvidence("MD-ONE", claim(), {
        ...options,
        fetchImpl: fakeFetch(routes),
      })
    ).reason,
    "MERGED_PR",
  );
  await assert.rejects(
    collectClaimRetirementEvidence(
      "MD-ONE",
      claim({ expiresAt: "2026-09-27T00:00:00Z" }),
      {
        ...options,
        fetchImpl: async () => new Response("unavailable", { status: 503 }),
      },
    ),
    /GITHUB_EVIDENCE_REQUEST_FAILED/u,
  );
});

test("administrative release cannot alter implementation state or authority", () => {
  for (const reason of ["EXPIRED", "ORPHANED"]) {
    const canonicalManifest = {
      id: "MD-ONE",
      state: "IMPLEMENTING",
      baseSha: MERGE,
      branch: "infra/example",
      owns: { paths: ["tooling/example.mjs"] },
    };
    const candidate = {
      ...canonicalManifest,
      baseSha: BASE,
      branch: "infra/release",
    };
    const options = {
      claimId: "MD-ONE",
      expectedBaseSha: BASE,
      canonicalManifest,
      evidence: { reason },
    };
    assert.equal(
      validateCandidateRetirementManifest(candidate, options).state,
      "IMPLEMENTING",
    );
    assert.throws(
      () =>
        validateCandidateRetirementManifest(
          { ...candidate, state: "MERGED" },
          options,
        ),
      /CLAIM_RETIREMENT_IMPLEMENTATION_STATE_INVALID/u,
    );
    assert.throws(
      () =>
        validateCandidateRetirementManifest(
          { ...candidate, owns: { paths: ["**"] } },
          options,
        ),
      /CLAIM_RETIREMENT_AUTHORITY_DIVERGED/u,
    );
  }
});

function ledgerEvent(type, overrides = {}) {
  return {
    schemaVersion: 1,
    eventId: "evt-proof-" + type.toLowerCase(),
    eventType: type,
    observedAt: "2026-09-28T00:00:00Z",
    actor: "ORCHESTRATOR",
    entity: "MD-ONE",
    sourceSha: BASE,
    payloadVersion: 1,
    payload: { reason: "EXPIRED" },
    ...overrides,
  };
}
const ledger = (events) =>
  events.map((event) => JSON.stringify(event) + "\n").join("");

test("unfinished retirement ledger permits release but cannot fabricate MERGED", () => {
  const history = ledger([ledgerEvent("CHANGESET_CREATED")]);
  const released = ledgerEvent("CLAIM_RELEASED");
  const input = {
    canonicalText: history,
    candidateText: history + ledger([released]),
    claimId: "MD-ONE",
    expectedBaseSha: BASE,
    evidence: { reason: "EXPIRED" },
  };
  assert.equal(validateRetirementEvents(input).length, 1);
  assert.throws(
    () =>
      validateRetirementEvents({
        ...input,
        candidateText: history + ledger([ledgerEvent("MERGED"), released]),
      }),
    /CLAIM_RETIREMENT_EVENT_TYPES_INVALID/u,
  );
  assert.throws(
    () =>
      validateRetirementEvents({
        ...input,
        candidateText: ledger([
          { ...ledgerEvent("CHANGESET_CREATED"), actor: "OTHER" },
          released,
        ]),
      }),
    /CLAIM_RETIREMENT_LEDGER_HISTORY_MUTATED/u,
  );
  for (const [patch, error] of [
    [{ entity: "MD-OTHER" }, /CLAIM_RETIREMENT_EVENT_ENTITY_INVALID/u],
    [{ actor: "WORKER" }, /CLAIM_RETIREMENT_EVENT_ACTOR_INVALID/u],
    [{ sourceSha: MERGE }, /CLAIM_RETIREMENT_EVENT_SOURCE_INVALID/u],
    [
      { payload: { reason: "ORPHANED" } },
      /CLAIM_RETIREMENT_EVENT_REASON_INVALID/u,
    ],
  ])
    assert.throws(
      () =>
        validateRetirementEvents({
          ...input,
          candidateText: history + ledger([{ ...released, ...patch }]),
        }),
      error,
    );
});

test("material retirement ledger binds completion and release to the actual merged PR", () => {
  const evidence = { reason: "MERGED_PR", mergeSha: MERGE, prNumber: 123 };
  const events = ["MERGED", "CLAIM_RELEASED"].map((type) =>
    ledgerEvent(type, {
      sourceSha: MERGE,
      payload: { pullRequest: 123, mergeSha: MERGE },
    }),
  );
  const input = {
    canonicalText: "",
    candidateText: ledger(events),
    claimId: "MD-ONE",
    expectedBaseSha: BASE,
    evidence,
  };
  assert.equal(validateRetirementEvents(input).length, 2);
  assert.throws(
    () =>
      validateRetirementEvents({
        ...input,
        candidateText: ledger([events[1]]),
      }),
    /CLAIM_RETIREMENT_EVENT_TYPES_INVALID/u,
  );
  events[1].payload.pullRequest = 999;
  assert.throws(
    () => validateRetirementEvents({ ...input, candidateText: ledger(events) }),
    /CLAIM_RETIREMENT_EVENT_PR_INVALID/u,
  );
});
