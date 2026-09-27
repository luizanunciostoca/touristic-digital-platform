---
name: morro-release-certification
description: Certifies a release candidate from exact main through immutable artifact identity, provenance, staging and production gates.
---

# morro-release-certification

## Purpose
Protect build-once/promote-same-artifact release authority.

## Inputs
- Exact main SHA
- tree SHA
- candidate artifact
- OCI digest
- provenance
- staging evidence

## Allowed operations
- Read release workflows
- Validate release identity
- Run non-destructive certification checks
- Generate release evidence

## Forbidden operations
- Rebuild between environments
- Bypass staging
- Deploy production without required gates
- Activate providers

## Acceptance criteria
- Exact main certified
- Immutable OCI digest fixed
- Provenance matches source
- Staging accepted before production

## Evidence format
- ChangeSet ID
- exact source/base/head SHA as applicable
- command/workflow/runtime target
- timestamp
- result and residual blockers

## Failure states
- ARTIFACT_DRIFT
- PROVENANCE_MISMATCH
- STAGING_NOT_ACCEPTED
- RELEASE_SHA_MISMATCH
