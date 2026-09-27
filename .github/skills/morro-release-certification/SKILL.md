---
name: morro-release-certification
description: Certify exact-main release identity and immutable build-once promotion evidence.
---

# morro-release-certification

## Purpose

Protect BUILD-ONCE / PROMOTE-SAME-ARTIFACT across staging and production.

## Inputs

- exact main SHA and tree
- candidate artifact identity
- OCI digest
- provenance/attestation
- staging evidence

## Allowed operations

- Validate release workflows and identities
- Run non-destructive certification checks
- Produce release evidence

## Forbidden operations

- Rebuild between environments
- Bypass staging
- Direct production deploy
- Provider activation

## Acceptance criteria

- Exact main certified
- Artifact/digest immutable
- Lockfile digest recorded and bound to the certified candidate
- Provenance matches source
- Staging precedes production

## Evidence format

- ChangeSet ID.
- Exact base/head/source SHA as applicable.
- Command, workflow run, or runtime target.
- Timestamp, result, and residual blockers.

## Failure states

- ARTIFACT_DRIFT
- PROVENANCE_MISMATCH
- STAGING_NOT_ACCEPTED
- RELEASE_SHA_MISMATCH
