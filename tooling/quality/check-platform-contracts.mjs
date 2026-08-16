import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const registryPath = "docs/contracts/registry.json";
const platformBiblePath = "docs/product-architecture/PLATFORM-BIBLE.md";
const moduleContractsPath = "docs/product-architecture/MODULE-CONTRACTS.md";

const expectedContracts = Object.freeze({
  "PLATFORM-EVENT-ENVELOPE": Object.freeze({
    kind: "event",
    required: Object.freeze([
      "eventId",
      "type",
      "version",
      "occurredAt",
      "destinationId",
      "correlationId",
      "payload",
    ]),
    runtimeFields: Object.freeze([
      "eventId",
      "type",
      "version",
      "payload",
      "occurredAt",
      "destinationId",
      "tenantId",
      "correlationId",
      "causationId",
    ]),
  }),
  "PLATFORM-OBSERVATION": Object.freeze({
    kind: "observability",
    required: Object.freeze([
      "observationId",
      "kind",
      "name",
      "severity",
      "occurredAt",
      "destinationId",
      "correlationId",
      "attributes",
    ]),
    runtimeFields: Object.freeze([
      "observationId",
      "kind",
      "name",
      "severity",
      "occurredAt",
      "destinationId",
      "tenantId",
      "correlationId",
      "causationId",
      "attributes",
    ]),
  }),
  "PLATFORM-HEALTH-SNAPSHOT": Object.freeze({
    kind: "health",
    required: Object.freeze([
      "contractVersion",
      "service",
      "status",
      "readiness",
      "checkedAt",
      "destinationId",
      "correlationId",
      "checks",
    ]),
    runtimeFields: Object.freeze([
      "contractVersion",
      "service",
      "status",
      "readiness",
      "checkedAt",
      "destinationId",
      "tenantId",
      "correlationId",
      "checks",
    ]),
  }),
});

const HEALTH_STATUSES = new Set(["healthy", "degraded", "unhealthy"]);
const READINESS_STATUSES = new Set(["ready", "not_ready"]);
const HEALTH_CHECK_STATUSES = new Set(["pass", "warn", "fail"]);

function fail(message) {
  throw new Error(`Platform contracts gate: ${message}`);
}

async function readText(path) {
  return readFile(resolve(repositoryRoot, path), "utf8");
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    fail(`${label} must be unique.`);
  }
}

function assertBoundedString(value, label, maxLength = 160) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maxLength
  ) {
    fail(`${label} must be a non-empty string up to ${maxLength} characters.`);
  }
}

function assertRequiredSchemaFields(contract, schema, expected) {
  if (schema.type !== "object" || schema.additionalProperties !== false) {
    fail(`${contract.id} schema must be a closed object.`);
  }
  if (
    typeof schema.$id !== "string" ||
    !schema.$id.endsWith(`.v${contract.version}.schema.json`)
  ) {
    fail(`${contract.id} schema id must match registry version.`);
  }

  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const field of expected.required) {
    if (!required.includes(field)) {
      fail(`${contract.id} schema is missing required field ${field}.`);
    }
  }

  const properties = schema.properties ?? {};
  for (const field of expected.runtimeFields) {
    if (!(field in properties)) {
      fail(`${contract.id} schema is missing property ${field}.`);
    }
  }
}

function assertHealthSchema(contract, schema) {
  const properties = schema.properties ?? {};
  const statusValues = properties.status?.enum ?? [];
  const readinessValues = properties.readiness?.enum ?? [];
  const checks = properties.checks;
  const checkProperties = checks?.items?.properties ?? {};
  const checkRequired = checks?.items?.required ?? [];

  if (
    statusValues.length !== HEALTH_STATUSES.size ||
    statusValues.some((value) => !HEALTH_STATUSES.has(value))
  ) {
    fail(`${contract.id} schema has unexpected health statuses.`);
  }
  if (
    readinessValues.length !== READINESS_STATUSES.size ||
    readinessValues.some((value) => !READINESS_STATUSES.has(value))
  ) {
    fail(`${contract.id} schema has unexpected readiness statuses.`);
  }
  if (
    checks?.type !== "array" ||
    checks.minItems !== 1 ||
    checks.maxItems !== 50 ||
    checks.items?.type !== "object" ||
    checks.items?.additionalProperties !== false
  ) {
    fail(`${contract.id} checks schema must be a bounded closed array.`);
  }
  for (const field of ["name", "status", "critical"]) {
    if (!checkRequired.includes(field) || !(field in checkProperties)) {
      fail(`${contract.id} check schema is missing ${field}.`);
    }
  }
  const checkStatuses = checkProperties.status?.enum ?? [];
  if (
    checkStatuses.length !== HEALTH_CHECK_STATUSES.size ||
    checkStatuses.some((value) => !HEALTH_CHECK_STATUSES.has(value))
  ) {
    fail(`${contract.id} schema has unexpected check statuses.`);
  }
}

function assertRuntimeFields(contract, runtimeSource, expected) {
  for (const field of expected.runtimeFields) {
    if (!runtimeSource.includes(`readonly ${field}`)) {
      fail(`${contract.id} runtime is missing field ${field}.`);
    }
  }
}

function assertHealthFixture(path, fixture) {
  if (!fixture || typeof fixture !== "object" || Array.isArray(fixture)) {
    fail(`${path} must be an object.`);
  }

  const required = expectedContracts["PLATFORM-HEALTH-SNAPSHOT"].required;
  for (const field of required) {
    if (!(field in fixture)) {
      fail(`${path} is missing required field ${field}.`);
    }
  }
  if (fixture.contractVersion !== 1) {
    fail(`${path} contractVersion must be 1.`);
  }
  assertBoundedString(fixture.service, `${path} service`);
  assertBoundedString(fixture.destinationId, `${path} destinationId`);
  assertBoundedString(fixture.correlationId, `${path} correlationId`);
  if (fixture.tenantId !== undefined) {
    assertBoundedString(fixture.tenantId, `${path} tenantId`);
  }
  if (
    typeof fixture.checkedAt !== "string" ||
    Number.isNaN(Date.parse(fixture.checkedAt))
  ) {
    fail(`${path} checkedAt must be ISO-8601.`);
  }
  if (!HEALTH_STATUSES.has(fixture.status)) {
    fail(`${path} has invalid status ${fixture.status}.`);
  }
  if (!READINESS_STATUSES.has(fixture.readiness)) {
    fail(`${path} has invalid readiness ${fixture.readiness}.`);
  }
  if (
    !Array.isArray(fixture.checks) ||
    fixture.checks.length === 0 ||
    fixture.checks.length > 50
  ) {
    fail(`${path} must contain between 1 and 50 checks.`);
  }

  const names = [];
  for (const [index, check] of fixture.checks.entries()) {
    if (!check || typeof check !== "object" || Array.isArray(check)) {
      fail(`${path} check ${index} must be an object.`);
    }
    assertBoundedString(check.name, `${path} check ${index} name`);
    names.push(check.name.trim());
    if (!HEALTH_CHECK_STATUSES.has(check.status)) {
      fail(`${path} check ${check.name} has invalid status ${check.status}.`);
    }
    if (typeof check.critical !== "boolean") {
      fail(`${path} check ${check.name} critical must be boolean.`);
    }
    if (check.detail !== undefined) {
      assertBoundedString(
        check.detail,
        `${path} check ${check.name} detail`,
        500,
      );
    }
  }
  assertUnique(names, `${path} check names`);

  const hasCriticalFailure = fixture.checks.some(
    (check) => check.critical && check.status === "fail",
  );
  const hasDegradation = fixture.checks.some(
    (check) => check.status !== "pass",
  );
  const expectedStatus = hasCriticalFailure
    ? "unhealthy"
    : hasDegradation
      ? "degraded"
      : "healthy";
  const expectedReadiness = hasCriticalFailure ? "not_ready" : "ready";

  if (fixture.status !== expectedStatus) {
    fail(
      `${path} status ${fixture.status} disagrees with checks (${expectedStatus}).`,
    );
  }
  if (fixture.readiness !== expectedReadiness) {
    fail(
      `${path} readiness ${fixture.readiness} disagrees with critical checks (${expectedReadiness}).`,
    );
  }
}

async function validateContract(contract, evidenceCache) {
  if (!contract || typeof contract !== "object") {
    fail("Every registry entry must be an object.");
  }
  if (contract.status !== "canonical") {
    fail(`${contract.id ?? "unknown"} must be canonical.`);
  }
  if (!Number.isSafeInteger(contract.version) || contract.version <= 0) {
    fail(`${contract.id ?? "unknown"} has an invalid version.`);
  }
  if (contract.owner !== "core") {
    fail(`${contract.id ?? "unknown"} must remain owned by core.`);
  }

  const expected = expectedContracts[contract.id];
  if (!expected) fail(`Unknown canonical contract ${contract.id}.`);
  if (contract.kind !== expected.kind) {
    fail(`${contract.id} has unexpected kind ${contract.kind}.`);
  }

  const [schema, runtimeSource] = await Promise.all([
    readJson(contract.schema),
    readText(contract.runtime),
  ]);
  assertRequiredSchemaFields(contract, schema, expected);
  assertRuntimeFields(contract, runtimeSource, expected);
  if (contract.id === "PLATFORM-HEALTH-SNAPSHOT") {
    assertHealthSchema(contract, schema);
  }

  let evidence = evidenceCache.get(contract.evidence);
  if (!evidence) {
    evidence = await readText(contract.evidence);
    evidenceCache.set(contract.evidence, evidence);
  }
  if (!evidence.includes(contract.id)) {
    fail(`${contract.id} evidence does not reference the contract id.`);
  }
  if (!evidence.includes(contract.schema)) {
    fail(`${contract.id} evidence does not reference its schema.`);
  }

  if (contract.id === "PLATFORM-HEALTH-SNAPSHOT") {
    if (!Array.isArray(contract.fixtures) || contract.fixtures.length < 2) {
      fail(`${contract.id} requires ready and not-ready fixtures.`);
    }
    assertUnique(contract.fixtures, `${contract.id} fixture paths`);
    for (const fixturePath of contract.fixtures) {
      assertHealthFixture(fixturePath, await readJson(fixturePath));
      if (!evidence.includes(fixturePath)) {
        fail(
          `${contract.id} evidence does not reference fixture ${fixturePath}.`,
        );
      }
    }
  }
}

const registry = await readJson(registryPath);
if (registry.schemaVersion !== 1 || !Array.isArray(registry.contracts)) {
  fail("registry must use schemaVersion 1 with a contracts array.");
}

const contractIds = registry.contracts.map((contract) => contract.id);
assertUnique(contractIds, "Contract ids");
const expectedIds = Object.keys(expectedContracts);
if (
  contractIds.length !== expectedIds.length ||
  expectedIds.some((id) => !contractIds.includes(id))
) {
  fail(`registry must contain exactly: ${expectedIds.join(", ")}.`);
}

const evidenceCache = new Map();
await Promise.all(
  registry.contracts.map((contract) =>
    validateContract(contract, evidenceCache),
  ),
);

const [platformBible, moduleContracts] = await Promise.all([
  readText(platformBiblePath),
  readText(moduleContractsPath),
]);
for (const contract of registry.contracts) {
  for (const source of [platformBible, moduleContracts]) {
    if (!source.includes(contract.id) || !source.includes(contract.schema)) {
      fail(`${contract.id} is not reconciled in canonical architecture docs.`);
    }
  }
}

console.log(
  `Platform contracts valid: ${registry.contracts.length} canonical contracts.`,
);
