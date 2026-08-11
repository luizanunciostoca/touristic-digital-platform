# Business Portal — Migration Matrix (M52 mounted dashboard surface)

## Status semantics

- `PASS` — V2 already exposes the audited Business-owned contract with executable evidence.
- `PARTIAL` — some reusable dependency or Business-owned primitive exists, but the observable contract is incomplete.
- `GAP` — no V2 Business-owned equivalent exists yet.
- `N/A` — contract belongs to another feature.

After M52, `FEATURE-0005` remains `baseline-pending`. The Business core, protected HTTP boundary, authenticated dashboard consumer and mounted dashboard shell are executable, but production analytics/persistence breadth and onboarding are not yet equivalent.

| Contract                                | Frozen V1 evidence                                                    | V2 evidence at M52                                                                                                        | Status  | Migration decision                                                                 |
| --------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| Business domain/browser behavior        | `js/business/*`                                                       | `@touristic/business` domain plus authenticated mounted dashboard exist; broader V1 Business browser behavior incomplete  | PARTIAL | Keep Business core framework-independent; continue remaining browser adapters.     |
| Business profile behavior               | `js/business/profile/*`                                               | immutable models + protected HTTP resource + mounted read/edit/save profile surface; persistence breadth still partial    | PARTIAL | Bind intended persistence/full profile behavior before PASS.                       |
| Authenticated dashboard consumer        | `dashboard/*`                                                         | M51 client is mounted in M52 and browser-tested with real Auth session, Business scope, profile load/save and logout      | PASS    | Keep dashboard consumption behind centralized Auth browser boundary.               |
| Protected dashboard API consumption     | `dashboard/auth-client.js` protects authenticated dashboard resources | `@touristic/auth-browser` protects `/api/business`; app load/save use only `DashboardAuthClient.secureFetch()`            | PASS    | Keep all future dashboard mutations on the centralized Auth browser boundary.      |
| Business tenant selection/authorization | dashboard requests carry business IDs; server Auth enforces scope     | real Business HTTP GET/PUT delegates tenant/read-only policy to `authorizeBusinessAccess()`                               | PASS    | Preserve server authorization on every future Business resource.                   |
| Business onboarding orchestration       | `js/onboarding/business-onboarding.js`                                | no `apps/business-onboarding`                                                                                             | GAP     | Port orchestration after dashboard/browser foundations.                            |
| Onboarding engine                       | `js/onboarding/engine/*`                                              | no Business onboarding app                                                                                                | GAP     | Keep workflow engine separate from persistence/security.                           |
| Onboarding conversation                 | `js/onboarding/conversation/*`                                        | equivalent Assistant exists, Business consumer absent                                                                     | PARTIAL | Consume Assistant boundary; Business owns onboarding state.                        |
| Onboarding session/workflow state       | `js/onboarding/session/*`                                             | no Business onboarding state port                                                                                         | GAP     | Do not confuse onboarding state with Auth session.                                 |
| Onboarding tours/tutorial               | `js/onboarding/tours/*`                                               | no Business onboarding app                                                                                                | GAP     | Port product tutorial behavior after core dependencies.                            |
| Business discovery adapter              | `js/onboarding/runtime/business-discovery-adapter.js`                 | Search is equivalent; Business adapter absent                                                                             | PARTIAL | Consume `FEATURE-0002`; do not duplicate Search/Assistant internals.               |
| Business location resolver              | `js/onboarding/runtime/business-location-resolver.js`                 | geospatial/search equivalent; Business adapter absent                                                                     | PARTIAL | Reuse existing geo/search ports.                                                   |
| Profile sandbox/runtime                 | `business-profile-sandbox.js`                                         | profile core + protected resource + mounted profile surface exist; sandbox-specific runtime remains unclassified          | GAP     | Classify/port only observable sandbox/runtime contract if required.                |
| Recommendation sandbox                  | `business-recommendation-sandbox.js`                                  | adjacent recommendation capabilities exist; Business port absent                                                          | GAP     | Do not infer production recommendation ownership from sandbox alone.               |
| Partner workspace adapter               | `business-partner-workspace-adapter.js`                               | no Business workspace port                                                                                                | GAP     | Freeze active call sites before implementation.                                    |
| Live Business runtime                   | `business-live-runtime.js`                                            | authenticated mounted dashboard runtime now exists; wider live/analytics adapters from V1 are not yet migrated            | PARTIAL | Extend from explicit ports; do not restore global browser state.                   |
| Commercial conversion adapter           | `business-commercial-conversion-adapter.js`                           | no Business conversion port                                                                                               | GAP     | Keep payments/subscriptions outside Business ownership.                            |
| Checkout client                         | `business-checkout-client.js`                                         | `FEATURE-0009` remains planned                                                                                            | N/A     | Payment execution belongs to Payments; Business only consumes future port.         |
| Dashboard visual surface                | `dashboard/*.html/css/js`                                             | M52 mounted shell reproduces/auth-tests sidebar, header, primary views, theme, logout, profile states and responsive menu | PASS    | Keep analytics explicitly unavailable until their endpoints are separately ported. |
| Business onboarding visual surface      | V1 onboarding/tutorial browser flow                                   | no Business onboarding app                                                                                                | GAP     | Freeze visual/browser contract before equivalence claim.                           |

## M52 score

- `PASS`: 4
- `PARTIAL`: 6
- `GAP`: 9
- `N/A`: 1
- total: 20

M52 promotes the authenticated dashboard consumer to `PASS` because the M51 client is now mounted and exercised in Chromium against a real Auth/Business runtime. It also promotes the dashboard visual surface to `PASS` at the frozen shell/lifecycle boundary: authenticated entry, responsive sidebar/mobile overlay, Business header, primary views, theme, logout and profile editing/save are executable.

The live Business runtime moves from `GAP` to `PARTIAL`: a real mounted runtime exists, but the broader V1 live analytics/recommendation/workspace adapters are not yet equivalent.

M52 deliberately does **not** treat missing analytics as migrated. Reach, routes, recommendations, conversions, audience, forecast and predictive values remain visibly unavailable until their owning endpoints/contracts are ported.

## Dependency rule

No Business implementation milestone may introduce its own credential/session/cookie/CSRF logic. Those contracts belong to `FEATURE-0008` and must be consumed through an Auth-owned boundary.

M52 follows that rule: the dashboard surface receives behavior through `DashboardAuthClient` and `BusinessDashboardClient`; browser code never reads session cookie/signing material and tenant authorization remains server-side.

## Browser evidence

`BUSINESS-M52-EVIDENCE.md` plus the permanent `Business Dashboard Browser Contract` prove the mounted lifecycle with real login, protected profile seed/load/save, responsive navigation, theme persistence and logout/revocation.

## Next implementation milestone

M53 should move into Business onboarding ownership rather than inventing dashboard analytics. Port the onboarding workflow/session/orchestration boundary first, consuming the already-equivalent Assistant, Search and geospatial capabilities through explicit adapters. Payment/checkout execution remains owned by `FEATURE-0009` and stays outside Business.
