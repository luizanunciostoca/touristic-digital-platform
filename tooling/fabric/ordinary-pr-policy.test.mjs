import assert from "node:assert/strict";
import test from "node:test";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { ordinaryPrScope } from "./ordinary-pr-policy.mjs";
import { validateAdmission as admission } from "../ci/local-fast-gate.mjs";
import { evaluatePreToolUse } from "../../.github/hooks/morro-pretool-guard.mjs";
const risk = JSON.parse(
  readFileSync(new URL("../../.morro/risk-policy.json", import.meta.url)),
);
const ownership = JSON.parse(
  readFileSync(new URL("../../.morro/ownership.json", import.meta.url)),
);
const ordinary = "apps/morro-digital-platform/src/map/ordinary-test.ts";
test("ordinary mapped application work requires no claim input", () =>
  assert.equal(ordinaryPrScope([ordinary], risk, ownership), true));
for (const path of [
  ".github/workflows/quality.yml",
  ".github/morro-control/claims.json",
  ".morro/risk-policy.json",
  "tooling/ci/local-fast-gate.mjs",
  "packages/auth/src/a.ts",
  "packages/financial/src/a.ts",
  "services/ticketing/src/a.ts",
  "apps/morro-digital-platform/src/map/.env.local",
  "apps/morro-digital-platform/src/map/migrations/a.sql",
  "apps/morro-digital-platform/src/map/production/deploy.ts",
  "docs/operations/runbook.md",
  "unknown/file.ts",
])
  test("sensitive/unknown stays Fabric: " + path, () =>
    assert.equal(ordinaryPrScope([ordinary, path], risk, ownership), false),
  );
for (const path of ["../x", "/tmp/x", "apps/x/../a", "apps//x", "apps\\x"])
  test("invalid path " + path, () =>
    assert.throws(() => ordinaryPrScope([path], risk, ownership)),
  );
test("missing policy fails closed", () =>
  assert.throws(() => ordinaryPrScope([ordinary], {}, ownership)));
test("base owner required", () =>
  assert.equal(ordinaryPrScope([ordinary], risk, { domains: [] }), false));
test("real hook allows ordinary edit without registry or manifest; still denies sensitive edit", () => {
  const root = mkdtempSync(join(tmpdir(), "tdp-native-hook-"));
  const git = (...a) =>
    execFileSync("git", ["-C", root, ...a], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    git("init", "-b", "main");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "user.name", "Fixture");
    for (const [path, value] of [
      [".morro/risk-policy.json", risk],
      [".morro/ownership.json", ownership],
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), JSON.stringify(value));
    }
    mkdirSync(dirname(join(root, ordinary)), { recursive: true });
    writeFileSync(join(root, ordinary), "base");
    git("add", ".");
    git("commit", "-m", "fixture base");
    git("remote", "add", "origin", root);
    git("checkout", "-b", "feature");
    assert.deepEqual(
      evaluatePreToolUse({
        cwd: root,
        toolName: "edit",
        toolArgs: { path: ordinary },
      }),
      { permissionDecision: "allow" },
    );
    assert.throws(() =>
      evaluatePreToolUse({
        cwd: root,
        toolName: "edit",
        toolArgs: { path: ".morro/risk-policy.json" },
      }),
    );
    // Altered candidate policy cannot broaden its own ordinary scope.
    writeFileSync(
      join(root, ".morro/risk-policy.json"),
      JSON.stringify({ ...risk, highPaths: [], criticalPaths: [] }),
    );
    assert.throws(() =>
      evaluatePreToolUse({
        cwd: root,
        toolName: "edit",
        toolArgs: { path: "packages/auth/src/a.ts" },
      }),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("real admission module needs no ordinary claim and rejects sensitive rename through real legacy validation", async () => {
  const root = mkdtempSync(join(tmpdir(), "tdp-native-admission-"));
  const git = (...a) =>
    execFileSync("git", ["-C", root, ...a], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const changedFiles = (base, head) =>
    git("diff", "--name-only", base + "..." + head)
      .split("\n")
      .filter(Boolean);
  const previousCwd = process.cwd();
  process.chdir(root);
  try {
    git("init", "-b", "main");
    mkdirSync(join(root, ".github/morro-control"), { recursive: true });
    writeFileSync(
      join(root, ".github/morro-control/claims.json"),
      JSON.stringify({ registryAuthority: "ORCHESTRATOR", claims: {} }),
    );
    git("config", "user.email", "fixture@example.invalid");
    git("config", "user.name", "Fixture");
    for (const [path, value] of [
      [".morro/risk-policy.json", risk],
      [".morro/ownership.json", ownership],
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), JSON.stringify(value));
    }
    mkdirSync(dirname(join(root, ordinary)), { recursive: true });
    writeFileSync(join(root, ordinary), "base");
    git("add", ".");
    git("commit", "-m", "base");
    const base = git("rev-parse", "HEAD");
    git("checkout", "-b", "feature");
    writeFileSync(join(root, ordinary), "updated");
    git("add", ".");
    git("commit", "-m", "change");
    const head = git("rev-parse", "HEAD");
    const result = await admission(base, head, [ordinary]);
    assert.equal(result.mode, "NATIVE_PR");
    assert.equal(result.claimId, null);
    await assert.rejects(() => admission(base, head, []), /CHANGED_FILES/);
    writeFileSync(join(root, ordinary), "dirty");
    await assert.rejects(
      () => admission(base, head, [ordinary]),
      /CLEAN_WORKTREE/,
    );
    git("restore", ordinary);
    // Scope includes both ends of a rename, so governance moved under src is not ordinary.
    git(
      "mv",
      ".morro/risk-policy.json",
      join(dirname(ordinary), "policy.json"),
    );
    git("commit", "-m", "rename sensitive");
    const moved = git("rev-parse", "HEAD");
    await assert.rejects(
      () => admission(base, moved, changedFiles(base, moved)),
      (error) =>
        error instanceof assert.AssertionError &&
        /FAST_GATE_ACTIVE_CLAIM_RESOLUTION_FAILED/.test(error.message),
    );
  } finally {
    process.chdir(previousCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

for (const path of [
  "packages/crm/src/authorization.ts",
  "services/crm/src/leads-http-transport.ts",
  "apps/control-center/public/control-center.js",
]) {
  test("semantic platform-authz regression: " + path, () =>
    assert.equal(ordinaryPrScope([path], risk, ownership), false),
  );
}
test("overlapping ordinary owner cannot mask sensitive contract owner", () => {
  const o = structuredClone(ownership);
  o.domains.unshift({
    id: "broad",
    pathPrefixes: ["apps/control-center/"],
    contracts: [],
  });
  assert.equal(
    ordinaryPrScope(["apps/control-center/public/control-center.js"], risk, o),
    false,
  );
});
test("semantic-only high floor blocks mapped app path without lexical sensitive prefix", () => {
  const o = {
    domains: [
      {
        id: "synthetic",
        pathPrefixes: [ordinary],
        contracts: ["commerce-offering-identity"],
      },
    ],
  };
  assert.equal(ordinaryPrScope([ordinary], risk, o), false);
});
test("unmapped contract fails closed", () =>
  assert.throws(
    () =>
      ordinaryPrScope([ordinary], risk, {
        domains: [
          { pathPrefixes: [ordinary], contracts: ["unknown-contract"] },
        ],
      }),
    /CONTRACT_RISK_UNKNOWN/,
  ));
test("missing semantic policy fails closed", () => {
  const r = structuredClone(risk);
  delete r.semanticRiskFloor;
  assert.throws(
    () => ordinaryPrScope([ordinary], r, ownership),
    /SEMANTIC_POLICY/,
  );
});
test("unknown semantic level fails closed", () => {
  const r = structuredClone(risk);
  r.semanticRiskFloor["platform-authz"] = "safe";
  assert.throws(
    () => ordinaryPrScope([ordinary], r, ownership),
    /CONTRACT_RISK_UNKNOWN/,
  );
});
test("missing domain contracts fails closed", () =>
  assert.throws(
    () =>
      ordinaryPrScope([ordinary], risk, {
        domains: [{ pathPrefixes: [ordinary] }],
      }),
    /DOMAIN_CONTRACTS/,
  ));
test("malformed risk prefix fails closed", () =>
  assert.throws(
    () =>
      ordinaryPrScope([ordinary], { ...risk, highPaths: [null] }, ownership),
    /RISK_PREFIX/,
  ));
