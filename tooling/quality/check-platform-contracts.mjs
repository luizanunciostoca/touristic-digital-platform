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
});

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

function assertRequiredSchemaFields(contract, schema, expected) {
  if (schema.type !== "object" || schema.additionalProperties !== false) {
    fail(`${contract.id} schema must be a closed object.`);
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

function assertRuntimeFields(contract, runtimeSource, expected) {
  for (const field of expected.runtimeFields) {
    if (!runtimeSource.includes(`readonly ${field}`)) {
      fail(`${contract.id} runtime is missing field ${field}.`);
    }
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
