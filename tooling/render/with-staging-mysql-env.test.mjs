import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import {
  reconcileStagingMysqlDomains,
  deriveStagingCrmDatabaseIdentity,
  stagingCrmIdentity,
} from "./reconcile-staging-mysql-domains.mjs";
import {
  buildStagingControlCenterOwnerAuthEnvironment,
  buildStagingDatabaseEnvironment,
  buildStagingPaymentsAcceptanceAuthEnvironment,
  shouldStartStagingPaymentsProviderAcceptance,
  stagingControlCenterOwnerIdentity,
  stagingPaymentsAcceptanceIdentity,
  isStagingCrmMigrationCommand,
  runStagingCrmMigration,
  validateStagingCrmConnectionIdentity,
} from "./with-staging-mysql-env.mjs";

const acceptancePayerEmail = "test_payer_1234567890@testuser.com";

function fixture(overrides = {}) {
  return {
    RENDER_SERVICE_NAME: "morro-digital-v2-staging",
    STAGING_MYSQL_ROOT_PASSWORD: "root-secret-0123456789abcdef",
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
    STAGING_BUSINESS_DATABASE_NAME: "morro_business_staging",
    STAGING_BUSINESS_DATABASE_USER: "morro_business",
    STAGING_BUSINESS_DATABASE_PASSWORD: "business+/=safe-password",
    STAGING_CONTENT_DATABASE_NAME: "morro_content_staging",
    STAGING_CONTENT_DATABASE_USER: "morro_content",
    STAGING_CONTENT_DATABASE_PASSWORD: "content+/=safe-password",
    STAGING_COMMERCE_DATABASE_NAME: "morro_commerce_staging",
    STAGING_COMMERCE_DATABASE_USER: "morro_commerce",
    STAGING_COMMERCE_DATABASE_PASSWORD: "commerce+/=safe-password",
    STAGING_DESTINATIONS_DATABASE_NAME: "morro_destinations_staging",
    STAGING_DESTINATIONS_DATABASE_USER: "morro_destinations",
    STAGING_DESTINATIONS_DATABASE_PASSWORD: "destinations+/=safe-password",
    STAGING_NOTIFICATIONS_DATABASE_NAME: "morro_notifications_staging",
    STAGING_NOTIFICATIONS_DATABASE_USER: "morro_notifications",
    STAGING_NOTIFICATIONS_DATABASE_PASSWORD: "notifications+/=safe-password",
    STAGING_TICKETING_DATABASE_NAME: "morro_ticketing_staging",
    STAGING_TICKETING_DATABASE_USER: "morro_ticketing",
    STAGING_TICKETING_DATABASE_PASSWORD: "ticketing+/=safe-password",
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

function deterministicPasswordHash(password) {
  const salt = Buffer.alloc(16, 71);
  const derived = scryptSync(password, salt, 64);
  return [
    "scrypt",
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

test("derives isolated MySQL owners plus durable Control Center audit storage", () => {
  const derived = buildStagingDatabaseEnvironment(fixture());
  assert.deepEqual(Object.keys(derived).sort(), [
    "AFFILIATES_DATABASE_URL",
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
  ]);
  assert.equal(
    derived.CONTROL_CENTER_AUDIT_DATABASE_URL,
    derived.AUTH_DATABASE_URL,
  );

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
  assert.equal(new Set(names).size, 11);

  const commerce = new URL(derived.COMMERCE_DATABASE_URL);
  assert.equal(decodeURIComponent(commerce.username), "morro_commerce");
  assert.equal(
    decodeURIComponent(commerce.password),
    "commerce+/=safe-password",
  );
  assert.equal(commerce.pathname, "/morro_commerce_staging");

  const crm = new URL(derived.CRM_DATABASE_URL);
  assert.equal(crm.protocol, "mysql:");
  assert.equal(crm.hostname, "morro-digital-v2-staging-mysql");
  assert.equal(crm.pathname, "/morro_crm_staging");
  assert.equal(decodeURIComponent(crm.username), "morro_crm");
  assert.match(decodeURIComponent(crm.password), /^[a-f0-9]{64}$/u);
  assert.notEqual(derived.CRM_DATABASE_URL, derived.AUTH_DATABASE_URL);
  assert.equal(
    JSON.stringify(derived).includes("root-secret-0123456789abcdef"),
    false,
  );
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
    STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_PAYER_EMAIL: acceptancePayerEmail,
    DASHBOARD_USERS_JSON: JSON.stringify([existingUser]),
  });

  assert.equal(derived.DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED, "true");
  const users = JSON.parse(derived.DASHBOARD_USERS_JSON);
  assert.equal(users.length, 3);
  assert.deepEqual(users[0], existingUser);

  const owner = users.find(
    (user) => user.id === stagingPaymentsAcceptanceIdentity.owner.id,
  );
  assert.equal(owner.email, acceptancePayerEmail);
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
        STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_PAYER_EMAIL: acceptancePayerEmail,
      }),
    /STAGING_PAYMENTS_ACCEPTANCE_SERVICE_DENIED/u,
  );
});

test("rejects weak credentials, invalid payer email, and identity collisions", () => {
  assert.throws(
    () =>
      buildStagingPaymentsAcceptanceAuthEnvironment({
        RENDER_SERVICE_NAME: stagingPaymentsAcceptanceIdentity.serviceName,
        STAGING_PAYMENTS_ACCEPTANCE_ENABLED: "true",
        STAGING_PAYMENTS_ACCEPTANCE_PASSWORD: "too-short",
        STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_PAYER_EMAIL: acceptancePayerEmail,
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
      }),
    /STAGING_PAYMENTS_ACCEPTANCE_PAYER_EMAIL_INVALID/u,
  );

  assert.throws(
    () =>
      buildStagingPaymentsAcceptanceAuthEnvironment({
        RENDER_SERVICE_NAME: stagingPaymentsAcceptanceIdentity.serviceName,
        STAGING_PAYMENTS_ACCEPTANCE_ENABLED: "true",
        STAGING_PAYMENTS_ACCEPTANCE_PASSWORD:
          "temporary acceptance password 2026",
        STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_PAYER_EMAIL: "buyer@example.com",
      }),
    /STAGING_PAYMENTS_ACCEPTANCE_PAYER_EMAIL_INVALID/u,
  );

  assert.throws(
    () =>
      buildStagingPaymentsAcceptanceAuthEnvironment({
        RENDER_SERVICE_NAME: stagingPaymentsAcceptanceIdentity.serviceName,
        STAGING_PAYMENTS_ACCEPTANCE_ENABLED: "true",
        STAGING_PAYMENTS_ACCEPTANCE_PASSWORD:
          "temporary acceptance password 2026",
        STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_PAYER_EMAIL: acceptancePayerEmail,
        DASHBOARD_USERS_JSON: JSON.stringify([
          {
            id: "different-id",
            email: acceptancePayerEmail,
          },
        ]),
      }),
    /STAGING_PAYMENTS_ACCEPTANCE_USER_COLLISION/u,
  );
});

test("leaves dashboard users untouched unless Control Center owner bootstrap is explicitly enabled", () => {
  assert.deepEqual(
    buildStagingControlCenterOwnerAuthEnvironment({
      DASHBOARD_USERS_JSON: JSON.stringify([{ id: "existing" }]),
    }),
    {},
  );
});

test("adds an isolated PLATFORM_OWNER without replacing existing users", () => {
  const password = "temporary control center owner password 2026";
  const email = "control-center-owner@morro.digital";
  const existingUser = {
    id: "existing-owner",
    email: "existing-owner@morro.invalid",
    passwordHash: "existing-hash",
    role: "owner",
    businessIds: ["biz_existing"],
  };
  const derived = buildStagingControlCenterOwnerAuthEnvironment({
    RENDER_SERVICE_NAME: stagingControlCenterOwnerIdentity.serviceName,
    STAGING_CONTROL_CENTER_OWNER_ENABLED: "true",
    STAGING_CONTROL_CENTER_OWNER_EMAIL: email,
    STAGING_CONTROL_CENTER_OWNER_PASSWORD: password,
    DASHBOARD_USERS_JSON: JSON.stringify([existingUser]),
  });

  assert.equal(derived.DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED, "true");
  const users = JSON.parse(derived.DASHBOARD_USERS_JSON);
  assert.equal(users.length, 2);
  assert.deepEqual(users[0], existingUser);

  const owner = users.find(
    (user) => user.id === stagingControlCenterOwnerIdentity.id,
  );
  assert.equal(owner.email, email);
  assert.equal(owner.role, "PLATFORM_OWNER");
  assert.deepEqual(owner.businessIds, []);
  assertPasswordHash(password, owner.passwordHash);
});

test("accepts a pre-hashed Control Center owner credential without plaintext password", () => {
  const password = "temporary control center owner password 2026";
  const credentialDigest = deterministicPasswordHash(password);
  const email = "control-center-owner@morro.digital";
  const derived = buildStagingControlCenterOwnerAuthEnvironment({
    RENDER_SERVICE_NAME: stagingControlCenterOwnerIdentity.serviceName,
    STAGING_CONTROL_CENTER_OWNER_ENABLED: "true",
    STAGING_CONTROL_CENTER_OWNER_EMAIL: email,
    STAGING_CONTROL_CENTER_OWNER_CREDENTIAL_DIGEST: credentialDigest,
    DASHBOARD_USERS_JSON: "[]",
  });

  const users = JSON.parse(derived.DASHBOARD_USERS_JSON);
  assert.equal(users.length, 1);
  assert.equal(users[0].email, email);
  assert.equal(users[0].role, "PLATFORM_OWNER");
  assert.equal(users[0].passwordHash, credentialDigest);
  assertPasswordHash(password, users[0].passwordHash);
});

test("rotates one matching owner and preserves other users", () => {
  const password = "temporary control center owner password 2026";
  const credentialDigest = deterministicPasswordHash(password);
  const email = "control-center-owner@morro.digital";
  const existingTarget = {
    id: "existing-platform-user",
    email,
    passwordHash: "existing-hash",
    role: "admin",
    businessIds: ["biz_existing"],
    displayName: "Existing Owner",
  };
  const sibling = {
    id: "sibling-user",
    email: "sibling@morro.invalid",
    passwordHash: "sibling-hash",
    role: "viewer",
    businessIds: ["biz_sibling"],
  };

  const derived = buildStagingControlCenterOwnerAuthEnvironment({
    RENDER_SERVICE_NAME: stagingControlCenterOwnerIdentity.serviceName,
    STAGING_CONTROL_CENTER_OWNER_ENABLED: "true",
    STAGING_CONTROL_CENTER_OWNER_ROTATE_EXISTING: "true",
    STAGING_CONTROL_CENTER_OWNER_EMAIL: email,
    STAGING_CONTROL_CENTER_OWNER_CREDENTIAL_DIGEST: credentialDigest,
    DASHBOARD_USERS_JSON: JSON.stringify([existingTarget, sibling]),
  });

  const users = JSON.parse(derived.DASHBOARD_USERS_JSON);
  assert.equal(users.length, 2);
  const rotated = users.find((user) => user.email === email);
  assert.equal(rotated.id, existingTarget.id);
  assert.equal(rotated.role, "PLATFORM_OWNER");
  assert.deepEqual(rotated.businessIds, []);
  assert.equal(rotated.displayName, existingTarget.displayName);
  assert.equal(rotated.passwordHash, credentialDigest);
  assertPasswordHash(password, rotated.passwordHash);
  assert.deepEqual(
    users.find((user) => user.id === sibling.id),
    sibling,
  );
});

test("rejects unsafe existing-owner rotation", () => {
  const password = "temporary control center owner password 2026";
  const email = "control-center-owner@morro.digital";

  assert.throws(
    () =>
      buildStagingControlCenterOwnerAuthEnvironment({
        RENDER_SERVICE_NAME: stagingControlCenterOwnerIdentity.serviceName,
        STAGING_CONTROL_CENTER_OWNER_ENABLED: "true",
        STAGING_CONTROL_CENTER_OWNER_EMAIL: email,
        STAGING_CONTROL_CENTER_OWNER_PASSWORD: password,
        DASHBOARD_USERS_JSON: JSON.stringify([{ id: "existing", email }]),
      }),
    /STAGING_CONTROL_CENTER_OWNER_USER_COLLISION/u,
  );

  assert.throws(
    () =>
      buildStagingControlCenterOwnerAuthEnvironment({
        RENDER_SERVICE_NAME: stagingControlCenterOwnerIdentity.serviceName,
        STAGING_CONTROL_CENTER_OWNER_ENABLED: "true",
        STAGING_CONTROL_CENTER_OWNER_ROTATE_EXISTING: "true",
        STAGING_CONTROL_CENTER_OWNER_EMAIL: email,
        STAGING_CONTROL_CENTER_OWNER_PASSWORD: password,
        DASHBOARD_USERS_JSON: JSON.stringify([
          { id: "existing-a", email },
          { id: "existing-b", email },
        ]),
      }),
    /STAGING_CONTROL_CENTER_OWNER_USER_COLLISION/u,
  );
});

test("fails closed for unsafe Control Center owner bootstrap configuration", () => {
  const strongPassword = "temporary control center owner password 2026";
  const email = "control-center-owner@morro.digital";

  assert.throws(
    () =>
      buildStagingControlCenterOwnerAuthEnvironment({
        RENDER_SERVICE_NAME: "morro-digital-production",
        STAGING_CONTROL_CENTER_OWNER_ENABLED: "true",
        STAGING_CONTROL_CENTER_OWNER_EMAIL: email,
        STAGING_CONTROL_CENTER_OWNER_PASSWORD: strongPassword,
      }),
    /STAGING_CONTROL_CENTER_OWNER_SERVICE_DENIED/u,
  );

  assert.throws(
    () =>
      buildStagingControlCenterOwnerAuthEnvironment({
        RENDER_SERVICE_NAME: stagingControlCenterOwnerIdentity.serviceName,
        STAGING_CONTROL_CENTER_OWNER_ENABLED: "true",
        STAGING_CONTROL_CENTER_OWNER_EMAIL: email,
        STAGING_CONTROL_CENTER_OWNER_PASSWORD: "too-short",
      }),
    /STAGING_CONTROL_CENTER_OWNER_PASSWORD_INVALID/u,
  );

  assert.throws(
    () =>
      buildStagingControlCenterOwnerAuthEnvironment({
        RENDER_SERVICE_NAME: stagingControlCenterOwnerIdentity.serviceName,
        STAGING_CONTROL_CENTER_OWNER_ENABLED: "true",
        STAGING_CONTROL_CENTER_OWNER_EMAIL: "invalid",
        STAGING_CONTROL_CENTER_OWNER_PASSWORD: strongPassword,
      }),
    /STAGING_CONTROL_CENTER_OWNER_EMAIL_INVALID/u,
  );

  assert.throws(
    () =>
      buildStagingControlCenterOwnerAuthEnvironment({
        RENDER_SERVICE_NAME: stagingControlCenterOwnerIdentity.serviceName,
        STAGING_CONTROL_CENTER_OWNER_ENABLED: "true",
        STAGING_CONTROL_CENTER_OWNER_EMAIL: email,
        STAGING_CONTROL_CENTER_OWNER_PASSWORD: strongPassword,
        STAGING_CONTROL_CENTER_OWNER_CREDENTIAL_DIGEST:
          deterministicPasswordHash(strongPassword),
      }),
    /STAGING_CONTROL_CENTER_OWNER_CREDENTIAL_SOURCE_CONFLICT/u,
  );

  assert.throws(
    () =>
      buildStagingControlCenterOwnerAuthEnvironment({
        RENDER_SERVICE_NAME: stagingControlCenterOwnerIdentity.serviceName,
        STAGING_CONTROL_CENTER_OWNER_ENABLED: "true",
        STAGING_CONTROL_CENTER_OWNER_EMAIL: email,
        STAGING_CONTROL_CENTER_OWNER_CREDENTIAL_DIGEST:
          "scrypt$invalid$invalid",
      }),
    /STAGING_CONTROL_CENTER_OWNER_PASSWORD_INVALID/u,
  );

  assert.throws(
    () =>
      buildStagingControlCenterOwnerAuthEnvironment({
        RENDER_SERVICE_NAME: stagingControlCenterOwnerIdentity.serviceName,
        STAGING_CONTROL_CENTER_OWNER_ENABLED: "true",
        STAGING_CONTROL_CENTER_OWNER_EMAIL: email,
        STAGING_CONTROL_CENTER_OWNER_PASSWORD: strongPassword,
        DASHBOARD_USERS_JSON: JSON.stringify([{ id: "different-id", email }]),
      }),
    /STAGING_CONTROL_CENTER_OWNER_USER_COLLISION/u,
  );
});

test("starts provider acceptance only for the V2 staging runtime command", () => {
  const environment = {
    RENDER_SERVICE_NAME: stagingPaymentsAcceptanceIdentity.serviceName,
    STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_AUTORUN: "true",
  };
  assert.equal(
    shouldStartStagingPaymentsProviderAcceptance(environment, "node", [
      "apps/morro-digital-platform/tooling/dev-server.mjs",
    ]),
    true,
  );
  assert.equal(
    shouldStartStagingPaymentsProviderAcceptance(environment, "node", [
      "apps/morro-digital-platform/tooling/payments-migrate.mjs",
    ]),
    false,
  );
  assert.equal(
    shouldStartStagingPaymentsProviderAcceptance(
      { ...environment, RENDER_SERVICE_NAME: "morro-digital-production" },
      "node",
      ["apps/morro-digital-platform/tooling/dev-server.mjs"],
    ),
    false,
  );
  assert.equal(
    shouldStartStagingPaymentsProviderAcceptance(
      { ...environment, STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_AUTORUN: "false" },
      "node",
      ["apps/morro-digital-platform/tooling/dev-server.mjs"],
    ),
    false,
  );
});

test("reconciles all staging schemas without exposing credentials", async () => {
  const queries = [];
  let ended = false;
  const mysqlClient = {
    async createConnection(options) {
      assert.equal(options.host, "morro-digital-v2-staging-mysql");
      assert.equal(options.port, 3306);
      assert.equal(options.user, "root");
      assert.equal(options.password, "root-secret-0123456789abcdef");
      return {
        async query(sql, params = []) {
          queries.push([sql, params]);
        },
        async end() {
          ended = true;
        },
      };
    },
  };

  const result = await reconcileStagingMysqlDomains(
    {
      RENDER_SERVICE_NAME: "morro-digital-v2-staging",
      STAGING_MYSQL_HOSTPORT: "morro-digital-v2-staging-mysql:3306",
      STAGING_MYSQL_ROOT_PASSWORD: "root-secret",
      ...fixture(),
    },
    mysqlClient,
  );

  assert.equal(result.status, "pass");
  assert.deepEqual(result.domains, [
    "auth",
    "ordering",
    "financial",
    "affiliates",
    "business",
    "content",
    "commerce",
    "destinations",
    "notifications",
    "ticketing",
    "crm",
  ]);
  assert.equal(ended, true);
  assert.equal(
    queries.filter(([sql]) => sql.startsWith("CREATE DATABASE")).length,
    11,
  );
  assert.equal(
    queries.filter(([sql]) => sql.startsWith("CREATE USER")).length,
    11,
  );
  assert.equal(
    queries.filter(([sql]) => sql.startsWith("ALTER USER")).length,
    11,
  );
  assert.equal(
    queries.filter(([sql]) => sql.startsWith("GRANT ALL PRIVILEGES")).length,
    11,
  );
  assert.equal(queries.at(-1)?.[0], "FLUSH PRIVILEGES");
  assert.equal(JSON.stringify(queries).includes("root-secret"), false);
});

test("denies database reconciliation outside canonical staging service", async () => {
  await assert.rejects(
    reconcileStagingMysqlDomains(
      {
        ...fixture(),
        RENDER_SERVICE_NAME: "morro-digital-v2",
      },
      {
        createConnection: async () => {
          throw new Error("must not connect");
        },
      },
    ),
    /STAGING_MYSQL_RECONCILE_SERVICE_DENIED/u,
  );
});

// Staging CRM owner isolation and migrations must run in the already managed
// MySQL environment proof suite, not rely on unmapped test paths.
const crmCredsEnv = {
  RENDER_SERVICE_NAME: "morro-digital-v2-staging",
  STAGING_MYSQL_ROOT_PASSWORD: "root-secret-0123456789abcdef",
};
test("CRM derives a deterministic, independent staging-only MySQL user", () => {
  const a = deriveStagingCrmDatabaseIdentity(crmCredsEnv);
  const b = deriveStagingCrmDatabaseIdentity(crmCredsEnv);
  assert.deepEqual(a, b);
  assert.equal(a.domain, "CRM");
  assert.equal(a.database, "morro_crm_staging");
  assert.equal(a.user, "morro_crm");
  assert.equal(stagingCrmIdentity.service, crmCredsEnv.RENDER_SERVICE_NAME);
  assert.match(a.password, /^[a-f0-9]{64}$/u);
  assert.ok(!a.password.includes(crmCredsEnv.STAGING_MYSQL_ROOT_PASSWORD));
  assert.notEqual(
    a.password,
    deriveStagingCrmDatabaseIdentity({
      ...crmCredsEnv,
      STAGING_MYSQL_ROOT_PASSWORD: "another-root-secret-0123456789",
    }).password,
  );
  assert.equal(Object.isFrozen(a), true);
});

test("CRM secret derivation fails closed for production/missing root identity", () => {
  for (const environment of [
    { ...crmCredsEnv, RENDER_SERVICE_NAME: "morro-digital-v2" },
    { ...crmCredsEnv, RENDER_SERVICE_NAME: "morro-digital-v2-production" },
    { ...crmCredsEnv, RENDER_SERVICE_NAME: "" },
  ]) {
    assert.throws(
      () => deriveStagingCrmDatabaseIdentity(environment),
      /STAGING_CRM_SERVICE_DENIED/u,
    );
  }
  for (const secret of ["", "root-secret", "short"]) {
    assert.throws(
      () =>
        deriveStagingCrmDatabaseIdentity({
          ...crmCredsEnv,
          STAGING_MYSQL_ROOT_PASSWORD: secret,
        }),
      /STAGING_CRM_ROOT_SECRET_INVALID/u,
    );
  }
});

const crmBase = {
  RENDER_SERVICE_NAME: "morro-digital-v2-staging",
  STAGING_MYSQL_HOSTPORT: "morro-digital-v2-staging-mysql:3306",
  STAGING_MYSQL_ROOT_PASSWORD: "root-secret-0123456789abcdef",
};
function crmFixture(changes = {}) {
  const identity = deriveStagingCrmDatabaseIdentity(crmBase);
  const u = new URL("mysql://placeholder.invalid/");
  u.host = crmBase.STAGING_MYSQL_HOSTPORT;
  u.username = identity.user;
  u.password = identity.password;
  u.pathname = "/" + identity.database;
  return { ...crmBase, CRM_DATABASE_URL: u.toString(), ...changes };
}

test("only exact staging predeploy command can apply CRM migrations", () => {
  const f = crmFixture();
  assert.equal(
    isStagingCrmMigrationCommand(f, "node", [
      "apps/morro-digital-platform/tooling/staging-predeploy.mjs",
    ]),
    true,
  );
  for (const [environment, command, args] of [
    [f, "node", ["apps/morro-digital-platform/tooling/dev-server.mjs"]],
    [
      f,
      "node",
      ["apps/morro-digital-platform/tooling/staging-predeploy.mjs", "--other"],
    ],
    [
      f,
      "node",
      [
        "apps/morro-digital-platform/tooling/production-runtime-database-predeploy.mjs",
      ],
    ],
    [
      { ...f, RENDER_SERVICE_NAME: "morro-digital-v2" },
      "node",
      ["apps/morro-digital-platform/tooling/staging-predeploy.mjs"],
    ],
  ]) {
    assert.equal(
      isStagingCrmMigrationCommand(environment, command, args),
      false,
    );
  }
});

test("migration validation refuses foreign DB/user/host and root credential changes", () => {
  const f = crmFixture();
  assert.equal(
    validateStagingCrmConnectionIdentity(f).database,
    "morro_crm_staging",
  );
  for (const changes of [
    { CRM_DATABASE_URL: "mysql://root:bad@127.0.0.1:3306/morro_crm_staging" },
    {
      CRM_DATABASE_URL: f.CRM_DATABASE_URL.replace(
        "morro_crm_staging",
        "morro_auth_staging",
      ),
    },
    { CRM_DATABASE_URL: f.CRM_DATABASE_URL.replace("morro_crm", "morro_auth") },
    { STAGING_MYSQL_ROOT_PASSWORD: "changed-root-secret-0123456789" },
  ]) {
    assert.throws(
      () => validateStagingCrmConnectionIdentity({ ...f, ...changes }),
      /STAGING_CRM_URL_IDENTITY_MISMATCH/u,
    );
  }
  assert.throws(
    () =>
      validateStagingCrmConnectionIdentity({
        ...f,
        RENDER_SERVICE_NAME: "morro-digital-v2",
      }),
    /STAGING_CRM_SERVICE_DENIED/u,
  );
});

test("schema migration is additive, verifies real owner and tables, closes pool", async () => {
  const queries = [];
  let closed = false;
  const pool = {
    async query(sql) {
      queries.push(sql);
      if (sql.startsWith("SELECT DATABASE()")) {
        return [
          [
            {
              database_name: "morro_crm_staging",
              current_user_name: "morro_crm",
            },
          ],
        ];
      }
      if (sql.startsWith("SELECT TABLE_NAME")) {
        return [
          [
            "crm_leads",
            "crm_follow_ups",
            "crm_trials",
            "crm_referrals",
            "crm_settings",
            "crm_storage_objects",
            "crm_commerce_customers",
            "crm_commerce_purchases",
          ].map((name) => ({ name })),
        ];
      }
      return [[]];
    },
    async end() {
      closed = true;
    },
  };
  const calls = [];
  const crm = {
    createCrmMySqlPoolFromEnvironment(options) {
      assert.equal(options.CRM_DATABASE_URL, crmFixture().CRM_DATABASE_URL);
      return pool;
    },
    async applyCrmM155Schema(p) {
      assert.equal(p, pool);
      calls.push("m155");
    },
    async applyCrmCommerceSchema(p) {
      assert.equal(p, pool);
      calls.push("commerce");
    },
  };
  const result = await runStagingCrmMigration(crmFixture(), { crm });
  assert.equal(result.status, "pass");
  assert.equal(result.database, "morro_crm_staging");
  assert.equal(result.user, "morro_crm");
  assert.deepEqual(calls, ["m155", "commerce"]);
  assert.equal(closed, true);
  assert.ok(queries.some((sql) => sql.startsWith("SELECT DATABASE()")));
  assert.ok(queries.some((sql) => sql.startsWith("SELECT TABLE_NAME")));
  assert.ok(queries.includes("SELECT id FROM crm_leads LIMIT 1"));
  assert.equal(JSON.stringify(result).includes("root-secret"), false);
});

test("schema readback and owner mismatch fail closed and always close", async () => {
  for (const failure of ["owner", "tables"]) {
    let closed = false,
      applied = false;
    const pool = {
      async query(sql) {
        if (sql.startsWith("SELECT DATABASE()")) {
          return [
            [
              {
                database_name:
                  failure === "owner"
                    ? "morro_auth_staging"
                    : "morro_crm_staging",
                current_user_name: "morro_crm",
              },
            ],
          ];
        }
        if (sql.startsWith("SELECT TABLE_NAME"))
          return [[{ name: "crm_leads" }]];
        return [[]];
      },
      async end() {
        closed = true;
      },
    };
    const crm = {
      createCrmMySqlPoolFromEnvironment: () => pool,
      async applyCrmM155Schema() {
        applied = true;
      },
      async applyCrmCommerceSchema() {},
    };
    await assert.rejects(
      runStagingCrmMigration(crmFixture(), { crm }),
      failure === "owner"
        ? /STAGING_CRM_DB_OWNER_MISMATCH/u
        : /STAGING_CRM_SCHEMA_READBACK_FAILED/u,
    );
    assert.equal(closed, true);
    if (failure === "owner") assert.equal(applied, false);
  }
});
