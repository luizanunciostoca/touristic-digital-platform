---
name: morro-exact-head-proof
description: Verifies that implementation, CI evidence and merge eligibility belong to the exact current PR head and current main lineage.
---

# morro-exact-head-proof

## Purpose
Prove identity before integration or evidence reuse.

## Inputs
- ChangeSet ID
- PR/head SHA
- current main SHA
- required checks/evidence

## Allowed operations
- Read Git/GitHub state
- Compare SHAs and trees
- Validate workflow/check identity
- Generate evidence

## Forbidden operations
- Treat stale runs as current
- Merge or deploy
- Infer equivalence without tree/contract proof

## Acceptance criteria
- PR head is explicit
- Base is current main or reconciled
- Required checks ran on the exact head
- Evidence identity is recorded

## Evidence format
- ChangeSet ID
- exact source/base/head SHA as applicable
- command/workflow/runtime target
- timestamp
- result and residual blockers

## Failure states
- STALE_BASE
- STALE_EVIDENCE
- HEAD_MISMATCH
- MISSING_REQUIRED_CHECK
