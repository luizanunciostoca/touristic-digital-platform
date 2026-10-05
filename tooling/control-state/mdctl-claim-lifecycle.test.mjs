import assert from "node:assert/strict";
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
import test from "node:test";
import {
  buildClaimAcquisition,
  buildClaimReanchor,
  buildClaimRetirement,
  completeMergedRetirementEvidence,
  prepareClaimLifecycleMutation,
  runClaimCli,
} from "../mdctl/claim-lifecycle.mjs";

const BASE = "a".repeat(40);
const NEXT = "b".repeat(40);
const MERGE = "c".repeat(40);
const NOW = "2026-10-05T06:20:00.000Z";
const EXPIRY = "2026-10-06T06:20:00.000Z";

function manifest(overrides = {}) {
  return {
    schemaVersion: 2,
    id: "MD-FASTFIX-TEST",
    objective: "prove-fastfix-claim-lifecycle",
    baseSha: BASE,
    branch: "fix/fastfix-test",
    state: "IMPLEMENTING",
    risk: "high",
    scope: "PLATFORM",
    owns: {
      paths: ["tooling/ci/local-fast-gate.mjs"],
      contracts: ["TDP-FAST-GATE"],
    },
    reads: { contracts: ["MAIN"] },
    produces: { events: ["CLAIM_ACQUIRED"], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
    dependencies: [],
    requiredEvidence: ["remote-proof"],
    requiredCapabilities: ["github:read"],
    contextPack: {
      maxBytes: 65536,
      include: ["changeset", "git-identity", "proof-plan"],
    },
    proof: {
      budget: { maxCommands: 1, maxSeconds: 60 },
      commands: [
        {
          id: "claim-proof",
          argv: ["node", "--test", "tooling/ci/local-fast-gate.test.mjs"],
          timeoutSeconds: 30,
        },
      ],
      requiredRemoteEvidence: ["remote-proof"],
    },
    stopAt: "REMOTE_PROVEN",
    ...overrides,
  };
}

const registry = (claims = {}) => ({
  schemaVersion: 1,
  registryAuthority: "ORCHESTRATOR",
  claims,
});

function activeClaim(overrides = {}) {
  const value = manifest();
  return {
    owner: "CHATGPT-PRO-CONTROL",
    reviewer: "AUTOMATED-INDEPENDENT-PROOF",
    branch: value.branch,
    baseSha: BASE,
    paths: value.owns.paths,
    domains: ["ci-release"],
    risk: "P1",
    status: "IMPLEMENTING",
    expiresAt: EXPIRY,
    ...overrides,
  };
}

function mergedEvidence(overrides = {}) {
  const claim = activeClaim();
  return {
    id: "MD-FASTFIX-TEST",
    reason: "MERGED_PR",
    branch: claim.branch,
    baseSha: claim.baseSha,
    prNumber: 900,
    mergeSha: MERGE,
    mergeShaAncestorOfBase: true,
    materialPaths: ["tooling/ci/local-fast-gate.mjs"],
    ...overrides,
  };
}

function acquire(overrides = {}) {
  return buildClaimAcquisition({
    registry: registry(),
    ledgerText: "",
    manifest: manifest(),
    expiresAt: EXPIRY,
    observedAt: NOW,
    domains: ["ci-release"],
    ...overrides,
  });
}

test("claim CLI binds exact base and rejects noncanonical paths", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "fastfix-claim-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

  git("init", "-q", "-b", "fix/fastfix-cli");
  git("config", "user.name", "FASTFIX Test");
  git("config", "user.email", "fastfix@example.test");
  mkdirSync(join(root, ".github/morro-control"), { recursive: true });
  mkdirSync(join(root, ".morro/changesets"), { recursive: true });
  writeFileSync(
    join(root, ".github/morro-control/claims.json"),
    JSON.stringify(registry(), null, 2) + "\n",
  );
  writeFileSync(join(root, ".github/morro-control/events.ndjson"), "");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git("add", ".");
  git("commit", "-qm", "base");
  const baseSha = git("rev-parse", "HEAD");
  const manifestPath = ".morro/changesets/MD-FASTFIX-CLI.json";
  const cliManifest = manifest({
    id: "MD-FASTFIX-CLI",
    baseSha,
    branch: "fix/fastfix-cli",
    owns: {
      paths: [manifestPath, "tooling/ci/local-fast-gate.mjs"],
      contracts: ["TDP-FAST-GATE"],
    },
  });
  const writeManifest = (value, path = manifestPath) =>
    writeFileSync(join(root, path), JSON.stringify(value, null, 2) + "\n");
  const prepareMutation = async () => ({ formattedFiles: [] });

  writeManifest({ ...cliManifest, baseSha: "f".repeat(40) });
  await assert.rejects(
    runClaimCli(
      [
        "acquire",
        manifestPath,
        "--expires-at",
        EXPIRY,
        "--domains",
        "ci-release",
      ],
      { root, now: () => NOW, prepareMutation },
    ),
    /CLAIM_ACQUIRE_HEAD_MUST_EQUAL_BASE/u,
  );

  writeManifest(cliManifest);
  const beforePrepareFailure = {
    registry: readFileSync(
      join(root, ".github/morro-control/claims.json"),
      "utf8",
    ),
    manifest: readFileSync(join(root, manifestPath), "utf8"),
    ledger: readFileSync(
      join(root, ".github/morro-control/events.ndjson"),
      "utf8",
    ),
  };
  await assert.rejects(
    runClaimCli(
      [
        "acquire",
        manifestPath,
        "--expires-at",
        EXPIRY,
        "--domains",
        "ci-release",
      ],
      {
        root,
        now: () => NOW,
        prepareMutation: async () => {
          throw new Error("CLAIM_LIFECYCLE_PREPARE_FAILED");
        },
      },
    ),
    /CLAIM_LIFECYCLE_PREPARE_FAILED/u,
  );
  assert.equal(
    readFileSync(join(root, ".github/morro-control/claims.json"), "utf8"),
    beforePrepareFailure.registry,
  );
  assert.equal(
    readFileSync(join(root, manifestPath), "utf8"),
    beforePrepareFailure.manifest,
  );
  assert.equal(
    readFileSync(join(root, ".github/morro-control/events.ndjson"), "utf8"),
    beforePrepareFailure.ledger,
  );

  const acquired = await runClaimCli(
    [
      "acquire",
      manifestPath,
      "--expires-at",
      EXPIRY,
      "--domains",
      "ci-release",
    ],
    { root, now: () => NOW, prepareMutation },
  );
  assert.equal(acquired.action, "acquire");

  git("add", ".");
  git("commit", "-qm", "acquire");
  const nextBaseSha = git("rev-parse", "HEAD");
  writeManifest(
    JSON.parse(readFileSync(join(root, manifestPath), "utf8")),
    "outside.json",
  );
  await assert.rejects(
    runClaimCli(["reanchor", "outside.json", "--base-sha", nextBaseSha], {
      root,
      now: () => "2026-10-05T06:21:00.000Z",
      prepareMutation,
    }),
    /CLAIM_CANONICAL_MANIFEST_REQUIRED/u,
  );
  rmSync(join(root, "outside.json"));

  const reanchored = await runClaimCli(
    ["reanchor", manifestPath, "--base-sha", nextBaseSha],
    {
      root,
      now: () => "2026-10-05T06:21:00.000Z",
      prepareMutation,
    },
  );
  assert.equal(reanchored.action, "reanchor");
  const currentRegistry = JSON.parse(
    readFileSync(join(root, ".github/morro-control/claims.json"), "utf8"),
  );
  const currentManifest = JSON.parse(
    readFileSync(join(root, manifestPath), "utf8"),
  );
  assert.equal(currentRegistry.claims["MD-FASTFIX-CLI"].baseSha, nextBaseSha);
  assert.equal(currentManifest.baseSha, nextBaseSha);
  assert.match(
    readFileSync(join(root, ".github/morro-control/events.ndjson"), "utf8"),
    /"CLAIM_RENEWED"/u,
  );
});

test("merged retirement binds ancestry and historical identity", () => {
  const calls = [];
  const completed = completeMergedRetirementEvidence({
    root: "/fixture",
    manifest: manifest(),
    claim: activeClaim(),
    evidence: mergedEvidence(),
    gitImpl: (_root, ...args) => {
      calls.push(args);
      if (args[0] === "merge-base") return "";
      if (args[0] === "show")
        return JSON.stringify({
          id: "MD-FASTFIX-TEST",
          branch: manifest().branch,
          baseSha: BASE,
        });
      throw new Error("UNEXPECTED_GIT_CALL");
    },
  });
  assert.equal(completed.claimBaseAncestorOfMerge, true);
  assert.equal(completed.historicalManifestMatches, true);
  assert.deepEqual(calls[0], ["merge-base", "--is-ancestor", BASE, MERGE]);

  assert.throws(
    () =>
      completeMergedRetirementEvidence({
        root: "/fixture",
        manifest: manifest(),
        claim: activeClaim(),
        evidence: mergedEvidence(),
        gitImpl: (_root, ...args) =>
          args[0] === "show"
            ? JSON.stringify({
                id: "MD-FASTFIX-TEST",
                branch: "wrong/branch",
                baseSha: BASE,
              })
            : "",
      }),
    /CLAIM_RETIRE_HISTORICAL_MANIFEST_MISMATCH/u,
  );
});

test("acquisition emits exactly creation plus acquisition", () => {
  const value = acquire();
  assert.equal(value.claim.baseSha, BASE);
  assert.deepEqual(value.claim.paths, manifest().owns.paths);
  assert.deepEqual(
    value.events.map((event) => event.eventType),
    ["CHANGESET_CREATED", "CLAIM_ACQUIRED"],
  );
  assert.equal(value.registry.claims["MD-FASTFIX-TEST"].risk, "P1");
});

test("acquisition rejects overlap, bookkeeping, and bad domains", () => {
  assert.throws(
    () =>
      acquire({
        registry: registry({
          "MD-OTHER": activeClaim({
            owner: "OTHER",
            branch: "fix/other",
            paths: ["tooling/ci/**"],
          }),
        }),
      }),
    /CLAIM_ACQUIRE_COLLISION/u,
  );
  assert.throws(
    () =>
      acquire({
        manifest: manifest({
          owns: {
            paths: [".github/morro-control/claims.json"],
            contracts: [],
          },
        }),
      }),
    /PERSISTENT_BOOKKEEPING_FORBIDDEN/u,
  );
  for (const domains of [undefined, ["ci-release", "ci-release"]]) {
    assert.throws(
      () => acquire({ domains }),
      /CLAIM_ACQUIRE_DOMAINS_REQUIRED/u,
    );
  }
});

test("reanchors keep state and use unique renewal identities", () => {
  const acquired = acquire();
  const first = buildClaimReanchor({
    registry: acquired.registry,
    ledgerText: acquired.ledgerText,
    manifest: acquired.manifest,
    newBaseSha: NEXT,
    observedAt: "2026-10-05T06:21:00.000Z",
  });
  const second = buildClaimReanchor({
    registry: first.registry,
    ledgerText: first.ledgerText,
    manifest: first.manifest,
    newBaseSha: "e".repeat(40),
    observedAt: "2026-10-05T06:21:00.000Z",
  });
  assert.equal(first.manifest.state, "IMPLEMENTING");
  assert.equal(first.claim.baseSha, NEXT);
  assert.deepEqual(
    first.events.map((event) => event.eventType),
    ["CLAIM_RENEWED"],
  );
  assert.notEqual(first.events[0].eventId, second.events[0].eventId);
});

test("merged retirement requires material evidence before MERGED", () => {
  const acquired = acquire();
  const value = buildClaimRetirement({
    registry: acquired.registry,
    ledgerText: acquired.ledgerText,
    manifest: acquired.manifest,
    evidence: {
      ...mergedEvidence(),
      claimBaseAncestorOfMerge: true,
      historicalManifestMatches: true,
    },
    retirementBaseSha: MERGE,
    retirementBranch: "infra/retire-fastfix-test",
    observedAt: "2026-10-05T06:22:00.000Z",
  });
  assert.equal(value.registry.claims["MD-FASTFIX-TEST"], undefined);
  assert.equal(value.manifest.state, "MERGED");
  assert.deepEqual(
    value.events.map((event) => event.eventType),
    ["MERGED", "CLAIM_RELEASED"],
  );

  assert.throws(
    () =>
      buildClaimRetirement({
        registry: acquired.registry,
        ledgerText: acquired.ledgerText,
        manifest: acquired.manifest,
        evidence: {
          id: "MD-FASTFIX-TEST",
          reason: "MERGED_PR",
          branch: manifest().branch,
          baseSha: BASE,
        },
        retirementBaseSha: NEXT,
        retirementBranch: "infra/retire-fastfix-test",
        observedAt: "2026-10-05T06:22:00.000Z",
      }),
    /MATERIAL_IMPLEMENTATION_MISSING|PR_INVALID|MERGE_SHA_INVALID/u,
  );
});

test("expired retirement releases without promoting state", () => {
  const survivor = activeClaim({
    owner: "OTHER",
    branch: "fix/survivor",
    paths: ["docs/**"],
    domains: ["docs"],
    risk: "P3",
    expiresAt: "2026-10-07T00:00:00.000Z",
  });
  const acquired = acquire({
    registry: registry({ "MD-SURVIVOR": survivor }),
    expiresAt: "2026-10-05T06:21:00.000Z",
  });
  const value = buildClaimRetirement({
    registry: acquired.registry,
    ledgerText: acquired.ledgerText,
    manifest: acquired.manifest,
    evidence: {
      id: "MD-FASTFIX-TEST",
      reason: "EXPIRED",
      branch: manifest().branch,
      baseSha: BASE,
    },
    retirementBaseSha: NEXT,
    retirementBranch: "infra/retire-fastfix-test",
    observedAt: "2026-10-05T06:22:00.000Z",
  });
  assert.equal(value.manifest.state, "IMPLEMENTING");
  assert.deepEqual(value.registry.claims["MD-SURVIVOR"], survivor);
  assert.deepEqual(
    value.events.map((event) => event.eventType),
    ["CLAIM_RELEASED"],
  );
});

test("claim lifecycle PREPARE formats canonical JSON and diff-checks before handoff", () => {
  const calls = [];
  const result = prepareClaimLifecycleMutation({
    root: "/repo",
    paths: [
      "/repo/.github/morro-control/claims.json",
      "/repo/.morro/changesets/MD-X.json",
      "/repo/.github/morro-control/events.ndjson",
    ],
    run: (command, args) => {
      calls.push({ command, args });
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.deepEqual(result.formattedFiles, [
    ".github/morro-control/claims.json",
    ".morro/changesets/MD-X.json",
  ]);
  assert.equal(calls[0].command, "pnpm");
  assert.deepEqual(calls[0].args.slice(0, 4), [
    "exec",
    "prettier",
    "--write",
    "--ignore-unknown",
  ]);
  assert.deepEqual(calls[1], {
    command: "git",
    args: ["-C", "/repo", "diff", "--check"],
  });
});

test("claim lifecycle PREPARE fails closed when formatter fails", () => {
  assert.throws(
    () =>
      prepareClaimLifecycleMutation({
        root: "/repo",
        paths: ["/repo/.github/morro-control/claims.json"],
        run: () => ({ status: 1, stdout: "", stderr: "formatter failed" }),
      }),
    /CLAIM_LIFECYCLE_PREPARE_FAILED/u,
  );
});
