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

function registry(claims = {}) {
  return { schemaVersion: 1, registryAuthority: "ORCHESTRATOR", claims };
}

test("mdctl claim CLI performs acquire then exact-head reanchor in a real git worktree", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "fastfix-claim-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runGit = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

  runGit("init", "-q", "-b", "fix/fastfix-cli");
  runGit("config", "user.name", "FASTFIX Test");
  runGit("config", "user.email", "fastfix@example.test");
  mkdirSync(join(root, ".github/morro-control"), { recursive: true });
  mkdirSync(join(root, ".morro/changesets"), { recursive: true });
  writeFileSync(
    join(root, ".github/morro-control/claims.json"),
    JSON.stringify(registry(), null, 2) + "\n",
  );
  writeFileSync(join(root, ".github/morro-control/events.ndjson"), "");
  writeFileSync(join(root, "README.md"), "fixture\n");
  runGit("add", ".");
  runGit("commit", "-qm", "base");
  const baseSha = runGit("rev-parse", "HEAD");
  const cliManifest = manifest({
    id: "MD-FASTFIX-CLI",
    baseSha,
    branch: "fix/fastfix-cli",
    owns: {
      paths: [
        ".morro/changesets/MD-FASTFIX-CLI.json",
        "tooling/ci/local-fast-gate.mjs",
      ],
      contracts: ["TDP-FAST-GATE"],
    },
  });
  const manifestPath = ".morro/changesets/MD-FASTFIX-CLI.json";
  writeFileSync(
    join(root, manifestPath),
    JSON.stringify(cliManifest, null, 2) + "\n",
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
    { root, now: () => NOW },
  );
  assert.equal(acquired.action, "acquire");
  let currentRegistry = JSON.parse(
    readFileSync(join(root, ".github/morro-control/claims.json"), "utf8"),
  );
  assert.equal(currentRegistry.claims["MD-FASTFIX-CLI"].baseSha, baseSha);

  runGit("add", ".");
  runGit("commit", "-qm", "acquire");
  const nextBaseSha = runGit("rev-parse", "HEAD");
  const reanchored = await runClaimCli(
    ["reanchor", manifestPath, "--base-sha", nextBaseSha],
    { root, now: () => "2026-10-05T06:21:00.000Z" },
  );
  assert.equal(reanchored.action, "reanchor");
  currentRegistry = JSON.parse(
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

test("acquisition produces one bounded claim and exactly two authority events", () => {
  const value = buildClaimAcquisition({
    registry: registry(),
    ledgerText: "",
    manifest: manifest(),
    expiresAt: EXPIRY,
    observedAt: NOW,
    domains: ["ci-release"],
  });
  assert.equal(value.claim.baseSha, BASE);
  assert.deepEqual(value.claim.paths, manifest().owns.paths);
  assert.deepEqual(
    value.events.map((event) => event.eventType),
    ["CHANGESET_CREATED", "CLAIM_ACQUIRED"],
  );
  assert.equal(value.registry.claims["MD-FASTFIX-TEST"].risk, "P1");
});

test("acquisition rejects overlap and persistent bookkeeping ownership", () => {
  const existing = {
    owner: "OTHER",
    reviewer: "AUTOMATED-INDEPENDENT-PROOF",
    branch: "fix/other",
    baseSha: BASE,
    paths: ["tooling/ci/**"],
    domains: ["ci-release"],
    risk: "P1",
    status: "IMPLEMENTING",
    expiresAt: EXPIRY,
  };
  assert.throws(
    () =>
      buildClaimAcquisition({
        registry: registry({ "MD-OTHER": existing }),
        ledgerText: "",
        manifest: manifest(),
        expiresAt: EXPIRY,
        observedAt: NOW,
        domains: ["ci-release"],
      }),
    /CLAIM_ACQUIRE_COLLISION/u,
  );
  assert.throws(
    () =>
      buildClaimAcquisition({
        registry: registry(),
        ledgerText: "",
        manifest: manifest({
          owns: {
            paths: [".github/morro-control/claims.json"],
            contracts: [],
          },
        }),
        expiresAt: EXPIRY,
        observedAt: NOW,
        domains: ["ci-release"],
      }),
    /PERSISTENT_BOOKKEEPING_FORBIDDEN/u,
  );
});

test("acquisition requires explicit non-duplicated domains", () => {
  assert.throws(
    () =>
      buildClaimAcquisition({
        registry: registry(),
        ledgerText: "",
        manifest: manifest(),
        expiresAt: EXPIRY,
        observedAt: NOW,
      }),
    /CLAIM_ACQUIRE_DOMAINS_REQUIRED/u,
  );
  assert.throws(
    () =>
      buildClaimAcquisition({
        registry: registry(),
        ledgerText: "",
        manifest: manifest(),
        expiresAt: EXPIRY,
        observedAt: NOW,
        domains: ["ci-release", "ci-release"],
      }),
    /CLAIM_ACQUIRE_DOMAINS_REQUIRED/u,
  );
});

test("repeated reanchors at one timestamp remain event-id unique", () => {
  const acquired = buildClaimAcquisition({
    registry: registry(),
    ledgerText: "",
    manifest: manifest(),
    domains: ["ci-release"],
    expiresAt: EXPIRY,
    observedAt: NOW,
  });
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
  assert.notEqual(first.events[0].eventId, second.events[0].eventId);
  assert.equal(second.manifest.baseSha, "e".repeat(40));
});

test("reanchor changes only base identity and emits one renewal", () => {
  const acquired = buildClaimAcquisition({
    registry: registry(),
    ledgerText: "",
    manifest: manifest(),
    expiresAt: EXPIRY,
    observedAt: NOW,
    domains: ["ci-release"],
  });
  const value = buildClaimReanchor({
    registry: acquired.registry,
    ledgerText: acquired.ledgerText,
    manifest: acquired.manifest,
    newBaseSha: NEXT,
    observedAt: "2026-10-05T06:21:00.000Z",
  });
  assert.equal(value.manifest.baseSha, NEXT);
  assert.equal(value.manifest.branch, manifest().branch);
  assert.equal(value.manifest.state, "IMPLEMENTING");
  assert.equal(value.claim.baseSha, NEXT);
  assert.deepEqual(
    value.events.map((event) => event.eventType),
    ["CLAIM_RENEWED"],
  );
});

test("merged retirement removes target with material merged evidence", () => {
  const acquired = buildClaimAcquisition({
    registry: registry(),
    ledgerText: "",
    manifest: manifest(),
    expiresAt: EXPIRY,
    observedAt: NOW,
    domains: ["ci-release"],
  });
  const evidence = {
    id: "MD-FASTFIX-TEST",
    reason: "MERGED_PR",
    branch: manifest().branch,
    baseSha: BASE,
    prNumber: 900,
    mergeSha: MERGE,
    mergeShaAncestorOfBase: true,
    claimBaseAncestorOfMerge: true,
    historicalManifestMatches: true,
    materialPaths: ["tooling/ci/local-fast-gate.mjs"],
  };
  const value = buildClaimRetirement({
    registry: acquired.registry,
    ledgerText: acquired.ledgerText,
    manifest: acquired.manifest,
    evidence,
    retirementBaseSha: MERGE,
    retirementBranch: "infra/retire-fastfix-test",
    observedAt: "2026-10-05T06:22:00.000Z",
  });
  assert.equal(value.registry.claims["MD-FASTFIX-TEST"], undefined);
  assert.equal(value.manifest.state, "MERGED");
  assert.equal(value.manifest.baseSha, MERGE);
  assert.deepEqual(
    value.events.map((event) => event.eventType),
    ["MERGED", "CLAIM_RELEASED"],
  );
});

test("retirement cannot mark unimplemented work merged without merged evidence", () => {
  const acquired = buildClaimAcquisition({
    registry: registry(),
    ledgerText: "",
    manifest: manifest(),
    expiresAt: EXPIRY,
    observedAt: NOW,
    domains: ["ci-release"],
  });
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

test("expired retirement preserves implementation state and surviving claims", () => {
  const acquired = buildClaimAcquisition({
    registry: registry({
      "MD-SURVIVOR": {
        owner: "OTHER",
        reviewer: "AUTOMATED-INDEPENDENT-PROOF",
        branch: "fix/survivor",
        baseSha: BASE,
        paths: ["docs/**"],
        domains: ["docs"],
        risk: "P3",
        status: "IMPLEMENTING",
        expiresAt: "2026-10-07T00:00:00.000Z",
      },
    }),
    ledgerText: "",
    manifest: manifest(),
    expiresAt: "2026-10-05T06:21:00.000Z",
    observedAt: NOW,
    domains: ["ci-release"],
  });
  const evidence = {
    id: "MD-FASTFIX-TEST",
    reason: "EXPIRED",
    branch: manifest().branch,
    baseSha: BASE,
  };
  const value = buildClaimRetirement({
    registry: acquired.registry,
    ledgerText: acquired.ledgerText,
    manifest: acquired.manifest,
    evidence,
    retirementBaseSha: NEXT,
    retirementBranch: "infra/retire-fastfix-test",
    observedAt: "2026-10-05T06:22:00.000Z",
  });
  assert.equal(value.manifest.state, "IMPLEMENTING");
  assert.deepEqual(
    value.registry.claims["MD-SURVIVOR"],
    acquired.registry.claims["MD-SURVIVOR"],
  );
  assert.deepEqual(
    value.events.map((event) => event.eventType),
    ["CLAIM_RELEASED"],
  );
});
