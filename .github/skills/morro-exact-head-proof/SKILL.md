---
name: morro-exact-head-proof
description: Verify exact-head identity, current-main lineage, and freshness of CI evidence before integration.
---

# morro-exact-head-proof

## Purpose

Prevent stale, cross-SHA, or ambiguous evidence from authorizing integration.

## Inputs

- ChangeSet ID and manifest
- current main SHA
- PR head SHA
- required checks and evidence

## Allowed operations

- Read Git/GitHub state
- Compare SHA/tree identity
- Validate checks and evidence freshness
- Emit proof findings

## Forbidden operations

- Reuse evidence from a different head
- Infer tree equivalence without proof
- Merge or deploy

## Acceptance criteria

- Base/main identity is explicit
- PR head is explicit and current
- Required evidence belongs to that head
- No stale evidence is counted

## Evidence format

- ChangeSet ID.
- Exact base/head/source SHA as applicable.
- Command, workflow run, or runtime target.
- Timestamp, result, and residual blockers.

## Failure states

- STALE_BASE
- STALE_EVIDENCE
- HEAD_MISMATCH
- MISSING_REQUIRED_CHECK
