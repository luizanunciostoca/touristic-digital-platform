# Business Portal — Migration Matrix (M63 production profile view parity)

## Status semantics

- `PASS` — V2 already exposes the audited Business-owned contract with executable evidence.
- `PARTIAL` — some reusable dependency or Business-owned primitive exists, but the observable contract is incomplete.
- `GAP` — no V2 Business-owned equivalent exists yet.
- `N/A` — contract belongs to another feature.

After M63, `FEATURE-0005` remains `baseline-pending`. M61/M62 closed the Business-owned commercial conversion lifecycle while preserving Payments ownership, and M63 ports the frozen production profile browser view onto the authenticated dashboard. Wider live Business runtime and broader Business browser behavior remain partial.

| Contract                                | Frozen V1 evidence                                                    | V2 evidence at M63                                                                                                                                                               | Status  | Migration decision                                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business domain/browser behavior        | `js/business/*`                                                       | `@touristic/business` domain plus authenticated dashboard and dedicated onboarding browser flow exist; broader V1 browser behavior remains                                       | PARTIAL | Keep Business core framework-independent; continue remaining browser adapters.                                                                       |
| Business profile behavior               | `js/business/profile/*`                                               | immutable model + protected GET/PUT + authenticated dashboard editing + M63 production modal view with optional promotion, delegated actions and deterministic Chromium evidence | PASS    | Keep one normalized `BusinessProfile` model and preserve Auth-owned persistence/authorization.                                                       |
| Authenticated dashboard consumer        | `dashboard/*`                                                         | M51 client is mounted in M52 and browser-tested with real Auth session, Business scope, profile load/save and logout                                                             | PASS    | Keep dashboard consumption behind centralized Auth browser boundary.                                                                                 |
| Protected dashboard API consumption     | `dashboard/auth-client.js` protects authenticated dashboard resources | `@touristic/auth-browser` protects `/api/business`; app load/save use only `DashboardAuthClient.secureFetch()`                                                                   | PASS    | Keep all future dashboard mutations on the centralized Auth browser boundary.                                                                        |
| Business tenant selection/authorization | dashboard requests carry business IDs; server Auth enforces scope     | real Business HTTP GET/PUT delegates tenant/read-only policy to `authorizeBusinessAccess()`                                                                                      | PASS    | Preserve server authorization on every future Business resource.                                                                                     |
| Business onboarding orchestration       | `js/onboarding/business-onboarding.js`                                | M56 binds the frozen 28-step flow; M57 adds verified route; M58 recommendation; M59 profile; M60 workspace; M62 commercial browser handoff                                       | PASS    | Preserve explicit external capability ports; Business owns onboarding/workflow state, not Search, Assistant, Navigation, Auth or Payments internals. |
| Onboarding engine                       | `js/onboarding/engine/*`                                              | deterministic chapters/state transitions plus guarded forward/back, resume, restart, pause/complete and bounded async timeout                                                    | PASS    | Preserve fail-closed guards and immutable workflow transitions.                                                                                      |
| Onboarding conversation                 | `js/onboarding/conversation/*`                                        | M54 binds real Assistant integration; M58 evaluates the tutorial candidate after Assistant execution; M59 consumes the resulting tutorial context for profile projection         | PASS    | Continue consuming Assistant; Business retains onboarding workflow/tutorial state ownership.                                                         |
| Onboarding session/workflow state       | `js/onboarding/session/*`                                             | version 2 workflow state, seven-day TTL, statuses, resume/pause/complete, capability sets and explicit runtime-context allowlist including M62 commercial results                | PASS    | Keep onboarding workflow state separate from authenticated Auth session state.                                                                       |
| Onboarding tours/tutorial               | `js/onboarding/tours/*`                                               | all 28 frozen V1 step definitions, copy, option sets, dynamic specialties, text field, lists, metrics and tutorial actions are browser-rendered                                  | PASS    | Keep presentation declarative and isolate runtime effects behind explicit ports.                                                                     |
| Business discovery adapter              | `js/onboarding/runtime/business-discovery-adapter.js`                 | M54 binds Business discovery to the shared immutable V1 Search catalog through `@touristic/search`; deterministic browser contract green                                         | PASS    | Keep discovery on `FEATURE-0002`; do not duplicate catalog/Assistant internals.                                                                      |
| Business location resolver              | `js/onboarding/runtime/business-location-resolver.js`                 | catalog coordinates and device location remain explicit M54 capabilities; M56 invokes and confirms them from the real browser step                                               | PASS    | Keep geo/search ownership external and Business adapter explicit.                                                                                    |
| Profile sandbox/runtime                 | `business-profile-sandbox.js`                                         | M59 tutorial profile adapter reuses `BusinessProfile` core, persists profile-step projection, renders preview and exposes map/primary/promotion tutorial actions                 | PASS    | Keep tutorial profile isolated; production profile breadth remains separately classified.                                                            |
| Recommendation sandbox                  | `business-recommendation-sandbox.js`                                  | M58 Business-owned tutorial candidate + frozen additive score weights/threshold + `assistant-query` runtime integration + metric exclusion                                       | PASS    | Keep this tutorial-only; production recommendation remains with Search/Assistant architecture.                                                       |
| Partner workspace adapter               | `business-partner-workspace-adapter.js`                               | M60 renders session-only metrics, creates sandbox promotions and hands off explicitly to the protected authenticated dashboard                                                   | PASS    | Keep tutorial workspace isolated; Auth protects the real dashboard and production analytics remain separate.                                         |
| Live Business runtime                   | `business-live-runtime.js`                                            | onboarding drives location, discovery, Assistant, recommendation, profile, verified route, workspace and commercial lifecycle; wider live/analytics behavior remains incomplete  | PARTIAL | Continue only from frozen observable call sites; do not restore global browser state or invent analytics.                                            |
| Commercial conversion adapter           | `business-commercial-conversion-adapter.js`                           | M61 ports the framework-independent commercial core; M62 binds it to the finish-step browser form, Payments handoff and fail-closed verified activation lifecycle                | PASS    | Keep payment/subscription execution in `FEATURE-0009`; Business owns only commercial preparation and handoff consumption.                            |
| Checkout client                         | `business-checkout-client.js`                                         | `FEATURE-0009` remains planned                                                                                                                                                   | N/A     | Payment execution belongs to Payments; Business only consumes its verified boundary.                                                                 |
| Dashboard visual surface                | `dashboard/*.html/css/js`                                             | M52 mounted shell reproduces/auth-tests sidebar, header, primary views, theme, logout, profile states and responsive menu                                                        | PASS    | Keep analytics explicitly unavailable until their endpoints are separately ported.                                                                   |
| Business onboarding visual surface      | V1 onboarding/tutorial browser flow                                   | full 28-step presentation remains browser-tested; M59 adds profile preview, M60 partner workspace, and M62 commercial preparation plus Payments-ownership disclosure             | PASS    | Preserve accessible controls and browser evidence while production runtime ports evolve.                                                             |

## M63 score

- `PASS`: 17
- `PARTIAL`: 2
- `GAP`: 0
- `N/A`: 1
- total: 20

M61 promotes `Commercial conversion adapter` from `GAP` to `PASS` through `@touristic/business/onboarding-commercial-conversion`. The frozen V1 audit separates Business-owned commercial preparation from Payments-owned execution: Business recommends a plan, validates contractor data and required legal acceptances, creates a normalized handoff and only consumes a separately verified payment result.

M62 makes that port observable in the real browser lifecycle. The `finish` step renders the commercial preparation form, sends an explicit runtime action, and the runtime delegates all plan/contractor/acceptance/handoff rules to the M61 core. The resulting `businessCommercialCheckoutHandoff` is persisted only through the explicit workflow allowlist and emits `businessCheckoutRequested` with `requiresPaymentsCapability: true`.

The Business browser neither creates checkout/provider sessions nor stores provider URLs/tokens, sends payment HTTP requests, creates idempotency keys, polls transaction state, or claims confirmation from the handoff. The entrypoint consumes only an external `businessPaymentVerified` signal. Wrong-session and unverified signals fail closed; only a verified same-correlation signal accepted by the M61 core persists `businessCommercialActivation` and emits `businessCommercialActivationReady`.

The permanent Commercial Browser Contract proves this lifecycle in deterministic Chromium. It also proves the `events → performance` plan fallback through the M61 core, contractor sanitization, explicit Payments-ownership disclosure, absence of payment execution state in the handoff, rejection of invalid verification and exactly one valid activation event.

`Business profile behavior` is now `PASS`: M63 reuses the protected V2 profile model/persistence and restores the frozen production browser view with accessible modal semantics, optional promotion, delegated primary/map/promotion actions and no synthetic business data. `Business domain/browser behavior` and `Live Business runtime` remain `PARTIAL`. `Checkout client` remains `N/A` for Business because provider/payment execution belongs to `FEATURE-0009`. M63 still does not claim full Business equivalence.

## Dependency rule

No Business implementation milestone may introduce its own credential/session/cookie/CSRF logic. Those contracts belong to `FEATURE-0008` and must be consumed through an Auth-owned boundary.

The onboarding workflow correlation remains product/workflow state only and is not an authentication authority or proof of payment. Its runtime allowlist persists only explicit Business workflow results and rejects unrelated fields.

Payment/checkout execution remains owned by `FEATURE-0009`; Business may prepare and consume the explicit port but must not absorb provider execution or financial verification ownership.

## Evidence

`BUSINESS-M54-EVIDENCE.md` and the permanent Business Onboarding Adapter Browser Contract continue to prove Search discovery, catalog/device location and real Assistant-domain integration.

`BUSINESS-M55-EVIDENCE.md` and `onboarding-host.test.ts` continue to prove host lifecycle, guarded transitions, resume/expiry handling and bounded fail-closed transitions.

`BUSINESS-M56-EVIDENCE.md`, `onboarding-steps.test.ts` and the permanent Business Onboarding Browser Contract continue to prove the frozen 28-step presentation/input contract, persisted foundation inputs and representative browser lifecycle/effects.

`BUSINESS-M57-EVIDENCE.md`, the expanded `business-onboarding-adapters.test.ts` and the permanent Business Onboarding Route Browser Contract continue to prove verified same-origin route calculation, fail-closed errors, tutorial metric exclusion, Navigation ownership handoff and route guard release only after a valid result.

`BUSINESS-M58-EVIDENCE.md` and `onboarding-recommendation.test.ts` continue to prove the frozen tutorial candidate/scoring/threshold contract.

`BUSINESS-M59-EVIDENCE.md`, `onboarding-profile.test.ts`, `onboarding-context.test.ts` and the permanent Business Onboarding Profile Browser Contract prove tutorial profile projection, shared-core sanitization, explicit runtime persistence, embedded preview and profile tutorial actions.

`BUSINESS-M60-EVIDENCE.md`, `onboarding-workspace.test.ts` and the permanent Business Onboarding Workspace Browser Contract prove session-only event summaries, sandbox promotion creation, partner-panel rendering, metric exclusion and an explicit authenticated dashboard handoff.

`BUSINESS-M61-EVIDENCE.md` and `onboarding-commercial-conversion.test.ts` prove the framework-independent commercial core, immutable handoff and fail-closed verified-payment acceptance boundary.

`BUSINESS-M62-EVIDENCE.md`, the expanded runtime-context allowlist and the permanent Business Onboarding Commercial Browser Contract prove the browser finish-step preparation flow, reuse of the M61 core, Payments handoff, absence of synthetic financial confirmation and same-correlation verified activation.

`BUSINESS-M63-EVIDENCE.md` and the permanent Business Production Profile Browser Contract prove the authenticated production profile modal, frozen V1 view semantics, optional promotion, delegated actions, Escape teardown and absence of synthetic ratings/hours/images/contacts.

The official Quality Gate must validate formatting, architecture, Feature Registry, lint, typecheck, tests and build. The Business Dashboard Browser Contract and Business Production Profile Browser Contract must remain green on the final permanent M63 head, together with any other path-triggered regressions.

## Next implementation milestone

M64 should audit the two remaining `PARTIAL` contracts — `Business domain/browser behavior` and `Live Business runtime` — from frozen production V1 call sites and select the smallest observable production behavior that can be ported without inventing analytics or restoring legacy globals.

Zero GAPs and a production-profile PASS at M63 do not make `FEATURE-0005` equivalent while these two PARTIAL contracts remain.
