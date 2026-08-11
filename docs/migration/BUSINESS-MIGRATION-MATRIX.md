# Business Portal — Migration Matrix (M50 protected HTTP)

## Status semantics

- `PASS` — V2 already exposes the audited Business-owned contract with executable evidence.
- `PARTIAL` — some reusable dependency or Business-owned primitive exists, but the observable contract is incomplete.
- `GAP` — no V2 Business-owned equivalent exists yet.
- `N/A` — contract belongs to another feature.

After M50, `FEATURE-0005` remains `baseline-pending`. The Business core and protected HTTP boundary are executable, but the authenticated dashboard consumer, production persistence, dashboard/browser surface and onboarding are not yet equivalent.

| Contract                                | Frozen V1 evidence                                                     | V2 evidence at M50                                                                                         | Status  | Migration decision                                                           |
| --------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| Business domain/browser behavior        | `js/business/*`                                                        | `@touristic/business` domain exists; browser runtime is not ported                                         | PARTIAL | Keep Business core framework-independent; port browser consumers later.      |
| Business profile behavior               | `js/business/profile/*`                                                | immutable profile/promotion models plus protected profile HTTP resource; persistence/browser still partial | PARTIAL | Bind to intended persistence/browser resource before PASS.                   |
| Authenticated dashboard consumer        | `dashboard/*`                                                          | no `apps/business-dashboard`                                                                               | GAP     | Implement on top of M50 protected resource.                                  |
| Protected dashboard API consumption     | `dashboard/auth-client.js` protects `/api/dashboard` and `/api/offers` | protected Business profile API now reuses Auth session/origin/CSRF boundary; dashboard consumer absent     | PARTIAL | Reuse Auth browser client in dashboard milestone; do not duplicate security. |
| Business tenant selection/authorization | dashboard requests carry business IDs; server Auth enforces scope      | real Business HTTP GET/PUT delegates tenant/read-only policy to `authorizeBusinessAccess()`                | PASS    | Preserve server authorization on every future Business resource.             |
| Business onboarding orchestration       | `js/onboarding/business-onboarding.js`                                 | no `apps/business-onboarding`                                                                              | GAP     | Port orchestration after Business HTTP/dashboard foundations.                |
| Onboarding engine                       | `js/onboarding/engine/*`                                               | no Business onboarding app                                                                                 | GAP     | Keep workflow engine separate from persistence/security.                     |
| Onboarding conversation                 | `js/onboarding/conversation/*`                                         | equivalent Assistant exists, Business consumer absent                                                      | PARTIAL | Consume Assistant boundary; Business owns onboarding state.                  |
| Onboarding session/workflow state       | `js/onboarding/session/*`                                              | no Business onboarding state port                                                                          | GAP     | Do not confuse onboarding state with Auth session.                           |
| Onboarding tours/tutorial               | `js/onboarding/tours/*`                                                | no Business onboarding app                                                                                 | GAP     | Port product tutorial behavior after core dependencies.                      |
| Business discovery adapter              | `js/onboarding/runtime/business-discovery-adapter.js`                  | Search is equivalent; Business adapter absent                                                              | PARTIAL | Consume `FEATURE-0002`; do not duplicate Search/Assistant internals.         |
| Business location resolver              | `js/onboarding/runtime/business-location-resolver.js`                  | geospatial/search equivalent; Business adapter absent                                                      | PARTIAL | Reuse existing geo/search ports.                                             |
| Profile sandbox/runtime                 | `business-profile-sandbox.js`                                          | Business profile core + protected resource exist; sandbox/browser runtime absent                           | GAP     | Classify and port only observable sandbox/runtime contract if required.      |
| Recommendation sandbox                  | `business-recommendation-sandbox.js`                                   | adjacent recommendation capabilities exist; Business port absent                                           | GAP     | Do not infer production recommendation ownership from sandbox alone.         |
| Partner workspace adapter               | `business-partner-workspace-adapter.js`                                | no Business workspace port                                                                                 | GAP     | Freeze active call sites before implementation.                              |
| Live Business runtime                   | `business-live-runtime.js`                                             | protected HTTP resource exists; live browser runtime absent                                                | GAP     | Build from explicit ports, not global browser state.                         |
| Commercial conversion adapter           | `business-commercial-conversion-adapter.js`                            | no Business conversion port                                                                                | GAP     | Keep payments/subscriptions outside Business ownership.                      |
| Checkout client                         | `business-checkout-client.js`                                          | `FEATURE-0009` remains planned                                                                             | N/A     | Payment execution belongs to Payments; Business only consumes future port.   |
| Dashboard visual surface                | `dashboard/*.html/css/js`                                              | no Business dashboard app                                                                                  | GAP     | Freeze and port visual baseline after protected resource boundary.           |
| Business onboarding visual surface      | V1 onboarding/tutorial browser flow                                    | no Business onboarding app                                                                                 | GAP     | Freeze visual/browser contract before equivalence claim.                     |

## M50 score

- `PASS`: 1
- `PARTIAL`: 6
- `GAP`: 12
- `N/A`: 1
- total: 20

M50 proves the real protected Business HTTP authorization boundary without overclaiming the portal. Tenant/business authorization becomes `PASS` because the executable HTTP contract validates same-session owner access, cross-tenant denial and viewer read-only policy through Auth. Protected API consumption becomes `PARTIAL` because the resource exists but no dashboard browser consumer has been ported yet.

## Dependency rule

No Business implementation milestone may introduce its own credential/session/cookie/CSRF logic. Those contracts belong to `FEATURE-0008` and must be consumed through an Auth-owned boundary.

M50 follows that rule: the Business HTTP adapter delegates session, origin, CSRF, role and tenant decisions to the Auth boundary and keeps Business routing/profile behavior separate.

## Next implementation milestone

M51 should freeze and implement the authenticated Business dashboard browser consumer against the M50 resource, reusing `@touristic/auth-browser` for session/CSRF retry semantics. The dashboard visual baseline should be frozen in the same phase or immediately before browser parity work; onboarding remains later.
