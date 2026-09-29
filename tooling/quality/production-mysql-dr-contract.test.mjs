import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const authorityPath =
  "apps/morro-digital-platform/tooling/production-database-predeploy.mjs";
const manifestPath =
  "tooling/render/mysql-production-dr/canonical-manifest.tsv";
const executorPath = "tooling/render/mysql-production-dr/dr-proof.sh";
const dockerfilePath = "tooling/render/mysql-production-dr/Dockerfile";
const workflowPath =
  ".github/workflows/production-mysql-backup-restore-proof.yml";

function manifestRows() {
  const [header, ...lines] = readFileSync(manifestPath, "utf8")
    .trim()
    .split(/\r?\n/u);
  assert.equal(header, "schema\ttable\tscope");
  return lines.map((line) => line.split("\t"));
}

test("DR canonical manifest exactly matches production bootstrap authority", () => {
  const actual = manifestRows();
  const authority = readFileSync(authorityPath, "utf8");
  const domainsStart = authority.indexOf(
    "export const canonicalProductionDomains",
  );
  const scopeStart = authority.indexOf(
    "export const canonicalProductionScopePolicy",
  );
  const scopeEnd = authority.indexOf("function safeFailureCode");

  assert.ok(domainsStart >= 0);
  assert.ok(scopeStart > domainsStart);
  assert.ok(scopeEnd > scopeStart);

  const domainsSection = authority.slice(domainsStart, scopeStart);
  const scopeSection = authority.slice(scopeStart, scopeEnd);
  const domainPattern =
    /Object\.freeze\(\{\s*name:\s*"([^"]+)",[\s\S]*?schema:\s*"([^"]+)",\s*expectedTables:\s*Object\.freeze\(\[([\s\S]*?)\]\),\s*\}\)/gu;

  const expected = [];
  for (const match of domainsSection.matchAll(domainPattern)) {
    const schema = match[2];
    const tables = [...match[3].matchAll(/"([a-z0-9_]+)"/gu)].map(
      (tableMatch) => tableMatch[1],
    );

    for (const table of tables) {
      const scopeMatch = new RegExp("\\b" + table + ': "([^"]+)"', "u").exec(
        scopeSection,
      );
      assert.ok(scopeMatch, `missing canonical scope for ${table}`);
      expected.push([schema, table, scopeMatch[1]]);
    }
  }

  assert.equal(actual.length, 91);
  assert.equal(new Set(actual.map(([schema]) => schema)).size, 13);
  assert.equal(
    new Set(actual.map(([schema, table]) => `${schema}.${table}`)).size,
    91,
  );
  assert.equal(expected.length, 91);
  assert.equal(new Set(expected.map(([schema]) => schema)).size, 13);
  assert.deepEqual(actual, expected);
});

test("DR executor is syntactically valid and fails closed around production", () => {
  const syntax = spawnSync("bash", ["-n", executorPath], {
    encoding: "utf8",
  });
  assert.equal(syntax.status, 0, syntax.stderr);

  const source = readFileSync(executorPath, "utf8");
  for (const required of [
    "morro-digital-v2-production-mysql",
    "MAX_ENCRYPTED_BYTES=300000",
    "--single-transaction",
    "CHECKSUM TABLE",
    "SOURCE_DATA_CHANGED_DURING_BACKUP",
    "--initialize-insecure",
    "RESTORE_CHECKSUM_MISMATCH",
    "RESTORE_ROW_COUNT_MISMATCH",
    "AES-256-CBC",
    "PBKDF2",
    "DR_ENCRYPTION_SECRET",
    "/usr/local/bin/morro-mysql-readback",
    "RESTORE_LEAST_PRIVILEGE_READBACK_FAILED",
    "schemaOwners",
    "crossDomainDenied",
    "PRE_CUTOVER_SOURCE_STABLE_DURING_BACKUP",
  ]) {
    assert.ok(
      source.includes(required),
      `missing DR executor contract: ${required}`,
    );
  }

  assert.match(
    source,
    /\/var\/lib\/mysql\|\/var\/lib\/mysql\/\*\) fail "BACKUP_PATH_FORBIDDEN"/u,
  );
  assert.doesNotMatch(source, /DROP\s+DATABASE|DROP\s+TABLE|TRUNCATE\s+TABLE/iu);
  assert.doesNotMatch(source, /MYSQL_ROOT_PASSWORD/u);
  assert.doesNotMatch(source, /GITHUB_TOKEN|DR_UPLOAD_TOKEN/u);
});

test("DR worker image uses the exact pinned MySQL 8.4 base", () => {
  const source = readFileSync(dockerfilePath, "utf8");
  assert.match(
    source,
    /^FROM mysql:8\.4@sha256:0744ee5ef89ce6ccfa13de3e579fe6b9e27f93dd70da9c06d2c908b1b193fb8d$/mu,
  );
  assert.match(source, /^USER root$/mu);
  assert.match(source, /microdnf install -y jq gzip/u);
  assert.match(
    source,
    /COPY tooling\/render\/mysql-production\/readback\.sh \/usr\/local\/bin\/morro-mysql-readback/u,
  );
  assert.match(source, /^USER mysql$/mu);
  assert.ok(source.lastIndexOf("USER mysql") > source.lastIndexOf("USER root"));
  assert.match(source, /CMD \["bash", "-lc", "sleep infinity"\]/u);
});

test("DR workflow never delegates GitHub credentials or deletes the source service", () => {
  const source = readFileSync(workflowPath, "utf8");

  for (const required of [
    "srv-datbsavlot8c73evbhj0",
    "dsk-datbtpk9v7es7384alk0",
    "morro-digital-v2-production-mysql-dr-",
    "MORRO-PRODUCTION-MYSQL-BACKUP-CHUNK",
    "production-mysql-backup-restore-proof-",
    "retention-days: 90",
    "PRODUCTION_MYSQL_DR_ENCRYPTION_KEY_V1",
    "github-actions-production-mysql-dr-key-v1",
    ".restore.leastPrivilegeReadback == true",
    ".restore.crossDomainDenied == 156",
    'test "$dr_service_id" != "$MYSQL_SERVICE_ID"',
    'test "$dr_service_name" != "$MYSQL_SERVICE_NAME"',
  ]) {
    assert.ok(
      source.includes(required),
      `missing DR workflow contract: ${required}`,
    );
  }

  assert.doesNotMatch(source, /DR_UPLOAD_TOKEN|GITHUB_TOKEN.*envVars/u);
  assert.doesNotMatch(source, /MYSQL_ROOT_PASSWORD/u);
  assert.doesNotMatch(source, /DELETE[^\n]+services\/\$MYSQL_SERVICE_ID/iu);
  assert.ok(
    source.includes(
      "node --test tooling/quality/production-mysql-dr-contract.test.mjs",
    ),
  );
});
