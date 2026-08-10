# Business Portal — Migration Matrix (M49 core + Auth consumer)

## Status semantics

- `PASS` — V2 already exposes the audited Business-owned contract with executable evidence.
- `PARTIAL` — some reusable dependency or Business-owned primitive exists, but the observable contract is incomplete.
- `GAP` — no V2 Business-owned equivalent exists yet.
- `N/A` — contract belongs to another feature.

After M49, `FEATURE-0005` remains `baseline-pending`. The Business core and Auth policy consumer are executable, but protected HTTP resources, dashboard/browser behavior and onboarding are not yet equivalent.

| Contract                                | Frozen V1 evidence                                                     | V2 evidence at M49                                                                    | Status  | Migration decision                                                          |
| --------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------- |
| Business domain/browser behavior        | `js/business/*`                                                        | `@touristic/business` domain exists; browser runtime is not ported                    | PARTIAL | Keep Business core framework-independent; port browser consumers later.     |
| Business profile behavior               | `js/business/profile/*`                                                | immutable profile/promotion models, repository port and profile service exist         | PARTIAL | Bind to real protected persistence/browser resources before PASS.           |
| Authenticated dashboard consumer        | `dashboard/*`                                                          | no `apps/business-dashboard`                                                          | GAP     | Implement only after protected Business HTTP boundary.                      |
| Protected dashboard API consumption     | `dashboard/auth-client.js` protects `/api/dashboard` and `/api/offers` | Auth M48 exists; no Business-owned protected HTTP resource yet                        | GAP     | M50 must consume Auth server/browser boundaries without duplicating them.   |
| Business tenant selection/authorization | dashboard requests carry business IDs; server Auth enforces scope      | Auth-aware Business service delegates tenant decisions to `authorizeBusinessAccess()` | PARTIAL | Prove same policy on real Business HTTP resources before PASS.              |
| Business onboarding orchestration       | `js/onboarding/business-onboarding.js`                                 | no `apps/business-onboarding`                                                         | GAP     | Port orchestration after Business HTTP/dashboard foundations.               |
| Onboarding engine                       | `js/onboarding/engine/*`                                               | no Business onboarding app                                                            | GAP     | Keep workflow engine separate from persistence/security.                    |
| Onboarding conversation                 | `js/onboarding/conversation/*`                                         | equivalent Assistant exists, Business consumer absent                                 | PARTIAL | Consume Assistant boundary; Business owns onboarding state.                 |
| Onboarding session/workflow state       | `js/onboarding/session/*`                                              | no Business onboarding state port                                                     | GAP     | Do not confuse onboarding state with Auth session.                          |
| Onboarding tours/tutorial               | `js/onboarding/tours/*`                                                | no Business onboarding app                                                            | GAP     | Port product tutorial behavior after core dependencies.                     |
| Business discovery adapter              | `js/onboarding/runtime/business-discovery-adapter.js`                  | Search is equivalent; Business adapter absent                                         | PARTIAL | Consume `FEATURE-0002`; do not duplicate Search/Assistant internals.        |
| Business location resolver              | `js/onboarding/runtime/business-location-resolver.js`                  | geospatial/search equivalent; Business adapter absent                                 | PARTIAL | Reuse existing geo/search ports.                                            |
| Profile sandbox/runtime                 | `business-profile-sandbox.js`                                          | Business profile core exists; sandbox/browser runtime absent                          | GAP     | Classify and port only the observable sandbox/runtime contract if required. |
| Recommendation sandbox                  | `business-recommendation-sandbox.js`                                   | adjacent recommendation capabilities exist; Business port absent                      | GAP     | Do not infer production recommendation ownership from sandbox alone.        |
| Partner workspace adapter               | `business-partner-workspace-adapter.js`                                | no Business workspace port                                                            | GAP     | Freeze active call sites before implementation.                             |
| Live Business runtime                   | `business-live-runtime.js`                                             | no Business live/browser runtime                                                      | GAP     | Build from explicit ports, not global browser state.                        |
| Commercial conversion adapter           | `business-commercial-conversion-adapter.js`                            | no Business conversion port                                                           | GAP     | Keep payments/subscriptions outside Business ownership.                     |
| Checkout client                         | `business-checkout-client.js`                                          | `FEATURE-0009` remains planned                                                        | N/A     | Payment execution belongs to Payments; Business only consumes future port.  |
| Dashboard visual surface                | `dashboard/*.html/css/js`                                              | no Business dashboard app                                                             | GAP     | Freeze and port visual baseline after protected resource boundary.          |
| Business onboarding visual surface      | V1 onboarding/tutorial browser flow                                    | no Business onboarding app                                                            | GAP     | Freeze visual/browser contract before equivalence claim.                    |

## M49 score

- `PASS`: 0
- `PARTIAL`: 6
- `GAP`: 13
- `N/A`: 1
- total: 20

M49 advances three formerly missing Business-owned foundations to `PARTIAL`: the domain/browser boundary now has a framework-independent core, profile behavior has explicit models/repository/service contracts, and tenant authorization is consumed directly from Auth. None is promoted to `PASS` because the real protected Business HTTP/browser surfaces are not yet present.

## Dependency rule

No Business implementation milestone may introduce its own credential/session/cookie/CSRF logic. Those contracts belong to `FEATURE-0008` and must be consumed through an Auth-owned boundary.

M49 follows that rule: `@touristic/business` imports only the pure Auth authorization policy and delegates tenant/read-only decisions to `authorizeBusinessAccess()`.

## Next implementation milestone

M50 should bind the Business profile service to a real Business-owned HTTP resource and reuse the M48 Auth server/browser boundary for session, same-origin, CSRF, tenant authorization and structured denial auditing. Dashboard UI and onboarding remain later milestones.
