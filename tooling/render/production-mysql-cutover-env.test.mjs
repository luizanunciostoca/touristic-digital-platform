import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCutoverEnvironment,
  databaseUrl,
  normalizeRenderEnvVars,
  productionDatabaseDomains,
} from "./production-mysql-cutover-env.mjs";

const SHA = "a".repeat(40);
const PREVIOUS_SHA = "b".repeat(40);

function mysqlEnvironment() {
  return productionDatabaseDomains.flatMap(({ prefix, schema }, index) => [
    { envVar: { key: `${prefix}_DATABASE_NAME`, value: schema } },
    { envVar: { key: `${prefix}_DATABASE_USER`, value: schema } },
    {
      envVar: {
        key: `${prefix}_DATABASE_PASSWORD`,
        value: `secret-${index}-:/?#[]@`,
      },
    },
  ]);
}

test("normalizes Render env-var wrapper responses without exposing shape drift", () => {
  assert.deepEqual(
    normalizeRenderEnvVars([
      { envVar: { key: "A", value: "1" } },
      { envVar: { key: "B", value: "2" } },
    ]),
    [
      { key: "A", value: "1" },
      { key: "B", value: "2" },
    ],
  );
});

test("rejects Render env responses whose values are unavailable", () => {
  assert.throws(
    () => normalizeRenderEnvVars([{ envVar: { key: "A" } }]),
    /RENDER_ENV_VALUE_UNAVAILABLE:A/u,
  );
});

test("database URL safely encodes owner credentials", () => {
  const value = new URL(
    databaseUrl({
      host: "mysql.internal",
      port: "3306",
      user: "morro_business",
      password: "p@ss word:/?#[]",
      database: "morro_business",
    }),
  );
  assert.equal(value.hostname, "mysql.internal");
  assert.equal(value.port, "3306");
  assert.equal(value.username, "morro_business");
  assert.equal(decodeURIComponent(value.password), "p@ss word:/?#[]");
  assert.equal(value.pathname, "/morro_business");
});

test("cutover replaces exactly thirteen database URLs and preserves all other env vars", () => {
  const webEnvironment = [
    { envVar: { key: "NODE_ENV", value: "production" } },
    {
      envVar: {
        key: "AUTH_DATABASE_URL",
        value: "mysql://legacy:secret@legacy.invalid/morro_auth",
      },
    },
    { envVar: { key: "UNRELATED_SECRET", value: "keep-me" } },
  ];

  const result = buildCutoverEnvironment({
    mysqlEnvironment: mysqlEnvironment(),
    webEnvironment,
    expectedSha: SHA,
    previousDeployId: "dep-previous123",
    previousReleaseSha: PREVIOUS_SHA,
  });

  const next = new Map(result.next.map(({ key, value }) => [key, value]));
  assert.equal(next.get("NODE_ENV"), "production");
  assert.equal(next.get("UNRELATED_SECRET"), "keep-me");
  assert.equal(
    next.get("MORRO_DATABASE_TOPOLOGY"),
    "render-private-domain-users",
  );
  assert.equal(next.get("MORRO_DATABASE_CUTOVER_SHA"), SHA);
  assert.equal(
    next.get("MORRO_DATABASE_ROLLBACK_DEPLOY_ID"),
    "dep-previous123",
  );
  assert.equal(next.get("MORRO_DATABASE_ROLLBACK_RELEASE_SHA"), PREVIOUS_SHA);

  for (const { key, schema } of productionDatabaseDomains) {
    const url = new URL(next.get(key));
    assert.equal(url.hostname, "morro-digital-v2-production-mysql");
    assert.equal(url.port, "3306");
    assert.equal(url.pathname, `/${schema}`);
    assert.equal(url.username, schema);
  }

  const rollback = JSON.parse(
    Buffer.from(
      next.get("MORRO_DATABASE_ROLLBACK_URLS_B64"),
      "base64",
    ).toString("utf8"),
  );
  assert.equal(rollback.version, 1);
  assert.equal(rollback.variables.length, 13);
  assert.deepEqual(rollback.variables[0], {
    key: "AUTH_DATABASE_URL",
    present: true,
    value: "mysql://legacy:secret@legacy.invalid/morro_auth",
  });
});

test("cutover refuses to overwrite an existing successful topology marker", () => {
  assert.throws(
    () =>
      buildCutoverEnvironment({
        mysqlEnvironment: mysqlEnvironment(),
        webEnvironment: [
          {
            envVar: {
              key: "MORRO_DATABASE_TOPOLOGY",
              value: "render-private-domain-users",
            },
          },
        ],
        expectedSha: SHA,
        previousDeployId: "dep-previous123",
        previousReleaseSha: PREVIOUS_SHA,
      }),
    /PRODUCTION_MYSQL_CUTOVER_ALREADY_APPLIED/u,
  );
});

test("cutover rejects a domain owner/schema mismatch", () => {
  const values = mysqlEnvironment();
  const businessUser = values.find(
    (entry) => entry.envVar.key === "BUSINESS_DATABASE_USER",
  );
  businessUser.envVar.value = "shared_user";
  assert.throws(
    () =>
      buildCutoverEnvironment({
        mysqlEnvironment: values,
        webEnvironment: [],
        expectedSha: SHA,
        previousDeployId: "dep-previous123",
        previousReleaseSha: PREVIOUS_SHA,
      }),
    /PRODUCTION_MYSQL_OWNER_MISMATCH:BUSINESS/u,
  );
});
