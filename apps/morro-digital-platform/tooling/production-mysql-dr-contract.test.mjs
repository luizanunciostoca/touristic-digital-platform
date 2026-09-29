import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canonicalProductionDomains,
  canonicalProductionScopePolicy,
} from "./production-database-predeploy.mjs";

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
  const expected = canonicalProductionDomains.flatMap((domain) =>
    domain.expectedTables.map((table) => [
      domain.schema,
      table,
      canonicalProductionScopePolicy[domain.name][table],
    ]),
  );

  assert.equal(actual.length, 91);
  assert.equal(new Set(actual.map(([schema]) => schema)).size, 13);
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
    "PRE_CUTOVER_SOURCE_STABLE_DURING_BACKUP",
  ]) {
    assert.ok(source.includes(required), `missing DR executor contract: ${required}`);
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
  assert.match(source, /^USER mysql$/mu);
  assert.ok(source.lastIndexOf("USER mysql") > source.lastIndexOf("USER root"));
  assert.match(
    source,
    /CMD \["bash", "-lc", "sleep infinity"\]/u,
  );
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
    'test "$dr_service_id" != "$MYSQL_SERVICE_ID"',
    'test "$dr_service_name" != "$MYSQL_SERVICE_NAME"',
  ]) {
    assert.ok(source.includes(required), `missing DR workflow contract: ${required}`);
  }

  assert.doesNotMatch(source, /DR_UPLOAD_TOKEN|GITHUB_TOKEN.*envVars/u);
  assert.doesNotMatch(
    source,
    /DELETE[^\n]+services\/\$MYSQL_SERVICE_ID/iu,
  );
  assert.match(
    source,
    /node --test apps\\/morro-digital-platform\\/tooling\\/production-mysql-dr-contract\\.test\\.mjs/u,
  );
});
