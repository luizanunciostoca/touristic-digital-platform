# MySQL Staging Backup / Restore Drill

## Purpose

This runbook provides the canonical executable drill for the private MySQL staging service. It proves that a logical backup can be produced and restored into an isolated schema, then compares the restored base-table set and row counts with the source.

It does **not** claim production disaster recovery, off-site backup retention, PITR, production RPO/RTO, or a production rollback. Those remain external/live gates.

## Safety boundary

The installed command is:

`/usr/local/bin/morro-mysql-backup-restore-drill`

The command fails closed unless all of the following are true:

- `DRILL_ENVIRONMENT=staging`;
- `DRILL_CONFIRM=BACKUP_RESTORE_STAGING_ONLY`;
- when Render exposes `RENDER_SERVICE_NAME`, it equals `morro-digital-v2-staging-mysql`;
- the source database equals one of the four staging database names already injected into the MySQL private service;
- the restore database is different from the source and begins with `<source>_restore_drill_`;
- the backup directory is not the MySQL data volume `/var/lib/mysql`.

The script never changes the source schema. It creates only the isolated restore schema. By default the restore schema is dropped after validation. Set `DRILL_KEEP_RESTORE=true` only when an operator needs to inspect the restored clone and accepts responsibility for later cleanup.

Passwords are supplied through environment variables and are never emitted in the JSON evidence.

## Dry-run contract

A dry-run validates the safety boundary without connecting to MySQL:

```sh
DRILL_ENVIRONMENT=staging \
DRILL_CONFIRM=BACKUP_RESTORE_STAGING_ONLY \
DRILL_DRY_RUN=true \
DRILL_SOURCE_DATABASE="$ORDERING_DATABASE_NAME" \
DRILL_RESTORE_DATABASE="${ORDERING_DATABASE_NAME}_restore_drill_plan" \
/usr/local/bin/morro-mysql-backup-restore-drill
```

Expected status: `"status":"planned"`.

## Live staging drill

Run from an authenticated shell **inside the private staging MySQL service**, never from production:

```sh
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

DRILL_ENVIRONMENT=staging \
DRILL_CONFIRM=BACKUP_RESTORE_STAGING_ONLY \
DRILL_SOURCE_DATABASE="$ORDERING_DATABASE_NAME" \
DRILL_RESTORE_DATABASE="${ORDERING_DATABASE_NAME}_restore_drill_${STAMP}" \
DRILL_BACKUP_DIRECTORY=/tmp/morro-dr \
/usr/local/bin/morro-mysql-backup-restore-drill
```

Repeat for Auth, Ordering, Financial and Affiliates when the release gate requires a complete database drill.

A successful execution returns a single `MYSQL-BACKUP-RESTORE-DRILL` JSON record with:

- source and isolated restore database names;
- logical dump filename, byte count and SHA-256;
- table count;
- UTC backup start/completion timestamps;
- UTC restore start/completion timestamps;
- whether the restore schema was retained.

Store the JSON output in the release evidence ledger. Do not store the SQL dump in Git.

## What this closes

After the script is integrated and CI passes, the repository-side status is:

- canonical backup/restore executor: **IMPLEMENTED**;
- staging-only destructive guardrails: **IMPLEMENTED + CI VERIFIED**;
- real staging backup/restore drill: **OPEN until executed on the private MySQL service**;
- external/off-site backup retention: **OPEN**;
- observed production RPO/RTO: **OPEN**;
- production DR drill: **OPEN**.

A green dry-run or syntax check must never be reported as a successful live restore.
