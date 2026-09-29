import assert from "node:assert/strict";

import mysql from "mysql2/promise";

import { validateRuntimePrivilegeBoundaries } from "./production-runtime-database-predeploy.mjs";

const adminDatabaseUrl = String(
  process.env.MYSQL_ADMIN_DATABASE_URL ?? "",
).trim();
assert.ok(adminDatabaseUrl, "MYSQL_ADMIN_DATABASE_URL_REQUIRED");

const schema = "morro_runtime_predeploy_test";
const user = "morro_runtime_predeploy_test";
const role = "morro_runtime_predeploy_role";
const password = "runtime-predeploy-test-password";
const domain = Object.freeze({ name: "integration", schema });

function runtimeDatabaseUrl() {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${schema}`;
  url.username = user;
  url.password = password;
  return url.toString();
}

const admin = mysql.createPool({
  uri: adminDatabaseUrl,
  connectionLimit: 2,
  waitForConnections: true,
  timezone: "Z",
});

async function runtimePool() {
  return mysql.createPool({
    uri: runtimeDatabaseUrl(),
    connectionLimit: 2,
    waitForConnections: true,
    timezone: "Z",
  });
}

try {
  await admin.query(`DROP USER IF EXISTS \`${user}\`@'%'`);
  await admin.query(`DROP ROLE IF EXISTS \`${role}\`@'%'`);
  await admin.query(`DROP DATABASE IF EXISTS \`${schema}\``);
  await admin.query(`CREATE DATABASE \`${schema}\``);
  await admin.query(`CREATE USER \`${user}\`@'%' IDENTIFIED BY '${password}'`);
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON \`${schema}\`.* TO \`${user}\`@'%'`,
  );

  const bounded = await runtimePool();
  try {
    await validateRuntimePrivilegeBoundaries(domain, bounded);
  } finally {
    await bounded.end();
  }

  await admin.query(`CREATE ROLE \`${role}\`@'%'`);
  await admin.query(`GRANT \`${role}\`@'%' TO \`${user}\`@'%'`);

  const roleBound = await runtimePool();
  try {
    await assert.rejects(
      validateRuntimePrivilegeBoundaries(domain, roleBound),
      /PRODUCTION_RUNTIME_DATABASE_ROLE_PRIVILEGE_INVALID_INTEGRATION/u,
    );
  } finally {
    await roleBound.end();
  }

  process.stdout.write(
    "Production runtime privilege MySQL 8.4 integration: PASS\n",
  );
} finally {
  await admin.query(`DROP USER IF EXISTS \`${user}\`@'%'`);
  await admin.query(`DROP ROLE IF EXISTS \`${role}\`@'%'`);
  await admin.query(`DROP DATABASE IF EXISTS \`${schema}\``);
  await admin.end();
}
