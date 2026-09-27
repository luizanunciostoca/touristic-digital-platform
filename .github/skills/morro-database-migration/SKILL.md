---
name: morro-database-migration
description: Design and prove safe durable database migrations, readback, rollback, and restore compatibility.
---

# morro-database-migration

## Purpose

Keep schema evolution durable and fail-safe.

## Inputs

- Migration and schema owner
- affected reads/writes
- environment
- rollback/restore plan

## Allowed operations

- Create non-destructive migrations
- Run dev/test migration checks
- Prove durable readback

## Forbidden operations

- Destructive production migration
- DROP/TRUNCATE production
- Treat mocks as persistence proof

## Acceptance criteria

- Migration deterministic
- Compatibility assessed
- Persistence proven when required
- Rollback/restore documented

## Evidence format

- ChangeSet ID.
- Exact base/head/source SHA as applicable.
- Command, workflow run, or runtime target.
- Timestamp, result, and residual blockers.

## Failure states

- DESTRUCTIVE_UNAPPROVED
- MIGRATION_DRIFT
- PERSISTENCE_UNPROVEN
- RESTORE_GAP
