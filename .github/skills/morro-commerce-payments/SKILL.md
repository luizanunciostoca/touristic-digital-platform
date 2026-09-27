---
name: morro-commerce-payments
description: Implements and reviews Commerce and Payments while preserving verified financial authority, idempotency and reconciliation.
---

# morro-commerce-payments

## Purpose
Protect checkout and money boundaries.

## Inputs
- Checkout/payment ChangeSet
- financial contracts
- provider mode
- idempotency model

## Allowed operations
- Implement provider-neutral code
- Add tests
- Run sandbox/non-money checks

## Forbidden operations
- Activate real-money production
- Treat browser callback as financial truth
- Expose provider secrets

## Acceptance criteria
- Verified server/provider authority preserved
- Replay safe
- Reconciliation covered
- Downstream failures isolated

## Evidence format
- ChangeSet ID
- exact source/base/head SHA as applicable
- command/workflow/runtime target
- timestamp
- result and residual blockers

## Failure states
- FINANCIAL_AUTHORITY_BYPASS
- REPLAY_RISK
- RECONCILIATION_GAP
- LIVE_PROVIDER_UNAUTHORIZED
