# Morro Digital Control Center — Implementation Ledger

## Canonical snapshot

- Master issue: #152
- Reconciliation date: 2026-09-27
- Exact main audited: `df18e8d2ee329ed9d01f37389e52b95e7e96fc0d`
- Current staging release at audit: same exact SHA, LIVE
- Current production release at audit: same exact SHA, LIVE
- Real-money/provider effects remain separately governed and are not authorized by this ledger.

This document is a semantic reconciliation of the original #152 plan against current main. Historical branch-local GAP/PARTIAL labels must not be treated as current truth when current-main owner contracts and acceptance evidence supersede them.

## Architectural invariants

- Control Center never mutates another domain through direct table access.
- Domain owners retain persistence and mutation authority.
- PLATFORM_OWNER is maximum functional authority, never a security bypass.
- Authorization remains role + capability + scope.
- Support Mode preserves actor and effective-user identities.
- Financial remains monetary source of truth.
- Administrative audit is append-only from the UI/API perspective.
- Missing integration fails closed; no hidden SQL fallback is allowed.

## PRESENT_IN_MAIN

The following #152 requirements are already present in current main:

- canonical platform roles and legacy compatibility;
- centralized capability authorization;
- durable Auth role/status policy backed by MySQL when `AUTH_DATABASE_URL` is configured;
- governed account block/reactivate and role changes with session revocation;
- Admin API v1 orchestration shell;
- dedicated `apps/control-center` application;
- signed Support Mode with actor/effective-user separation;
- append-only MySQL administrative audit;
- System Health projection with secret redaction;
- Affiliates owner/admin integration and governed membership critical actions;
- CRM owner orchestration including lead detail/create/edit/stage transitions;
- governed Business/Place CMS and Commerce/Catalog administration;
- Ticketing, Reservations, Ordering and Financial owner-backed administration;
- durable Content owner/admin integration;
- durable Destinations owner/admin integration;
- step-up protection for current critical-action families;
- dedicated Control Center responsive/accessibility/browser contracts.

Historical GAP claims for account block/reactivate, Affiliates, Content, Destinations, durable role policy and the original CRM partial adapter are therefore obsolete or superseded.

## VALID_MISSING

FEATURE-0012 remains `partial` because these residuals still require executable evidence:

1. Complete and prove Dashboard owner-backed aggregate breadth for the planned cross-domain overview.
2. Complete and prove Universal Search cross-domain breadth on one exact head.
3. Reconcile any genuine residual Business admin breadth against current owner contracts instead of restoring V1 wholesale.
4. Add broader Admin API mutation replay/rate-limit protection without bypassing domain-owned idempotency.
5. Run the dedicated Control Center final qualification on one current exact head.
6. Run dedicated Control Center staging acceptance against the same release identity.

Generic platform staging/production convergence does not substitute for Control Center-specific acceptance.

## Current semantic classification

- Canonical roles: `PRESENT_IN_MAIN`
- Capability model: `PRESENT_IN_MAIN`
- Durable role/status policy: `PRESENT_IN_MAIN`
- Admin API v1 shell: `PRESENT_IN_MAIN`
- Dedicated Control Center app: `PRESENT_IN_MAIN`
- Dashboard breadth: `VALID_MISSING`
- Universal Search breadth: `VALID_MISSING`
- Users administration: `PRESENT_IN_MAIN`
- Businesses: `PRESENT_IN_MAIN` for current profile/CMS/catalog owner contracts, with residual breadth requiring reconciliation
- Support Mode: `PRESENT_IN_MAIN`
- Audit: `PRESENT_IN_MAIN`
- System Health: `PRESENT_IN_MAIN`
- Affiliates: `PRESENT_IN_MAIN`
- CRM: `PRESENT_IN_MAIN`
- Products / Offers / Catalog: `PRESENT_IN_MAIN`
- Reservations: `PRESENT_IN_MAIN`
- Ticketing: `PRESENT_IN_MAIN`
- Orders: `PRESENT_IN_MAIN`
- Financial: `PRESENT_IN_MAIN`
- Content: `PRESENT_IN_MAIN`
- Destinations: `PRESENT_IN_MAIN`
- Step-up auth: `PRESENT_IN_MAIN`
- Responsive contracts: `PRESENT_IN_MAIN`
- Accessibility contracts: `PRESENT_IN_MAIN`
- Security negative tests: `PRESENT_IN_MAIN`
- Browser E2E contracts: `PRESENT_IN_MAIN`
- Generic staging deployment: `PRESENT_IN_MAIN`
- Dedicated Control Center staging acceptance: `VALID_MISSING`
- Dedicated final exact-head Control Center qualification: `VALID_MISSING`

## Completion rule

#152 may be closed only after the remaining `VALID_MISSING` items have executable evidence and the dedicated Control Center exact-head + staging acceptance are green. No historical branch should be merged wholesale to satisfy these items. Production convergence by itself does not replace Control Center-specific proof.
