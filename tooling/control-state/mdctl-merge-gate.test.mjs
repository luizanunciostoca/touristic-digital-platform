import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  addedClaimIds,
  assertAcquisitionClaimKeyset,
  assertRetirementClaimKeyset,
  buildMergedRetirementProof,
  countUnresolvedReviewThreads,
  diffEvidence,
  evaluateClaimAcquisitionMergeGate,
  evaluateMergeGate,
  evaluateRetirementMergeGate,
  runMergeGate,
} from "../mdctl/merge-gate.mjs";

const BASE = "b".repeat(40);
const HEAD = "c".repeat(40);
const OLD_BASE = "a".repeat(40);
const BRANCH = "feat/gated";
const OLD_BRANCH = "feat/previous";

test("merge-gate workflow shares the required context across PR and merge-group events", () => {
  const source = readFileSync(
    join(process.cwd(), ".github/workflows/morro-merge-gate.yml"),
    "utf8",
  );

  assert.match(source, /^  pull_request:$/mu);
  assert.match(source, /^  merge_group:$/mu);
  assert.equal(
    [...source.matchAll(/^    name: morro\/merge-gate$/gmu)].length,
    1,
  );
  assert.doesNotMatch(source, /morro\/merge-group-gate/u);

  const prSteps = [
    "Reject fork candidates",
    "Checkout trusted base",
    "Checkout candidate as data",
    "Setup Node for PR policy",
    "Detect canonical claim retirement",
    "Run trusted merge-gate policy",
  ];
  for (const name of prSteps) {
    assert.ok(
      source.includes(
        `      - name: ${name}\n        if: github.event_name == 'pull_request'\n`,
      ),
      "PR_STEP_GUARD_MISSING:" + name,
    );
  }
  assert.ok(
    source.includes(
      "      - name: Wait for exact-head Trusted Claim Guard\n" +
        "        if: github.event_name == 'pull_request' && steps.retirement.outputs.eligible != 'true'\n",
    ),
    "RETIREMENT_BOOTSTRAP_GUARD_MISSING",
  );
  assert.ok(
    source.includes(
      "      - name: Upload PR merge-gate decision\n" +
        "        if: always() && github.event_name == 'pull_request'\n",
    ),
    "PR_UPLOAD_GUARD_MISSING",
  );

  for (const name of [
    "Checkout merge group",
    "Require current main ancestry",
  ]) {
    assert.ok(
      source.includes(
        `      - name: ${name}\n        if: github.event_name == 'merge_group'\n`,
      ),
      "MERGE_GROUP_STEP_GUARD_MISSING:" + name,
    );
  }
  assert.ok(
    source.includes(
      "      - name: Upload merge-group decision\n" +
        "        if: always() && github.event_name == 'merge_group'\n",
    ),
    "MERGE_GROUP_UPLOAD_GUARD_MISSING",
  );
});

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

function acquisitionInput(overrides = {}) {
  const candidate =
    overrides.manifest ??
    manifest({
      state: "IMPLEMENTING",
      baseSha: BASE,
      branch: BRANCH,
    });
  const currentClaim = claim(candidate, { status: "IMPLEMENTING" });
  const registry = overrides.registry ?? {
    registryAuthority: "ORCHESTRATOR",
    claims: { [candidate.id]: currentClaim },
  };
  const canonicalRegistry = overrides.canonicalRegistry ?? {
    registryAuthority: "ORCHESTRATOR",
    claims: {},
  };
  const canonicalEvents = overrides.canonicalEvents ?? [
    {
      schemaVersion: 1,
      eventId: "evt-canonical-existing",
      eventType: "MERGED",
      observedAt: "2026-10-01T16:59:00Z",
      actor: "ORCHESTRATOR",
      entity: "MD-SYSTEM",
      sourceSha: OLD_BASE,
      payloadVersion: 1,
      payload: { reason: "fixture" },
    },
  ];
  const events = overrides.events ?? [
    ...structuredClone(canonicalEvents),
    {
      schemaVersion: 1,
      eventId: "evt-acquisition-created",
      eventType: "CHANGESET_CREATED",
      observedAt: "2026-10-01T17:00:00Z",
      actor: "ORCHESTRATOR",
      entity: candidate.id,
      sourceSha: BASE,
      payloadVersion: 1,
      payload: {
        branch: BRANCH,
        objective: candidate.objective,
      },
    },
    {
      schemaVersion: 1,
      eventId: "evt-acquisition-claim",
      eventType: "CLAIM_ACQUIRED",
      observedAt: "2026-10-01T17:00:00Z",
      actor: "ORCHESTRATOR",
      entity: candidate.id,
      sourceSha: BASE,
      payloadVersion: 1,
      payload: {
        branch: BRANCH,
        expiresAt: currentClaim.expiresAt,
        risk: currentClaim.risk,
      },
    },
  ];
  const extraLiveItems = overrides.liveItems ?? [];
  const {
    registry: _registry,
    canonicalRegistry: _canonicalRegistry,
    canonicalEvents: _canonicalEvents,
    events: _events,
    liveItems: _liveItems,
    ...rest
  } = overrides;
  return {
    manifest: candidate,
    registry,
    canonicalRegistry,
    claimId: candidate.id,
    canonicalEvents,
    events,
    branch: BRANCH,
    baseSha: BASE,
    headSha: HEAD,
    authorizationPaths: [
      ".github/morro-control/claims.json",
      ".github/morro-control/events.ndjson",
      ".morro/changesets/MD-GATED.json",
    ],
    changedFileCount: 3,
    changedLines: 120,
    currentPrNumber: 10,
    liveItems: [
      {
        prNumber: 10,
        openPr: true,
        writerActive: false,
        invalid: "CLAIM_REGISTRY_KEYSET_CHANGED",
      },
      ...extraLiveItems,
    ],
    dependenciesSatisfied: true,
    unresolvedDependencies: [],
    unresolvedReviewThreads: 0,
    trust: {
      trusted: true,
      authority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
      headSha: HEAD,
    },
    now: Date.parse("2026-10-01T17:00:00Z"),
    ancestor: () => true,
    ...rest,
  };
}

test("claim acquisition accepts exactly one bounded orchestrator claim", () => {
  const input = acquisitionInput();
  assert.deepEqual(addedClaimIds(input.canonicalRegistry, input.registry), [
    "MD-GATED",
  ]);
  const result = evaluateClaimAcquisitionMergeGate(input);
  assert.equal(result.decision, "POLICY_SATISFIED");
  assert.equal(result.mode, "CLAIM_ACQUISITION");
  assert.equal(result.changeSetId, "MD-GATED");
  assert.equal(result.trustAuthority, "TRUSTED_CLAIM_GUARD_EXACT_HEAD");
});

test("claim acquisition permits only mandatory bookkeeping overlap with a surviving claim", () => {
  const input = acquisitionInput();
  const existingManifest = manifest({
    id: "MD-EXISTING",
    branch: "feat/existing",
    objective: "existing-objective",
    owns: {
      paths: [
        ".github/morro-control/claims.json",
        ".github/morro-control/events.ndjson",
        "apps/existing/index.ts",
      ],
      contracts: [],
    },
    produces: { events: ["EXISTING_UPDATED"], routes: ["/existing"] },
    database: { tables: ["existing_records"] },
    auth: { capabilities: ["existing:write"] },
  });
  const existing = claim(existingManifest, {
    status: "IMPLEMENTING",
    paths: [
      ".github/morro-control/claims.json",
      ".github/morro-control/events.ndjson",
      "apps/existing/index.ts",
    ],
  });
  input.canonicalRegistry.claims["MD-EXISTING"] = existing;
  input.registry.claims["MD-EXISTING"] = structuredClone(existing);
  input.liveItems.push({
    prNumber: 11,
    openPr: true,
    writerActive: true,
    invalid: null,
    changeSet: {
      ...existingManifest,
      owns: { paths: existing.paths, contracts: [] },
    },
  });
  const result = evaluateClaimAcquisitionMergeGate(input);
  assert.equal(result.decision, "POLICY_SATISFIED");
  assert.equal(result.mode, "CLAIM_ACQUISITION");
});

test("claim acquisition never ignores non-path semantic collisions", () => {
  const input = acquisitionInput();
  const existingManifest = manifest({
    id: "MD-EXISTING-SEMANTIC",
    branch: "feat/existing-semantic",
    objective: "existing-semantic-objective",
    owns: {
      paths: [
        ".github/morro-control/claims.json",
        ".github/morro-control/events.ndjson",
        "apps/existing-semantic/index.ts",
      ],
      contracts: [],
    },
  });
  const existing = claim(existingManifest, {
    status: "IMPLEMENTING",
    paths: existingManifest.owns.paths,
  });
  input.canonicalRegistry.claims[existingManifest.id] = existing;
  input.registry.claims[existingManifest.id] = structuredClone(existing);
  input.liveItems.push({
    prNumber: 12,
    openPr: true,
    writerActive: true,
    invalid: null,
    changeSet: existingManifest,
  });
  assert.throws(
    () => evaluateClaimAcquisitionMergeGate(input),
    /MERGE_GATE_SEMANTIC_COLLISION/u,
  );
});

test("claim acquisition rejects added claims plus surviving claim mutation", () => {
  const canonical = {
    registryAuthority: "ORCHESTRATOR",
    claims: {
      "MD-EXISTING": claim(
        manifest({
          id: "MD-EXISTING",
          branch: "feat/existing",
          objective: "existing-objective",
        }),
      ),
    },
  };
  const candidate = {
    registryAuthority: "ORCHESTRATOR",
    claims: {
      ...canonical.claims,
      "MD-GATED": claim(
        manifest({ state: "IMPLEMENTING", baseSha: BASE, branch: BRANCH }),
        { status: "IMPLEMENTING" },
      ),
    },
  };
  assert.doesNotThrow(() =>
    assertAcquisitionClaimKeyset(canonical, candidate, "MD-GATED"),
  );
  candidate.claims["MD-EXISTING"] = {
    ...candidate.claims["MD-EXISTING"],
    risk: "P0",
  };
  assert.throws(
    () => assertAcquisitionClaimKeyset(canonical, candidate, "MD-GATED"),
    /MERGE_GATE_ACQUISITION_SURVIVING_CLAIM_MUTATION_FORBIDDEN/u,
  );
});

test("claim acquisition rejects authority, event, scope and trust weakening", () => {
  const extra = acquisitionInput({
    authorizationPaths: [
      ".github/morro-control/claims.json",
      ".github/morro-control/events.ndjson",
      ".morro/changesets/MD-GATED.json",
      "apps/runtime/escape.js",
    ],
    changedFileCount: 4,
  });
  assert.throws(
    () => evaluateClaimAcquisitionMergeGate(extra),
    /MERGE_GATE_ACQUISITION_SCOPE_INVALID/u,
  );

  const badTrust = acquisitionInput({
    trust: {
      trusted: false,
      authority: "UNTRUSTED",
      headSha: HEAD,
    },
  });
  assert.throws(
    () => evaluateClaimAcquisitionMergeGate(badTrust),
    /MERGE_GATE_ACQUISITION_EXACT_HEAD_TRUST_REQUIRED/u,
  );

  const badEvents = acquisitionInput();
  badEvents.events[1].payload.branch = "feat/wrong";
  assert.throws(
    () => evaluateClaimAcquisitionMergeGate(badEvents),
    /MERGE_GATE_ACQUISITION_EVENT_BRANCH_MISMATCH/u,
  );

  const rewrittenHistory = acquisitionInput();
  rewrittenHistory.events[0].payload.reason = "mutated";
  assert.throws(
    () => evaluateClaimAcquisitionMergeGate(rewrittenHistory),
    /MERGE_GATE_ACQUISITION_LEDGER_HISTORY_MUTATED/u,
  );

  const missingEvent = acquisitionInput();
  missingEvent.events.pop();
  assert.throws(
    () => evaluateClaimAcquisitionMergeGate(missingEvent),
    /MERGE_GATE_ACQUISITION_EVENT_COUNT_INVALID/u,
  );
});

test("claim acquisition preserves invalid concurrent fail-closed behavior", () => {
  const value = acquisitionInput({
    liveItems: [
      {
        prNumber: 11,
        openPr: true,
        writerActive: false,
        invalid: "PR_FILES_UNAVAILABLE",
      },
    ],
  });
  assert.throws(
    () => evaluateClaimAcquisitionMergeGate(value),
    /MERGE_GATE_LIVE_WORK_ITEM_INVALID/u,
  );
});

test("claim acquisition enforces active PR and global writer limits", () => {
  const tooManyPrs = Array.from({ length: 8 }, (_, index) => ({
    prNumber: 20 + index,
    openPr: true,
    writerActive: false,
    invalid: null,
  }));
  assert.throws(
    () =>
      evaluateClaimAcquisitionMergeGate(
        acquisitionInput({ liveItems: tooManyPrs }),
      ),
    /MERGE_GATE_ACTIVE_PR_LIMIT_EXCEEDED/u,
  );

  const writers = Array.from({ length: 3 }, (_, index) => ({
    prNumber: 40 + index,
    openPr: true,
    writerActive: true,
    invalid: null,
    changeSet: manifest({
      id: "MD-WRITER-" + index,
      branch: "feat/writer-" + index,
      objective: "writer-objective-" + index,
      owns: { paths: ["writer/" + index + "/**"], contracts: [] },
      produces: { events: ["WRITER_EVENT_" + index], routes: [] },
      database: { tables: [] },
      auth: { capabilities: [] },
    }),
  }));
  assert.throws(
    () =>
      evaluateClaimAcquisitionMergeGate(
        acquisitionInput({ liveItems: writers }),
      ),
    /MERGE_GATE_GLOBAL_WIP_EXCEEDED/u,
  );
});

test("claim acquisition enforces semantic collision and exact trust binding", () => {
  const current = acquisitionInput();
  const collision = manifest({
    id: "MD-COLLISION",
    branch: "feat/collision",
    objective: current.manifest.objective,
    owns: { paths: ["collision/**"], contracts: [] },
    produces: { events: ["COLLISION_EVENT"], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
  });
  assert.throws(
    () =>
      evaluateClaimAcquisitionMergeGate(
        acquisitionInput({
          liveItems: [
            {
              prNumber: 55,
              openPr: true,
              writerActive: true,
              invalid: null,
              changeSet: collision,
            },
          ],
        }),
      ),
    /MERGE_GATE_SEMANTIC_COLLISION/u,
  );

  assert.throws(
    () =>
      evaluateClaimAcquisitionMergeGate(
        acquisitionInput({
          trust: {
            trusted: true,
            authority: "WRONG_AUTHORITY",
            headSha: HEAD,
          },
        }),
      ),
    /MERGE_GATE_ACQUISITION_TRUST_AUTHORITY_INVALID/u,
  );
  assert.throws(
    () =>
      evaluateClaimAcquisitionMergeGate(
        acquisitionInput({
          trust: {
            trusted: true,
            authority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
            headSha: "d".repeat(40),
          },
        }),
      ),
    /MERGE_GATE_ACQUISITION_TRUST_HEAD_MISMATCH/u,
  );
});

function writeFixtureJson(root, relativePath, value) {
  const target = join(root, relativePath);
  mkdirSync(target.slice(0, target.lastIndexOf("/")), { recursive: true });
  writeFileSync(target, JSON.stringify(value, null, 2) + "\n");
}

function gitFixture(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function createRunGateFixture() {
  const root = mkdtempSync(join(tmpdir(), "morro-run-gate-"));
  const source = join(root, "source");
  mkdirSync(source, { recursive: true });
  gitFixture(source, ["init", "-q"]);
  gitFixture(source, ["config", "user.name", "Merge Gate Fixture"]);
  gitFixture(source, ["config", "user.email", "merge-gate@example.invalid"]);

  const canonicalManifest = manifest({
    branch: OLD_BRANCH,
    baseSha: OLD_BASE,
  });
  const canonicalRegistry = {
    registryAuthority: "ORCHESTRATOR",
    claims: {
      [canonicalManifest.id]: claim(canonicalManifest),
    },
  };
  writeFixtureJson(
    source,
    ".morro/changesets/MD-GATED.json",
    canonicalManifest,
  );
  writeFixtureJson(
    source,
    ".github/morro-control/claims.json",
    canonicalRegistry,
  );
  writeFixtureJson(source, ".morro/scheduler-policy.json", {
    version: 1,
    globalWriterLimit: 3,
    activePrLimit: 8,
    sameObjectiveLimit: 1,
    replanBehindCommits: 20,
    changeLimits: { hardFiles: 30, hardLines: 1500 },
    objectiveRequiredForDispatch: true,
    writerStates: [
      "IMPLEMENTING",
      "LOCAL_PROVEN",
      "REMOTE_PROVEN",
      "COMPOSITION_PROVEN",
      "POLICY_SATISFIED",
    ],
    slotReleaseStates: ["MERGE_READY", "MERGED"],
  });
  mkdirSync(join(source, "tooling", "mdctl"), { recursive: true });
  writeFileSync(
    join(source, "tooling", "mdctl", "example.mjs"),
    "export const value = 1;\n",
  );
  gitFixture(source, ["add", "."]);
  gitFixture(source, ["commit", "-qm", "trusted base"]);
  const baseSha = gitFixture(source, ["rev-parse", "HEAD"]);

  const candidateManifest = manifest({
    branch: BRANCH,
    baseSha,
  });
  const candidateRegistry = {
    registryAuthority: "ORCHESTRATOR",
    claims: {
      [candidateManifest.id]: claim(candidateManifest),
    },
  };
  writeFixtureJson(
    source,
    ".morro/changesets/MD-GATED.json",
    candidateManifest,
  );
  writeFixtureJson(
    source,
    ".github/morro-control/claims.json",
    candidateRegistry,
  );
  writeFileSync(
    join(source, "tooling", "mdctl", "example.mjs"),
    "export const value = 2;\n",
  );
  gitFixture(source, ["add", "."]);
  gitFixture(source, ["commit", "-qm", "candidate"]);
  const headSha = gitFixture(source, ["rev-parse", "HEAD"]);

  const trustedDir = join(root, "trusted");
  const candidateDir = join(root, "candidate");
  execFileSync("git", ["clone", "-q", "--no-hardlinks", source, trustedDir]);
  gitFixture(trustedDir, ["checkout", "-q", "--detach", baseSha]);
  execFileSync("git", ["clone", "-q", "--no-hardlinks", source, candidateDir]);
  gitFixture(candidateDir, ["checkout", "-q", "--detach", headSha]);

  const diff = diffEvidence({ candidateDir, baseSha, headSha });
  return {
    root,
    trustedDir,
    candidateDir,
    baseSha,
    headSha,
    candidateManifest,
    diff,
  };
}

function gateApiFor(fixture, options = {}) {
  let mainReads = 0;
  return async (endpoint) => {
    if (endpoint === "repos/example/repo/pulls/10") {
      return {
        number: 10,
        head: {
          sha: options.mismatchedPrHead ? "d".repeat(40) : fixture.headSha,
          ref: BRANCH,
          repo: { full_name: "example/repo" },
        },
        base: { sha: fixture.baseSha, ref: "main" },
        changed_files: fixture.diff.changedFileCount,
        additions: fixture.diff.additions,
        deletions: fixture.diff.deletions,
      };
    }
    if (endpoint === "repos/example/repo/commits/main") {
      mainReads += 1;
      return {
        sha:
          options.moveMainAfterFirstRead && mainReads > 1
            ? "e".repeat(40)
            : fixture.baseSha,
      };
    }
    throw new Error("UNEXPECTED_FIXTURE_ENDPOINT:" + endpoint);
  };
}

function gateLiveCollector(fixture, extraItems = []) {
  return async () => ({
    mainSha: fixture.baseSha,
    authority: "TRUSTED_PR_EXACT_HEADS",
    items: [
      {
        prNumber: 10,
        openPr: true,
        writerActive: true,
        ready: false,
        headSha: fixture.headSha,
        changeSet: fixture.candidateManifest,
        dependenciesSatisfied: true,
        unresolvedDependencies: [],
        behindBy: 0,
        baseIsAncestorOfMain: true,
        statsKnown: true,
        changedFiles: fixture.diff.changedFileCount,
        changedLines: fixture.diff.changedLines,
        invalid: null,
        trust: {
          trusted: true,
          authority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
        },
      },
      ...extraItems,
    ],
  });
}

test("merge gate fails closed on any invalid concurrent live PR", () => {
  assert.throws(
    () =>
      evaluateMergeGate(
        input({
          liveItems: [
            {
              prNumber: 11,
              openPr: true,
              writerActive: false,
              invalid: "PR_FILES_UNAVAILABLE",
            },
          ],
        }),
      ),
    /MERGE_GATE_LIVE_WORK_ITEM_INVALID/u,
  );
});

function createAcquisitionRunGateFixture({ invalidLedgerEvent = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "morro-acquisition-gate-"));
  const source = join(root, "source");
  mkdirSync(source, { recursive: true });
  gitFixture(source, ["init", "-q"]);
  gitFixture(source, ["config", "user.name", "Acquisition Gate Fixture"]);
  gitFixture(source, [
    "config",
    "user.email",
    "acquisition-gate@example.invalid",
  ]);

  writeFixtureJson(source, ".github/morro-control/claims.json", {
    registryAuthority: "ORCHESTRATOR",
    claims: {},
  });
  mkdirSync(join(source, ".github", "morro-control"), { recursive: true });
  const canonicalEvent = {
    schemaVersion: 1,
    eventId: "evt-acquisition-canonical",
    eventType: "MERGED",
    observedAt: "2026-10-01T16:59:00Z",
    actor: "ORCHESTRATOR",
    entity: "MD-CANONICAL",
    sourceSha: OLD_BASE,
    payloadVersion: 1,
    payload: { reason: "fixture" },
  };
  writeFileSync(
    join(source, ".github", "morro-control", "events.ndjson"),
    JSON.stringify(canonicalEvent) + "\n",
  );
  writeFixtureJson(source, ".morro/scheduler-policy.json", {
    version: 1,
    globalWriterLimit: 3,
    activePrLimit: 8,
    sameObjectiveLimit: 1,
    replanBehindCommits: 20,
    changeLimits: { hardFiles: 30, hardLines: 1500 },
    objectiveRequiredForDispatch: true,
    writerStates: [
      "IMPLEMENTING",
      "LOCAL_PROVEN",
      "REMOTE_PROVEN",
      "COMPOSITION_PROVEN",
      "POLICY_SATISFIED",
    ],
    slotReleaseStates: ["MERGE_READY", "MERGED"],
  });
  gitFixture(source, ["add", "."]);
  gitFixture(source, ["commit", "-qm", "trusted acquisition base"]);
  const baseSha = gitFixture(source, ["rev-parse", "HEAD"]);

  const candidateManifest = manifest({
    state: "IMPLEMENTING",
    branch: BRANCH,
    baseSha,
  });
  const candidateClaim = claim(candidateManifest, { status: "IMPLEMENTING" });
  writeFixtureJson(
    source,
    ".morro/changesets/MD-GATED.json",
    candidateManifest,
  );
  writeFixtureJson(source, ".github/morro-control/claims.json", {
    registryAuthority: "ORCHESTRATOR",
    claims: {
      [candidateManifest.id]: candidateClaim,
    },
  });
  const acquiredEvent = {
    schemaVersion: 1,
    ...(invalidLedgerEvent ? {} : { eventId: "evt-acquisition-claim" }),
    eventType: "CLAIM_ACQUIRED",
    observedAt: "2026-10-01T17:00:00Z",
    actor: "ORCHESTRATOR",
    entity: candidateManifest.id,
    sourceSha: baseSha,
    payloadVersion: 1,
    payload: {
      branch: BRANCH,
      expiresAt: candidateClaim.expiresAt,
      risk: candidateClaim.risk,
    },
  };
  writeFileSync(
    join(source, ".github", "morro-control", "events.ndjson"),
    [
      JSON.stringify(canonicalEvent),
      JSON.stringify({
        schemaVersion: 1,
        eventId: "evt-acquisition-created",
        eventType: "CHANGESET_CREATED",
        observedAt: "2026-10-01T17:00:00Z",
        actor: "ORCHESTRATOR",
        entity: candidateManifest.id,
        sourceSha: baseSha,
        payloadVersion: 1,
        payload: {
          branch: BRANCH,
          objective: candidateManifest.objective,
        },
      }),
      JSON.stringify(acquiredEvent),
      "",
    ].join("\n"),
  );
  gitFixture(source, ["add", "."]);
  gitFixture(source, ["commit", "-qm", "acquire claim"]);
  const headSha = gitFixture(source, ["rev-parse", "HEAD"]);

  const trustedDir = join(root, "trusted");
  const candidateDir = join(root, "candidate");
  execFileSync("git", ["clone", "-q", "--no-hardlinks", source, trustedDir]);
  gitFixture(trustedDir, ["checkout", "-q", "--detach", baseSha]);
  execFileSync("git", ["clone", "-q", "--no-hardlinks", source, candidateDir]);
  gitFixture(candidateDir, ["checkout", "-q", "--detach", headSha]);
  const diff = diffEvidence({ candidateDir, baseSha, headSha });
  return {
    root,
    trustedDir,
    candidateDir,
    baseSha,
    headSha,
    candidateManifest,
    diff,
  };
}

test("runMergeGate routes one new claim through trusted acquisition mode", async () => {
  const fixture = createAcquisitionRunGateFixture();
  try {
    const result = await runMergeGate({
      trustedDir: fixture.trustedDir,
      candidateDir: fixture.candidateDir,
      repository: "example/repo",
      prNumber: 10,
      headSha: fixture.headSha,
      baseSha: fixture.baseSha,
      branch: BRANCH,
      api: gateApiFor(fixture),
      reviewThreadCounter: async () => 0,
      liveCollector: async () => ({
        mainSha: fixture.baseSha,
        authority: "TRUSTED_PR_EXACT_HEADS",
        items: [
          {
            prNumber: 10,
            openPr: true,
            writerActive: false,
            invalid: "CLAIM_REGISTRY_KEYSET_CHANGED",
          },
        ],
      }),
      dependencyEvaluator: async () => ({
        satisfied: true,
        unresolved: [],
      }),
      trustEvidenceVerifier: async () => ({
        trusted: true,
        authority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
        headSha: fixture.headSha,
      }),
    });
    assert.equal(result.decision, "POLICY_SATISFIED");
    assert.equal(result.mode, "CLAIM_ACQUISITION");
    assert.equal(result.exactHeadSha, fixture.headSha);
    assert.equal(result.exactBaseSha, fixture.baseSha);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("runMergeGate rejects malformed acquisition ledger before policy admission", async () => {
  const fixture = createAcquisitionRunGateFixture({ invalidLedgerEvent: true });
  try {
    await assert.rejects(
      runMergeGate({
        trustedDir: fixture.trustedDir,
        candidateDir: fixture.candidateDir,
        repository: "example/repo",
        prNumber: 10,
        headSha: fixture.headSha,
        baseSha: fixture.baseSha,
        branch: BRANCH,
        api: gateApiFor(fixture),
        reviewThreadCounter: async () => 0,
        liveCollector: async () => ({
          mainSha: fixture.baseSha,
          authority: "TRUSTED_PR_EXACT_HEADS",
          items: [],
        }),
        dependencyEvaluator: async () => ({
          satisfied: true,
          unresolved: [],
        }),
        trustEvidenceVerifier: async () => ({
          trusted: true,
          authority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
          headSha: fixture.headSha,
        }),
      }),
      /EVENT_ID_INVALID/u,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("runMergeGate proves trusted and candidate checkout identity end to end", async () => {
  const fixture = createRunGateFixture();
  try {
    const result = await runMergeGate({
      trustedDir: fixture.trustedDir,
      candidateDir: fixture.candidateDir,
      repository: "example/repo",
      prNumber: 10,
      headSha: fixture.headSha,
      baseSha: fixture.baseSha,
      branch: BRANCH,
      api: gateApiFor(fixture),
      reviewThreadCounter: async () => 0,
      liveCollector: gateLiveCollector(fixture),
      dependencyEvaluator: async () => ({
        satisfied: true,
        unresolved: [],
      }),
    });
    assert.equal(result.decision, "POLICY_SATISFIED");
    assert.equal(result.exactHeadSha, fixture.headSha);
    assert.equal(result.exactBaseSha, fixture.baseSha);
    assert.equal(result.trustAuthority, "TRUSTED_CLAIM_GUARD_EXACT_HEAD");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("runMergeGate rejects moved main and mismatched PR head identity", async () => {
  const fixture = createRunGateFixture();
  try {
    await assert.rejects(
      runMergeGate({
        trustedDir: fixture.trustedDir,
        candidateDir: fixture.candidateDir,
        repository: "example/repo",
        prNumber: 10,
        headSha: fixture.headSha,
        baseSha: fixture.baseSha,
        branch: BRANCH,
        api: gateApiFor(fixture, { moveMainAfterFirstRead: true }),
        reviewThreadCounter: async () => 0,
        liveCollector: gateLiveCollector(fixture),
        dependencyEvaluator: async () => ({
          satisfied: true,
          unresolved: [],
        }),
      }),
      /MERGE_GATE_MAIN_MOVED_DURING_PROOF/u,
    );

    await assert.rejects(
      runMergeGate({
        trustedDir: fixture.trustedDir,
        candidateDir: fixture.candidateDir,
        repository: "example/repo",
        prNumber: 10,
        headSha: fixture.headSha,
        baseSha: fixture.baseSha,
        branch: BRANCH,
        api: gateApiFor(fixture, { mismatchedPrHead: true }),
        reviewThreadCounter: async () => 0,
        liveCollector: gateLiveCollector(fixture),
        dependencyEvaluator: async () => ({
          satisfied: true,
          unresolved: [],
        }),
      }),
      /MERGE_GATE_PR_HEAD_MISMATCH/u,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

function retirementProof({ headSha = HEAD, baseSha = BASE } = {}) {
  return {
    contract: "MORRO-CLAIM-RETIREMENT-PROOF",
    status: "pass",
    failClosed: true,
    exactHead: headSha,
    currentBaseSha: baseSha,
    removedClaims: ["MD-GATED"],
    retirements: [
      {
        id: "MD-GATED",
        reason: "MERGED_PR",
        branch: OLD_BRANCH,
        baseSha: OLD_BASE,
        prNumber: 9,
        mergeSha: "d".repeat(40),
        mergeShaAncestorOfBase: true,
        claimBaseAncestorOfMerge: true,
        historicalManifestMatches: true,
      },
    ],
  };
}

function retirementInput(overrides = {}) {
  const canonicalManifest = manifest({
    branch: OLD_BRANCH,
    baseSha: OLD_BASE,
    state: "LOCAL_PROVEN",
  });
  const candidateManifest =
    overrides.manifest ??
    manifest({
      branch: BRANCH,
      baseSha: BASE,
      state: "MERGED",
    });
  return {
    manifest: candidateManifest,
    canonicalManifest,
    claimId: "MD-GATED",
    branch: BRANCH,
    baseSha: BASE,
    headSha: HEAD,
    authorizationPaths: [
      ".github/morro-control/claims.json",
      ".github/morro-control/events.ndjson",
      ".morro/changesets/MD-GATED.json",
    ],
    changedFileCount: 3,
    changedLines: 9,
    unresolvedReviewThreads: 0,
    retirementProof: retirementProof(),
    ...overrides,
  };
}

test("retirement keyset rejects removal plus claim addition", () => {
  const canonical = { claims: { "MD-GATED": {}, "MD-OTHER": {} } };
  assert.doesNotThrow(() =>
    assertRetirementClaimKeyset(
      canonical,
      { claims: { "MD-OTHER": {} } },
      "MD-GATED",
    ),
  );
  assert.throws(
    () =>
      assertRetirementClaimKeyset(
        canonical,
        { claims: { "MD-OTHER": {}, "MD-NEW": {} } },
        "MD-GATED",
      ),
    /MERGE_GATE_RETIREMENT_CLAIM_KEYSET_INVALID/u,
  );
});

test("merged retirement proof is time-stable and rejects expiry-only evidence", async () => {
  let observedNow = null;
  const merged = retirementProof();
  const value = await buildMergedRetirementProof(
    "trusted",
    "candidate",
    {},
    {
      proofBuilder: async (_trusted, _candidate, _env, options) => {
        observedNow = options.now;
        return merged;
      },
    },
  );
  assert.equal(observedNow, 0);
  assert.equal(value.retirements[0].reason, "MERGED_PR");

  await assert.rejects(
    buildMergedRetirementProof(
      "trusted",
      "candidate",
      {},
      {
        proofBuilder: async () => ({
          ...merged,
          retirements: [{ ...merged.retirements[0], reason: "EXPIRED" }],
        }),
      },
    ),
    /MERGE_GATE_RETIREMENT_MERGED_EVIDENCE_REQUIRED/u,
  );
});

test("retirement gate accepts one canonically proven merged claim release", () => {
  const result = evaluateRetirementMergeGate(retirementInput());
  assert.equal(result.decision, "POLICY_SATISFIED");
  assert.equal(result.mode, "CLAIM_RETIREMENT");
  assert.equal(result.changeSetId, "MD-GATED");
  assert.equal(result.retirementReason, "MERGED_PR");
});

test("retirement gate rejects authority mutation while closing the ChangeSet", () => {
  const candidate = manifest({
    branch: BRANCH,
    baseSha: BASE,
    state: "MERGED",
    owns: {
      ...manifest().owns,
      contracts: ["GATED-CONTRACT", "WIDENED-CONTRACT"],
    },
  });
  assert.throws(
    () =>
      evaluateRetirementMergeGate(
        retirementInput({
          manifest: candidate,
        }),
      ),
    /MERGE_GATE_RETIREMENT_AUTHORITY_DIVERGED/u,
  );
});

test("retirement gate rejects extra files outside the three governance records", () => {
  assert.throws(
    () =>
      evaluateRetirementMergeGate(
        retirementInput({
          authorizationPaths: [
            ".github/morro-control/claims.json",
            ".github/morro-control/events.ndjson",
            ".morro/changesets/MD-GATED.json",
            "tooling/mdctl/merge-gate.mjs",
          ],
          changedFileCount: 4,
        }),
      ),
    /MERGE_GATE_RETIREMENT_SCOPE_INVALID/u,
  );
});

function createRetirementRunGateFixture() {
  const root = mkdtempSync(join(tmpdir(), "morro-retirement-gate-"));
  const source = join(root, "source");
  mkdirSync(source, { recursive: true });
  gitFixture(source, ["init", "-q"]);
  gitFixture(source, ["config", "user.name", "Retirement Gate Fixture"]);
  gitFixture(source, [
    "config",
    "user.email",
    "retirement-gate@example.invalid",
  ]);

  const canonicalManifest = manifest({
    branch: OLD_BRANCH,
    baseSha: OLD_BASE,
    state: "LOCAL_PROVEN",
  });
  const canonicalRegistry = {
    registryAuthority: "ORCHESTRATOR",
    claims: {
      [canonicalManifest.id]: claim(canonicalManifest),
    },
  };
  writeFixtureJson(
    source,
    ".morro/changesets/MD-GATED.json",
    canonicalManifest,
  );
  writeFixtureJson(
    source,
    ".github/morro-control/claims.json",
    canonicalRegistry,
  );
  writeFixtureJson(source, ".morro/scheduler-policy.json", {
    version: 1,
    globalWriterLimit: 3,
    activePrLimit: 8,
    sameObjectiveLimit: 1,
    replanBehindCommits: 20,
    changeLimits: { hardFiles: 30, hardLines: 1500 },
    objectiveRequiredForDispatch: true,
    writerStates: [
      "IMPLEMENTING",
      "LOCAL_PROVEN",
      "REMOTE_PROVEN",
      "COMPOSITION_PROVEN",
      "POLICY_SATISFIED",
    ],
    slotReleaseStates: ["MERGE_READY", "MERGED"],
  });
  mkdirSync(join(source, ".github", "morro-control"), { recursive: true });
  writeFileSync(
    join(source, ".github", "morro-control", "events.ndjson"),
    '{"event":"base"}\n',
  );
  gitFixture(source, ["add", "."]);
  gitFixture(source, ["commit", "-qm", "trusted retirement base"]);
  const baseSha = gitFixture(source, ["rev-parse", "HEAD"]);

  const candidateManifest = manifest({
    branch: BRANCH,
    baseSha,
    state: "MERGED",
  });
  writeFixtureJson(
    source,
    ".morro/changesets/MD-GATED.json",
    candidateManifest,
  );
  writeFixtureJson(source, ".github/morro-control/claims.json", {
    registryAuthority: "ORCHESTRATOR",
    claims: {},
  });
  writeFileSync(
    join(source, ".github", "morro-control", "events.ndjson"),
    '{"event":"base"}\n{"event":"retired"}\n',
  );
  gitFixture(source, ["add", "."]);
  gitFixture(source, ["commit", "-qm", "retire claim"]);
  const headSha = gitFixture(source, ["rev-parse", "HEAD"]);

  const trustedDir = join(root, "trusted");
  const candidateDir = join(root, "candidate");
  execFileSync("git", ["clone", "-q", "--no-hardlinks", source, trustedDir]);
  gitFixture(trustedDir, ["checkout", "-q", "--detach", baseSha]);
  execFileSync("git", ["clone", "-q", "--no-hardlinks", source, candidateDir]);
  gitFixture(candidateDir, ["checkout", "-q", "--detach", headSha]);
  const diff = diffEvidence({ candidateDir, baseSha, headSha });
  return {
    root,
    trustedDir,
    candidateDir,
    baseSha,
    headSha,
    candidateManifest,
    diff,
  };
}

test("runMergeGate routes a proven claim removal through retirement mode", async () => {
  const fixture = createRetirementRunGateFixture();
  try {
    const result = await runMergeGate({
      trustedDir: fixture.trustedDir,
      candidateDir: fixture.candidateDir,
      repository: "example/repo",
      prNumber: 10,
      headSha: fixture.headSha,
      baseSha: fixture.baseSha,
      branch: BRANCH,
      api: gateApiFor(fixture),
      reviewThreadCounter: async () => 0,
      liveCollector: async () => {
        throw new Error("RETIREMENT_MUST_NOT_USE_LIVE_WRITER_ADMISSION");
      },
      dependencyEvaluator: async () => {
        throw new Error(
          "RETIREMENT_MUST_NOT_REQUIRE_ACTIVE_DEPENDENCY_DISPATCH",
        );
      },
      retirementProofBuilder: async () =>
        retirementProof({
          headSha: fixture.headSha,
          baseSha: fixture.baseSha,
        }),
    });
    assert.equal(result.decision, "POLICY_SATISFIED");
    assert.equal(result.mode, "CLAIM_RETIREMENT");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

// Execute the workflow's actual shell predicate; fixtures replace only GitHub responses.
const bootstrapWorkflows = [
  ".github/workflows/morro-claim-guard-trust-bootstrap.yml",
  ".github/workflows/morro-claim-guard.yml",
  ".github/workflows/morro-merge-gate.yml",
];

for (const workflow of bootstrapWorkflows) {
  test(`bootstrap approval authenticates provider identity and target: ${workflow}`, () => {
    const source = readFileSync(join(process.cwd(), workflow), "utf8");
    const start = source.indexOf('          if [ "$PR_NUMBER" = "713" ]');
    const endLine = source.indexOf('            test "$approval"', start);
    assert.ok(start >= 0 && endLine > start, "BOOTSTRAP_PREDICATE_MISSING");
    const predicate = source.slice(start, source.indexOf("\n", endLine));
    const root = mkdtempSync(join(tmpdir(), "bootstrap-approval-"));
    const repo = "luizanunciostoca/touristic-digital-platform";
    const sha = "d".repeat(40);
    const owner = { login: "luizanunciostoca", id: 318748875, type: "User" };
    const comment = {
      body: `APPROVED_BOOTSTRAP_HEAD:${sha}`,
      user: owner,
      author_association: "OWNER",
      performed_via_github_app: null,
    };
    const gh = join(root, "gh");
    writeFileSync(
      gh,
      `#!/bin/bash
set -eu
if [ "\${API_FAILURE:-0}" = 1 ]; then exit 1; fi
if [ "$2" = "repos/${repo}" ]; then cat "$FIXTURE_OWNER"; exit 0; fi
if [[ " $* " == *" --jq "* ]]; then
  jq -r 'add | .[].body' "$FIXTURE_COMMENTS"
else
  cat "$FIXTURE_COMMENTS"
fi
`,
    );
    chmodSync(gh, 0o700);
    const cases = [
      ["exact owner", [[comment]], true],
      ["missing approval", [[]], false],
      [
        "non-owner",
        [[{ ...comment, user: { ...owner, login: "contributor", id: 123 } }]],
        false,
      ],
      [
        "same login wrong id",
        [[{ ...comment, user: { ...owner, id: 123 } }]],
        false,
      ],
      [
        "same id wrong login",
        [[{ ...comment, user: { ...owner, login: "contributor" } }]],
        false,
      ],
      ["bot", [[{ ...comment, user: { ...owner, type: "Bot" } }]], false],
      [
        "non-owner association",
        [[{ ...comment, author_association: "MEMBER" }]],
        false,
      ],
      [
        "app-issued",
        [[{ ...comment, performed_via_github_app: { id: 1 } }]],
        false,
      ],
      [
        "wrong head",
        [[{ ...comment, body: `APPROVED_BOOTSTRAP_HEAD:${"e".repeat(40)}` }]],
        false,
      ],
      ["quoted marker", [[{ ...comment, body: `> ${comment.body}` }]], false],
      ["revoked by edit", [[{ ...comment, body: "REVOKED" }]], false],
      ["owner on later page", [[], [comment]], true],
      ["duplicate exact approvals", [[comment], [comment]], false],
      ["wrong repository", [[comment]], false, { REPOSITORY: "other/repo" }],
      ["fork", [[comment]], false, { HEAD_REPOSITORY: "other/repo" }],
      ["wrong base ref", [[comment]], false, { BASE_REF: "other" }],
      ["wrong base sha", [[comment]], false, { BASE_SHA: "e".repeat(40) }],
      ["ordinary branch", [[comment]], false, { HEAD_BRANCH: "fix/unclaimed" }],
      ["wrong PR", [[comment]], false, { PR_NUMBER: "714" }],
      ["consumed bootstrap PR", [[comment]], false, { PR_NUMBER: "712" }],
      [
        "consumed bootstrap base",
        [[comment]],
        false,
        { BASE_SHA: "4b8919475378e714d7f6d69e478924256fdf96bf" },
      ],
      ["API unavailable", [[comment]], false, { API_FAILURE: "1" }],
    ];
    try {
      writeFileSync(join(root, "owner.json"), JSON.stringify({ owner }));
      for (const [label, comments, expected, extra = {}] of cases) {
        writeFileSync(join(root, "comments.json"), JSON.stringify(comments));
        let accepted = false;
        try {
          execFileSync(
            "bash",
            [
              "-c",
              `set -euo pipefail\naccepted=no\n${predicate}\naccepted=yes\nfi\ntest "$accepted" = yes`,
            ],
            {
              env: {
                ...process.env,
                PATH: `${root}:${process.env.PATH}`,
                FIXTURE_OWNER: join(root, "owner.json"),
                FIXTURE_COMMENTS: join(root, "comments.json"),
                HEAD_SHA: sha,
                BASE_SHA: "2ad095e4eb17bed9023a8aa6c1473b1f9c902feb",
                HEAD_BRANCH: "fix/claim-acquisition-cli-bootstrap-20261004",
                PR_NUMBER: "713",
                REPOSITORY: repo,
                HEAD_REPOSITORY: repo,
                BASE_REF: "main",
                ...extra,
              },
              stdio: "pipe",
            },
          );
          accepted = true;
        } catch {
          accepted = false;
        }
        assert.equal(accepted, expected, `${workflow}: ${label}`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("bootstrap retains pinned independent gate and base-sourced regression assertions", () => {
  const source = readFileSync(
    join(process.cwd(), bootstrapWorkflows[0]),
    "utf8",
  );
  const independent = source
    .split("  independent-proof:\n")[1]
    .split("  claim-handoff-proof:\n")[0];
  assert.match(
    independent,
    /always\(\) && needs\.unit\.outputs\.retirement != 'true'/u,
  );
  assert.doesNotMatch(independent, /approved_bootstrap/u);
  assert.match(
    independent,
    /morro-agent-profiles-trusted\.yml@504d587c9eb780cff01aae71d377b2c2aec99054/u,
  );
  const bootstrap = source
    .split("  approved-bootstrap-proof:\n")[1]
    .split("  retirement-proof:\n")[0];
  assert.match(bootstrap, /git -C trusted archive "\$EXPECTED_BASE"/u);
  assert.match(bootstrap, /git -C candidate show "\$EXPECTED_HEAD:\$module"/u);
  assert.doesNotMatch(bootstrap, /cd candidate && node --test/u);
  assert.match(
    bootstrap,
    /for module in tooling\/fabric\/claim-guard\.mjs tooling\/mdctl\/merge-gate\.mjs;/u,
  );
});

test("bootstrap proof routing stays exact and never requires owner approval to gather evidence", () => {
  const source = readFileSync(
    join(process.cwd(), bootstrapWorkflows[0]),
    "utf8",
  );
  const section = source
    .split("  independent-proof:\n")[1]
    .split("  claim-handoff-proof:\n")[0];
  const expression = section.match(/    if: \$\{\{ (.+) \}\}/u)?.[1];
  assert.ok(expression);
  function eligible(overrides = {}) {
    const github = {
      repository: "luizanunciostoca/touristic-digital-platform",
      event: {
        pull_request: {
          number: 713,
          head: {
            ref: "fix/claim-acquisition-cli-bootstrap-20261004",
            repo: { full_name: "luizanunciostoca/touristic-digital-platform" },
          },
          base: {
            ref: "main",
            sha: "2ad095e4eb17bed9023a8aa6c1473b1f9c902feb",
          },
        },
      },
    };
    overrides.modify?.(github);
    const needs = {
      unit: {
        result: overrides.result ?? "failure",
        outputs: { retirement: overrides.retirement ?? "", manifest_path: "" },
      },
    };
    return Function(
      "github",
      "needs",
      "always",
      `return (${expression});`,
    )(github, needs, () => true);
  }
  assert.equal(eligible(), true, "BOUNDED_PROOF_BEFORE_APPROVAL");
  assert.equal(eligible({ retirement: "true" }), false);
  assert.equal(
    eligible({
      modify: (g) => {
        g.event.pull_request.number = 714;
      },
    }),
    false,
  );
  assert.equal(
    eligible({
      modify: (g) => {
        g.event.pull_request.head.ref = "fix/unclaimed";
      },
    }),
    false,
  );
  assert.equal(
    eligible({
      modify: (g) => {
        g.event.pull_request.head.repo.full_name = "other/repo";
      },
    }),
    false,
  );
  assert.equal(
    eligible({
      modify: (g) => {
        g.event.pull_request.base.sha = "e".repeat(40);
      },
    }),
    false,
  );
  assert.equal(
    eligible({
      result: "success",
      modify: (g) => {
        g.event.pull_request.number = 714;
      },
    }),
    true,
    "ORDINARY_REGISTERED_ROUTE_PRESERVED",
  );
  assert.match(section, /MD-CP-CLAIM-ACQ-CLI-711\.json/u);
  for (const name of bootstrapWorkflows) {
    const body = readFileSync(join(process.cwd(), name), "utf8");
    assert.ok(
      body.includes('".morro/changesets/MD-CP-CLAIM-ACQ-CLI-711.json"'),
    );
    assert.ok(
      body.includes('test "$approval" = "true"'),
      "OWNER_GATE_RETAINED",
    );
  }
});
