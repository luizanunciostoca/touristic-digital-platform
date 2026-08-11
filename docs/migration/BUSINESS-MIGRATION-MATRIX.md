# Business Portal — Migration Matrix (M57 onboarding route parity)

## Status semantics

- `PASS` — V2 already exposes the audited Business-owned contract with executable evidence.
- `PARTIAL` — some reusable dependency or Business-owned primitive exists, but the observable contract is incomplete.
- `GAP` — no V2 Business-owned equivalent exists yet.
- `N/A` — contract belongs to another feature.

After M57, `FEATURE-0005` remains `baseline-pending`, but the Business-owned onboarding orchestration is now executable end-to-end across the frozen 28-step flow. M57 adds an explicit route port backed by the shared Navigation routing contract, keeps route verification fail-closed, persists tutorial-only route summaries and hands successful route intent back to Navigation without moving routing ownership into Business. Wider Business profile/runtime, analytics, partner-workspace and sandbox surfaces remain incomplete and commercial conversion stays outside Business ownership.

| Contract                                | Frozen V1 evidence                                                    | V2 evidence at M57                                                                                                                                              | Status  | Migration decision                                                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Business domain/browser behavior        | `js/business/*`                                                       | `@touristic/business` domain plus authenticated dashboard and dedicated onboarding browser flow exist; broader V1 browser behavior remains                      | PARTIAL | Keep Business core framework-independent; continue remaining browser adapters.                                                                 |
| Business profile behavior               | `js/business/profile/*`                                               | immutable models + protected HTTP resource + mounted read/edit/save profile surface; persistence breadth still partial                                          | PARTIAL | Bind intended persistence/full profile behavior before PASS.                                                                                   |
| Authenticated dashboard consumer        | `dashboard/*`                                                         | M51 client is mounted in M52 and browser-tested with real Auth session, Business scope, profile load/save and logout                                            | PASS    | Keep dashboard consumption behind centralized Auth browser boundary.                                                                           |
| Protected dashboard API consumption     | `dashboard/auth-client.js` protects authenticated dashboard resources | `@touristic/auth-browser` protects `/api/business`; app load/save use only `DashboardAuthClient.secureFetch()`                                                  | PASS    | Keep all future dashboard mutations on the centralized Auth browser boundary.                                                                  |
| Business tenant selection/authorization | dashboard requests carry business IDs; server Auth enforces scope     | real Business HTTP GET/PUT delegates tenant/read-only policy to `authorizeBusinessAccess()`                                                                     | PASS    | Preserve server authorization on every future Business resource.                                                                               |
| Business onboarding orchestration       | `js/onboarding/business-onboarding.js`                                | M56 binds the frozen 28-step flow to host/adapters; M57 adds verified fail-closed route execution through the shared Navigation contract and Navigation handoff | PASS    | Preserve explicit external capability ports; Business owns onboarding state/guards, not Search, Assistant, geospatial or Navigation internals. |
| Onboarding engine                       | `js/onboarding/engine/*`                                              | deterministic chapters/state transitions plus guarded forward/back, resume, restart, pause/complete and bounded async timeout                                   | PASS    | Preserve fail-closed guards and immutable workflow transitions.                                                                                |
| Onboarding conversation                 | `js/onboarding/conversation/*`                                        | M54 binds `BusinessAssistantPort` to the real Assistant dialog controller and Morro domain handlers; deterministic browser contract green                       | PASS    | Continue consuming Assistant; Business retains onboarding state ownership.                                                                     |
| Onboarding session/workflow state       | `js/onboarding/session/*`                                             | version 2 workflow state, seven-day TTL, statuses, resume/pause/complete, capability sets and M56 input/runtime context persistence                             | PASS    | Keep onboarding workflow state separate from authenticated Auth session state.                                                                 |
| Onboarding tours/tutorial               | `js/onboarding/tours/*`                                               | all 28 frozen V1 step definitions, copy, option sets, dynamic specialties, text field, lists, metrics and tutorial actions are browser-rendered                 | PASS    | Keep presentation declarative and isolate runtime effects behind explicit ports.                                                               |
| Business discovery adapter              | `js/onboarding/runtime/business-discovery-adapter.js`                 | M54 binds Business discovery to the shared immutable V1 Search catalog through `@touristic/search`; deterministic browser contract green                        | PASS    | Keep discovery on `FEATURE-0002`; do not duplicate catalog/Assistant internals.                                                                |
| Business location resolver              | `js/onboarding/runtime/business-location-resolver.js`                 | catalog coordinates and device location remain explicit M54 capabilities; M56 now invokes and confirms them from the real browser step                          | PASS    | Keep geo/search ownership external and Business adapter explicit.                                                                              |
| Profile sandbox/runtime                 | `business-profile-sandbox.js`                                         | profile core + protected resource + mounted profile surface exist; sandbox-specific runtime remains unclassified                                                | GAP     | Classify/port only observable sandbox/runtime contract if required.                                                                            |
| Recommendation sandbox                  | `business-recommendation-sandbox.js`                                  | adjacent recommendation capabilities exist; Business port absent                                                                                                | GAP     | Do not infer production recommendation ownership from sandbox alone.                                                                           |
| Partner workspace adapter               | `business-partner-workspace-adapter.js`                               | no Business workspace port                                                                                                                                      | GAP     | Freeze active call sites before implementation.                                                                                                |
| Live Business runtime                   | `business-live-runtime.js`                                            | onboarding now drives location, discovery, Assistant, ranking/profile and verified route behavior; wider live/analytics/workspace runtime remains incomplete    | PARTIAL | Continue only from frozen observable call sites; do not restore global browser state.                                                          |
| Commercial conversion adapter           | `business-commercial-conversion-adapter.js`                           | no Business conversion port                                                                                                                                     | GAP     | Keep payments/subscriptions outside Business ownership.                                                                                        |
| Checkout client                         | `business-checkout-client.js`                                         | `FEATURE-0009` remains planned                                                                                                                                  | N/A     | Payment execution belongs to Payments; Business only consumes future port.                                                                     |
| Dashboard visual surface                | `dashboard/*.html/css/js`                                             | M52 mounted shell reproduces/auth-tests sidebar, header, primary views, theme, logout, profile states and responsive menu                                       | PASS    | Keep analytics explicitly unavailable until their endpoints are separately ported.                                                             |
| Business onboarding visual surface      | V1 onboarding/tutorial browser flow                                   | M56 renders the full 28-step declarative presentation with choices, dynamic specialties, name input, actions, lists, metrics and context copy                   | PASS    | Preserve accessible controls and browser evidence while runtime ports evolve.                                                                  |

## M57 score

- `PASS`: 12
- `PARTIAL`: 3
- `GAP`: 4
- `N/A`: 1
- total: 20

M57 promotes `Business onboarding orchestration` from `PARTIAL` to `PASS`. The remaining route guard no longer relies on a placeholder: Business now consumes an explicit route port, the app adapter delegates to the shared `@touristic/navigation` `requestRoute()` boundary, verified route distance/duration/geometry are persisted as tutorial-only state, and `route → conversion` remains blocked until that verification succeeds.

The permanent `Business Onboarding Route Browser Contract` proves the same-origin `POST`, `foot-walking` profile, validated `LineString`, tutorial metric exclusion, route summary persistence, `businessTutorialRouteRendered`, Navigation ownership handoff through `morro:navigation-requested`, and guarded transition to `conversion`. Failure remains fail-closed and is covered by unit tests.

`Live Business runtime` remains `PARTIAL`. M57 closes the onboarding-owned route orchestration gap but does not claim analytics, partner-workspace, recommendation/profile sandbox or other unrelated Business runtime breadth. Commercial conversion remains outside Business ownership.

The M54 runtime-isolation rule remains intact. Business onboarding consumes Search, location, Assistant and Navigation through explicit ports and dedicated onboarding subpaths; protected Business/Auth server consumers retain their existing module graph.

## Dependency rule

No Business implementation milestone may introduce its own credential/session/cookie/CSRF logic. Those contracts belong to `FEATURE-0008` and must be consumed through an Auth-owned boundary.

The onboarding workflow session remains product/workflow state only and is not an authentication authority. It contains no credential, signed cookie, CSRF secret, role token or tenant authorization authority.

Payment/checkout execution remains owned by `FEATURE-0009`; onboarding may expose a future commercial handoff but must not absorb Payments ownership.

## Evidence

`BUSINESS-M54-EVIDENCE.md` and the permanent Business Onboarding Adapter Browser Contract continue to prove Search discovery, catalog/device location and real Assistant-domain integration.

`BUSINESS-M55-EVIDENCE.md` and `onboarding-host.test.ts` continue to prove host lifecycle, guarded transitions, resume/expiry handling and bounded fail-closed transitions.

`BUSINESS-M56-EVIDENCE.md`, `onboarding-steps.test.ts` and the permanent Business Onboarding Browser Contract continue to prove the frozen 28-step presentation/input contract, persisted foundation inputs and representative browser lifecycle/effects.

`BUSINESS-M57-EVIDENCE.md`, the expanded `business-onboarding-adapters.test.ts` and the permanent Business Onboarding Route Browser Contract prove verified same-origin route calculation, fail-closed errors, tutorial metric exclusion, Navigation ownership handoff and `route → conversion` guard release only after a valid route result.

The official Quality Gate validates formatting, architecture, Feature Registry, lint, typecheck, tests and build. Business Auth, Dashboard, Onboarding Adapter, Onboarding Browser, Onboarding Route and Navigation Accessibility regressions must remain green on the final M57 head.

## Next implementation milestone

M58 should audit the remaining Business-owned `PARTIAL`/`GAP` contracts before implementation, prioritizing frozen observable call sites rather than expanding scope by assumption. The next candidate should be selected from Business profile persistence/runtime breadth, profile sandbox/runtime, recommendation sandbox or partner-workspace integration based on executable V1 usage. Payments/checkout and commercial conversion remain separate feature ownership, and analytics endpoints must not be invented merely to improve the Business migration score.
