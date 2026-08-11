# Business Portal — Migration Matrix (M55 onboarding browser lifecycle)

## Status semantics

- `PASS` — V2 already exposes the audited Business-owned contract with executable evidence.
- `PARTIAL` — some reusable dependency or Business-owned primitive exists, but the observable contract is incomplete.
- `GAP` — no V2 Business-owned equivalent exists yet.
- `N/A` — contract belongs to another feature.

After M55, `FEATURE-0005` remains `baseline-pending`. The Business core, protected HTTP boundary, authenticated dashboard consumer, mounted dashboard shell, onboarding workflow/session core, concrete Search/geospatial/Assistant onboarding adapters and a dedicated onboarding browser host are executable. The host now covers chapter/step progress, forward/back, pause/resume/restart/complete and bounded fail-closed transition guards. Full per-step tutorial content/actions, wider Business runtime breadth and remaining profile/runtime surfaces are not yet equivalent.

| Contract                                | Frozen V1 evidence                                                    | V2 evidence at M55                                                                                                                         | Status  | Migration decision                                                                    |
| --------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------- |
| Business domain/browser behavior        | `js/business/*`                                                       | `@touristic/business` domain plus authenticated dashboard and dedicated onboarding browser host exist; broader V1 browser behavior remains | PARTIAL | Keep Business core framework-independent; continue remaining browser adapters.        |
| Business profile behavior               | `js/business/profile/*`                                               | immutable models + protected HTTP resource + mounted read/edit/save profile surface; persistence breadth still partial                     | PARTIAL | Bind intended persistence/full profile behavior before PASS.                          |
| Authenticated dashboard consumer        | `dashboard/*`                                                         | M51 client is mounted in M52 and browser-tested with real Auth session, Business scope, profile load/save and logout                       | PASS    | Keep dashboard consumption behind centralized Auth browser boundary.                  |
| Protected dashboard API consumption     | `dashboard/auth-client.js` protects authenticated dashboard resources | `@touristic/auth-browser` protects `/api/business`; app load/save use only `DashboardAuthClient.secureFetch()`                             | PASS    | Keep all future dashboard mutations on the centralized Auth browser boundary.         |
| Business tenant selection/authorization | dashboard requests carry business IDs; server Auth enforces scope     | real Business HTTP GET/PUT delegates tenant/read-only policy to `authorizeBusinessAccess()`                                                | PASS    | Preserve server authorization on every future Business resource.                      |
| Business onboarding orchestration       | `js/onboarding/business-onboarding.js`                                | M53/M54 core/adapters plus M55 mounted host lifecycle are executable; step-specific content/action orchestration is still incomplete       | PARTIAL | Wire the frozen per-step content/actions and adapter-triggering behavior before PASS. |
| Onboarding engine                       | `js/onboarding/engine/*`                                              | deterministic chapters/state transitions plus M55 guarded forward/back, resume, restart, pause/complete and bounded async timeout          | PASS    | Preserve fail-closed guards and immutable workflow transitions.                       |
| Onboarding conversation                 | `js/onboarding/conversation/*`                                        | M54 binds `BusinessAssistantPort` to the real Assistant dialog controller and Morro domain handlers; deterministic browser contract green  | PASS    | Continue consuming Assistant; Business retains onboarding state ownership.            |
| Onboarding session/workflow state       | `js/onboarding/session/*`                                             | version 2 workflow state, seven-day TTL, statuses, resume/pause/complete and capability sets independently from Auth                       | PASS    | Keep onboarding workflow state separate from authenticated Auth session state.        |
| Onboarding tours/tutorial               | `js/onboarding/tours/*`                                               | M55 dedicated browser tutorial surface mounts, navigates and tears down correctly; detailed step presentation/actions remain incomplete    | PARTIAL | Port only the remaining observable per-step tutorial contracts.                       |
| Business discovery adapter              | `js/onboarding/runtime/business-discovery-adapter.js`                 | M54 binds Business discovery to the shared immutable V1 Search catalog through `@touristic/search`; deterministic browser contract green   | PASS    | Keep discovery on `FEATURE-0002`; do not duplicate catalog/Assistant internals.       |
| Business location resolver              | `js/onboarding/runtime/business-location-resolver.js`                 | M54 resolves catalog coordinates through Search/geospatial types and browser device location through an explicit capability port           | PASS    | Keep geo/search ownership external and Business adapter explicit.                     |
| Profile sandbox/runtime                 | `business-profile-sandbox.js`                                         | profile core + protected resource + mounted profile surface exist; sandbox-specific runtime remains unclassified                           | GAP     | Classify/port only observable sandbox/runtime contract if required.                   |
| Recommendation sandbox                  | `business-recommendation-sandbox.js`                                  | adjacent recommendation capabilities exist; Business port absent                                                                           | GAP     | Do not infer production recommendation ownership from sandbox alone.                  |
| Partner workspace adapter               | `business-partner-workspace-adapter.js`                               | no Business workspace port                                                                                                                 | GAP     | Freeze active call sites before implementation.                                       |
| Live Business runtime                   | `business-live-runtime.js`                                            | authenticated dashboard + onboarding core/adapters/host exist; wider live/analytics/tutorial runtime remains incomplete                    | PARTIAL | Extend from explicit ports; do not restore global browser state.                      |
| Commercial conversion adapter           | `business-commercial-conversion-adapter.js`                           | no Business conversion port                                                                                                                | GAP     | Keep payments/subscriptions outside Business ownership.                               |
| Checkout client                         | `business-checkout-client.js`                                         | `FEATURE-0009` remains planned                                                                                                             | N/A     | Payment execution belongs to Payments; Business only consumes future port.            |
| Dashboard visual surface                | `dashboard/*.html/css/js`                                             | M52 mounted shell reproduces/auth-tests sidebar, header, primary views, theme, logout, profile states and responsive menu                  | PASS    | Keep analytics explicitly unavailable until their endpoints are separately ported.    |
| Business onboarding visual surface      | V1 onboarding/tutorial browser flow                                   | M55 mounts an accessible dedicated onboarding dialog with chapter/step progress, back/continue/complete and skip lifecycle                 | PARTIAL | Freeze/port detailed per-step content and action presentation before PASS.            |

## M55 score

- `PASS`: 9
- `PARTIAL`: 6
- `GAP`: 4
- `N/A`: 1
- total: 20

M55 promotes `Onboarding engine` to `PASS`: the existing M53 state machine now has an explicit host lifecycle with immutable forward/back transitions, resumable paused workflow state, restart, pause/complete and bounded fail-closed async guards. Unit tests freeze these contracts.

`Onboarding tours/tutorial` and `Business onboarding visual surface` move from `GAP` to `PARTIAL`. The permanent `Business Onboarding Browser Contract` proves the dedicated page mounts, exposes accessible dialog semantics, publishes active/inactive lifecycle state, renders chapter/step progress, advances `welcome → category`, returns `category → welcome`, and tears down on skip. They remain `PARTIAL` because M55 deliberately does not claim that all 28 V1 steps' detailed copy, controls, presentations and adapter-triggering actions are reproduced yet.

`Business onboarding orchestration` remains `PARTIAL` for the same reason. M54 adapters stay executable and independently browser-tested, while M55 supplies the host lifecycle; the next checkpoint must bind the frozen per-step contracts to that host rather than infer full orchestration from two independently green components.

The M54 runtime-isolation rule remains intact. Onboarding is consumed through dedicated `@touristic/business/onboarding` and `@touristic/business/onboarding-host` subpaths rather than being re-exported through the main `@touristic/business` entrypoint; protected Business/Auth server consumers therefore retain their existing module graph.

## Dependency rule

No Business implementation milestone may introduce its own credential/session/cookie/CSRF logic. Those contracts belong to `FEATURE-0008` and must be consumed through an Auth-owned boundary.

The onboarding workflow session remains product/workflow state only and is not an authentication authority. It contains no credential, signed cookie, CSRF secret, role token or tenant authorization authority.

Payment/checkout execution remains owned by `FEATURE-0009`; onboarding may expose a future commercial handoff but must not absorb Payments ownership.

## Evidence

`BUSINESS-M54-EVIDENCE.md`, `business-onboarding-adapters.test.ts` and the permanent `Business Onboarding Adapter Browser Contract` continue to prove Search discovery, catalog location resolution, safe device-location fallback and real Assistant-domain integration.

`BUSINESS-M55-EVIDENCE.md`, `onboarding-host.test.ts` and the permanent `Business Onboarding Browser Contract` prove host lifecycle, guarded transitions, resume/expiry handling and observable browser mount/navigation/skip behavior.

The official Quality Gate validates formatting, architecture, Feature Registry, lint, typecheck, tests and build. Existing Business Auth, dashboard, onboarding-adapter and navigation-accessibility regressions must remain green on the final M55 head.

## Next implementation milestone

M56 should port and bind the remaining observable per-step onboarding contracts across the frozen 28-step flow: step copy/presentation, input/action controls, step-specific guard requirements and calls into the already-equivalent M54 Search/geospatial/Assistant adapters. It should not absorb Payments/commercial conversion ownership, invent analytics endpoints or expand unrelated Business sandbox/workspace scope.
