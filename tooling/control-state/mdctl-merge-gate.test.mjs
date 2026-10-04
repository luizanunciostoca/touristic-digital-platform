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
import { gunzipSync } from "node:zlib";
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
  candidate.owns.paths = candidate.owns.paths.filter(
    (path) =>
      ![
        ".github/morro-control/claims.json",
        ".github/morro-control/events.ndjson",
      ].includes(path),
  );
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

for (const patterns of [
  [".github/morro-control/claims.json"],
  [".github/morro-control/events.ndjson"],
  [".github/morro-control/claims.json", ".github/morro-control/events.ndjson"],
  [".github/morro-control/**"],
  [".github/**"],
]) {
  test(`new acquisition rejects persistent bookkeeping ownership: ${patterns.join(",")}`, () => {
    const input = acquisitionInput();
    input.manifest.owns.paths.push(...patterns);
    input.registry.claims[input.claimId].paths = [...input.manifest.owns.paths];
    assert.throws(
      () => evaluateClaimAcquisitionMergeGate(input),
      /ACQUISITION_PERSISTENT_BOOKKEEPING_FORBIDDEN/u,
    );
  });
}

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

function createAcquisitionRunGateFixture({
  invalidLedgerEvent = false,
  persistentOnly = true,
} = {}) {
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

  const survivors = persistentOnly
    ? JSON.parse(readFileSync(".github/morro-control/claims.json", "utf8"))
        .claims
    : {};
  writeFixtureJson(source, ".github/morro-control/claims.json", {
    registryAuthority: "ORCHESTRATOR",
    claims: survivors,
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
  if (persistentOnly)
    candidateManifest.owns.paths = candidateManifest.owns.paths.filter(
      (path) =>
        ![
          ".github/morro-control/claims.json",
          ".github/morro-control/events.ndjson",
        ].includes(path),
    );
  const candidateClaim = claim(candidateManifest, { status: "IMPLEMENTING" });
  writeFixtureJson(
    source,
    ".morro/changesets/MD-GATED.json",
    candidateManifest,
  );
  writeFixtureJson(source, ".github/morro-control/claims.json", {
    registryAuthority: "ORCHESTRATOR",
    claims: {
      ...survivors,
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

function retirementProof({
  headSha = HEAD,
  baseSha = BASE,
  reason = "MERGED_PR",
} = {}) {
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
        reason,
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

test("retirement proof forwards trusted time and accepts only canonical reasons", async () => {
  for (const reason of ["MERGED_PR", "EXPIRED", "ORPHANED"]) {
    let observedNow = null;
    const expected = retirementProof({ reason });
    const value = await buildMergedRetirementProof(
      "trusted",
      "candidate",
      {},
      {
        now: 12345,
        proofBuilder: async (_trusted, _candidate, _env, options) => {
          observedNow = options.now;
          return expected;
        },
      },
    );
    assert.equal(observedNow, 12345);
    assert.equal(value.retirements[0].reason, reason);
  }

  await assert.rejects(
    buildMergedRetirementProof(
      "trusted",
      "candidate",
      {},
      {
        now: 12345,
        proofBuilder: async () => retirementProof({ reason: "CALLER_ASSERTED" }),
      },
    ),
    /MERGE_GATE_RETIREMENT_REASON_INVALID/u,
  );
});

test("retirement gate accepts one canonically proven merged claim release", () => {
  const result = evaluateRetirementMergeGate(retirementInput());
  assert.equal(result.decision, "POLICY_SATISFIED");
  assert.equal(result.mode, "CLAIM_RETIREMENT");
  assert.equal(result.changeSetId, "MD-GATED");
  assert.equal(result.retirementReason, "MERGED_PR");
});

test("retirement gate accepts canonically proven expired and orphaned releases", () => {
  for (const reason of ["EXPIRED", "ORPHANED"]) {
    const result = evaluateRetirementMergeGate(
      retirementInput({ retirementProof: retirementProof({ reason }) }),
    );
    assert.equal(result.decision, "POLICY_SATISFIED");
    assert.equal(result.retirementReason, reason);
  }
});

test("retirement gate rejects unsupported retirement reasons", () => {
  assert.throws(
    () =>
      evaluateRetirementMergeGate(
        retirementInput({
          retirementProof: retirementProof({ reason: "CALLER_ASSERTED" }),
        }),
      ),
    /MERGE_GATE_RETIREMENT_REASON_INVALID/u,
  );
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
    const start = source.indexOf('          if [ "$PR_NUMBER" = "714" ]');
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
      ["wrong PR", [[comment]], false, { PR_NUMBER: "715" }],
      ["consumed bootstrap PR", [[comment]], false, { PR_NUMBER: "713" }],
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
                BASE_SHA: "de6c1637abc98e4e86e9c575ac0aaeb00a99551c",
                HEAD_BRANCH: "fix/claim-lifecycle-bootstrap-20261004",
                PR_NUMBER: "714",
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
    /for module in tooling\/fabric\/claim-guard\.mjs tooling\/mdctl\/merge-gate\.mjs tooling\/quality\/independent-proof-trusted\.mjs;/u,
  );
});

function bootstrapScopeForPr(source, prNumber) {
  const marker = `[ "$PR_NUMBER" = "${prNumber}" ]`;
  const offset = source.indexOf(marker);
  assert.ok(offset >= 0, "BOOTSTRAP_MARKER_MISSING:" + prNumber);
  const scope = source
    .slice(offset)
    .match(/expected=\(([\s\S]*?)\n\s*\)/u)?.[1];
  assert.ok(scope, "BOOTSTRAP_SCOPE_MISSING:" + prNumber);
  return [...scope.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
}

test("claim lifecycle bootstrap keeps its exact ten-path authorized manifest", () => {
  const manifest = JSON.parse(
    readFileSync(
      join(process.cwd(), ".morro/changesets/MD-CP-CLAIM-LIFECYCLE-711.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.owns.paths.length, 10);
  for (const path of bootstrapWorkflows) {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    assert.deepEqual(
      bootstrapScopeForPr(source, 714).sort(),
      [...manifest.owns.paths].sort(),
      path,
    );
  }
  const merge = readFileSync(
    join(process.cwd(), ".github/workflows/morro-merge-gate.yml"),
    "utf8",
  );
  assert.match(merge, /"prNumber":714/u);
});

test("scheduler reanchor bootstrap keeps its exact eight-path authorized manifest", () => {
  const manifest = JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        ".morro/changesets/MD-CP-SCHEDULER-REANCHOR-718.json",
      ),
      "utf8",
    ),
  );
  assert.equal(manifest.owns.paths.length, 8);
  for (const path of bootstrapWorkflows) {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    assert.deepEqual(
      bootstrapScopeForPr(source, 719).sort(),
      [...manifest.owns.paths].sort(),
      path,
    );
    assert.match(source, /issues\/718\/comments\?per_page=100/u);
    assert.match(source, /APPROVED_BOOTSTRAP_HEAD:/u);
  }
  const bootstrap = readFileSync(
    join(
      process.cwd(),
      ".github/workflows/morro-claim-guard-trust-bootstrap.yml",
    ),
    "utf8",
  );
  const proof = bootstrap
    .split("  scheduler-reanchor-bootstrap-proof:\n")[1]
    .split("  retirement-proof:\n")[0];
  assert.ok(proof);
  assert.doesNotMatch(proof, /cd candidate && node --test/u);
  assert.match(proof, /trustedReanchorTransientPaths/u);
  const merge = readFileSync(
    join(process.cwd(), ".github/workflows/morro-merge-gate.yml"),
    "utf8",
  );
  assert.match(merge, /"prNumber":719/u);
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
          number: 714,
          head: {
            ref: "fix/claim-lifecycle-bootstrap-20261004",
            repo: { full_name: "luizanunciostoca/touristic-digital-platform" },
          },
          base: {
            ref: "main",
            sha: "de6c1637abc98e4e86e9c575ac0aaeb00a99551c",
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
        g.event.pull_request.number = 715;
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
        g.event.pull_request.number = 715;
      },
    }),
    true,
    "ORDINARY_REGISTERED_ROUTE_PRESERVED",
  );
  assert.match(section, /MD-CP-CLAIM-LIFECYCLE-711\.json/u);
  for (const name of bootstrapWorkflows) {
    const body = readFileSync(join(process.cwd(), name), "utf8");
    assert.ok(
      body.includes('".morro/changesets/MD-CP-CLAIM-LIFECYCLE-711.json"'),
    );
    assert.ok(
      body.includes('test "$approval" = "true"'),
      "OWNER_GATE_RETAINED",
    );
  }
});

test("runMergeGate certifies acquisition then exact-base implementation with a surviving learning claim", async () => {
  const f = createAcquisitionRunGateFixture({ persistentOnly: true });
  const registryPath = ".github/morro-control/claims.json";
  const ledgerPath = ".github/morro-control/events.ndjson";
  const manifestPath = ".morro/changesets/MD-GATED.json";
  const run = (api = gateApiFor(f)) =>
    runMergeGate({
      trustedDir: f.trustedDir,
      candidateDir: f.candidateDir,
      repository: "example/repo",
      prNumber: 10,
      headSha: f.headSha,
      baseSha: f.baseSha,
      branch: BRANCH,
      api,
      reviewThreadCounter: async () => 0,
      liveCollector: gateLiveCollector(f),
      dependencyEvaluator: async () => ({ satisfied: true, unresolved: [] }),
      trustEvidenceVerifier: async () => ({
        trusted: true,
        authority: "TRUSTED_CLAIM_GUARD_EXACT_HEAD",
        headSha: f.headSha,
      }),
    });
  try {
    assert.equal((await run()).mode, "CLAIM_ACQUISITION");
    const acquired = f.headSha;
    gitFixture(f.trustedDir, ["checkout", "-q", "--detach", acquired]);
    const registry = JSON.parse(
      readFileSync(join(f.candidateDir, registryPath), "utf8"),
    );
    const survivor = structuredClone(registry.claims["MD-TDP-LEARNING-001"]);
    registry.claims["MD-GATED"].baseSha = acquired;
    f.candidateManifest.baseSha = acquired;
    f.candidateManifest.state = "LOCAL_PROVEN";
    writeFixtureJson(f.candidateDir, registryPath, registry);
    writeFixtureJson(f.candidateDir, manifestPath, f.candidateManifest);
    writeFileSync(
      join(f.candidateDir, ledgerPath),
      readFileSync(join(f.candidateDir, ledgerPath), "utf8") +
        JSON.stringify({
          schemaVersion: 1,
          eventId: "evt-gate-reanchor",
          eventType: "CLAIM_RENEWED",
          observedAt: "2026-10-04T00:00:00Z",
          actor: "ORCHESTRATOR",
          entity: "MD-GATED",
          sourceSha: acquired,
          payloadVersion: 1,
          payload: {
            currentBaseSha: acquired,
            currentBranch: BRANCH,
            authorityScopeChanged: false,
          },
        }) +
        "\n",
    );
    mkdirSync(join(f.candidateDir, "tooling/mdctl"), { recursive: true });
    writeFileSync(
      join(f.candidateDir, "tooling/mdctl/implementation.mjs"),
      "export default 1;\n",
    );
    gitFixture(f.candidateDir, ["config", "user.name", "Lifecycle Proof"]);
    gitFixture(f.candidateDir, [
      "config",
      "user.email",
      "lifecycle@example.invalid",
    ]);
    gitFixture(f.candidateDir, ["add", "."]);
    gitFixture(f.candidateDir, [
      "commit",
      "-qm",
      "implementation on exact acquired base",
    ]);
    f.baseSha = acquired;
    f.headSha = gitFixture(f.candidateDir, ["rev-parse", "HEAD"]);
    f.diff = diffEvidence({
      candidateDir: f.candidateDir,
      baseSha: f.baseSha,
      headSha: f.headSha,
    });
    const result = await run();
    assert.equal(result.decision, "POLICY_SATISFIED");
    assert.equal(
      result.mode,
      undefined,
      "ordinary policy, not acquisition mode",
    );
    assert.equal(result.exactBaseSha, acquired);
    assert.deepEqual(
      JSON.parse(readFileSync(join(f.candidateDir, registryPath), "utf8"))
        .claims["MD-TDP-LEARNING-001"],
      survivor,
    );
    await assert.rejects(
      () => run(gateApiFor(f, { moveMainAfterFirstRead: true })),
      /MERGE_GATE_MAIN_MOVED_DURING_PROOF/,
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

function baselinePython(label) {
  const source = readFileSync(
    join(process.cwd(), bootstrapWorkflows[0]),
    "utf8",
  );
  return source
    .split(`<<'${label}'\n`)[1]
    .split(`          ${label}\n`)[0]
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n");
}

// Immutable test inputs from de6c1637abc98e4e86e9c575ac0aaeb00a99551c.
// Gzip only stores bytes; PY_MIGRATE checks each full-source SHA-256 before use.
// Keep this test offline and independent of checkout depth. Regenerate with
// git show <base>:<path> | gzip -n, then base64 encode the result.
const baselineSourceGzip = {
  "tooling/fabric/claim-guard.test.mjs":
    "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",
  "tooling/control-state/mdctl-merge-gate.test.mjs":
    "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",
};

test("baseline migration checks exact source and retains every test declaration", () => {
  const root = mkdtempSync(join(tmpdir(), "baseline-migration-test-"));
  try {
    const archive = join(root, "archive"),
      evidence = join(root, "evidence");
    for (const path of [
      "tooling/fabric/claim-guard.test.mjs",
      "tooling/control-state/mdctl-merge-gate.test.mjs",
    ]) {
      mkdirSync(join(archive, path, ".."), { recursive: true });
      writeFileSync(
        join(archive, path),
        gunzipSync(Buffer.from(baselineSourceGzip[path], "base64")),
      );
    }
    const run = () =>
      execFileSync("python3", ["-", archive, evidence], {
        input: baselinePython("PY_MIGRATE"),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    const report = JSON.parse(run());
    assert.equal(report.edits.length, 6);
    assert.equal(
      report.patchSha256,
      "8503d0c7778cfb3ddaead7477e1368d7d972c2db97907be473d30bd2636d52ee",
    );
    assert.throws(run, /BASE_PREIMAGE_MISMATCH/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("baseline verifier rejects extra failures, wrong reasons, skips and empty evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "baseline-verifier-test-"));
  const names = [
    "claim acquisition accepts exactly one bounded orchestrator claim",
    "claim acquisition permits only mandatory bookkeeping overlap with a surviving claim",
    "claim acquisition never ignores non-path semantic collisions",
    "claim acquisition rejects authority, event, scope and trust weakening",
    "claim acquisition preserves invalid concurrent fail-closed behavior",
    "claim acquisition enforces active PR and global writer limits",
    "claim acquisition enforces semantic collision and exact trust binding",
    "runMergeGate routes one new claim through trusted acquisition mode",
    "real CLI acquisition: valid",
  ];
  const summary = (failures) =>
    `# tests 139\n# pass ${139 - failures}\n# fail ${failures}\n# cancelled 0\n# skipped 0\n# todo 0\n`;
  const delta =
    names
      .map(
        (name, i) =>
          `not ok ${i + 1} - ${name}\n  error: ACQUISITION_PERSISTENT_BOOKKEEPING_FORBIDDEN\n`,
      )
      .join("") + summary(9);
  const initial = {
    "baseline-control.tap": summary(0),
    "baseline-unmigrated.tap": delta,
    "baseline-migrated.tap": summary(0),
  };
  const run = (values) => {
    for (const [name, content] of Object.entries(values))
      writeFileSync(join(root, name), content);
    return execFileSync("python3", ["-", root], {
      input: baselinePython("PY_VERIFY"),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  };
  try {
    assert.equal(JSON.parse(run(initial)).migratedBaselinePassed, 139);
    for (const changed of [
      { "baseline-migrated.tap": summary(0).replace("skipped 0", "skipped 1") },
      {
        "baseline-unmigrated.tap": delta.replace(
          names[0],
          "unexpected regression",
        ),
      },
      {
        "baseline-unmigrated.tap": delta.replace(
          "ACQUISITION_PERSISTENT_BOOKKEEPING_FORBIDDEN",
          "UNRELATED_FAILURE",
        ),
      },
      { "baseline-unmigrated.tap": summary(0) },
      { "baseline-control.tap": "" },
    ])
      assert.throws(() => run({ ...initial, ...changed }), /BASELINE_/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
