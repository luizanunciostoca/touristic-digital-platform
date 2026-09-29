# Production MySQL Backup / Restore DR Proof

## Purpose

This runbook defines the pre-cutover disaster-recovery proof for the canonical Render MySQL service. It is deliberately read-only against the production source. It creates a logical backup, restores it into an isolated ephemeral MySQL instance, validates the restored state, retains only an encrypted backup artifact, and removes the temporary Render worker.

This proof must complete before application cutover. It does not authorize Railway destruction, production data migration, payment activation, or restoration over the production disk.

## Fixed safety boundary

The protected source is:

- service: `morro-digital-v2-production-mysql`;
- Render service id: `srv-datbsavlot8c73evbhj0`;
- persistent disk: `dsk-datbtpk9v7es7384alk0`;
- mount: `/var/lib/mysql`;
- size: 10 GB;
- region: Virginia.

The workflow fails closed unless those properties match the live Render control plane. The production source service and its disk are never deleted or recreated by the DR workflow.

The restore target is not production. It is a temporary MySQL 8.4 instance initialized under `/tmp` inside a one-off job on a uniquely named Render background worker. The temporary worker has no persistent disk. Cleanup is guarded so its service id must differ from the production MySQL service id and its name must match the dedicated DR prefix.

## Backup consistency

The production application is intentionally not cut over to this MySQL service. The workflow also rechecks the live production web service and rejects a runtime that points at the canonical production MySQL host.

Each of the 13 least-privilege schema owners produces a `mysqldump --single-transaction` for its own canonical schema. Before and after the dump set, the executor captures:

- canonical table inventory;
- table checksums;
- column definitions;
- primary-key/index metadata;
- foreign-key metadata.

Any change across the backup window fails the run. All canonical base tables must be InnoDB. This makes the multi-schema backup proof depend on measured source stability rather than assuming cross-schema root authority.

## Restore validation

The isolated restore must match the source for:

- all 13 canonical schemas;
- all 91 canonical tables;
- per-table row counts;
- per-table checksums;
- columns;
- primary keys and indexes;
- foreign keys;
- the canonical destination seed `morro-de-sao-paulo`;
- 12 Business tables;
- 14 Financial tables;
- the canonical scope-policy inventory.

The scope-policy manifest is contract-tested against `canonicalProductionDomains` and `canonicalProductionScopePolicy` from the production bootstrap source so that the live inventory and the repository authority cannot silently drift.

## Artifact protection and retention

The repository is public, so the SQL dump is never uploaded in plaintext.

The DR executor encrypts the logical dump with AES-256-CBC + PBKDF2 before it leaves the temporary Render worker. The encryption passphrase is derived for the run from the protected Render MySQL root secret and the source SHA; neither the root secret nor the derived passphrase is emitted or retained in artifacts.

The temporary worker never receives a GitHub credential. After encryption, the compressed ciphertext is emitted in bounded, ordered log chunks. The workflow reads those chunks through the already protected Render control-plane credential, reconstructs the ciphertext on the GitHub runner, verifies its SHA-256 and byte length, and decrypts it only as a stream to verify the plaintext dump digest. No plaintext SQL file is written on the runner.

The log transport is deliberately capped at 300 KB of encrypted compressed payload. This pre-cutover database is expected to remain far below that bound; exceeding it fails closed instead of weakening transport security. A later production backup service should use dedicated encrypted object storage rather than logs.

The retained GitHub Actions artifact contains only:

- the encrypted `.sql.enc` backup;
- the DR evidence JSON.

Retention is 90 days. Recovery from that retained artifact requires access to the protected Render secret used for key derivation.

## RPO and RTO interpretation

The workflow records backup duration and observed restore-to-validation duration. That restore-to-validation interval is the observed drill RTO for the temporary target.

A production RPO is not inferred from this pre-cutover drill. The source is measured stable during the backup window, but there is no active production-write stream against this database yet. The evidence therefore reports RPO as not production-measurable rather than inventing a zero-loss production claim.

## Rollback / failure handling

The DR workflow makes no source mutation, so a failed drill requires no data rollback.

On failure:

1. delete only the temporary DR worker whose id and name pass the cleanup guard;
2. remove runner temporary files;
3. leave `morro-digital-v2-production-mysql` and disk `dsk-datbtpk9v7es7384alk0` untouched;
4. leave Railway untouched;
5. rerun the existing production MySQL readback before investigating any source-side anomaly.

Never restore the retained dump directly over the production volume. A real disaster recovery must provision an isolated replacement target first, restore there, validate it, and only then use a separately authorized cutover procedure.

## Success contract

The workflow is authoritative only when its evidence states:

`PRODUCTION_MYSQL_BACKUP_RESTORE_PROOF = PASS`

and the GitHub Actions run itself is successful. A local contract test, successful backup without restore, or successful restore without metadata/data comparison is not sufficient.
