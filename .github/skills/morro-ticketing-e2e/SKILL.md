---
name: morro-ticketing-e2e
description: Proves Ticketing from inventory and verified fulfillment through durable ticket issuance and downstream notification boundaries.
---

# morro-ticketing-e2e

## Purpose
Prevent duplicate, unauthoritative or non-durable issuance.

## Inputs
- Ticketing ChangeSet
- inventory owner
- payment/financial evidence contract
- notification boundary

## Allowed operations
- Implement ticketing code/tests
- Run deterministic E2E
- Verify durable readback

## Forbidden operations
- Issue from browser-only success
- Duplicate canonical ownership
- Activate external delivery providers

## Acceptance criteria
- Issuance follows verified fulfillment
- Replay safe
- Tenant ownership explicit
- E2E evidence exact-head

## Evidence format
- ChangeSet ID
- exact source/base/head SHA as applicable
- command/workflow/runtime target
- timestamp
- result and residual blockers

## Failure states
- DUPLICATE_ISSUANCE
- UNVERIFIED_FULFILLMENT
- TENANT_SCOPE_GAP
- E2E_MISSING
