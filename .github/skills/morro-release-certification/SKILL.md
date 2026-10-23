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

## Authorized staging-only Node exception

The one-publication exception `CT1072-STAGING-NODE-20261023-ONE-PUBLICATION`, governed by ChangeSet `MD-STAGING-NODE-EXCEPTION-20261023` and Control Tower #1072, permits a Git/Node rebuild only on existing staging service `srv-da4hb6c9v7es7386ttt0`. It is not immutable OCI promotion. OCI remains the default and the production contract is unchanged. This exception requires the enabled, unexpired policy in `tooling/ci/staging-node-exception.json`, exact-main review/certification, authenticated pre/post connector receipts, retained backup and applicable recovery/rollback proof, shared service mutation lock and durable single-use reservation before the existing hook POST. No service, URL, disk, variables, plan or credentials may change. Node acceptance is explicitly staging-only, with `productionEligible:false` and `pagesEligible:false`; it cannot satisfy OCI/production/Pages acceptance. Ambiguous dispatch outcomes require reconciliation without another POST. See `docs/operations/STAGING-NODE-EXCEPTION.md` for the receipt and verification-only contract. Disabled policy authorizes no dispatch. General rebuild prohibitions remain in force outside this bounded exception.
