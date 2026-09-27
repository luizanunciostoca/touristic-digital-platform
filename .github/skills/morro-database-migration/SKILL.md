---
name: morro-database-migration
description: Designs and proves safe database migrations, persistence contracts and rollback/restore compatibility.
---

# morro-database-migration

## Purpose
Keep schema evolution durable, reversible where possible and environment-safe.

## Inputs
- Migration
- schema owner
- affected queries
- rollback/restore plan

## Allowed operations
- Create non-destructive migrations
- Run dev/test migration checks
- Prove readback

## Forbidden operations
- Destructive production migration
- DROP/TRUNCATE production
- Assume persistence from mocks

## Acceptance criteria
- Migration deterministic
- Backward compatibility assessed
- Real persistence proof where required
- Rollback/restore documented

## Evidence format
- ChangeSet ID
- exact source/base/head SHA as applicable
- command/workflow/runtime target
- timestamp
- result and residual blockers

## Failure states
- DESTRUCTIVE_UNAPPROVED
- MIGRATION_DRIFT
- PERSISTENCE_UNPROVEN
- RESTORE_GAP
