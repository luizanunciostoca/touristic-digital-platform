import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveStagingCrmDatabaseIdentity,
  stagingCrmIdentity,
} from "./staging-crm-credentials.mjs";

const env = {
  RENDER_SERVICE_NAME: "morro-digital-v2-staging",
  STAGING_MYSQL_ROOT_PASSWORD: "root-secret-0123456789abcdef",
};
test("CRM derives a deterministic, independent staging-only MySQL user", () => {
  const a = deriveStagingCrmDatabaseIdentity(env);
  const b = deriveStagingCrmDatabaseIdentity(env);
  assert.deepEqual(a, b);
  assert.equal(a.domain, "CRM");
  assert.equal(a.database, "morro_crm_staging");
  assert.equal(a.user, "morro_crm");
  assert.equal(stagingCrmIdentity.service, env.RENDER_SERVICE_NAME);
  assert.match(a.password, /^[a-f0-9]{64}$/u);
  assert.ok(!a.password.includes(env.STAGING_MYSQL_ROOT_PASSWORD));
  assert.notEqual(
    a.password,
    deriveStagingCrmDatabaseIdentity({
      ...env,
      STAGING_MYSQL_ROOT_PASSWORD: "another-root-secret-0123456789",
    }).password,
  );
  assert.equal(Object.isFrozen(a), true);
});

test("CRM secret derivation fails closed for production/missing root identity", () => {
  for (const environment of [
    { ...env, RENDER_SERVICE_NAME: "morro-digital-v2" },
    { ...env, RENDER_SERVICE_NAME: "morro-digital-v2-production" },
    { ...env, RENDER_SERVICE_NAME: "" },
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
          ...env,
          STAGING_MYSQL_ROOT_PASSWORD: secret,
        }),
      /STAGING_CRM_ROOT_SECRET_INVALID/u,
    );
  }
});
