import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalDatabaseDomains,
  databaseDomainByEnvironmentKey,
  databaseDomainByName,
  databaseSchemas,
  runtimeDatabaseEnvironmentKeys,
  stagingDatabaseDomains,
} from "./canonical-database-topology.mjs";

const expectedKeys = [
  "AFFILIATES_DATABASE_URL",
  "ANALYTICS_DATABASE_URL",
  "AUTH_DATABASE_URL",
  "BUSINESS_DATABASE_URL",
  "COMMERCE_DATABASE_URL",
  "CONTENT_DATABASE_URL",
  "CONTROL_CENTER_AUDIT_DATABASE_URL",
  "CRM_DATABASE_URL",
  "DESTINATIONS_DATABASE_URL",
  "FINANCIAL_DATABASE_URL",
  "NOTIFICATIONS_DATABASE_URL",
  "ORDERING_DATABASE_URL",
  "TICKETING_DATABASE_URL",
].sort();

test("declares the complete canonical 13-domain MySQL topology", () => {
  assert.equal(canonicalDatabaseDomains.length, 13);
  assert.deepEqual([...runtimeDatabaseEnvironmentKeys].sort(), expectedKeys);
  assert.deepEqual(Object.keys(databaseSchemas).sort(), expectedKeys);
  assert.equal(stagingDatabaseDomains.length, 13);
});

test("every physical schema and owner is unique", () => {
  for (const field of [
    "domain",
    "id",
    "environmentKey",
    "schema",
    "stagingSchema",
    "ownerUser",
  ]) {
    const values = canonicalDatabaseDomains.map((entry) => entry[field]);
    assert.equal(new Set(values).size, values.length, `${field} collision`);
  }
});

test("staging keeps the same owner identity and isolates schema names", () => {
  for (const domain of canonicalDatabaseDomains) {
    assert.equal(domain.stagingUser, domain.ownerUser);
    assert.equal(domain.stagingSchema, `${domain.schema}_staging`);
    assert.match(domain.schema, /^morro_[a-z_]+$/u);
    assert.match(domain.ownerUser, /^morro_[a-z_]+$/u);
  }
});

test("all business data domains are destination-aware instead of destination-specific databases", () => {
  assert.equal(databaseDomainByName("AUTH")?.scope, "platform");
  assert.equal(
    databaseDomainByName("DESTINATIONS")?.scope,
    "destination-registry",
  );
  for (const name of [
    "BUSINESS",
    "CONTENT",
    "CRM",
    "AFFILIATES",
    "COMMERCE",
    "ORDERING",
    "FINANCIAL",
    "TICKETING",
    "NOTIFICATIONS",
    "ANALYTICS",
  ]) {
    assert.equal(databaseDomainByName(name)?.scope, "destination-aware");
  }
  assert.equal(databaseDomainByName("AUDIT")?.scope, "mixed");
});

test("morro_business is a canonical domain and not a destination database", () => {
  assert.deepEqual(databaseDomainByEnvironmentKey("BUSINESS_DATABASE_URL"), {
    domain: "BUSINESS",
    id: "business",
    environmentKey: "BUSINESS_DATABASE_URL",
    schema: "morro_business",
    ownerUser: "morro_business",
    scope: "destination-aware",
    stagingSchema: "morro_business_staging",
    stagingUser: "morro_business",
  });
});
