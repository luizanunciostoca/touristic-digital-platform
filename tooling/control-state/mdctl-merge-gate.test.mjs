import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  countUnresolvedReviewThreads,
  diffEvidence,
  evaluateMergeGate,
} from "../mdctl/merge-gate.mjs";

const BASE = "b".repeat(40);
const HEAD = "c".repeat(40);
const OLD_BASE = "a".repeat(40);
const BRANCH = "feat/gated";
const OLD_BRANCH = "feat/previous";

function manifest(overrides = {}) {
  return {
    schemaVersion: 2,
    id: "MD-GATED",
    objective: "gated-objective",
    baseSha: BASE,
    branch: BRANCH,
    state: "LOCAL_PROVEN",
    risk: "high",
    scope: "PLATFORM",
    owns: {
      paths: [
        ".github/morro-control/claims.json",
        ".github/morro-control/events.ndjson",
        ".morro/changesets/MD-GATED.json",
        "tooling/mdctl/**",
        "tooling/control-state/mdctl-merge-gate.test.mjs",
      ],
      contracts: ["GATED-CONTRACT"],
    },
    reads: { contracts: [] },
    produces: { events: ["GATED_UPDATED"], routes: ["/gated"] },
    database: { tables: ["gated_records"] },
    auth: { capabilities: ["gated:write"] },
    dependencies: [],
    requiredEvidence: ["automated-independent-proof", "exact-head-identity"],
    requiredCapabilities: ["github:read"],
    contextPack: {
      maxBytes: 65536,
      include: ["changeset", "git-identity", "proof-plan"],
    },
    proof: {
      budget: { maxCommands: 1, maxSeconds: 60 },
      commands: [
        {
          id: "unit",
          argv: [
            "node",
            "--test",
            "tooling/control-state/mdctl-merge-gate.test.mjs",
          ],
          timeoutSeconds: 30,
        },
      ],
      requiredRemoteEvidence: [
        "automated-independent-proof",
        "exact-head-identity",
      ],
    },
    stopAt: "REMOTE_PROVEN",
    ...overrides,
  };
}

function claim(value, overrides = {}) {
  return {
    owner: "CHATGPT-PRO-CONTROL",
    reviewer: "AUTOMATED-INDEPENDENT-PROOF",
    branch: value.branch,
    baseSha: value.baseSha,
    paths: [...value.owns.paths],
    domains: ["control-plane"],
    risk: "P1",
    status: "LOCAL_PROVEN",
    expiresAt: "2099-01-01T00:00:00Z",
    ...overrides,
  };
}

function registries(candidate = manifest()) {
  const canonical = {
    ...manifest(),
    branch: OLD_BRANCH,
    baseSha: OLD_BASE,
  };
  return {
    canonicalManifest: canonical,
    canonicalRegistry: {
      registryAuthority: "ORCHESTRATOR",
      claims: {
        [canonical.id]: claim(canonical),
      },
    },
    registry: {
      registryAuthority: "ORCHESTRATOR",
      claims: {
        [candidate.id]: claim(candidate),
      },
    },
  };
}

function input(overrides = {}) {
  const candidate = overrides.manifest ?? manifest();
  const authority = registries(candidate);
  const extraLiveItems = overrides.liveItems ?? [];
  const { liveItems: _ignoredLiveItems, ...rest } = overrides;
  return {
    manifest: candidate,
    registry: authority.registry,
    canonicalManifest: authority.canonicalManifest,
    canonicalRegistry: authority.canonicalRegistry,
    branch: candidate.branch,
    baseSha: BASE,
    headSha: HEAD,
    authorizationPaths: [
      ".github/morro-control/claims.json",
      ".github/morro-control/events.ndjson",
      ".morro/changesets/MD-GATED.json",
      "tooling/mdctl/merge-gate.mjs",
      "tooling/control-state/mdctl-merge-gate.test.mjs",
    ],
    changedFileCount: 5,
    changedLines: 250,
    currentPrNumber: 10,
    liveItems: [
      {
        prNumber: 10,
        openPr: true,
        writerActive: true,
        headSha: HEAD,
        changeSet: candidate,
        invalid: null,
        trust: {
          trusted: true,
          authority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
        },
      },
      ...extraLiveItems,
    ],
    dependenciesSatisfied: true,
    unresolvedDependencies: [],
    unresolvedReviewThreads: 0,
    now: Date.parse("2026-10-01T17:00:00Z"),
    ancestor: () => true,
    ...rest,
  };
}

test("merge gate diff evidence authorizes both sides of a rename", () => {
  const root = mkdtempSync(join(tmpdir(), "morro-merge-gate-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Merge Gate Test"], {
      cwd: root,
    });
    execFileSync(
      "git",
      ["config", "user.email", "merge-gate@example.invalid"],
      {
        cwd: root,
      },
    );
    mkdirSync(join(root, "tooling", "old"), { recursive: true });
    writeFileSync(
      join(root, "tooling", "old", "file.mjs"),
      "export const x = 1;\n",
    );
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: root });
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();

    mkdirSync(join(root, "tooling", "mdctl"), { recursive: true });
    execFileSync(
      "git",
      ["mv", "tooling/old/file.mjs", "tooling/mdctl/file.mjs"],
      { cwd: root },
    );
    execFileSync("git", ["commit", "-qm", "rename"], { cwd: root });
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();

    const evidence = diffEvidence({
      candidateDir: root,
      baseSha,
      headSha,
    });
    assert.equal(evidence.changedFileCount, 1);
    assert.deepEqual(evidence.authorizationPaths.sort(), [
      "tooling/mdctl/file.mjs",
      "tooling/old/file.mjs",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("review-thread counter paginates and counts only unresolved threads", () => {
  let calls = 0;
  const count = countUnresolvedReviewThreads({
    repository: "example/repo",
    prNumber: 7,
    exec: (_file, args) => {
      calls += 1;
      const second = args.includes("cursor=next");
      return JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: second
                ? {
                    nodes: [{ isResolved: false }],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  }
                : {
                    nodes: [{ isResolved: false }, { isResolved: true }],
                    pageInfo: { hasNextPage: true, endCursor: "next" },
                  },
            },
          },
        },
      });
    },
  });
  assert.equal(count, 2);
  assert.equal(calls, 2);
});

test("merge gate accepts exact bounded collision-free trusted candidate", () => {
  const result = evaluateMergeGate(input());
  assert.equal(result.decision, "POLICY_SATISFIED");
  assert.equal(result.changeSetId, "MD-GATED");
  assert.equal(result.exactBaseSha, BASE);
  assert.equal(result.exactHeadSha, HEAD);
  assert.equal(result.unresolvedReviewThreads, 0);
});

test("merge gate rejects missing or untrusted current live candidate", () => {
  const missing = input();
  missing.liveItems = [{ prNumber: 11, openPr: true }];
  assert.throws(
    () => evaluateMergeGate(missing),
    /MERGE_GATE_LIVE_CANDIDATE_REQUIRED/u,
  );

  const value = input();
  value.liveItems[0].trust = {
    trusted: false,
    authority: "UNTRUSTED",
  };
  assert.throws(
    () => evaluateMergeGate(value),
    /MERGE_GATE_EXACT_HEAD_TRUST_REQUIRED/u,
  );
});

test("merge gate rejects unresolved review threads", () => {
  assert.throws(
    () => evaluateMergeGate(input({ unresolvedReviewThreads: 1 })),
    /MERGE_GATE_UNRESOLVED_REVIEW_THREADS/u,
  );
});

test("merge gate rejects unresolved dependencies", () => {
  assert.throws(
    () =>
      evaluateMergeGate(
        input({
          dependenciesSatisfied: false,
          unresolvedDependencies: ["MD-BASE"],
        }),
      ),
    /MERGE_GATE_DEPENDENCIES_UNRESOLVED/u,
  );
});

test("merge gate rejects exact-base mismatch", () => {
  const stale = manifest({ baseSha: OLD_BASE });
  const authority = registries(stale);
  assert.throws(
    () =>
      evaluateMergeGate(
        input({
          manifest: stale,
          registry: authority.registry,
          canonicalManifest: authority.canonicalManifest,
          canonicalRegistry: authority.canonicalRegistry,
        }),
      ),
    /MERGE_GATE_EXACT_BASE_MISMATCH/u,
  );
});

test("merge gate rejects hard size overflow", () => {
  assert.throws(
    () => evaluateMergeGate(input({ changedLines: 1501 })),
    /MERGE_GATE_HARD_LINE_LIMIT_EXCEEDED/u,
  );
  assert.throws(
    () => evaluateMergeGate(input({ changedFileCount: 31 })),
    /MERGE_GATE_HARD_FILE_LIMIT_EXCEEDED/u,
  );
});

test("merge gate rejects authority widening relative to canonical main", () => {
  const widened = manifest({
    auth: { capabilities: ["gated:write", "platform:admin"] },
  });
  const authority = registries(widened);
  assert.throws(
    () =>
      evaluateMergeGate(
        input({
          manifest: widened,
          registry: authority.registry,
          canonicalManifest: authority.canonicalManifest,
          canonicalRegistry: authority.canonicalRegistry,
        }),
      ),
    /CHANGESET_AUTHORITY_DIVERGED_FROM_MAIN/u,
  );
});

test("merge gate rejects semantic collision with another active writer", () => {
  const other = manifest({
    id: "MD-OTHER",
    branch: "feat/other",
    objective: "gated-objective",
    owns: { paths: ["other/**"], contracts: [] },
  });
  assert.throws(
    () =>
      evaluateMergeGate(
        input({
          liveItems: [
            {
              prNumber: 11,
              openPr: true,
              writerActive: true,
              headSha: "d".repeat(40),
              changeSet: other,
            },
          ],
        }),
      ),
    /MERGE_GATE_SEMANTIC_COLLISION/u,
  );
});

test("merge gate enforces global writer WIP including current candidate", () => {
  const others = [11, 12, 13].map((number) => ({
    prNumber: number,
    openPr: true,
    writerActive: true,
    headSha: String(number).padStart(40, "d").slice(0, 40),
    changeSet: manifest({
      id: "MD-" + number,
      branch: "feat/" + number,
      objective: "objective-" + number,
      owns: { paths: ["other/" + number + "/**"], contracts: [] },
      produces: { events: ["EVENT_" + number], routes: ["/r/" + number] },
      database: { tables: ["table_" + number] },
      auth: { capabilities: ["cap:" + number] },
    }),
  }));
  assert.throws(
    () => evaluateMergeGate(input({ liveItems: others })),
    /MERGE_GATE_GLOBAL_WIP_EXCEEDED/u,
  );
});

test("merge gate requires declared remote proof authorities", () => {
  const candidate = manifest({
    proof: {
      ...manifest().proof,
      requiredRemoteEvidence: ["exact-head-identity"],
    },
  });
  const authority = registries(candidate);
  assert.throws(
    () =>
      evaluateMergeGate(
        input({
          manifest: candidate,
          registry: authority.registry,
          canonicalManifest: authority.canonicalManifest,
          canonicalRegistry: authority.canonicalRegistry,
        }),
      ),
    /MERGE_GATE_REMOTE_EVIDENCE_REQUIRED:automated-independent-proof/u,
  );
});

test("merge gate rejects changed path outside claim and ChangeSet ownership", () => {
  assert.throws(
    () =>
      evaluateMergeGate(
        input({
          authorizationPaths: [
            ".github/morro-control/claims.json",
            "packages/outside/secret.mjs",
          ],
          changedFileCount: 2,
        }),
      ),
    /CLAIM_PATH_VIOLATION/u,
  );
});
