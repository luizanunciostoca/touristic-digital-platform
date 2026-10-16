import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  addedClaimIds,
  buildClaimRetirementProof,
  deriveExplicitRetirementRequest,
  validateExplicitRetirementTime,
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
            head: { ref: "infra/example", repo: { full_name: "owner/repo" } },
            base: { ref: "main", repo: { full_name: "owner/repo" } },
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
                head: {
                  ref: "infra/example",
                  repo: { full_name: "owner/repo" },
                },
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
                head: {
                  ref: "infra/example",
                  repo: { full_name: "owner/repo" },
                },
                base: { ref: "main", repo: { full_name: "owner/repo" } },
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
          head: { ref: "infra/example", repo: { full_name: "owner/repo" } },
          base: { ref: "main", repo: { full_name: "owner/repo" } },
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

test("material merge evidence rejects same-owner forks and missing repository identity", async () => {
  for (const override of [
    { head: { ref: "infra/example", repo: { full_name: "owner/fork" } } },
    { base: { ref: "main", repo: { full_name: "owner/other" } } },
    { head: { ref: "infra/example" } },
    { base: { ref: "main" } },
  ]) {
    const routes = mergedRoutes([
      { filename: "tooling/example.mjs", status: "modified" },
    ]);
    const material = { ...routes[0][1][0], ...override };
    const acquisition = {
      ...routes[0][1][0],
      number: 124,
      merged_at: "2026-09-28T00:00:00Z",
    };
    routes[0][1] = [acquisition, material];
    routes.push([
      "/pulls/124/files?",
      [{ filename: ".morro/changesets/MD-ONE.json", status: "added" }],
    ]);
    const observed = [];
    const fetchFixture = fakeFetch(routes);
    const evidence = await collectClaimRetirementEvidence(
      "MD-ONE",
      claim({ expiresAt: "2026-09-29T00:00:00Z" }),
      {
        repository: "owner/repo",
        expectedBaseSha: BASE,
        token: "test-token",
        now: Date.parse("2026-10-04T00:00:00Z"),
        fetchImpl: async (url) => {
          observed.push(String(url));
          return fetchFixture(url);
        },
      },
    );
    assert.equal(evidence.reason, "EXPIRED");
    assert.equal(evidence.prNumber, undefined);
    assert.equal(
      observed.some((url) => url.includes("/pulls/123/files?")),
      false,
    );
  }
});

test("foreign material PR cannot complete an active claim or shadow an older canonical merge", async () => {
  const routes = mergedRoutes([
    { filename: "tooling/example.mjs", status: "modified" },
  ]);
  const canonical = routes[0][1][0];
  const foreign = {
    ...canonical,
    number: 124,
    merged_at: "2026-09-28T00:00:00Z",
    head: { ref: "infra/example", repo: { full_name: "owner/fork" } },
  };
  const options = {
    repository: "owner/repo",
    expectedBaseSha: BASE,
    token: "test-token",
    now: Date.parse("2026-10-04T00:00:00Z"),
  };
  const active = claim({ expiresAt: "2099-01-01T00:00:00Z" });
  for (const value of [
    foreign,
    { ...canonical, head: { ref: "infra/example", repo: null } },
    { ...canonical, base: { ref: "main", repo: null } },
  ]) {
    routes[0][1] = [value];
    await assert.rejects(
      () =>
        collectClaimRetirementEvidence("MD-ONE", active, {
          ...options,
          fetchImpl: fakeFetch(routes),
        }),
      /CLAIM_RETIREMENT_NO_CANONICAL_EVIDENCE/u,
    );
  }
  routes[0][1] = [foreign, canonical];
  const evidence = await collectClaimRetirementEvidence("MD-ONE", active, {
    ...options,
    fetchImpl: fakeFetch(routes),
  });
  assert.equal(evidence.reason, "MERGED_PR");
  assert.equal(evidence.prNumber, canonical.number);
});

const EXPLICIT_TIME = "2026-10-05T06:22:00.000Z";
const EXPLICIT_NOW = Date.parse(EXPLICIT_TIME);
const explicitClaim = () => claim({ expiresAt: "2026-10-05T06:21:00.000Z" });
const explicitEvent = () =>
  ledgerEvent("CLAIM_RELEASED", {
    observedAt: EXPLICIT_TIME,
    payload: { reason: "EXPIRED", requestedReason: "EXPIRED" },
  });

function explicitRequestInput(event = explicitEvent()) {
  const canonicalText = ledger([ledgerEvent("CHANGESET_CREATED")]);
  return {
    canonicalText,
    candidateText: canonicalText + ledger([event]),
    claimId: "MD-ONE",
    expectedBaseSha: BASE,
    claim: explicitClaim(),
    now: EXPLICIT_NOW,
  };
}

test("explicit expired collection ignores prior merge as a competing basis, without altering automatic priority", async () => {
  const options = {
    repository: "owner/repo",
    expectedBaseSha: BASE,
    now: EXPLICIT_NOW,
    requestedReason: "EXPIRED",
    fetchImpl: async () => {
      throw new Error("UNEXPECTED_PROVIDER_CALL");
    },
  };
  const result = await collectClaimRetirementEvidence(
    "MD-ONE",
    explicitClaim(),
    options,
  );
  assert.equal(result.reason, "EXPIRED");
  assert.equal(result.branch, explicitClaim().branch);
  assert.equal(result.baseSha, BASE);
  for (const patch of [
    { expiresAt: "2099-01-01T00:00:00Z" },
    { expiresAt: "invalid" },
    { expiresAt: 123 },
  ]) {
    await assert.rejects(
      collectClaimRetirementEvidence("MD-ONE", claim(patch), options),
      /NOT_EXPIRED|EXPIRY_INVALID/u,
    );
  }
  for (const requestedReason of [null, "MERGED_PR", "ORPHANED", "expired"]) {
    await assert.rejects(
      collectClaimRetirementEvidence("MD-ONE", explicitClaim(), {
        ...options,
        requestedReason,
      }),
      /REQUEST_INVALID/u,
    );
  }
  const automatic = await collectClaimRetirementEvidence(
    "MD-ONE",
    explicitClaim(),
    {
      ...options,
      requestedReason: undefined,
      token: "test-token",
      fetchImpl: fakeFetch(
        mergedRoutes([{ filename: "tooling/example.mjs", status: "modified" }]),
      ),
    },
  );
  assert.equal(automatic.reason, "MERGED_PR");
});

test("explicit lease observation cannot become eligible retroactively or in the future", () => {
  validateExplicitRetirementTime({
    claim: explicitClaim(),
    observedAt: EXPLICIT_TIME,
    now: EXPLICIT_NOW,
  });
  for (const [observedAt, pattern] of [
    ["2026-10-05T06:20:00.000Z", /BEFORE_EXPIRY/u],
    ["2026-10-05T06:23:00.000Z", /IN_FUTURE/u],
    ["2026-10-05T06:22:00Z", /OBSERVATION_INVALID/u],
    ["invalid", /OBSERVATION_INVALID/u],
  ])
    assert.throws(
      () =>
        validateExplicitRetirementTime({
          claim: explicitClaim(),
          observedAt,
          now: EXPLICIT_NOW,
        }),
      pattern,
    );
  assert.throws(
    () =>
      validateExplicitRetirementTime({
        claim: explicitClaim(),
        observedAt: EXPLICIT_TIME,
        now: NaN,
      }),
    /NOW_INVALID/u,
  );
});

test("explicit intent is derived only from one exact lease-bound authority event", () => {
  assert.equal(
    deriveExplicitRetirementRequest(explicitRequestInput()),
    "EXPIRED",
  );
  const unmarked = explicitEvent();
  delete unmarked.payload.requestedReason;
  assert.equal(
    deriveExplicitRetirementRequest(explicitRequestInput(unmarked)),
    undefined,
  );
  for (const patch of [
    { entity: "MD-OTHER" },
    { actor: "WORKER" },
    { sourceSha: MERGE },
    { payloadVersion: 2 },
    { observedAt: "2026-10-05T06:20:00.000Z" },
    { observedAt: "2026-10-05T06:23:00.000Z" },
    { payload: { reason: "MERGED_PR", requestedReason: "EXPIRED" } },
    { payload: { reason: "ORPHANED", requestedReason: "EXPIRED" } },
    { payload: { reason: "EXPIRED", requestedReason: "ORPHANED" } },
    {
      payload: {
        reason: "EXPIRED",
        requestedReason: "EXPIRED",
        approved: true,
      },
    },
  ])
    assert.throws(
      () =>
        deriveExplicitRetirementRequest(
          explicitRequestInput({ ...explicitEvent(), ...patch }),
        ),
      /CLAIM_RETIREMENT_/u,
    );
  const input = explicitRequestInput();
  for (const suffix of [
    ledger([explicitEvent(), ledgerEvent("MERGED")]),
    ledger([explicitEvent(), explicitEvent()]),
  ]) {
    assert.throws(
      () =>
        deriveExplicitRetirementRequest({
          ...input,
          candidateText: input.canonicalText + suffix,
        }),
      /EVENT|CLAIM_RETIREMENT/u,
    );
  }
  assert.throws(
    () =>
      deriveExplicitRetirementRequest({
        ...input,
        candidateText: input.candidateText.replace(
          '"ORCHESTRATOR"',
          '"WORKER"',
        ),
      }),
    /HISTORY_MUTATED/u,
  );
  assert.throws(
    () =>
      validateRetirementEvents({ ...input, evidence: { reason: "EXPIRED" } }),
    /UNDECLARED_REQUEST/u,
  );
});

test("trusted proof independently rejects forged explicit operations against real clean Git identities", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "explicit-expiry-proof-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const trustedRoot = join(directory, "trusted"),
    candidateRoot = join(directory, "candidate");
  mkdirSync(trustedRoot);
  const git = (root, ...args) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const configure = (root) => {
    git(root, "config", "user.name", "Proof Fixture");
    git(root, "config", "user.email", "proof@example.test");
  };
  git(trustedRoot, "init", "-q", "-b", "main");
  configure(trustedRoot);
  writeFileSync(join(trustedRoot, "README.md"), "fixture\n");
  git(trustedRoot, "add", ".");
  git(trustedRoot, "commit", "-qm", "genesis");
  const claimBase = git(trustedRoot, "rev-parse", "HEAD");
  const canonicalManifest = {
    schemaVersion: 2,
    id: "MD-ONE",
    objective: "prove-explicit-expiry",
    baseSha: claimBase,
    branch: "infra/example",
    state: "IMPLEMENTING",
    risk: "high",
    scope: "PLATFORM",
    owns: { paths: ["tooling/example.mjs"], contracts: [] },
    reads: { contracts: [] },
    produces: { events: [], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
    dependencies: [],
    requiredEvidence: ["proof"],
    requiredCapabilities: ["github:read"],
    contextPack: {
      maxBytes: 65536,
      include: ["changeset", "git-identity", "proof-plan"],
    },
    proof: {
      budget: { maxCommands: 1, maxSeconds: 60 },
      commands: [
        {
          id: "proof",
          argv: ["node", "--test", "tooling/example.test.mjs"],
          timeoutSeconds: 30,
        },
      ],
      requiredRemoteEvidence: ["proof"],
    },
    stopAt: "REMOTE_PROVEN",
  };
  const paths = {
    registry: ".github/morro-control/claims.json",
    ledger: ".github/morro-control/events.ndjson",
    manifest: ".morro/changesets/MD-ONE.json",
  };
  mkdirSync(join(trustedRoot, ".github/morro-control"), { recursive: true });
  mkdirSync(join(trustedRoot, ".morro/changesets"), { recursive: true });
  const canonicalRegistry = registry({
    "MD-ONE": explicitClaim(),
    "MD-SURVIVOR": claim({ branch: "infra/survivor", paths: ["docs/**"] }),
  });
  canonicalRegistry.claims["MD-ONE"].baseSha = claimBase;
  const history = ledger([
    ledgerEvent("CHANGESET_CREATED", { sourceSha: claimBase }),
  ]);
  for (const [path, value] of [
    [paths.registry, canonicalRegistry],
    [paths.manifest, canonicalManifest],
  ])
    writeFileSync(join(trustedRoot, path), JSON.stringify(value) + "\n");
  writeFileSync(join(trustedRoot, paths.ledger), history);
  git(trustedRoot, "add", ".");
  git(trustedRoot, "commit", "-qm", "canonical claim");
  const expectedBaseSha = git(trustedRoot, "rev-parse", "HEAD");
  git(directory, "clone", "-q", "--no-hardlinks", trustedRoot, candidateRoot);
  configure(candidateRoot);
  git(candidateRoot, "checkout", "-qb", "infra/retire");
  let sequence = 0;
  const verify = async (patch = {}) => {
    const nextRegistry = structuredClone(canonicalRegistry);
    delete nextRegistry.claims["MD-ONE"];
    if (patch.survivor) nextRegistry.claims["MD-SURVIVOR"].owner = "OTHER";
    if (patch.addition) nextRegistry.claims["MD-ADDED"] = claim();
    const event = {
      ...explicitEvent(),
      sourceSha: expectedBaseSha,
      ...patch.event,
    };
    const nextManifest = {
      ...canonicalManifest,
      baseSha: expectedBaseSha,
      branch: "infra/retire",
      ...patch.manifest,
    };
    for (const [path, value] of [
      [paths.registry, nextRegistry],
      [paths.manifest, nextManifest],
    ])
      writeFileSync(join(candidateRoot, path), JSON.stringify(value) + "\n");
    writeFileSync(join(candidateRoot, paths.ledger), history + ledger([event]));
    git(candidateRoot, "add", ".");
    git(candidateRoot, "commit", "-qm", "operation " + ++sequence);
    return buildClaimRetirementProof(
      trustedRoot,
      candidateRoot,
      {
        EXPECTED_BASE_SHA: expectedBaseSha,
        EXPECTED_CANDIDATE_SHA: git(candidateRoot, "rev-parse", "HEAD"),
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_TOKEN: "test-token",
        REQUESTED_REASON: "EXPIRED",
      },
      {
        now: EXPLICIT_NOW,
        fetchImpl: async () => {
          throw new Error("UNEXPECTED_PROVIDER_CALL");
        },
      },
    );
  };
  const result = await verify();
  assert.equal(result.status, "pass");
  assert.equal(result.retirements[0].reason, "EXPIRED");
  for (const [patch, pattern] of [
    [{ event: { observedAt: "2026-10-05T06:20:00.000Z" } }, /BEFORE_EXPIRY/u],
    [{ event: { sourceSha: claimBase } }, /SOURCE_INVALID/u],
    [{ manifest: { state: "MERGED" } }, /IMPLEMENTATION_STATE_INVALID/u],
    [{ survivor: true }, /SURVIVING_CLAIM_MUTATION/u],
    [{ addition: true }, /CLAIM_ADDITION_FORBIDDEN/u],
    [
      { event: { payload: { reason: "EXPIRED" } } },
      /UNEXPECTED_PROVIDER_CALL/u,
    ],
  ])
    await assert.rejects(verify(patch), pattern);
});
