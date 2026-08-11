# Business Portal — Migration Matrix (M56 onboarding per-step contracts)

## Status semantics

- `PASS` — V2 already exposes the audited Business-owned contract with executable evidence.
- `PARTIAL` — some reusable dependency or Business-owned primitive exists, but the observable contract is incomplete.
- `GAP` — no V2 Business-owned equivalent exists yet.
- `N/A` — contract belongs to another feature.

After M56, `FEATURE-0005` remains `baseline-pending`. The Business core, protected HTTP boundary, authenticated dashboard consumer, mounted dashboard shell, onboarding workflow/session core, concrete Search/geospatial/Assistant onboarding adapters, dedicated onboarding browser host and the frozen 28-step presentation/input contract are executable. M56 now renders the V1 step copy and controls, persists the five business-foundation inputs, interpolates business context, drives discovery/location/Assistant effects through existing M54 adapters and preserves fail-closed guards. Route execution remains intentionally blocked because an equivalent Business route port has not yet been established; wider Business runtime/profile sandbox/workspace/commercial surfaces remain outside this milestone.

| Contract                                | Frozen V1 evidence                                                    | V2 evidence at M56                                                                                                                               | Status  | Migration decision                                                                    |
| --------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------- |
| Business domain/browser behavior        | `js/business/*`                                                       | `@touristic/business` domain plus authenticated dashboard and dedicated onboarding browser flow exist; broader V1 browser behavior remains      | PARTIAL | Keep Business core framework-independent; continue remaining browser adapters.        |
| Business profile behavior               | `js/business/profile/*`                                               | immutable models + protected HTTP resource + mounted read/edit/save profile surface; persistence breadth still partial                           | PARTIAL | Bind intended persistence/full profile behavior before PASS.                          |
| Authenticated dashboard consumer        | `dashboard/*`                                                         | M51 client is mounted in M52 and browser-tested with real Auth session, Business scope, profile load/save and logout                             | PASS    | Keep dashboard consumption behind centralized Auth browser boundary.                  |
| Protected dashboard API consumption     | `dashboard/auth-client.js` protects authenticated dashboard resources | `@touristic/auth-browser` protects `/api/business`; app load/save use only `DashboardAuthClient.secureFetch()`                                   | PASS    | Keep all future dashboard mutations on the centralized Auth browser boundary.         |
| Business tenant selection/authorization | dashboard requests carry business IDs; server Auth enforces scope     | real Business HTTP GET/PUT delegates tenant/read-only policy to `authorizeBusinessAccess()`                                                      | PASS    | Preserve server authorization on every future Business resource.                      |
| Business onboarding orchestration       | `js/onboarding/business-onboarding.js`                                | M56 binds the frozen 28-step contract to the M55 host and M54 adapters; route execution still lacks an equivalent port                           | PARTIAL | Add an explicit equivalent route capability before claiming full orchestration parity.|
| Onboarding engine                       | `js/onboarding/engine/*`                                              | deterministic chapters/state transitions plus guarded forward/back, resume, restart, pause/complete and bounded async timeout                   | PASS    | Preserve fail-closed guards and immutable workflow transitions.                       |
| Onboarding conversation                 | `js/onboarding/conversation/*`                                        | M54 binds `BusinessAssistantPort` to the real Assistant dialog controller and Morro domain handlers; deterministic browser contract green        | PASS    | Continue consuming Assistant; Business retains onboarding state ownership.            |
| Onboarding session/workflow state       | `js/onboarding/session/*`                                             | version 2 workflow state, seven-day TTL, statuses, resume/pause/complete, capability sets and M56 input/runtime context persistence               | PASS    | Keep onboarding workflow state separate from authenticated Auth session state.        |
| Onboarding tours/tutorial               | `js/onboarding/tours/*`                                               | all 28 frozen V1 step definitions, copy, option sets, dynamic specialties, text field, lists, metrics and tutorial actions are browser-rendered  | PASS    | Keep presentation declarative and isolate runtime effects behind explicit ports.       |
| Business discovery adapter              | `js/onboarding/runtime/business-discovery-adapter.js`                 | M54 binds Business discovery to the shared immutable V1 Search catalog through `@touristic/search`; deterministic browser contract green         | PASS    | Keep discovery on `FEATURE-0002`; do not duplicate catalog/Assistant internals.       |
| Business location resolver              | `js/onboarding/runtime/business-location-resolver.js`                 | catalog coordinates and device location remain explicit M54 capabilities; M56 now invokes and confirms them from the real browser step           | PASS    | Keep geo/search ownership external and Business adapter explicit.                     |
| Profile sandbox/runtime                 | `business-profile-sandbox.js`                                         | profile core + protected resource + mounted profile surface exist; sandbox-specific runtime remains unclassified                                 | GAP     | Classify/port only observable sandbox/runtime contract if required.                   |
| Recommendation sandbox                  | `business-recommendation-sandbox.js`                                  | adjacent recommendation capabilities exist; Business port absent                                                                                 | GAP     | Do not infer production recommendation ownership from sandbox alone.                  |
| Partner workspace adapter               | `business-partner-workspace-adapter.js`                               | no Business workspace port                                                                                                                       | GAP     | Freeze active call sites before implementation.                                       |
| Live Business runtime                   | `business-live-runtime.js`                                            | onboarding now drives location, discovery, Assistant, ranking/profile events and guards; route and wider live/analytics runtime remain incomplete | PARTIAL | Extend only through explicit ports; do not restore global browser state.              |
| Commercial conversion adapter           | `business-commercial-conversion-adapter.js`                           | no Business conversion port                                                                                                                      | GAP     | Keep payments/subscriptions outside Business ownership.                               |
| Checkout client                         | `business-checkout-client.js`                                         | `FEATURE-0009` remains planned                                                                                                                   | N/A     | Payment execution belongs to Payments; Business only consumes future port.            |
| Dashboard visual surface                | `dashboard/*.html/css/js`                                             | M52 mounted shell reproduces/auth-tests sidebar, header, primary views, theme, logout, profile states and responsive menu                        | PASS    | Keep analytics explicitly unavailable until their endpoints are separately ported.    |
| Business onboarding visual surface      | V1 onboarding/tutorial browser flow                                   | M56 renders the full 28-step declarative presentation with choices, dynamic specialties, name input, actions, lists, metrics and context copy    | PASS    | Preserve accessible controls and browser evidence while runtime ports evolve.         |

## M56 score

- `PASS`: 11
- `PARTIAL`: 4
- `GAP`: 4
- `N/A`: 1
- total: 20

M56 promotes `Onboarding tours/tutorial` and `Business onboarding visual surface` from `PARTIAL` to `PASS`. The permanent step contract freezes all 28 V1 step IDs and their presentation metadata, while the browser surface now renders category/specialty/objective/audience choices, the business-name field, interpolated context copy, response blocks, tool/funnel lists, metrics and runtime actions. The Browser Contract executes the representative foundation path and confirms persisted inputs and rendered content rather than relying on the M55 placeholder step label.

`Business onboarding orchestration` deliberately remains `PARTIAL`. M56 connects location resolution/confirmation, discovery, simulated voice completion, multilingual presentation, Assistant recommendation, ranking explanation and profile lifecycle effects to the host while preserving the M55 fail-closed guards. The `route` step is explicitly kept fail-closed and publishes a route-required lifecycle event because V2 does not yet expose an equivalent route port; M56 does not fabricate route success to improve the score.

`Onboarding session/workflow state` remains `PASS` and is strengthened by immutable persistence of category, specialty, business name, objective and audience into the onboarding draft/business draft. Runtime context writes are allow-listed and cannot inject credential/session/cookie/CSRF/role/tenant authorization authority.

The M54 runtime-isolation rule remains intact. Onboarding presentation and host behavior are consumed through dedicated `@touristic/business/onboarding-*` subpaths rather than being re-exported through the main `@touristic/business` entrypoint; protected Business/Auth server consumers retain their existing module graph.

## Dependency rule

No Business implementation milestone may introduce its own credential/session/cookie/CSRF logic. Those contracts belong to `FEATURE-0008` and must be consumed through an Auth-owned boundary.

The onboarding workflow session remains product/workflow state only and is not an authentication authority. It contains no credential, signed cookie, CSRF secret, role token or tenant authorization authority.

Payment/checkout execution remains owned by `FEATURE-0009`; onboarding may expose a future commercial handoff but must not absorb Payments ownership.

## Evidence

`BUSINESS-M54-EVIDENCE.md`, `business-onboarding-adapters.test.ts` and the permanent `Business Onboarding Adapter Browser Contract` continue to prove Search discovery, catalog location resolution, safe device-location fallback and real Assistant-domain integration.

`BUSINESS-M55-EVIDENCE.md` and `onboarding-host.test.ts` continue to prove host lifecycle, guarded transitions, resume/expiry handling and bounded fail-closed transitions.

`BUSINESS-M56-EVIDENCE.md`, `onboarding-steps.test.ts`, the expanded host tests and the permanent `Business Onboarding Browser Contract` prove the 28-step order/copy contract, initial input persistence, browser rendering, validation, adapter-triggering behavior and representative lifecycle events.

The official Quality Gate validates formatting, architecture, Feature Registry, lint, typecheck, tests and build. Business Auth, Dashboard, Onboarding Adapter, Onboarding Browser and Navigation Accessibility regressions must all remain green on the final M56 head.

## Next implementation milestone

M57 should close the remaining observable onboarding orchestration gap around `route`: freeze the V1 route contract/call sites, introduce the smallest explicit Business route port backed by the already-owned navigation/geospatial capability where equivalence exists, and prove the `route` guard can transition only after a verified route result. It must remain fail-closed when routing is unavailable and must not absorb Payments, analytics, unrelated sandbox or partner-workspace ownership.
