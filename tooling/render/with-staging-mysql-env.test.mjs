import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import {
  buildStagingDatabaseEnvironment,
  buildStagingPaymentsAcceptanceAuthEnvironment,
  stagingPaymentsAcceptanceIdentity,
} from "./with-staging-mysql-env.mjs";

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

function assertPasswordHash(password, encoded) {
  const [scheme, encodedSalt, encodedHash, ...rest] =
    String(encoded).split("$");
  assert.equal(scheme, "scrypt");
  assert.equal(rest.length, 0);
  const salt = Buffer.from(encodedSalt, "base64url");
  const expected = Buffer.from(encodedHash, "base64url");
  const actual = scryptSync(password, salt, expected.length);
  assert.deepEqual(actual, expected);
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

  const names = Object.values(derived).map((value) =>
    new URL(value).pathname.slice(1),
  );
  assert.equal(new Set(names).size, 4);
});

test("rejects non-private-host hostport shapes", () => {
  assert.throws(
    () =>
      buildStagingDatabaseEnvironment(
        fixture({
          STAGING_MYSQL_HOSTPORT: "https://mysql.example.com:3306",
        }),
      ),
    /STAGING_MYSQL_HOSTPORT_INVALID/u,
  );
});

test("rejects SQL identifier injection", () => {
  assert.throws(
    () =>
      buildStagingDatabaseEnvironment(
        fixture({
          STAGING_ORDERING_DATABASE_NAME: "morro_ordering;DROP",
        }),
      ),
    /STAGING_ORDERING_DATABASE_INVALID/u,
  );
});

test("rejects ownership collisions between domain schemas", () => {
  assert.throws(
    () =>
      buildStagingDatabaseEnvironment(
        fixture({
          STAGING_FINANCIAL_DATABASE_NAME: "morro_ordering_staging",
        }),
      ),
    /STAGING_DATABASE_OWNERSHIP_COLLISION/u,
  );
});

test("leaves dashboard users untouched unless payments acceptance is explicitly enabled", () => {
  assert.deepEqual(
    buildStagingPaymentsAcceptanceAuthEnvironment({
      DASHBOARD_USERS_JSON: JSON.stringify([{ id: "existing" }]),
    }),
    {},
  );
});

test("adds isolated owner and admin acceptance identities without replacing existing users", () => {
  const password = "temporary acceptance password 2026";
  const existingUser = {
    id: "existing-owner",
    email: "existing-owner@morro.invalid",
    passwordHash: "existing-hash",
    role: "owner",
    businessIds: ["biz_existing"],
  };
  const derived = buildStagingPaymentsAcceptanceAuthEnvironment({
    RENDER_SERVICE_NAME: stagingPaymentsAcceptanceIdentity.serviceName,
    STAGING_PAYMENTS_ACCEPTANCE_ENABLED: "true",
    STAGING_PAYMENTS_ACCEPTANCE_PASSWORD: password,
    DASHBOARD_USERS_JSON: JSON.stringify([existingUser]),
  });

  assert.equal(derived.DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED, "true");
  const users = JSON.parse(derived.DASHBOARD_USERS_JSON);
  assert.equal(users.length, 3);
  assert.deepEqual(users[0], existingUser);

  const owner = users.find(
    (user) => user.id === stagingPaymentsAcceptanceIdentity.owner.id,
  );
  assert.equal(owner.email, stagingPaymentsAcceptanceIdentity.owner.email);
  assert.equal(owner.role, "owner");
  assert.deepEqual(owner.businessIds, [
    stagingPaymentsAcceptanceIdentity.businessId,
  ]);
  assertPasswordHash(password, owner.passwordHash);

  const admin = users.find(
    (user) => user.id === stagingPaymentsAcceptanceIdentity.admin.id,
  );
  assert.equal(admin.email, stagingPaymentsAcceptanceIdentity.admin.email);
  assert.equal(admin.role, "admin");
  assert.deepEqual(admin.businessIds, []);
  assertPasswordHash(password, admin.passwordHash);
});

test("rejects acceptance identities outside the dedicated V2 staging service", () => {
  assert.throws(
    () =>
      buildStagingPaymentsAcceptanceAuthEnvironment({
        RENDER_SERVICE_NAME: "morro-digital-production",
        STAGING_PAYMENTS_ACCEPTANCE_ENABLED: "true",
        STAGING_PAYMENTS_ACCEPTANCE_PASSWORD:
          "temporary acceptance password 2026",
      }),
    /STAGING_PAYMENTS_ACCEPTANCE_SERVICE_DENIED/u,
  );
});

test("rejects weak acceptance credentials and identity collisions", () => {
  assert.throws(
    () =>
      buildStagingPaymentsAcceptanceAuthEnvironment({
        RENDER_SERVICE_NAME: stagingPaymentsAcceptanceIdentity.serviceName,
        STAGING_PAYMENTS_ACCEPTANCE_ENABLED: "true",
        STAGING_PAYMENTS_ACCEPTANCE_PASSWORD: "too-short",
      }),
    /STAGING_PAYMENTS_ACCEPTANCE_PASSWORD_INVALID/u,
  );

  assert.throws(
    () =>
      buildStagingPaymentsAcceptanceAuthEnvironment({
        RENDER_SERVICE_NAME: stagingPaymentsAcceptanceIdentity.serviceName,
        STAGING_PAYMENTS_ACCEPTANCE_ENABLED: "true",
        STAGING_PAYMENTS_ACCEPTANCE_PASSWORD:
          "temporary acceptance password 2026",
        DASHBOARD_USERS_JSON: JSON.stringify([
          {
            id: "different-id",
            email: stagingPaymentsAcceptanceIdentity.owner.email,
          },
        ]),
      }),
    /STAGING_PAYMENTS_ACCEPTANCE_USER_COLLISION/u,
  );
});
