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
- Current-main commit SHA and tree SHA.
- PR-head commit SHA and tree SHA.
- Required check/workflow run IDs bound to the PR head.
- Evidence generation timestamp and freshness window.
- Command or runtime target when applicable.
- Result and residual blockers.

## Failure states

- STALE_BASE
- STALE_EVIDENCE
- HEAD_MISMATCH
- MISSING_REQUIRED_CHECK
