import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("./backup-restore-drill.sh", import.meta.url),
);

function run(extraEnvironment = {}) {
  return spawnSync("sh", [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      DRILL_ENVIRONMENT: "staging",
      DRILL_CONFIRM: "BACKUP_RESTORE_STAGING_ONLY",
      DRILL_DRY_RUN: "true",
      RENDER_SERVICE_NAME: "morro-digital-v2-staging-mysql",
      DRILL_SOURCE_QUIESCED_CONFIRMED: "true",
      AUTH_DATABASE_NAME: "morro_auth_staging",
      ORDERING_DATABASE_NAME: "morro_ordering_staging",
      FINANCIAL_DATABASE_NAME: "morro_financial_staging",
      AFFILIATES_DATABASE_NAME: "morro_affiliates_staging",
      DRILL_SOURCE_DATABASE: "morro_ordering_staging",
      DRILL_RESTORE_DATABASE: "morro_ordering_staging_restore_drill_ci",
      DRILL_MYSQL_PASSWORD: "ci-not-a-secret-value",
      ...extraEnvironment,
    },
  });
}

const syntax = spawnSync("sh", ["-n", script], { encoding: "utf8" });
assert.equal(syntax.status, 0, syntax.stderr);

const planned = run();
assert.equal(planned.status, 0, planned.stderr);
assert.match(planned.stdout, /"contract":"MYSQL-BACKUP-RESTORE-DRILL"/u);
assert.match(planned.stdout, /"status":"planned"/u);
assert.doesNotMatch(planned.stdout, /ci-not-a-secret-value/u);
assert.doesNotMatch(planned.stderr, /ci-not-a-secret-value/u);
assert.match(planned.stdout, /"sourceQuiescedConfirmed":true/u);
assert.match(planned.stdout, /"keepBackup":false/u);

const missingService = run({
  RENDER_SERVICE_NAME: "",
});
assert.notEqual(missingService.status, 0);
assert.match(missingService.stderr, /DRILL_SERVICE_DENIED/u);

const notQuiesced = run({
  DRILL_SOURCE_QUIESCED_CONFIRMED: "false",
});
assert.notEqual(notQuiesced.status, 0);
assert.match(
  notQuiesced.stderr,
  /DRILL_SOURCE_QUIESCED_CONFIRMATION_REQUIRED/u,
);

const productionService = run({
  RENDER_SERVICE_NAME: "morro-digital-v2",
});
assert.notEqual(productionService.status, 0);
assert.match(productionService.stderr, /DRILL_SERVICE_DENIED/u);

const unknownSource = run({
  DRILL_SOURCE_DATABASE: "unknown_database",
  DRILL_RESTORE_DATABASE: "unknown_database_restore_drill_ci",
});
assert.notEqual(unknownSource.status, 0);
assert.match(unknownSource.stderr, /DRILL_SOURCE_DATABASE_DENIED/u);

const unsafeRestore = run({
  DRILL_RESTORE_DATABASE: "morro_ordering_staging_copy",
});
assert.notEqual(unsafeRestore.status, 0);
assert.match(unsafeRestore.stderr, /DRILL_RESTORE_DATABASE_NAME_DENIED/u);

const mysqlDataVolumeBackup = run({
  DRILL_BACKUP_DIRECTORY: "/var/lib/mysql/drill",
});
assert.notEqual(mysqlDataVolumeBackup.status, 0);
assert.match(
  mysqlDataVolumeBackup.stderr,
  /DRILL_BACKUP_TARGET_MUST_NOT_BE_MYSQL_DATA_VOLUME/u,
);

console.log(
  "Staging MySQL backup/restore drill contract valid: staging-only, explicit confirmation, isolated restore schema, no secret output.",
);
