import assert from "node:assert/strict";
import test from "node:test";
import {
  isStagingCrmMigrationCommand,
  runStagingCrmMigration,
  validateStagingCrmConnectionIdentity,
} from "./staging-crm-migrate.mjs";
import { deriveStagingCrmDatabaseIdentity } from "./staging-crm-credentials.mjs";

const base = {
  RENDER_SERVICE_NAME: "morro-digital-v2-staging",
  STAGING_MYSQL_HOSTPORT: "morro-digital-v2-staging-mysql:3306",
  STAGING_MYSQL_ROOT_PASSWORD: "root-secret-0123456789abcdef",
};
function fixture(changes = {}) {
  const identity = deriveStagingCrmDatabaseIdentity(base);
  const u = new URL("mysql://placeholder.invalid/");
  u.host = base.STAGING_MYSQL_HOSTPORT;
  u.username = identity.user;
  u.password = identity.password;
  u.pathname = "/" + identity.database;
  return { ...base, CRM_DATABASE_URL: u.toString(), ...changes };
}

test("only exact staging predeploy command can apply CRM migrations", () => {
  const f = fixture();
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
  const f = fixture();
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
      assert.equal(options.CRM_DATABASE_URL, fixture().CRM_DATABASE_URL);
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
  const result = await runStagingCrmMigration(fixture(), { crm });
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
      runStagingCrmMigration(fixture(), { crm }),
      failure === "owner"
        ? /STAGING_CRM_DB_OWNER_MISMATCH/u
        : /STAGING_CRM_SCHEMA_READBACK_FAILED/u,
    );
    assert.equal(closed, true);
    if (failure === "owner") assert.equal(applied, false);
  }
});
