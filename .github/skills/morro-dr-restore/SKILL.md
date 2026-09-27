---
name: morro-dr-restore
description: Designs and proves disaster recovery, backup integrity and restore procedures without destructive production experimentation.
---

# morro-dr-restore

## Purpose
Make recovery a tested capability rather than documentation-only.

## Inputs
- Database/storage topology
- backup artifact
- restore target
- RPO/RTO expectations

## Allowed operations
- Run isolated restore tests
- Validate backup identity
- Document recovery evidence

## Forbidden operations
- Destroy production data
- Assume backup validity without restore
- Expose backup secrets

## Acceptance criteria
- Backup identified
- Isolated restore succeeds
- Application can read restored state
- Evidence records timing and scope

## Evidence format
- ChangeSet ID
- exact source/base/head SHA as applicable
- command/workflow/runtime target
- timestamp
- result and residual blockers

## Failure states
- BACKUP_UNRESTORABLE
- RESTORE_IDENTITY_MISMATCH
- APPLICATION_READBACK_FAIL
- RPO_RTO_UNPROVEN
