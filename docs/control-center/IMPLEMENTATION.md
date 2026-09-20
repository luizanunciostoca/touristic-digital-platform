# Morro Digital Control Center — Implementation Ledger

## Baseline

- Admission main: `05f7df04eaee94de9bf894f75f6842ba6f0c3731`
- Branch: `wave/platform-control-center-super-admin-20260920`
- Master issue: #152
- Production deployment: **not authorized**
- Real-money actions: **not authorized**

## Architectural invariants

- No direct cross-domain table mutation from Control Center.
- No hidden fallback to SQL when an admin contract is absent.
- PLATFORM_OWNER is not an authorization bypass.
- Financial remains monetary source of truth.
- actor and effectiveUser are separate in Support Mode.
- Secrets never appear in admin projections.
- Missing integration is represented as PARTIAL/GAP, not as success.

## Current implementation state

| Area                         | State                                | Evidence                                                                                     |
| ---------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Canonical roles              | PASS in code / CI pending            | `packages/auth/src/index.ts`                                                                 |
| Capability model             | PASS in code / CI pending            | `authorizeCapability`, explicit capability vocabulary                                        |
| Legacy role compatibility    | PASS in code / CI pending            | `authRoles` preserved and canonical mapping added                                            |
| Admin API v1 shell           | PASS in code / CI pending            | `tooling/admin-api.mjs`                                                                      |
| Dedicated Control Center app | PASS in code / browser proof pending | `apps/control-center/public/`                                                                |
| Dashboard                    | PARTIAL                              | Auth/health projections live; remaining domain metrics need owner adapters                   |
| Universal Search             | PARTIAL                              | Identity search live; domain adapters pending                                                |
| Users                        | PARTIAL                              | Read projection live; session revoke/block/reactivate contracts pending                      |
| Businesses                   | PARTIAL                              | Identity membership directory live; Business Admin mutation contract pending                 |
| Support Mode                 | PARTIAL                              | Signed support session implemented; full effective-user propagation into every panel pending |
| Audit                        | PARTIAL                              | Runtime append-only projection + observability event; durable immutable store pending        |
| System Health                | PASS in code / browser proof pending | Existing platformOperations reused                                                           |
| Affiliates                   | GAP                                  | Existing domain retained; admin adapter pending and PR #151 must not be overwritten          |
| CRM                          | GAP                                  | Existing CRM retained; Admin API adapter pending                                             |
| Ticketing                    | PARTIAL                              | Runtime authorization converted to capability-aware projection; admin adapter pending        |
| Financial                    | PARTIAL                              | Reconciliation gate capability-aware; full Admin API adapter/step-up pending                 |
| Content                      | GAP                                  | Admin adapter pending                                                                        |
| Destinations                 | GAP                                  | Admin adapter pending                                                                        |
| Step-up auth                 | GAP                                  | Critical-action contract pending                                                             |
| Browser E2E                  | GAP                                  | Control Center E2E pending                                                                   |
| Staging                      | GAP                                  | Not attempted before CI and browser gates                                                    |

## Security posture of current slice

Implemented:

- capability-based platform authorization;
- tenant-aware capability decision;
- read-only SUPPORT/AUDITOR semantics;
- signed short-lived support-session cookie;
- actor session binding;
- denial of impersonating platform-wide identities;
- same-origin/CSRF reuse for support mutations;
- secrets omitted from user/system projections;
- fail-closed missing-domain behavior;
- existing CSP/security headers inherited from platform runtime.

Still required before completion:

- durable immutable audit;
- step-up/MFA/re-auth for high-risk mutations;
- durable platform role/capability persistence and administrative privilege changes;
- session revoke admin endpoint;
- exhaustive IDOR/cross-tenant/forged-effective-user/replay tests;
- rate-limit policy for Admin API;
- all domain adapters;
- browser/accessibility proof;
- staging proof.

## Completion rule

No row marked PARTIAL or GAP may be reported as complete. FEATURE-0012 stays `partial` until the full acceptance matrix is proven.
