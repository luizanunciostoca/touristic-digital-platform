---
name: morro-render
description: Reconciles and verifies Render service configuration, release identity, staging and production runtime without bypassing canonical promotion workflows.
---

# morro-render

## Purpose
Keep Render aligned with repository release authority.

## Inputs
- Render service
- environment
- expected SHA/digest
- blueprint/config

## Allowed operations
- Inspect service/deploy state
- Compare runtime identity
- Trigger safe staging actions when gated

## Forbidden operations
- Direct production deploy outside Integrator
- Change production secrets without owner approval
- Treat latest branch as immutable release

## Acceptance criteria
- Service target identified
- Runtime matches expected release
- Config drift classified
- Promotion path remains canonical

## Evidence format
- ChangeSet ID
- exact source/base/head SHA as applicable
- command/workflow/runtime target
- timestamp
- result and residual blockers

## Failure states
- RENDER_DRIFT
- WRONG_SERVICE
- RUNTIME_SHA_MISMATCH
- UNAUTHORIZED_PRODUCTION_ACTION
