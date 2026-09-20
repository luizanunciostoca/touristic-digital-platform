# Morro Digital Control Center — Implementation Ledger

## Baseline

- Admission main: `05f7df04eaee94de9bf894f75f6842ba6f0c3731`
- Canonical main reconciled: `e673ce7d844e96bfecb870c8a427c796dd518b6e`
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

| Area                         | State                      | Evidence                                                                                                                       |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Canonical roles              | PASS                       | `packages/auth/src/index.ts`; Quality/Auth contracts green                                                                     |
| Capability model             | PASS                       | `authorizeCapability`; explicit capability vocabulary; negative admin-surface tests                                            |
| Legacy role compatibility    | PASS                       | legacy roles preserved through centralized capability mapping                                                                  |
| Admin API v1 shell           | PASS                       | `tooling/admin-api.mjs`; fail-closed domain adapter orchestration                                                              |
| Dedicated Control Center app | PASS                       | `apps/control-center/public/`; Chromium contract green                                                                         |
| Dashboard                    | PARTIAL                    | Auth/health projections live; remaining domain metrics need owner adapters                                                     |
| Universal Search             | PARTIAL                    | Identity search live; domain adapters pending                                                                                  |
| Users                        | PARTIAL                    | Read projection + Auth-owned hash-only session registry/revoke live; block/reactivate pending                                  |
| Businesses                   | PARTIAL                    | Membership directory + Business profile owner adapter live; wider business admin contracts pending                             |
| Support Mode                 | PARTIAL                    | Signed support session + request-scoped effective-user propagation proven for Business/CRM/Ticketing; Financial keeps actor authority and binds support context to the owner-resolved resource tenant |
| Audit                        | PASS                       | Append-only MySQL-backed admin audit with browser persistence proof and fail-closed mutation behavior                          |
| System Health                | PASS                       | Existing platformOperations reused; secret redaction proven in browser                                                         |
| Affiliates                   | GAP                        | Existing equivalent backend + PR #151 runtime retained; Control Center admin adapter pending                                   |
| CRM                          | PARTIAL                    | Existing CRM reused through Admin API adapter; full surface orchestration still incomplete                                     |
| Ticketing                    | PARTIAL                    | Capability-aware runtime + Admin API adapter for current operator contracts                                                    |
| Orders                       | PASS                       | Ordering-owner read adapter; Chromium financial contract proves Order lookup without Control Center table access                 |
| Financial                    | PASS                       | Financial-owner Payment/Ledger/Reconciliation reads plus step-up refund/reconciliation/acknowledge actions; owner-resolved tenant scope; production effects remain code-blocked |
| Content                      | GAP                        | Admin adapter pending                                                                                                          |
| Destinations                 | GAP                        | Admin adapter pending                                                                                                          |
| Step-up auth                 | PASS                       | Re-auth step-up enforced for session revocation and Financial critical actions with reason + textual confirmation               |
| Browser E2E                  | PASS for implemented slice | General Chromium contract plus dedicated Financial Chromium contract prove login, dashboard, search, Business 360, CRM, support, Orders, Payment, Ledger, governed refund denial, audit, system, sessions and responsive behavior |
| Staging                      | GAP                        | No dedicated Control Center staging certification yet                                                                          |

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
- existing CSP/security headers inherited from platform runtime;
- Financial resource scope resolved by owner contracts (`Payment → Order → CheckoutAccess` and `Finding → Payment`) before critical actions;
- Support Mode financial actions fail closed on resource-tenant mismatch;
- production Financial effects are blocked by code even after successful step-up.

Still required before completion:

- durable platform role/capability persistence and administrative privilege changes;
- account block/reactivate contracts;
- remaining high-risk actions outside the proven session-revoke and Financial step-up flows;
- broader replay/rate-limit coverage for Admin API;
- remaining domain adapters (Affiliates, Content, Destinations and wider Business/Ticketing coverage);
- full accessibility certification beyond current keyboard/responsive browser proof;
- staging proof.

## Financial slice evidence

- `Control Center Financial Contract`: PASS on `2220a7ebf685a48de4916e01cb01bc92a029c17b`.
- `Control Center Financial Browser Contract`: PASS on the same SHA using MySQL real repositories and sandbox-only runtime.
- `Payments Persistence Integration`, `Payments Operational Ledger Contract`, `Payments Refund Command Contract`, `Payments Reconciliation Contract`: PASS.
- `Quality Gate`, `Security Scanning`, `Control Center Browser Contract`, `Dependency Security Audit`: PASS.
- Browser fixture creation uses Ordering/Financial owner repositories; no Control Center SQL path is introduced.
- The governed refund browser test uses a non-eligible pending payment and proves `REFUND_NOT_ALLOWED` before any provider effect.

## Completion rule

No row marked PARTIAL or GAP may be reported as complete. FEATURE-0012 stays `partial` until the full acceptance matrix is proven.
