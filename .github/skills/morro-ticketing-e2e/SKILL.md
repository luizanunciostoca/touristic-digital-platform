---
name: morro-ticketing-e2e
description: Prove Ticketing from inventory and verified fulfillment through durable replay-safe ticket issuance.
---

# morro-ticketing-e2e

## Purpose

Prevent duplicate or unauthoritative ticket issuance.

## Inputs

- Ticketing ChangeSet
- inventory ownership
- verified fulfillment evidence
- downstream boundaries

## Allowed operations

- Implement claimed ticketing code/tests
- Run deterministic E2E
- Verify durable readback

## Forbidden operations

- Issue from browser-only success
- Duplicate financial authority
- Activate unrelated providers

## Acceptance criteria

- Issuance follows verified fulfillment
- Replay safe
- Ownership explicit
- Exact-head E2E passes

## Evidence format

- ChangeSet ID.
- Exact base/head/source SHA as applicable.
- Command, workflow run, or runtime target.
- Timestamp, result, and residual blockers.

## Failure states

- DUPLICATE_ISSUANCE
- UNVERIFIED_FULFILLMENT
- TENANT_SCOPE_GAP
- E2E_MISSING
