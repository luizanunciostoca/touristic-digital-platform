---
name: morro-dr-restore
description: Prove backup integrity and disaster-recovery restore procedures in isolated safe targets.
---

# morro-dr-restore

## Purpose

Make recovery a tested capability instead of documentation-only.

## Inputs

- Database/storage topology
- backup identity
- restore target
- RPO/RTO expectations

## Allowed operations

- Run isolated restore tests
- Validate backup identity
- Prove application readback

## Forbidden operations

- Destroy production data
- Assume backup validity without restore
- Expose backup secrets

## Acceptance criteria

- Backup identified
- Restore succeeds
- Application reads restored state
- Timing/scope recorded

## Evidence format

- ChangeSet ID.
- Exact base/head/source SHA as applicable.
- Command, workflow run, or runtime target.
- Timestamp, result, and residual blockers.

## Failure states

- BACKUP_UNRESTORABLE
- RESTORE_IDENTITY_MISMATCH
- APPLICATION_READBACK_FAIL
- RPO_RTO_UNPROVEN
