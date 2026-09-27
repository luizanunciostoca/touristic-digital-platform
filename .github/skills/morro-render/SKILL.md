---
name: morro-render
description: Reconcile and verify Render service, deployment, staging, and production identity without bypassing canonical promotion.
---

# morro-render

## Purpose

Keep Render runtime aligned with repository release authority.

## Inputs

- Render service/environment
- expected SHA/digest
- deployment identity
- canonical workflow

## Allowed operations

- Inspect services/deploys/logs
- Compare runtime identity
- Run safe staging verification

## Forbidden operations

- Direct production deploy outside Integrator
- Change production secrets
- Treat moving branch as immutable release

## Acceptance criteria

- Target service identified
- Runtime matches expected release
- Drift classified
- Canonical promotion preserved

## Evidence format

- ChangeSet ID.
- Exact base/head/source SHA as applicable.
- Command, workflow run, or runtime target.
- Timestamp, result, and residual blockers.

## Failure states

- RENDER_DRIFT
- WRONG_SERVICE
- RUNTIME_SHA_MISMATCH
- UNAUTHORIZED_PRODUCTION_ACTION
