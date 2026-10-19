import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("./backup-restore-drill.sh", import.meta.url),
);

function run(extraEnvironment = {}) {
  return spawnSync("sh", [script], {
    encoding: "utf8",
    timeout: 10_000,
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
      BUSINESS_DATABASE_NAME: "morro_business_staging",
      CONTENT_DATABASE_NAME: "morro_content_staging",
      COMMERCE_DATABASE_NAME: "morro_commerce_staging",
      DESTINATIONS_DATABASE_NAME: "morro_destinations_staging",
      TICKETING_DATABASE_NAME: "morro_ticketing_staging",
      CRM_DATABASE_NAME: "",
      DRILL_KEEP_BACKUP: "false",
      DRILL_KEEP_RESTORE: "false",
      NOTIFICATIONS_DATABASE_NAME: "morro_notifications_staging",
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

const stagingDatabases = [
  "morro_auth_staging",
  "morro_ordering_staging",
  "morro_financial_staging",
  "morro_affiliates_staging",
  "morro_business_staging",
  "morro_content_staging",
  "morro_commerce_staging",
  "morro_destinations_staging",
  "morro_notifications_staging",
  "morro_ticketing_staging",
  "morro_crm_staging",
];

for (const source of stagingDatabases) {
  test(`dry-run covers ${source}`, () => {
    const result = run({
      DRILL_SOURCE_DATABASE: source,
      DRILL_RESTORE_DATABASE: `${source}_restore_drill_ci`,
    });
    assert.equal(result.status, 0, result.stderr);
    const plannedRecord = JSON.parse(result.stdout);
    assert.equal(plannedRecord.status, "planned");
    assert.equal(plannedRecord.sourceDatabase, source);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /ci-not-a-secret-value/u,
    );
  });
}

test("CRM cannot be redirected through an arbitrary environment identity", () => {
  const result = run({
    CRM_DATABASE_NAME: "arbitrary_crm_database",
    DRILL_SOURCE_DATABASE: "arbitrary_crm_database",
    DRILL_RESTORE_DATABASE: "arbitrary_crm_database_restore_drill_ci",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DRILL_SOURCE_DATABASE_DENIED/u);
});

for (const domain of ["COMMERCE", "TICKETING"]) {
  test(`${domain} requires its injected database identity`, () => {
    const source = `morro_${domain.toLowerCase()}_staging`;
    const result = run({
      [`${domain}_DATABASE_NAME`]: "",
      DRILL_SOURCE_DATABASE: source,
      DRILL_RESTORE_DATABASE: `${source}_restore_drill_ci`,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /DRILL_SOURCE_DATABASE_DENIED/u);
  });
}

for (const [name, environment, code] of [
  [
    "production environment",
    { DRILL_ENVIRONMENT: "production" },
    "DRILL_ENVIRONMENT_DENIED",
  ],
  [
    "missing confirmation",
    { DRILL_CONFIRM: "" },
    "DRILL_CONFIRMATION_REQUIRED",
  ],
  [
    "same restore schema",
    { DRILL_RESTORE_DATABASE: "morro_ordering_staging" },
    "DRILL_RESTORE_DATABASE_MUST_DIFFER",
  ],
  [
    "invalid identifier",
    { DRILL_SOURCE_DATABASE: "unsafe-source" },
    "DRILL_IDENTIFIER_INVALID",
  ],
  [
    "CRM in another service",
    {
      RENDER_SERVICE_NAME: "morro-digital-v2",
      DRILL_SOURCE_DATABASE: "morro_crm_staging",
      DRILL_RESTORE_DATABASE: "morro_crm_staging_restore_drill_ci",
    },
    "DRILL_SERVICE_DENIED",
  ],
]) {
  test(`preserves guard: ${name}`, () => {
    const result = run(environment);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(code), result.stderr);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /ci-not-a-secret-value/u,
    );
  });
}

for (const keepBackup of ["false", "true"]) {
  test(`failed dump removes partial backup with keepBackup=${keepBackup}`, () => {
    const fixture = mkdtempSync(join(tmpdir(), "morro-drill-failure-"));
    try {
      const bin = join(fixture, "bin");
      const backup = join(fixture, "backup");
      const calls = join(fixture, "calls.log");
      mkdirSync(bin);
      const mysql = join(bin, "mysql");
      writeFileSync(
        mysql,
        [
          "#!/bin/sh",
          "set -eu",
          'printf "%s\\n" "mysql $*" >> "$DRILL_STUB_CALLS"',
          'case "$*" in',
          '  *"--execute=SELECT COUNT(*) FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME="*) printf "0\\n" ;;',
          "  *) exit 91 ;;",
          "esac",
          "",
        ].join("\n"),
      );
      const dump = join(bin, "mysqldump");
      writeFileSync(
        dump,
        [
          "#!/bin/sh",
          "set -eu",
          'printf "%s\\n" "mysqldump $*" >> "$DRILL_STUB_CALLS"',
          'printf "INCOMPLETE_DUMP_STUB\\n"',
          "exit 23",
          "",
        ].join("\n"),
      );
      chmodSync(mysql, 0o700);
      chmodSync(dump, 0o700);
      const result = run({
        PATH: `${bin}:${process.env.PATH}`,
        DRILL_STUB_CALLS: calls,
        DRILL_DRY_RUN: "false",
        DRILL_BACKUP_DIRECTORY: backup,
        DRILL_KEEP_BACKUP: keepBackup,
      });
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.deepEqual(
        readdirSync(backup),
        [],
        "a failed dump must never be retained",
      );
      assert.match(result.stderr, /DRILL_BACKUP_FAILED/u);
      assert.doesNotMatch(result.stdout, /"status":"pass"/u);
      const invocations = readFileSync(calls, "utf8");
      assert.equal(invocations.trim().split("\n").length, 2);
      assert.match(
        invocations,
        /SELECT COUNT\(\*\) FROM INFORMATION_SCHEMA\.SCHEMATA/u,
      );
      assert.match(invocations, /mysqldump /u);
      assert.doesNotMatch(
        invocations,
        /CREATE DATABASE|DROP DATABASE|--execute=.*INSERT/iu,
      );
      assert.doesNotMatch(
        result.stdout + result.stderr + invocations,
        /ci-not-a-secret-value/u,
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}
