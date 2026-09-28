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
- lockfile digest
- provenance/attestation
- staging evidence
- production promotion evidence when production is in scope

## Allowed operations

- Validate release workflows and identities
- Run non-destructive certification checks
- Produce release evidence

## Forbidden operations

- Rebuild between environments
- Promote a staging artifact and a different production artifact
- Bypass staging
- Direct production deploy
- Provider activation

## Acceptance criteria

- Exact main certified
- Candidate artifact and OCI digest are immutable
- Lockfile digest recorded and bound to the certified candidate
- Provenance matches source
- Staging precedes production
- Staging and production, when production is in scope, promote the identical certified candidate artifact and identical OCI digest; no environment rebuild is permitted

## Evidence format

- ChangeSet ID.
- Exact base/head/source commit SHA and source tree SHA as applicable.
- Candidate artifact identity and immutable candidate artifact digest.
- OCI digest.
- Lockfile digest bound to the certified candidate.
- Provenance/attestation identity and verification result.
- Staging promotion/deploy run identity, timestamp, and promoted candidate/OCI digest.
- Production promotion/deploy run identity, timestamp, and promoted candidate/OCI digest when production is in scope.
- Explicit same-artifact comparison result proving staging and production used the identical certified candidate/OCI digest when production is in scope.
- Result and residual blockers.

## Failure states

- ARTIFACT_DRIFT
- PROVENANCE_MISMATCH
- STAGING_NOT_ACCEPTED
- RELEASE_SHA_MISMATCH
