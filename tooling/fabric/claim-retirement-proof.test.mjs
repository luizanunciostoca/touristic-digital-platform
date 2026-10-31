import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
  githubJson,
  buildClaimRetirementProof,
  deriveExplicitRetirementRequest,
  validateExplicitRetirementTime,
  collectClaimRetirementEvidence,
  removedClaimIds,
  validateCandidateRetirementManifest,
  validateClaimRetirements,
  validateRetirementEvents,
  validateVoluntaryReleaseRequest,
  verifyVoluntaryRelease,
  voluntaryRetirementPayload,
} from "./claim-retirement-proof.mjs";
import { canonicalJson } from "../mdctl/changeset-v2.mjs";
import { runClaimCli } from "../mdctl/claim-lifecycle.mjs";
import {
  buildMergedRetirementProof,
  evaluateRetirementMergeGate,
} from "../mdctl/merge-gate.mjs";

const BASE = "a".repeat(40);
const MERGE = "b".repeat(40);

test("retirement CLI transport is explicit and performs bounded GitHub GET only", async () => {
  let calls = 0;
  const runCli = (command, args, options) => {
    calls++;
    assert.equal(command, "gh");
    assert.deepEqual(args, [
      "api",
      "--hostname",
      "github.com",
      "--method",
      "GET",
      "repos/owner/repo/pulls?state=all",
    ]);
    assert.equal(options.timeout, 30000);
    assert.equal(options.maxBuffer, 4 * 1024 * 1024);
    assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
    return '[{"number":1}]';
  };
  await assert.rejects(
    githubJson("/repos/owner/repo/pulls?state=all", {
      transport: undefined,
      runCli,
    }),
    /GITHUB_TOKEN_REQUIRED/u,
  );
  assert.equal(calls, 0);
  assert.deepEqual(
    await githubJson("/repos/owner/repo/pulls?state=all", {
      transport: "gh",
      runCli,
    }),
    [{ number: 1 }],
  );
  assert.equal(calls, 1);
});

test("retirement CLI rejects host redirection and suppresses command error details", async () => {
  for (const path of [
    "https://other.example/repos/o/r",
    "//other.example/repos/o/r",
    "--hostname=other.example",
    "/repos/o/r\n--method=POST",
  ]) {
    await assert.rejects(
      githubJson(path, {
        transport: "gh",
        runCli: () => assert.fail("must not invoke CLI"),
      }),
      /GITHUB_EVIDENCE_PATH_INVALID/u,
    );
  }
  for (const runCli of [
    () => {
      throw new Error("sensitive authentication detail");
    },
    () => "invalid JSON",
  ]) {
    await assert.rejects(
      githubJson("/repos/o/r/pulls", { transport: "gh", runCli }),
      (error) =>
        error.message === "GITHUB_CLI_EVIDENCE_REQUEST_FAILED" && !error.cause,
    );
  }
});

test("retirement token authentication stays authoritative and never retries with CLI", async () => {
  let calls = 0;
  await assert.rejects(
    githubJson("/repos/o/r/pulls", {
      token: "fixture-token",
      transport: "gh",
      runCli: () => {
        calls++;
      },
      fetchImpl: async (_url, options) => {
        assert.equal(options.headers.Authorization, "Bearer fixture-token");
        assert.equal(options.redirect, "error");
        return { ok: false };
      },
    }),
    /GITHUB_EVIDENCE_REQUEST_FAILED/u,
  );
  assert.equal(calls, 0);
});

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
    if (patch.source)
      writeFileSync(join(candidateRoot, "README.md"), "unauthorized source\n");
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
        now: patch.now ?? EXPLICIT_NOW,
        clock: () => patch.now ?? EXPLICIT_NOW,
        fetchImpl:
          patch.fetchImpl ??
          (async () => {
            throw new Error("UNEXPECTED_PROVIDER_CALL");
          }),
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
  const verified = voluntaryFixture("IMPLEMENTING", {
    claim: canonicalRegistry.claims["MD-ONE"],
    manifest: canonicalManifest,
    baseSha: expectedBaseSha,
    branch: "infra/retire",
  });
  const evidence = await verified.collect();
  const voluntaryPatch = {
    now: verified.context.now,
    fetchImpl: verified.fetchImpl,
    event: {
      observedAt: evidence.observedAt,
      payload: voluntaryRetirementPayload(evidence),
    },
  };
  const proof = await verify(voluntaryPatch);
  const env = {
    EXPECTED_BASE_SHA: expectedBaseSha,
    EXPECTED_CANDIDATE_SHA: proof.exactHead,
  };
  assert.equal(
    (
      await buildMergedRetirementProof(trustedRoot, candidateRoot, env, {
        now: verified.context.now,
        proofBuilder: async () => proof,
      })
    ).retirements[0].reason,
    "VOLUNTARY",
  );
  const actualDiff = git(
    candidateRoot,
    "diff",
    "--numstat",
    expectedBaseSha,
    proof.exactHead,
  )
    .split("\n")
    .map((line) => line.split("\t"));
  const gateContext = {
    manifest: JSON.parse(readFileSync(join(candidateRoot, paths.manifest))),
    canonicalManifest,
    claimId: "MD-ONE",
    branch: "infra/retire",
    baseSha: expectedBaseSha,
    headSha: proof.exactHead,
    authorizationPaths: actualDiff.map((line) => line[2]),
    changedFileCount: actualDiff.length,
    changedLines: actualDiff.reduce(
      (sum, line) => sum + Number(line[0]) + Number(line[1]),
      0,
    ),
    unresolvedReviewThreads: 0,
    retirementProof: proof,
  };
  assert.equal(
    evaluateRetirementMergeGate(gateContext).decision,
    "POLICY_SATISFIED",
  );
  assert.throws(
    () =>
      evaluateRetirementMergeGate({
        ...gateContext,
        retirementProof: { ...proof, exactHead: MERGE },
      }),
    /HEAD_MISMATCH/u,
  );
  for (const [event, pattern] of [
    [
      {
        ...voluntaryPatch.event,
        payload: {
          ...voluntaryPatch.event.payload,
          requestDigest: "f".repeat(64),
        },
      },
      /DIGEST|PAYLOAD/u,
    ],
    [
      { ...voluntaryPatch.event, observedAt: "2026-10-16T20:01:00.000Z" },
      /TIME|FUTURE/u,
    ],
    [
      {
        ...voluntaryPatch.event,
        payload: {
          ...voluntaryPatch.event.payload,
          ownerDecision: { ...evidence.ownerDecision, ownerId: 99 },
        },
      },
      /PAYLOAD/u,
    ],
  ])
    await assert.rejects(verify({ ...voluntaryPatch, event }), pattern);
  await assert.rejects(
    verify({ ...voluntaryPatch, source: true }),
    /EXACT_THREE_PATHS/u,
  );

  git(trustedRoot, "checkout", "-qb", "infra/retire");
  const decisionPath = join(directory, "decision.json");
  writeFileSync(decisionPath, JSON.stringify(verified.request));
  const args = [
    "retire",
    paths.manifest,
    "--base-sha",
    expectedBaseSha,
    "--reason",
    "VOLUNTARY",
    "--decision",
    decisionPath,
  ];
  const options = {
    root: trustedRoot,
    now: () => new Date(verified.context.now).toISOString(),
    repository: "owner/repo",
    token: "test-token",
    fetchImpl: verified.fetchImpl,
    prepareMutation: async () => ({ formattedFiles: [] }),
  };
  const originals = Object.values(paths).map((path) =>
    readFileSync(join(trustedRoot, path), "utf8"),
  );
  await assert.rejects(
    runClaimCli(args, {
      ...options,
      prepareMutation: () => {
        throw new Error("PREPARE_FAILURE");
      },
    }),
    /PREPARE_FAILURE/u,
  );
  assert.deepEqual(
    Object.values(paths).map((path) =>
      readFileSync(join(trustedRoot, path), "utf8"),
    ),
    originals,
  );
  for (const [kind, change, pattern] of [
    [
      "file",
      (root) => writeFileSync(join(root, paths.ledger), "concurrent edit\n"),
      /LOCAL_WORKTREE_CHANGED/u,
    ],
    [
      "head",
      (root) => git(root, "commit", "--allow-empty", "-qm", "concurrent"),
      /LOCAL_HEAD_CHANGED/u,
    ],
    [
      "branch",
      (root) => git(root, "checkout", "-qb", "concurrent"),
      /LOCAL_BRANCH_CHANGED/u,
    ],
  ]) {
    const root = join(directory, `race-${kind}`);
    git(directory, "clone", "-q", "--no-hardlinks", trustedRoot, root);
    configure(root);
    let reads = 0;
    await assert.rejects(
      runClaimCli(args, {
        ...options,
        root,
        fetchImpl: async (url, init) => {
          const response = await verified.fetchImpl(url, init);
          if (String(url).endsWith("/commits/main") && ++reads === 2)
            change(root);
          return response;
        },
      }),
      pattern,
    );
    const expected = [...originals];
    if (kind === "file") expected[1] = "concurrent edit\n";
    assert.deepEqual(
      Object.values(paths).map((path) =>
        readFileSync(join(root, path), "utf8"),
      ),
      expected,
    );
    if (kind === "head")
      assert.notEqual(git(root, "rev-parse", "HEAD"), expectedBaseSha);
    if (kind === "branch")
      assert.equal(git(root, "branch", "--show-current"), "concurrent");
  }
  await runClaimCli(args, options);
  const after = readFileSync(join(trustedRoot, paths.ledger), "utf8");
  assert.ok(after.startsWith(history));
  assert.deepEqual(
    after
      .slice(history.length)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).eventType),
    ["CLAIM_RELEASED"],
  );
  assert.equal(
    JSON.parse(readFileSync(join(trustedRoot, paths.manifest))).state,
    canonicalManifest.state,
  );
  assert.equal(
    JSON.parse(readFileSync(join(trustedRoot, paths.registry))).claims[
      "MD-ONE"
    ],
    undefined,
  );
  assert.deepEqual(
    JSON.parse(readFileSync(join(trustedRoot, paths.registry))).claims[
      "MD-SURVIVOR"
    ],
    canonicalRegistry.claims["MD-SURVIVOR"],
  );
  assert.throws(
    () =>
      validateVoluntaryReleaseRequest(verified.request, {
        ...verified.context,
        canonicalText: after,
      }),
    /NONCE_REPLAY/u,
  );
});

function ancestorResponse(sha) {
  return { status: "ahead", base_commit: { sha }, merge_base_commit: { sha } };
}

function backupRef(backup, sha = backup.commitSha) {
  return { ref: backup.ref, object: { type: "commit", sha } };
}

function preservedFile(path, blob, hash) {
  return {
    path,
    modeGit: "100644",
    status: "untracked",
    blobSha: blob.sha,
    sha256: hash(Buffer.from(blob.content, "base64")),
    bytes: blob.size,
    backupIndex: 0,
  };
}

function voluntaryFixture(state = "LOCAL_PROVEN", overrides = {}) {
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const digest = (value) => hash(canonicalJson(value));
  const blob = (text) => {
    const bytes = Buffer.from(text);
    const sha = createHash("sha1")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex");
    return {
      sha,
      encoding: "base64",
      size: bytes.length,
      content: bytes.toString("base64"),
    };
  };
  const now = Date.parse("2026-10-16T20:00:00.000Z"),
    repository = "owner/repo";
  const canonical =
    overrides.claim ??
    claim({
      paths: ["tooling/**", ".morro/changesets/MD-ONE.json"],
    });
  const canonicalManifest = overrides.manifest ?? {
    id: "MD-ONE",
    branch: canonical.branch,
    baseSha: canonical.baseSha,
    state,
  };
  const expectedBaseSha = overrides.baseSha ?? BASE;
  const writer = {
    writerId: "writer-1",
    executorIdentity: "executor",
    controllerIdentity: "controller",
    sessionId: "session",
    jobId: null,
    commandIds: ["command"],
    branch: canonical.branch,
    headSha: canonical.baseSha,
    treeSha: "c".repeat(40),
  };
  const facts = {
    writerId: writer.writerId,
    requestedAt: "2026-10-16T19:57:00.000Z",
    acknowledgedAt: "2026-10-16T19:57:10.000Z",
    drainedAt: "2026-10-16T19:57:20.000Z",
    terminalState: "STOPPED",
    pendingCommands: 0,
    pendingChildren: 0,
  };
  const receiptBlob = blob(
    JSON.stringify({ schemaVersion: 1, writer, receipt: facts }),
  );
  const fileBlob = blob("preserved untracked material\n");
  const backup = {
    writerId: writer.writerId,
    repository,
    ref: "refs/heads/backup-example",
    commitSha: MERGE,
    treeSha: "d".repeat(40),
  };
  const request = {
    schemaVersion: 1,
    reason: "VOLUNTARY",
    requestedReason: "VOLUNTARY",
    decisionNonce: "unique-nonce",
    repository,
    claimId: "MD-ONE",
    canonicalOwner: canonical.owner,
    executorIdentity: writer.executorIdentity,
    controllerIdentity: writer.controllerIdentity,
    exactBaseSha: expectedBaseSha,
    canonicalClaimDigest: digest(canonical),
    retirementBranch: overrides.branch ?? "infra/release",
    preservedMaterialState: state,
    expectedPaths: [
      ".github/morro-control/claims.json",
      ".github/morro-control/events.ndjson",
      ".morro/changesets/MD-ONE.json",
    ],
    transitionKind: "SINGLETON_RETIRE_NO_ACQUIRE",
    writerInventory: [writer],
    writerInventoryDigest: "",
    stopAckReceipts: [
      {
        ...facts,
        receiptRef: `https://api.github.com/repos/${repository}/git/blobs/${receiptBlob.sha}`,
        receiptSha256: hash(Buffer.from(receiptBlob.content, "base64")),
      },
    ],
    stopAckReceiptsDigest: "",
    wipInventory: [preservedFile("tooling/example.mjs", fileBlob, hash)],
    wipInventoryDigest: "",
    backupRefs: [backup],
    snapshotAt: "2026-10-16T19:58:00.000Z",
    anchorAcquisitionPr: 123,
    holdWritersStoppedUntilCanonicalRelease: true,
    completionClaimed: false,
    authorityModel: "OWNER_ATTESTED_CLOSED_WRITER_INVENTORY",
  };
  request.wipInventory.push(preservedFile("receipt.json", receiptBlob, hash));
  const routes = new Map();
  let comments;
  const refresh = () => {
    for (const key of ["writerInventory", "stopAckReceipts", "wipInventory"])
      request[key + "Digest"] = digest(request[key]);
    const body = `APPROVED_VOLUNTARY_RELEASE:MD-ONE:${digest(request)}:${request.decisionNonce}:${expectedBaseSha}`;
    const comment = {
      id: 7,
      body,
      user: { id: 1, login: "owner", type: "User" },
      author_association: "OWNER",
      performed_via_github_app: null,
      created_at: "2026-10-16T19:59:00Z",
      updated_at: "2026-10-16T19:59:00Z",
    };
    comments = [comment];
    routes.set("/issues/comments/7", structuredClone(comment));
  };
  refresh();
  routes.set(
    `/compare/${canonical.baseSha}...${MERGE}`,
    ancestorResponse(canonical.baseSha),
  );
  routes.set("/commits/main", { sha: expectedBaseSha });
  routes.set("", {
    full_name: repository,
    owner: { id: 1, login: "owner", type: "User" },
  });
  routes.set("/pulls/123", {
    number: 123,
    merged_at: "2026-10-15T00:00:00Z",
    merge_commit_sha: MERGE,
    head: { ref: canonical.branch, repo: { full_name: repository } },
    base: { ref: "main", repo: { full_name: repository } },
  });
  routes.set(`/compare/${MERGE}...${expectedBaseSha}`, ancestorResponse(MERGE));
  routes.set(
    `/contents/.github/morro-control/claims.json?ref=${MERGE}`,
    blob(JSON.stringify(registry({ "MD-ONE": canonical }))),
  );
  routes.set(
    `/contents/.morro/changesets/MD-ONE.json?ref=${MERGE}`,
    blob(JSON.stringify(canonicalManifest)),
  );
  routes.set("/git/ref/heads/backup-example", backupRef(backup));
  routes.set(`/git/commits/${MERGE}`, {
    sha: MERGE,
    tree: { sha: backup.treeSha },
  });
  routes.set(`/git/commits/${canonical.baseSha}`, {
    sha: canonical.baseSha,
    tree: { sha: writer.treeSha },
  });
  routes.set(`/git/trees/${writer.treeSha}?recursive=1`, {
    sha: writer.treeSha,
    truncated: false,
    tree: [],
  });
  routes.set(`/git/trees/${backup.treeSha}?recursive=1`, {
    sha: backup.treeSha,
    truncated: false,
    tree: [
      {
        path: "tooling/example.mjs",
        type: "blob",
        mode: "100644",
        sha: fileBlob.sha,
      },
    ],
  });
  routes.get(`/git/trees/${backup.treeSha}?recursive=1`).tree.push({
    path: "receipt.json",
    type: "blob",
    mode: "100644",
    sha: receiptBlob.sha,
  });
  for (const value of [fileBlob, receiptBlob])
    routes.set(`/git/blobs/${value.sha}`, value);
  const fetchImpl = async (url) => {
    const path = String(url).replace(
      "https://api.github.com/repos/owner/repo",
      "",
    );
    const value = routes.has(path)
      ? routes.get(path)
      : path.startsWith("/issues/123/comments?")
        ? comments
        : undefined;
    return new Response(
      JSON.stringify(
        (typeof value === "function" ? value() : value) ?? {
          message: "not mocked",
        },
      ),
      {
        status: value === undefined ? 404 : 200,
      },
    );
  };
  const context = {
    claimId: "MD-ONE",
    claim: canonical,
    canonicalManifest,
    expectedBaseSha,
    canonicalText: "",
    retirementBranch: request.retirementBranch,
    now,
  };
  const collect = (collectionOptions = {}) =>
    verifyVoluntaryRelease(request, {
      claimId: "MD-ONE",
      claim: canonical,
      ...context,
      repository,
      token: "fixture-token",
      fetchImpl,
      clock: () => now,
      ...collectionOptions,
    });
  return {
    request,
    context,
    collect,
    routes,
    refresh,
    fetchImpl,
    snapshot: routes.get(`/git/trees/${backup.treeSha}?recursive=1`),
    blob,
    hash,
    digest,
    get comments() {
      return comments;
    },
  };
}

test("explicit activation preserves both material states and exact authority envelopes", async () => {
  for (const state of ["IMPLEMENTING", "LOCAL_PROVEN"]) {
    const f = voluntaryFixture(state),
      evidence = await f.collect();
    assert.equal(evidence.reason, "VOLUNTARY");
    assert.equal(evidence.requestedReason, "VOLUNTARY");
    assert.equal(evidence.observedAt, new Date(f.context.now).toISOString());
    const candidate = {
      ...f.context.canonicalManifest,
      branch: f.request.retirementBranch,
    };
    assert.equal(
      validateCandidateRetirementManifest(candidate, { ...f.context, evidence })
        .state,
      state,
    );
    assert.equal(
      validateClaimRetirements({
        baseRegistry: registry({ "MD-ONE": f.context.claim }),
        candidateRegistry: registry({}),
        evidenceById: { "MD-ONE": evidence },
      }).retirements[0].reason,
      "VOLUNTARY",
    );
    assert.throws(
      () =>
        validateCandidateRetirementManifest(
          { ...candidate, state: "MERGED" },
          { ...f.context, evidence },
        ),
      /IMPLEMENTATION_STATE_INVALID/u,
    );
  }
});

test("VOLUNTARY schema rejects signed-field drift, extras, duplicate IDs and incomplete ACKs", () => {
  const mutations = [
    (r) => (r.extra = true),
    (r) => r.expectedPaths.reverse(),
    (r) => (r.canonicalOwner = "ALIAS"),
    (r) => (r.exactBaseSha = MERGE),
    (r) => (r.retirementBranch = "infra/other"),
    (r) => (r.preservedMaterialState = "MERGED"),
    (r) => (r.holdWritersStoppedUntilCanonicalRelease = false),
    (r) => (r.completionClaimed = true),
    (r) => (r.executorIdentity = "unlisted"),
    (r) => r.writerInventory.push(r.writerInventory[0]),
    (r) => (r.stopAckReceipts = []),
    (r) => (r.stopAckReceipts[0].pendingChildren = 1),
    (r) => (r.stopAckReceipts[0].terminalState = "ACTIVE"),
    (r) => (r.stopAckReceipts[0].receiptRef = "https://evil.invalid/blob"),
    (r) => (r.wipInventory[0].path = "../untracked"),
    (r) => (r.wipInventory[0].modeGit = "160000"),
    (r) => (r.wipInventory[0].bytes = -1),
    (r) => (r.wipInventory[0].backupIndex = 1),
    (r) => (r.writerInventory[0].headSha = "a".repeat(64)),
    (r) => delete r.backupRefs[0].writerId,
    (r) => (r.backupRefs[0].writerId = "unknown-writer"),
    (r) => (r.backupRefs[0].repository = "other/repo"),
    (r) => (r.backupRefs[0].ref = "refs/heads/../main"),
    (r) => (r.decisionNonce = "x".repeat(65536)),
  ];
  for (const mutate of mutations) {
    const f = voluntaryFixture();
    mutate(f.request);
    f.refresh();
    assert.throws(() => validateVoluntaryReleaseRequest(f.request, f.context));
  }
  const malformed = voluntaryFixture();
  malformed.context.claim.owner = malformed.request.canonicalOwner = "";
  malformed.request.canonicalClaimDigest = malformed.digest(
    malformed.context.claim,
  );
  assert.throws(() =>
    validateVoluntaryReleaseRequest(malformed.request, malformed.context),
  );
});

test("VOLUNTARY rejects future, unordered and stale drain/snapshot/consent clocks", async () => {
  for (const mutate of [
    (r) => (r.snapshotAt = "2026-10-16T20:01:00.000Z"),
    (r) => (r.snapshotAt = "2026-10-16T18:00:00.000Z"),
    (r) => (r.stopAckReceipts[0].acknowledgedAt = "2026-10-16T19:56:00.000Z"),
    (r) => (r.stopAckReceipts[0].drainedAt = "2026-10-16T19:59:00.000Z"),
  ]) {
    const f = voluntaryFixture();
    mutate(f.request);
    f.refresh();
    await assert.rejects(f.collect());
  }
  for (const created of [
    "2026-10-16T19:57:00.000Z",
    "2026-10-16T20:01:00.000Z",
  ]) {
    const f = voluntaryFixture();
    f.comments[0].created_at = created;
    f.comments[0].updated_at = created;
    await assert.rejects(f.collect());
  }
});

test("VOLUNTARY rejects missing, duplicate, edited, revoked and non-owner consent", async () => {
  const mutations = [
    (f) => f.comments.splice(0),
    (f) => f.comments.push(structuredClone(f.comments[0])),
    (f) => (f.comments[0].updated_at = "2026-10-16T19:59:01.000Z"),
    (f) =>
      f.comments.push({
        ...f.comments[0],
        id: 8,
        body: f.comments[0].body.replace("APPROVED", "REVOKED"),
      }),
    (f) => (f.comments[0].user.type = "Bot"),
    (f) => (f.comments[0].user.id = 2),
    (f) => (f.comments[0].author_association = "MEMBER"),
    (f) => (f.comments[0].performed_via_github_app = { id: 1 }),
    (f) => f.routes.delete("/issues/comments/7"),
    (f) =>
      f.routes.set("/issues/comments/7", {
        ...f.comments[0],
        body: "edited",
      }),
  ];
  for (const mutate of mutations) {
    const f = voluntaryFixture();
    mutate(f);
    await assert.rejects(f.collect());
  }
});

test("VOLUNTARY rejects anchor, backup, raw object and durable receipt corruption", async () => {
  const mutations = [
    (f) => (f.routes.get("").owner.type = "Organization"),
    (f) => (f.routes.get("/pulls/123").head.ref = "wrong"),
    (f) => (f.routes.get(`/compare/${MERGE}...${BASE}`).status = "behind"),
    (f) => (f.routes.get("/git/ref/heads/backup-example").object.sha = BASE),
    (f) => (f.routes.get("/git/ref/heads/backup-example").object.type = "tag"),
    (f) => (f.routes.get(`/compare/${BASE}...${MERGE}`).status = "behind"),
    (f) => (f.routes.get(`/git/commits/${MERGE}`).tree.sha = BASE),
    (f) => (f.snapshot.truncated = true),
    (f) => (f.snapshot.tree = []),
    (f) => (f.snapshot.tree[0].mode = "100755"),
    (f) =>
      (f.routes.get(`/git/blobs/${f.request.wipInventory[0].blobSha}`).content =
        Buffer.from("corrupt").toString("base64")),
    (f) => (f.request.stopAckReceipts[0].receiptSha256 = "f".repeat(64)),
    (f) => {
      const receipt = f.request.stopAckReceipts[0];
      const sha = receipt.receiptRef.split("/").at(-1);
      f.routes.delete(`/git/blobs/${sha}`);
    },
  ];
  for (const mutate of mutations) {
    const f = voluntaryFixture();
    mutate(f);
    f.refresh();
    await assert.rejects(f.collect());
  }
});

test("VOLUNTARY inventory covers both delta legs including reverted edits and deleted tombstones", async () => {
  const extra = {
    path: "tooling/omitted.mjs",
    type: "blob",
    mode: "100644",
    sha: "2".repeat(40),
  };
  for (const leg of ["snapshot", "writer-reverted"]) {
    const f = voluntaryFixture();
    const snapshot = f.snapshot;
    if (leg === "snapshot") snapshot.tree.push(extra);
    else {
      const writer = f.request.writerInventory[0];
      writer.headSha = "f".repeat(40);
      writer.treeSha = "1".repeat(40);
      f.routes.set(
        `/compare/${writer.headSha}...${MERGE}`,
        ancestorResponse(writer.headSha),
      );
      f.routes.get(`/git/trees/${"c".repeat(40)}?recursive=1`).tree.push(extra);
      snapshot.tree.push(extra);
      f.routes.set(`/git/commits/${writer.headSha}`, {
        sha: writer.headSha,
        tree: { sha: writer.treeSha },
      });
      f.routes.set(`/git/trees/${writer.treeSha}?recursive=1`, {
        sha: writer.treeSha,
        truncated: false,
        tree: [{ ...extra, sha: "3".repeat(40) }],
      });
    }
    f.refresh();
    await assert.rejects(f.collect(), /VOLUNTARY_WIP_PATH_OMITTED/u);
  }
  const f = voluntaryFixture();
  f.routes.get(`/git/trees/${"c".repeat(40)}?recursive=1`).tree.push(extra);
  const tombstone = {
    path: extra.path,
    status: "deleted",
    modeGit: null,
    blobSha: null,
    sha256: null,
    bytes: 0,
    backupIndex: 0,
  };
  f.request.wipInventory.push(tombstone);
  f.refresh();
  assert.equal((await f.collect()).reason, "VOLUNTARY");
  tombstone.path = "tooling/never-existed.mjs";
  f.refresh();
  await assert.rejects(f.collect());
});

test("activation is explicit only and event reconstruction rejects replay or drift", async () => {
  const f = voluntaryFixture();
  const options = {
    ...f.context,
    repository: f.request.repository,
    requestedReason: "VOLUNTARY",
    decisionRequest: f.request,
    token: "fixture-token",
    fetchImpl: f.fetchImpl,
    clock: () => f.context.now,
  };
  const evidence = await collectClaimRetirementEvidence(
    "MD-ONE",
    f.context.claim,
    options,
  );
  for (const requestedReason of [undefined, "EXPIRED"])
    await assert.rejects(
      collectClaimRetirementEvidence("MD-ONE", f.context.claim, {
        ...options,
        requestedReason,
      }),
      /REQUEST_WITHOUT_REASON/u,
    );
  const event = ledgerEvent("CLAIM_RELEASED", {
    sourceSha: BASE,
    observedAt: evidence.observedAt,
    payloadVersion: 1,
    payload: voluntaryRetirementPayload(evidence),
  });
  const candidateText = ledger([event]);
  assert.equal(
    deriveExplicitRetirementRequest({ ...f.context, candidateText }),
    "VOLUNTARY",
  );
  validateRetirementEvents({
    ...f.context,
    candidateText,
    evidence,
    requestedReason: "VOLUNTARY",
  });
  for (const patch of [
    { eventType: "MERGED" },
    { actor: "SELF" },
    { sourceSha: MERGE },
    { payload: { ...event.payload, requestDigest: "f".repeat(64) } },
  ])
    assert.throws(() =>
      validateRetirementEvents({
        ...f.context,
        candidateText: ledger([{ ...event, ...patch }]),
        evidence,
        requestedReason: "VOLUNTARY",
      }),
    );
  assert.throws(() =>
    deriveExplicitRetirementRequest({
      ...f.context,
      candidateText: candidateText + candidateText,
    }),
  );
  assert.throws(
    () =>
      validateVoluntaryReleaseRequest(f.request, {
        ...f.context,
        canonicalText: candidateText,
      }),
    /NONCE_REPLAY/u,
  );
  await assert.rejects(
    collectClaimRetirementEvidence("MD-ONE", f.context.claim, {
      ...options,
      canonicalText: candidateText,
    }),
    /NONCE_REPLAY/u,
  );
});

test("VOLUNTARY never freshens an overlong provider collection by stamping its end", async () => {
  const f = voluntaryFixture();
  let step = 0;
  await assert.rejects(
    f.collect({ clock: () => f.context.now + step++ * 30000 }),
    /VOLUNTARY_PROVIDER_OBSERVATION_STALE/u,
  );
});

test("read-only verification binds live main twice and anchors durable receipt bytes", async () => {
  for (const late of [false, true]) {
    const f = voluntaryFixture();
    let reads = 0;
    f.routes.set("/commits/main", () => ({
      sha: !late || reads++ ? MERGE : BASE,
    }));
    await assert.rejects(f.collect(), /VOLUNTARY_MAIN_CHANGED/u);
  }
  const f = voluntaryFixture();
  f.request.wipInventory = f.request.wipInventory.filter(
    (file) => file.path !== "receipt.json",
  );
  f.refresh();
  await assert.rejects(f.collect(), /VOLUNTARY_RECEIPT_NOT_DURABLY_BACKED/u);
});

function replaceReceipt(f, bytes) {
  const value = f.blob(bytes),
    receipt = f.request.stopAckReceipts[0];
  receipt.receiptRef = `https://api.github.com/repos/owner/repo/git/blobs/${value.sha}`;
  receipt.receiptSha256 = f.hash(Buffer.from(value.content, "base64"));
  Object.assign(
    f.request.wipInventory.find((file) => file.path === "receipt.json"),
    preservedFile("receipt.json", value, f.hash),
  );
  f.snapshot.tree.find((file) => file.path === "receipt.json").sha = value.sha;
  f.routes.set(`/git/blobs/${value.sha}`, value);
  f.refresh();
}

test("verification snapshots caller inputs and returns immutable owner-bound evidence", async () => {
  for (const phase of ["last-main", "backup"]) {
    const f = voluntaryFixture(),
      nonce = f.request.decisionNonce;
    const path =
      phase === "last-main"
        ? "/commits/main"
        : `/git/trees/${"d".repeat(40)}?recursive=1`;
    const value = f.routes.get(path);
    let reads = 0;
    f.routes.set(path, () => {
      if (phase === "backup" || ++reads === 2) {
        f.request.decisionNonce = "caller-mutated";
        f.context.claim.owner = "OTHER";
        f.context.claim.paths = [];
        f.context.canonicalManifest.state = "MERGED";
      }
      return value;
    });
    const evidence = await f.collect();
    assert.equal(evidence.decisionRequest.decisionNonce, nonce);
    assert.equal(evidence.requestDigest, f.digest(evidence.decisionRequest));
    assert.equal(
      evidence.ownerDecision.bodySha256,
      f.hash(
        `APPROVED_VOLUNTARY_RELEASE:MD-ONE:${evidence.requestDigest}:${nonce}:${BASE}`,
      ),
    );
    f.request.wipInventory[0].path = "after-return";
    assert.notEqual(
      evidence.decisionRequest.wipInventory[0].path,
      "after-return",
    );
    assert.throws(() => {
      evidence.decisionRequest.decisionNonce = "mutation";
    }, TypeError);
  }
});

test("provider pagination, late revocation and ref rereads fail closed", async () => {
  const page = (n) => `/issues/123/comments?per_page=100&page=${n}`;
  const filler = Array.from({ length: 100 }, (_, id) => ({
    id: 100 + id,
    body: "unrelated",
  }));
  const complete = voluntaryFixture();
  complete.routes.set(page(1), filler);
  complete.routes.set(page(2), complete.comments);
  assert.equal((await complete.collect()).reason, "VOLUNTARY");
  const limited = voluntaryFixture();
  for (let n = 1; n <= 10; n++) limited.routes.set(page(n), filler);
  await assert.rejects(
    limited.collect(),
    /VOLUNTARY_COMMENT_PAGINATION_LIMIT/u,
  );
  const revoked = voluntaryFixture();
  let reads = 0;
  revoked.routes.set(page(1), () =>
    ++reads === 1
      ? revoked.comments
      : [
          ...revoked.comments,
          {
            ...revoked.comments[0],
            id: 8,
            body: revoked.comments[0].body.replace("APPROVED", "REVOKED"),
          },
        ],
  );
  await assert.rejects(revoked.collect(), /VOLUNTARY_OWNER_REVOKED/u);
  const moved = voluntaryFixture();
  reads = 0;
  moved.routes.set("/git/ref/heads/backup-example", () =>
    backupRef(moved.request.backupRefs[0], reads++ ? BASE : MERGE),
  );
  await assert.rejects(moved.collect(), /VOLUNTARY_BACKUP_REF_MOVED/u);
});

test("receipt JSON rejects validly hashed wrong facts and malformed UTF8", async () => {
  for (const invalidUtf8 of [false, true]) {
    const f = voluntaryFixture();
    if (invalidUtf8) {
      f.request.executorIdentity = "bad\uFFFD";
      f.request.writerInventory[0].executorIdentity =
        f.request.executorIdentity;
    }
    const { receiptRef, receiptSha256, ...facts } =
      f.request.stopAckReceipts[0];
    const material = {
      schemaVersion: 1,
      writer: f.request.writerInventory[0],
      receipt: { ...facts, pendingChildren: invalidUtf8 ? 0 : 1 },
    };
    let bytes = Buffer.from(JSON.stringify(material));
    if (invalidUtf8) {
      const index = bytes.indexOf(Buffer.from("\uFFFD"));
      bytes = Buffer.concat([
        bytes.subarray(0, index),
        Buffer.from([255]),
        bytes.subarray(index + 3),
      ]);
    }
    replaceReceipt(f, bytes);
    await assert.rejects(
      f.collect(),
      invalidUtf8
        ? /encoded data was not valid/u
        : /VOLUNTARY_RECEIPT_FACTS_MISMATCH/u,
    );
  }
});

test("a receipt must be durably backed by its own writer snapshot", async () => {
  const f = voluntaryFixture(),
    parent = f.request.backupRefs[0];
  const writer = {
    ...f.request.writerInventory[0],
    writerId: "writer-2",
    sessionId: "session-2",
    executorIdentity: "executor-2",
    commandIds: ["command-2"],
  };
  const { receiptRef, receiptSha256, ...originalFacts } =
    f.request.stopAckReceipts[0];
  const facts = { ...originalFacts, writerId: writer.writerId };
  const bytes = f.blob(
    JSON.stringify({ schemaVersion: 1, writer, receipt: facts }),
  );
  const receipt = {
    ...facts,
    receiptRef: `https://api.github.com/repos/owner/repo/git/blobs/${bytes.sha}`,
    receiptSha256: f.hash(Buffer.from(bytes.content, "base64")),
  };
  const backup = {
    ...parent,
    writerId: writer.writerId,
    ref: "refs/heads/backup-2",
    commitSha: "f".repeat(40),
    treeSha: writer.treeSha,
  };
  f.request.writerInventory.push(writer);
  f.request.stopAckReceipts.push(receipt);
  f.request.backupRefs.push(backup);
  f.request.wipInventory.push(preservedFile("receipt-2.json", bytes, f.hash));
  f.routes.set("/git/ref/heads/backup-2", backupRef(backup));
  f.routes.set(`/git/commits/${backup.commitSha}`, {
    sha: backup.commitSha,
    tree: { sha: writer.treeSha },
  });
  f.routes.set(
    `/compare/${BASE}...${backup.commitSha}`,
    ancestorResponse(BASE),
  );
  f.routes.set(`/git/blobs/${bytes.sha}`, bytes);
  f.routes.get(`/git/trees/${parent.treeSha}?recursive=1`).tree.push({
    path: "receipt-2.json",
    type: "blob",
    mode: "100644",
    sha: bytes.sha,
  });
  f.refresh();
  await assert.rejects(f.collect(), /VOLUNTARY_RECEIPT_NOT_DURABLY_BACKED/u);
});

test("VOLUNTARY accepts only absent/null pin representation differences", async () => {
  for (const side of ["individual", "list", "both"]) {
    const f = voluntaryFixture();
    if (side !== "list") f.routes.get("/issues/comments/7").pin = null;
    if (side !== "individual") f.comments[0].pin = null;
    const before = structuredClone({
      list: f.comments[0],
      individual: f.routes.get("/issues/comments/7"),
    });
    const evidence = await f.collect();
    assert.equal(evidence.reason, "VOLUNTARY");
    assert.deepEqual(f.comments[0], before.list);
    assert.deepEqual(f.routes.get("/issues/comments/7"), before.individual);
  }
});

test("VOLUNTARY still rejects every other individual consent-field drift", async () => {
  const mutations = [
    (c) => (c.id = 8),
    (c) => (c.body += " edited"),
    (c) => (c.user.id = 2),
    (c) => (c.user.login = "other"),
    (c) => (c.user.type = "Bot"),
    (c) => (c.author_association = "MEMBER"),
    (c) => (c.performed_via_github_app = { id: 1 }),
    (c) => (c.created_at = "2026-10-16T19:59:01Z"),
    (c) => (c.updated_at = "2026-10-16T19:59:01Z"),
    (c) => (c.minimized = null),
    (c) => (c.unknown_metadata = null),
    (c) => delete c.performed_via_github_app,
  ];
  for (const mutate of mutations) {
    const f = voluntaryFixture();
    const current = f.routes.get("/issues/comments/7");
    current.pin = null;
    mutate(current);
    await assert.rejects(f.collect(), /VOLUNTARY_OWNER_COMMENT_CHANGED/u);
  }
});

test("VOLUNTARY rejects non-null pin differences in either endpoint", async () => {
  for (const value of [false, 0, "", {}, { id: 1 }]) {
    for (const side of ["individual", "list"]) {
      const f = voluntaryFixture();
      const current = f.routes.get("/issues/comments/7");
      if (side === "individual") current.pin = value;
      else {
        f.comments[0].pin = value;
        current.pin = null;
      }
      await assert.rejects(f.collect(), /VOLUNTARY_OWNER_COMMENT_CHANGED/u);
    }
  }
});

test("VOLUNTARY keeps second-list revocation, duplication and drift checks with pin asymmetry", async () => {
  const mutations = [
    (comments) => comments.splice(0),
    (comments) => comments.push(structuredClone(comments[0])),
    (comments) =>
      comments.push({
        ...comments[0],
        id: 8,
        body: comments[0].body.replace("APPROVED", "REVOKED"),
      }),
    (comments) => (comments[0].user.id = 2),
    (comments) => (comments[0].updated_at = "2026-10-16T19:59:01Z"),
    (comments) => (comments[0].unknown_metadata = null),
    (comments) => (comments[0].pin = { id: 1 }),
  ];
  for (const mutate of mutations) {
    const f = voluntaryFixture();
    f.routes.get("/issues/comments/7").pin = null;
    let reads = 0;
    f.routes.set("/issues/123/comments?per_page=100&page=1", () => {
      const comments = structuredClone(f.comments);
      if (++reads > 1) mutate(comments);
      return comments;
    });
    await assert.rejects(f.collect(), /VOLUNTARY_/u);
    assert.equal(reads, 2);
  }
});

test("VOLUNTARY accepts null pin representation drift on the final listing", async () => {
  const f = voluntaryFixture();
  f.routes.get("/issues/comments/7").pin = null;
  let reads = 0;
  f.routes.set("/issues/123/comments?per_page=100&page=1", () => {
    const comments = structuredClone(f.comments);
    if (++reads > 1) comments[0].pin = null;
    return comments;
  });
  assert.equal((await f.collect()).reason, "VOLUNTARY");
  assert.equal(reads, 2);
});
