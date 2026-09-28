---
name: morro-database-migration
description: Design and prove safe durable database migrations, readback, rollback, and restore compatibility.
---

# morro-database-migration

## Purpose

Keep schema evolution durable and fail-safe.

## Inputs

- ChangeSet ID and active claim covering every migration/schema path that may be written
- Migration and schema owner
- affected reads/writes
- environment
- rollback/restore plan

## Allowed operations

- Create non-destructive migrations only after an active ChangeSet claim covers the exact migration path
- Run dev/test migration checks
- Prove durable readback
- Exercise deterministic rollback/restore compatibility in a safe environment when applicable

## Forbidden operations

- Create or modify a migration outside an active ChangeSet claim
- Destructive production migration
- DROP/TRUNCATE production
- Treat mocks as persistence proof
- Treat a documented-only recovery plan as rollback/restore proof when execution is applicable

## Acceptance criteria

- Active ChangeSet claim covers every written migration/schema path
- Migration deterministic
- Compatibility assessed
- Persistence proven when required
- Rollback/restore plan documented
- Deterministic rollback or restore execution is exercised when applicable, followed by readback proving the recovered state and compatibility

## Evidence format

- ChangeSet ID and claimed migration/schema paths.
- Exact base/head/source SHA as applicable.
- Migration identity/version.
- Command, workflow run, or runtime target.
- Rollback/restore command or workflow identity when applicable.
- Post-rollback/restore readback result when applicable.
- Timestamp, result, and residual blockers.

## Failure states

- CLAIM_MISSING
- DESTRUCTIVE_UNAPPROVED
- MIGRATION_DRIFT
- PERSISTENCE_UNPROVEN
- RESTORE_GAP
