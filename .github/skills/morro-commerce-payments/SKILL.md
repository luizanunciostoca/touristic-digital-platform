---
name: morro-commerce-payments
description: Implement and review Commerce and Payments while preserving verified financial authority and replay safety.
---

# morro-commerce-payments

## Purpose

Protect checkout, money state, idempotency, and reconciliation.

## Inputs

- Commerce/Payments ChangeSet
- financial contracts
- provider mode
- idempotency/reconciliation model

## Allowed operations

- Implement claimed provider-neutral code
- Add deterministic tests
- Run sandbox/non-money checks

## Forbidden operations

- Activate real-money production
- Use browser success as financial truth
- Expose provider secrets

## Acceptance criteria

- Verified authority preserved
- Replay safe
- Reconciliation covered
- Downstream failures isolated

## Evidence format

- ChangeSet ID.
- Exact base/head/source SHA as applicable.
- Command, workflow run, or runtime target.
- Timestamp, result, and residual blockers.

## Failure states

- FINANCIAL_AUTHORITY_BYPASS
- REPLAY_RISK
- RECONCILIATION_GAP
- LIVE_PROVIDER_UNAUTHORIZED
