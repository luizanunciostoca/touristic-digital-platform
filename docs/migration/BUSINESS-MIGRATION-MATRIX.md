# Business Portal — Migration Matrix (M54 onboarding adapters)

## Status semantics

- `PASS` — V2 already exposes the audited Business-owned contract with executable evidence.
- `PARTIAL` — some reusable dependency or Business-owned primitive exists, but the observable contract is incomplete.
- `GAP` — no V2 Business-owned equivalent exists yet.
- `N/A` — contract belongs to another feature.

After M54, `FEATURE-0005` remains `baseline-pending`. The Business core, protected HTTP boundary, authenticated dashboard consumer, mounted dashboard shell, onboarding workflow/session core, and concrete Search/geospatial/Assistant onboarding adapters are executable. Full onboarding host/tutorial lifecycle, wider Business runtime breadth and remaining profile/runtime surfaces are not yet equivalent.

| Contract                                | Frozen V1 evidence                                                    | V2 evidence at M54                                                                                                                        | Status  | Migration decision                                                                    |
| --------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| Business domain/browser behavior        | `js/business/*`                                                       | `@touristic/business` domain plus authenticated mounted dashboard exist; broader V1 Business browser behavior incomplete                  | PARTIAL | Keep Business core framework-independent; continue remaining browser adapters.        |
| Business profile behavior               | `js/business/profile/*`                                               | immutable models + protected HTTP resource + mounted read/edit/save profile surface; persistence breadth still partial                    | PARTIAL | Bind intended persistence/full profile behavior before PASS.                          |
| Authenticated dashboard consumer        | `dashboard/*`                                                         | M51 client is mounted in M52 and browser-tested with real Auth session, Business scope, profile load/save and logout                      | PASS    | Keep dashboard consumption behind centralized Auth browser boundary.                  |
| Protected dashboard API consumption     | `dashboard/auth-client.js` protects authenticated dashboard resources | `@touristic/auth-browser` protects `/api/business`; app load/save use only `DashboardAuthClient.secureFetch()`                            | PASS    | Keep all future dashboard mutations on the centralized Auth browser boundary.         |
| Business tenant selection/authorization | dashboard requests carry business IDs; server Auth enforces scope     | real Business HTTP GET/PUT delegates tenant/read-only policy to `authorizeBusinessAccess()`                                               | PASS    | Preserve server authorization on every future Business resource.                      |
| Business onboarding orchestration       | `js/onboarding/business-onboarding.js`                                | M53 core plus M54 concrete dependency adapters are executable; browser host/step orchestration lifecycle remains incomplete               | PARTIAL | Complete browser host, guards/timeouts and observable orchestration before PASS.       |
| Onboarding engine                       | `js/onboarding/engine/*`                                              | deterministic chapters, step-state mapping and pure transition/status operations exist; guards/timeouts/host actions remain partial      | PARTIAL | Extend only the observable engine contracts still required by the browser flow.       |
| Onboarding conversation                 | `js/onboarding/conversation/*`                                        | M54 binds `BusinessAssistantPort` to the real Assistant dialog controller and Morro domain handlers; deterministic browser contract green | PASS    | Continue consuming Assistant; Business retains onboarding state ownership.            |
| Onboarding session/workflow state       | `js/onboarding/session/*`                                             | version 2 workflow state, seven-day TTL, statuses, resume/pause/complete and capability sets independently from Auth                      | PASS    | Keep onboarding workflow state separate from authenticated Auth session state.        |
| Onboarding tours/tutorial               | `js/onboarding/tours/*`                                               | no Business onboarding browser/tutorial surface                                                                                           | GAP     | Port product tutorial behavior after concrete onboarding adapters.                    |
| Business discovery adapter              | `js/onboarding/runtime/business-discovery-adapter.js`                 | M54 binds Business discovery to the shared immutable V1 Search catalog through `@touristic/search`; deterministic browser contract green  | PASS    | Keep discovery on `FEATURE-0002`; do not duplicate catalog/Assistant internals.       |
| Business location resolver              | `js/onboarding/runtime/business-location-resolver.js`                 | M54 resolves catalog coordinates through Search/geospatial types and browser device location through an explicit capability port          | PASS    | Keep geo/search ownership external and Business adapter explicit.                     |
| Profile sandbox/runtime                 | `business-profile-sandbox.js`                                         | profile core + protected resource + mounted profile surface exist; sandbox-specific runtime remains unclassified                          | GAP     | Classify/port only observable sandbox/runtime contract if required.                   |
| Recommendation sandbox                  | `business-recommendation-sandbox.js`                                  | adjacent recommendation capabilities exist; Business port absent                                                                          | GAP     | Do not infer production recommendation ownership from sandbox alone.                  |
| Partner workspace adapter               | `business-partner-workspace-adapter.js`                               | no Business workspace port                                                                                                                | GAP     | Freeze active call sites before implementation.                                       |
| Live Business runtime                   | `business-live-runtime.js`                                            | authenticated dashboard + onboarding core/adapters exist; wider live/analytics/tutorial runtime remains incomplete                        | PARTIAL | Extend from explicit ports; do not restore global browser state.                      |
| Commercial conversion adapter           | `business-commercial-conversion-adapter.js`                           | no Business conversion port                                                                                                               | GAP     | Keep payments/subscriptions outside Business ownership.                               |
| Checkout client                         | `business-checkout-client.js`                                         | `FEATURE-0009` remains planned                                                                                                            | N/A     | Payment execution belongs to Payments; Business only consumes future port.            |
| Dashboard visual surface                | `dashboard/*.html/css/js`                                             | M52 mounted shell reproduces/auth-tests sidebar, header, primary views, theme, logout, profile states and responsive menu                 | PASS    | Keep analytics explicitly unavailable until their endpoints are separately ported.    |
| Business onboarding visual surface      | V1 onboarding/tutorial browser flow                                   | M54 proves dependency adapters only; no full Business onboarding browser/tutorial surface                                                 | GAP     | Freeze and port visual/browser lifecycle in a dedicated checkpoint.                   |

## M54 score

- `PASS`: 8
- `PARTIAL`: 5
- `GAP`: 6
- `N/A`: 1
- total: 20

M54 promotes `Onboarding conversation`, `Business discovery adapter` and `Business location resolver` to `PASS`. The permanent browser contract executes all three concrete adapters against the real built workspace without requiring live Mapbox requests.

`Business onboarding orchestration` and `Onboarding engine` remain `PARTIAL`: the Business-owned state machine and now its concrete dependency ports are executable, but the full host lifecycle, guards/timeouts, tutorial presentation and step-by-step browser orchestration are not yet reproduced.

The M54 integration also preserves runtime isolation. Onboarding is consumed through the existing `@touristic/business/onboarding` subpath rather than being re-exported through the main `@touristic/business` entrypoint; this prevents onboarding module resolution from changing the Node dev-server graph used by protected Business/Auth resources.

## Dependency rule

No Business implementation milestone may introduce its own credential/session/cookie/CSRF logic. Those contracts belong to `FEATURE-0008` and must be consumed through an Auth-owned boundary.

The onboarding workflow session remains product/workflow state only and is not an authentication authority. It contains no credential, signed cookie, CSRF secret, role token or tenant authorization authority.

Payment/checkout execution remains owned by `FEATURE-0009`; onboarding may expose a future commercial handoff but must not absorb Payments ownership.

## Evidence

`BUSINESS-M54-EVIDENCE.md`, `business-onboarding-adapters.test.ts` and the permanent `Business Onboarding Adapter Browser Contract` prove Search discovery, catalog location resolution, safe device-location fallback and real Assistant-domain integration.

The official Quality Gate validates formatting, architecture, Feature Registry, lint, typecheck, tests and build. Existing Business Auth behavior remains controlled by its unchanged main entrypoint and dedicated regression contract.

## Next implementation milestone

M55 should freeze and port the observable onboarding browser host/tutorial lifecycle: mounting, chapter/step presentation, forward/back/resume/skip behavior, guards/timeouts and integration of the now-equivalent M54 adapters. It should not absorb Payments/commercial conversion ownership or invent analytics endpoints.
