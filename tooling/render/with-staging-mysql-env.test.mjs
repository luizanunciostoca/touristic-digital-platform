import assert from "node:assert/strict";
import test from "node:test";
import { buildStagingDatabaseEnvironment } from "./with-staging-mysql-env.mjs";

function fixture(overrides = {}) {
  return {
    STAGING_MYSQL_HOSTPORT: "morro-digital-v2-staging-mysql:3306",
    STAGING_AUTH_DATABASE_NAME: "morro_auth_staging",
    STAGING_AUTH_DATABASE_USER: "morro_auth",
    STAGING_AUTH_DATABASE_PASSWORD: "auth+/=safe-password",
    STAGING_ORDERING_DATABASE_NAME: "morro_ordering_staging",
    STAGING_ORDERING_DATABASE_USER: "morro_ordering",
    STAGING_ORDERING_DATABASE_PASSWORD: "ordering+/=safe-password",
    STAGING_FINANCIAL_DATABASE_NAME: "morro_financial_staging",
    STAGING_FINANCIAL_DATABASE_USER: "morro_financial",
    STAGING_FINANCIAL_DATABASE_PASSWORD: "financial+/=safe-password",
    STAGING_AFFILIATES_DATABASE_NAME: "morro_affiliates_staging",
    STAGING_AFFILIATES_DATABASE_USER: "morro_affiliates",
    STAGING_AFFILIATES_DATABASE_PASSWORD: "affiliates+/=safe-password",
    ...overrides,
  };
}

test("derives four isolated MySQL URLs and URL-encodes credentials", () => {
  const derived = buildStagingDatabaseEnvironment(fixture());
  assert.deepEqual(Object.keys(derived).sort(), [
    "AFFILIATES_DATABASE_URL",
    "AUTH_DATABASE_URL",
    "FINANCIAL_DATABASE_URL",
    "ORDERING_DATABASE_URL",
  ]);

  const auth = new URL(derived.AUTH_DATABASE_URL);
  assert.equal(auth.protocol, "mysql:");
  assert.equal(auth.hostname, "morro-digital-v2-staging-mysql");
  assert.equal(auth.port, "3306");
  assert.equal(decodeURIComponent(auth.username), "morro_auth");
  assert.equal(decodeURIComponent(auth.password), "auth+/=safe-password");
  assert.equal(auth.pathname, "/morro_auth_staging");

  const names = Object.values(derived).map(
    (value) => new URL(value).pathname.slice(1),
  );
  assert.equal(new Set(names).size, 4);
});

test("rejects non-private-host hostport shapes", () => {
  assert.throws(
    () =>
      buildStagingDatabaseEnvironment(
        fixture({ STAGING_MYSQL_HOSTPORT: "https://mysql.example.com:3306" }),
      ),
    /STAGING_MYSQL_HOSTPORT_INVALID/u,
  );
});

test("rejects SQL identifier injection", () => {
  assert.throws(
    () =>
      buildStagingDatabaseEnvironment(
        fixture({ STAGING_ORDERING_DATABASE_NAME: "morro_ordering;DROP" }),
      ),
    /STAGING_ORDERING_DATABASE_INVALID/u,
  );
});

test("rejects ownership collisions between domain schemas", () => {
  assert.throws(
    () =>
      buildStagingDatabaseEnvironment(
        fixture({ STAGING_FINANCIAL_DATABASE_NAME: "morro_ordering_staging" }),
      ),
    /STAGING_DATABASE_OWNERSHIP_COLLISION/u,
  );
});
