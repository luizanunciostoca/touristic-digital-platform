---
name: morro-runtime-proof
description: Produces black-box runtime evidence for staging, production and edge acceptance on an exact release identity.
---

# morro-runtime-proof

## Purpose
Separate tests from actual runtime proof.

## Inputs
- Target environment
- expected release SHA/digest
- critical flow list

## Allowed operations
- Probe health/readiness
- Run safe black-box flows
- Capture logs and release identity

## Forbidden operations
- Mutate production destructively
- Treat staging as production proof
- Hide target identity

## Acceptance criteria
- Runtime reports expected release identity
- Critical probes pass
- Evidence timestamp/target recorded

## Evidence format
- ChangeSet ID
- exact source/base/head SHA as applicable
- command/workflow/runtime target
- timestamp
- result and residual blockers

## Failure states
- RUNTIME_SHA_MISMATCH
- HEALTH_FAIL
- FLOW_FAIL
- TARGET_AMBIGUOUS
