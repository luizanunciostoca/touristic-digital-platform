# Morro Digital Control Center — Implementation Ledger

## Canonical snapshot

- Master issue: #152
- Reconciliation date: 2026-09-27
- Exact main audited: `df18e8d2ee329ed9d01f37389e52b95e7e96fc0d`
- Current staging release at audit: same exact SHA, LIVE
- Current production release at audit: same exact SHA, LIVE
- Real-money/provider effects: remain separately governed and are not authorized by this ledger.

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

## Semantic reconciliation matrix

| Area | Classification | Current-main evidence / interpretation | Residual |
| --- | --- | --- | --- |
| Canonical roles | PRESENT_IN_MAIN | PLATFORM_OWNER / PLATFORM_ADMIN / SUPPORT / AUDITOR plus legacy compatibility in Auth | none in #152 |
| Capability model | PRESENT_IN_MAIN | centralized capability authorization and negative authorization coverage | none in #152 |
| Durable role/status policy | PRESENT_IN_MAIN | Auth security state persists principal status/role overrides in MySQL when `AUTH_DATABASE_URL` is configured; production fails closed without durable state | none in #152 |
| Admin API v1 | PRESENT_IN_MAIN | `/api/admin/v1` orchestration shell, owner adapters and fail-closed missing-contract behavior | broad Admin API replay/rate-limit hardening remains |
| Dedicated Control Center app | PRESENT_IN_MAIN | `apps/control-center` shell and browser surfaces | none in #152 |
| Dashboard | VALID_MISSING | auth/system-health projections and several domain metrics exist | prove/complete owner-backed aggregate breadth for the full planned dashboard |
| Universal Search | VALID_MISSING | universal-search adapter mechanism exists and current domains such as CRM participate | prove/complete the planned cross-domain search breadth on one exact head |
| Users | PRESENT_IN_MAIN | list/detail, durable block/reactivate, durable role changes, session registry and governed revoke | none in #152 |
| Businesses | VALID_MISSING | profile, governed CMS/Place administration and catalog lifecycle exist | reconcile any remaining Business admin breadth against the original matrix instead of restoring V1 wholesale |
| Support Mode | PRESENT_IN_MAIN | signed support session, actor/effective-user separation, domain-scoped delegation and critical-action denials | none in core architecture |
| Audit | PRESENT_IN_MAIN | durable MySQL append-only administrative audit with fail-closed mutation behavior | none in #152 |
| System Health | PRESENT_IN_MAIN | platform operations/readiness projection with secret redaction | none in #152 |
| Affiliates | PRESENT_IN_MAIN | owner runtime, Admin API adapter, governed membership critical actions and dedicated browser/contract workflows | historical GAP is obsolete |
| CRM | PRESENT_IN_MAIN | owner orchestration, lead detail/create/edit/stage transitions and Support Mode constraints | historical PARTIAL is superseded by later integration |
| Products / Offers / Catalog | PRESENT_IN_MAIN | governed Business/Commerce catalog lifecycle and publication authority | none in #152 |
| Reservations | PRESENT_IN_MAIN | Ticketing reservation owner contracts and transaction binding | none in #152 |
| Ticketing | PRESENT_IN_MAIN | capability-aware Admin adapter and dedicated Control Center browser contract | none in #152 |
| Orders | PRESENT_IN_MAIN | Ordering-owner projections | none in #152 |
| Financial | PRESENT_IN_MAIN | owner-backed Order/Payment/Ledger/Reconciliation reads and governed critical actions; provider authority remains separate | no new real-money authority granted |
| Content | PRESENT_IN_MAIN | durable Content owner persistence, Admin adapter, mutation audit and dedicated contract | historical GAP is obsolete |
| Destinations | PRESENT_IN_MAIN | durable Destination owner boundary and Admin adapter | historical GAP is obsolete |
| Step-up auth | PRESENT_IN_MAIN | session revoke, user role/status, Affiliate membership and Financial critical actions use governed step-up flows | none in core #152 scope |
| Responsive | PRESENT_IN_MAIN | dedicated responsive/accessibility Control Center contracts | exact-head final qualification still required for closure |
| Accessibility | PRESENT_IN_MAIN | keyboard/reflow/accessibility browser contract exists in current main | exact-head final qualification still required for closure |
| Security negative tests | PRESENT_IN_MAIN | forged delegation/cross-tenant/critical-action denials plus security workflows | exact-head final qualification still required for closure |
| Browser E2E | PRESENT_IN_MAIN | general and domain-specific Control Center browser contracts exist | run final qualification on current exact head |
| Generic staging deployment | PRESENT_IN_MAIN | current exact main is LIVE in staging | does not replace Control Center-specific staging acceptance |
| Control Center staging acceptance | VALID_MISSING | staging infrastructure and owner bootstrap contract exist | execute dedicated Control Center staging verification and record evidence |
| Final exact-head qualification | VALID_MISSING | current main has broad release certification | run the dedicated Control Center final matrix on one current exact head |

## Obsolete historical gaps

The following old statements must no longer drive new implementation:

- “account block/reactivate pending”;
- “Affiliates admin adapter pending”;
- “Content admin adapter pending”;
- “Destinations admin adapter pending”;
- “durable platform role/capability persistence pending”;
- “CRM surface is only the original partial adapter”.

They are superseded by current-main implementations and tests.

## Remaining VALID_MISSING scope

FEATURE-0012 remains `partial` until these residuals are closed with evidence:

1. complete/prove Dashboard owner-backed aggregate breadth;
2. complete/prove Universal Search cross-domain breadth;
3. reconcile any genuine residual Business admin breadth against current owner contracts;
4. add broader Admin API mutation replay/rate-limit protection without bypassing domain-owned idempotency;
5. execute the dedicated Control Center final qualification on one exact current head;
6. execute dedicated Control Center staging acceptance against the same release identity.

No historical branch should be merged wholesale to satisfy these items.

## Completion rule

#152 may be closed only after the remaining `VALID_MISSING` rows above have executable evidence and the dedicated Control Center exact-head + staging acceptance are green. Production convergence by itself does not substitute for that Control Center-specific proof.
