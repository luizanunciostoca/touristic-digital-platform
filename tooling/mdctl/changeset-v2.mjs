import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const SHA = /^[0-9a-f]{40}$/u;
const ID = /^MD-[A-Z0-9-]+$/u;
const BRANCH = /^[A-Za-z0-9._/-]{1,240}$/u;
const CAPABILITY = /^[a-z0-9][a-z0-9:._/-]{0,159}$/u;
const COMMAND_ID = /^[a-z][a-z0-9-]{0,79}$/u;
const TEST_TARGET =
  /^(?:tooling|\.github)\/[A-Za-z0-9._/-]+\.(?:test|contract)\.mjs$/u;
const STATES = new Set([
  "IMPLEMENTING",
  "LOCAL_PROVEN",
  "REMOTE_PROVEN",
  "COMPOSITION_PROVEN",
  "POLICY_SATISFIED",
  "MERGE_READY",
  "MERGED",
]);
const RISKS = new Set(["low", "medium", "high", "critical"]);
const SCOPES = new Set([
  "PLATFORM",
  "DESTINATION:MORRO",
  "DESTINATION:ITACARE",
  "CROSS_DESTINATION",
]);
const CONTEXT_PARTS = new Set([
  "changeset",
  "git-identity",
  "ownership",
  "contracts",
  "dependencies",
  "proof-plan",
]);

const TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "id",
  "baseSha",
  "branch",
  "state",
  "risk",
  "scope",
  "owns",
  "reads",
  "produces",
  "database",
  "auth",
  "dependencies",
  "requiredEvidence",
  "requiredCapabilities",
  "contextPack",
  "proof",
  "stopAt",
]);

function assertClosedObject(value, required, allowed, code) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    code + "_OBJECT_REQUIRED",
  );
  for (const key of required)
    assert.ok(Object.hasOwn(value, key), code + "_FIELD_REQUIRED:" + key);
  for (const key of Object.keys(value))
    assert.ok(allowed.has(key), code + "_PROPERTY_UNKNOWN:" + key);
  return value;
}

function uniqueStrings(values, code, pattern = null) {
  assert.ok(Array.isArray(values), code);
  assert.equal(new Set(values).size, values.length, code + "_DUPLICATE");
  for (const value of values) {
    assert.equal(typeof value, "string", code);
    assert.ok(value.length > 0, code);
    if (pattern) assert.match(value, pattern, code);
  }
  return values;
}

function validateOwnedPath(path) {
  assert.equal(typeof path, "string", "CHANGESET_PATH_INVALID");
  assert.ok(path.length > 0 && path.length <= 320, "CHANGESET_PATH_INVALID");
  assert.equal(path.startsWith("/"), false, "CHANGESET_PATH_ABSOLUTE");
  assert.equal(path.includes("\\"), false, "CHANGESET_PATH_BACKSLASH");
  assert.equal(
    path.split("/").includes(".."),
    false,
    "CHANGESET_PATH_TRAVERSAL",
  );
  if (path.includes("*"))
    assert.ok(
      path.endsWith("/**") && path.slice(0, -3).includes("*") === false,
      "CHANGESET_PATH_WILDCARD_UNSUPPORTED",
    );
}

function validateProofTarget(target) {
  assert.equal(typeof target, "string", "CHANGESET_PROOF_TARGET_INVALID");
  assert.equal(target.startsWith("/"), false, "CHANGESET_PROOF_TARGET_ABSOLUTE");
  assert.equal(
    target.includes("\\"),
    false,
    "CHANGESET_PROOF_TARGET_BACKSLASH",
  );
  assert.equal(
    target.split("/").includes(".."),
    false,
    "CHANGESET_PROOF_TARGET_TRAVERSAL",
  );
  assert.match(target, TEST_TARGET, "CHANGESET_PROOF_TARGET_DENIED");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function changeSetDigest(manifest) {
  validateChangeSetV2(manifest);
  return (
    "sha256:" +
    createHash("sha256").update(canonicalJson(manifest)).digest("hex")
  );
}

export function validateChangeSetV2(manifest) {
  assertClosedObject(
    manifest,
    [...TOP_LEVEL_KEYS],
    TOP_LEVEL_KEYS,
    "CHANGESET",
  );
  assert.equal(manifest.schemaVersion, 2, "CHANGESET_SCHEMA_VERSION_INVALID");
  assert.match(manifest.id, ID, "CHANGESET_ID_INVALID");
  assert.match(manifest.baseSha, SHA, "CHANGESET_BASE_SHA_INVALID");
  assert.match(manifest.branch, BRANCH, "CHANGESET_BRANCH_INVALID");
  assert.equal(
    manifest.branch.includes(".."),
    false,
    "CHANGESET_BRANCH_INVALID",
  );
  assert.ok(STATES.has(manifest.state), "CHANGESET_STATE_INVALID");
  assert.ok(RISKS.has(manifest.risk), "CHANGESET_RISK_INVALID");
  assert.ok(SCOPES.has(manifest.scope), "CHANGESET_SCOPE_INVALID");
  assert.equal(manifest.stopAt, "REMOTE_PROVEN", "CHANGESET_STOP_INVALID");

  assertClosedObject(
    manifest.owns,
    ["paths", "contracts"],
    new Set(["paths", "contracts"]),
    "CHANGESET_OWNS",
  );
  uniqueStrings(manifest.owns.paths, "CHANGESET_OWNED_PATHS_REQUIRED");
  for (const path of manifest.owns.paths) validateOwnedPath(path);
  uniqueStrings(
    manifest.owns.contracts,
    "CHANGESET_OWNED_CONTRACTS_INVALID",
  );

  assertClosedObject(
    manifest.reads,
    ["contracts"],
    new Set(["contracts"]),
    "CHANGESET_READS",
  );
  uniqueStrings(manifest.reads.contracts, "CHANGESET_READ_CONTRACTS_INVALID");

  assertClosedObject(
    manifest.produces,
    ["events", "routes"],
    new Set(["events", "routes"]),
    "CHANGESET_PRODUCES",
  );
  uniqueStrings(manifest.produces.events, "CHANGESET_EVENTS_INVALID");
  uniqueStrings(manifest.produces.routes, "CHANGESET_ROUTES_INVALID");

  assertClosedObject(
    manifest.database,
    ["tables"],
    new Set(["tables"]),
    "CHANGESET_DATABASE",
  );
  uniqueStrings(manifest.database.tables, "CHANGESET_TABLES_INVALID");

  assertClosedObject(
    manifest.auth,
    ["capabilities"],
    new Set(["capabilities"]),
    "CHANGESET_AUTH",
  );
  uniqueStrings(
    manifest.auth.capabilities,
    "CHANGESET_AUTH_CAPABILITIES_INVALID",
  );

  uniqueStrings(manifest.dependencies, "CHANGESET_DEPENDENCIES_INVALID", ID);
  uniqueStrings(
    manifest.requiredEvidence,
    "CHANGESET_REQUIRED_EVIDENCE_INVALID",
  );
  assert.ok(
    manifest.requiredEvidence.length > 0,
    "CHANGESET_REQUIRED_EVIDENCE_EMPTY",
  );
  uniqueStrings(
    manifest.requiredCapabilities,
    "CHANGESET_REQUIRED_CAPABILITIES_INVALID",
    CAPABILITY,
  );
  assert.ok(
    manifest.requiredCapabilities.length > 0,
    "CHANGESET_REQUIRED_CAPABILITIES_EMPTY",
  );

  assertClosedObject(
    manifest.contextPack,
    ["maxBytes", "include"],
    new Set(["maxBytes", "include"]),
    "CHANGESET_CONTEXT_PACK",
  );
  assert.ok(
    Number.isInteger(manifest.contextPack.maxBytes) &&
      manifest.contextPack.maxBytes >= 4096 &&
      manifest.contextPack.maxBytes <= 1024 * 1024,
    "CHANGESET_CONTEXT_PACK_SIZE_INVALID",
  );
  uniqueStrings(
    manifest.contextPack.include,
    "CHANGESET_CONTEXT_PACK_INCLUDE_INVALID",
  );
  assert.ok(
    manifest.contextPack.include.length > 0,
    "CHANGESET_CONTEXT_PACK_EMPTY",
  );
  for (const part of manifest.contextPack.include)
    assert.ok(CONTEXT_PARTS.has(part), "CHANGESET_CONTEXT_PACK_PART_INVALID");

  assertClosedObject(
    manifest.proof,
    ["budget", "commands", "requiredRemoteEvidence"],
    new Set(["budget", "commands", "requiredRemoteEvidence"]),
    "CHANGESET_PROOF",
  );
  const budget = assertClosedObject(
    manifest.proof.budget,
    ["maxCommands", "maxSeconds"],
    new Set(["maxCommands", "maxSeconds"]),
    "CHANGESET_PROOF_BUDGET",
  );
  assert.ok(
    Number.isInteger(budget.maxCommands) &&
      budget.maxCommands >= 1 &&
      budget.maxCommands <= 32,
    "CHANGESET_PROOF_COMMAND_BUDGET_INVALID",
  );
  assert.ok(
    Number.isInteger(budget.maxSeconds) &&
      budget.maxSeconds >= 1 &&
      budget.maxSeconds <= 3600,
    "CHANGESET_PROOF_TIME_BUDGET_INVALID",
  );
  assert.ok(
    Array.isArray(manifest.proof.commands) &&
      manifest.proof.commands.length >= 1 &&
      manifest.proof.commands.length <= budget.maxCommands,
    "CHANGESET_PROOF_COMMANDS_INVALID",
  );

  const commandIds = [];
  let declaredSeconds = 0;
  for (const command of manifest.proof.commands) {
    assertClosedObject(
      command,
      ["id", "argv", "timeoutSeconds"],
      new Set(["id", "argv", "timeoutSeconds"]),
      "CHANGESET_PROOF_COMMAND",
    );
    assert.match(command.id, COMMAND_ID, "CHANGESET_PROOF_COMMAND_ID_INVALID");
    commandIds.push(command.id);
    assert.ok(
      Array.isArray(command.argv) &&
        command.argv.length >= 3 &&
        command.argv.length <= 32,
      "CHANGESET_PROOF_ARGV_INVALID",
    );
    assert.equal(command.argv[0], "node", "CHANGESET_PROOF_EXECUTABLE_DENIED");
    assert.equal(command.argv[1], "--test", "CHANGESET_PROOF_SUBCOMMAND_DENIED");
    for (const target of command.argv.slice(2)) validateProofTarget(target);
    assert.ok(
      Number.isInteger(command.timeoutSeconds) &&
        command.timeoutSeconds >= 1 &&
        command.timeoutSeconds <= 1800 &&
        command.timeoutSeconds <= budget.maxSeconds,
      "CHANGESET_PROOF_TIMEOUT_INVALID",
    );
    declaredSeconds += command.timeoutSeconds;
  }
  assert.equal(
    new Set(commandIds).size,
    commandIds.length,
    "CHANGESET_PROOF_COMMAND_ID_DUPLICATE",
  );
  assert.ok(
    declaredSeconds <= budget.maxSeconds,
    "CHANGESET_PROOF_TIME_BUDGET_EXCEEDED",
  );

  uniqueStrings(
    manifest.proof.requiredRemoteEvidence,
    "CHANGESET_REMOTE_EVIDENCE_INVALID",
  );
  assert.ok(
    manifest.proof.requiredRemoteEvidence.length > 0,
    "CHANGESET_REMOTE_EVIDENCE_EMPTY",
  );
  for (const evidence of manifest.proof.requiredRemoteEvidence)
    assert.ok(
      manifest.requiredEvidence.includes(evidence),
      "CHANGESET_REMOTE_EVIDENCE_NOT_REQUIRED",
    );

  return manifest;
}
