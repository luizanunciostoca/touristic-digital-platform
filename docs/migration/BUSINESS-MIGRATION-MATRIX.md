# Business Portal — Migration Matrix (M51 authenticated dashboard consumer)

## Status semantics

- `PASS` — V2 already exposes the audited Business-owned contract with executable evidence.
- `PARTIAL` — some reusable dependency or Business-owned primitive exists, but the observable contract is incomplete.
- `GAP` — no V2 Business-owned equivalent exists yet.
- `N/A` — contract belongs to another feature.

After M51, `FEATURE-0005` remains `baseline-pending`. The Business core, protected HTTP boundary and authenticated dashboard client are executable, but the mounted dashboard/browser surface, production persistence and onboarding are not yet equivalent.

| Contract                                | Frozen V1 evidence                                                     | V2 evidence at M51                                                                                                    | Status  | Migration decision                                                           |
| --------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| Business domain/browser behavior        | `js/business/*`                                                        | `@touristic/business` domain plus authenticated app consumer exist; complete browser runtime is not ported            | PARTIAL | Keep Business core framework-independent; continue browser surface later.    |
| Business profile behavior               | `js/business/profile/*`                                                | immutable profile/promotion models plus protected profile HTTP resource and browser client; persistence/UI partial    | PARTIAL | Bind to intended persistence and full editing surface before PASS.           |
| Authenticated dashboard consumer        | `dashboard/*`                                                          | app-level Business dashboard client bootstraps session/scope/profile through `@touristic/auth-browser`                | PARTIAL | Mount the consumer into the dashboard visual surface before PASS.             |
| Protected dashboard API consumption     | `dashboard/auth-client.js` protects authenticated dashboard resources  | `@touristic/auth-browser` protects `/api/business`; app load/save use only `DashboardAuthClient.secureFetch()`         | PASS    | Keep all future dashboard mutations on the centralized Auth browser boundary.|
| Business tenant selection/authorization | dashboard requests carry business IDs; server Auth enforces scope      | real Business HTTP GET/PUT delegates tenant/read-only policy to `authorizeBusinessAccess()`                           | PASS    | Preserve server authorization on every future Business resource.             |
| Business onboarding orchestration       | `js/onboarding/business-onboarding.js`                                 | no `apps/business-onboarding`                                                                                         | GAP     | Port orchestration after dashboard/browser foundations.                       |
| Onboarding engine                       | `js/onboarding/engine/*`                                               | no Business onboarding app                                                                                            | GAP     | Keep workflow engine separate from persistence/security.                      |
| Onboarding conversation                 | `js/onboarding/conversation/*`                                         | equivalent Assistant exists, Business consumer absent                                                                 | PARTIAL | Consume Assistant boundary; Business owns onboarding state.                   |
| Onboarding session/workflow state       | `js/onboarding/session/*`                                              | no Business onboarding state port                                                                                     | GAP     | Do not confuse onboarding state with Auth session.                            |
| Onboarding tours/tutorial               | `js/onboarding/tours/*`                                                | no Business onboarding app                                                                                            | GAP     | Port product tutorial behavior after core dependencies.                       |
| Business discovery adapter              | `js/onboarding/runtime/business-discovery-adapter.js`                  | Search is equivalent; Business adapter absent                                                                         | PARTIAL | Consume `FEATURE-0002`; do not duplicate Search/Assistant internals.          |
| Business location resolver              | `js/onboarding/runtime/business-location-resolver.js`                  | geospatial/search equivalent; Business adapter absent                                                                 | PARTIAL | Reuse existing geo/search ports.                                              |
| Profile sandbox/runtime                 | `business-profile-sandbox.js`                                          | Business profile core + protected resource + browser client exist; sandbox/runtime surface absent                     | GAP     | Classify and port only observable sandbox/runtime contract if required.       |
| Recommendation sandbox                  | `business-recommendation-sandbox.js`                                   | adjacent recommendation capabilities exist; Business port absent                                                      | GAP     | Do not infer production recommendation ownership from sandbox alone.          |
| Partner workspace adapter               | `business-partner-workspace-adapter.js`                                | no Business workspace port                                                                                            | GAP     | Freeze active call sites before implementation.                               |
| Live Business runtime                   | `business-live-runtime.js`                                             | protected HTTP resource and dashboard client exist; live mounted browser runtime absent                               | GAP     | Build from explicit ports, not global browser state.                          |
| Commercial conversion adapter           | `business-commercial-conversion-adapter.js`                            | no Business conversion port                                                                                           | GAP     | Keep payments/subscriptions outside Business ownership.                       |
| Checkout client                         | `business-checkout-client.js`                                          | `FEATURE-0009` remains planned                                                                                        | N/A     | Payment execution belongs to Payments; Business only consumes future port.    |
| Dashboard visual surface                | `dashboard/*.html/css/js`                                              | V1 visual baseline frozen in `BUSINESS-DASHBOARD-V1-BASELINE.md`; V2 surface not mounted                              | GAP     | Port and browser-test the frozen sidebar/header/views/theme/responsive shell. |
| Business onboarding visual surface      | V1 onboarding/tutorial browser flow                                    | no Business onboarding app                                                                                            | GAP     | Freeze visual/browser contract before equivalence claim.                      |

## M51 score

- `PASS`: 2
- `PARTIAL`: 6
- `GAP`: 11
- `N/A`: 1
- total: 20

M51 promotes protected dashboard API consumption to `PASS` because the browser consumer now traverses `@touristic/auth-browser`, including `/api/business` same-origin/CSRF handling, and calls the real M50 resource through that port. The authenticated dashboard consumer moves from `GAP` to `PARTIAL`: bootstrap/load/save behavior is executable, but the full dashboard UI has not been mounted.

## Dependency rule

No Business implementation milestone may introduce its own credential/session/cookie/CSRF logic. Those contracts belong to `FEATURE-0008` and must be consumed through an Auth-owned boundary.

M51 follows that rule: the app dashboard client receives a `DashboardAuthClient` and never reads or writes session cookie/signing material. Client-side Business scope selection is convenience only; authorization remains server-side.

## Frozen visual baseline

`BUSINESS-DASHBOARD-V1-BASELINE.md` freezes the canonical V1 dashboard shell and observable behavior from the baseline commit. This documentation does not promote `Dashboard visual surface`: that contract remains `GAP` until the V2 surface is implemented and validated in a browser.

## Next implementation milestone

M52 should mount the authenticated M51 consumer into a V2 dashboard surface and reproduce the frozen visual/lifecycle baseline: authenticated entry, responsive sidebar, business header, primary views, theme/logout behavior and profile editing states. Analytics endpoints not yet owned by V2 should remain explicitly unavailable or separately migrated rather than being replaced with invented data.
