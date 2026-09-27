---
name: morro-runtime-proof
description: Produce black-box staging, production, and edge runtime evidence bound to an exact release identity.
---

# morro-runtime-proof

## Purpose

Separate deterministic tests from runtime proof.

## Inputs

- Target environment
- expected release SHA/digest
- critical flow list
- target identity

## Allowed operations

- Probe health/readiness
- Run safe black-box flows
- Capture runtime/log identity

## Forbidden operations

- Destructive production mutation
- Treat staging as production proof
- Hide target identity

## Acceptance criteria

- Runtime reports expected identity
- Critical probes pass
- Target/timestamp recorded

## Evidence format

- ChangeSet ID.
- Exact base/head/source SHA as applicable.
- Command, workflow run, or runtime target.
- Timestamp, result, and residual blockers.

## Failure states

- RUNTIME_SHA_MISMATCH
- HEALTH_FAIL
- FLOW_FAIL
- TARGET_AMBIGUOUS
