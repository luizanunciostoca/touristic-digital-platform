# Business Portal — Migration Matrix (M53 onboarding core)

## Status semantics

- `PASS` — V2 already exposes the audited Business-owned contract with executable evidence.
- `PARTIAL` — some reusable dependency or Business-owned primitive exists, but the observable contract is incomplete.
- `GAP` — no V2 Business-owned equivalent exists yet.
- `N/A` — contract belongs to another feature.

After M53, `FEATURE-0005` remains `baseline-pending`. The Business core, protected HTTP boundary, authenticated dashboard consumer, mounted dashboard shell and Business-owned onboarding workflow/session core are executable, but concrete onboarding adapters/browser tutorial behavior and wider Business runtime breadth are not yet equivalent.

| Contract                                | Frozen V1 evidence                                                    | V2 evidence at M53                                                                                                                        | Status  | Migration decision                                                                    |
| --------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| Business domain/browser behavior        | `js/business/*`                                                       | `@touristic/business` domain plus authenticated mounted dashboard exist; broader V1 Business browser behavior incomplete                  | PARTIAL | Keep Business core framework-independent; continue remaining browser adapters.        |
| Business profile behavior               | `js/business/profile/*`                                               | immutable models + protected HTTP resource + mounted read/edit/save profile surface; persistence breadth still partial                    | PARTIAL | Bind intended persistence/full profile behavior before PASS.                          |
| Authenticated dashboard consumer        | `dashboard/*`                                                         | M51 client is mounted in M52 and browser-tested with real Auth session, Business scope, profile load/save and logout                      | PASS    | Keep dashboard consumption behind centralized Auth browser boundary.                  |
| Protected dashboard API consumption     | `dashboard/auth-client.js` protects authenticated dashboard resources | `@touristic/auth-browser` protects `/api/business`; app load/save use only `DashboardAuthClient.secureFetch()`                            | PASS    | Keep all future dashboard mutations on the centralized Auth browser boundary.         |
| Business tenant selection/authorization | dashboard requests carry business IDs; server Auth enforces scope     | real Business HTTP GET/PUT delegates tenant/read-only policy to `authorizeBusinessAccess()`                                               | PASS    | Preserve server authorization on every future Business resource.                      |
| Business onboarding orchestration       | `js/onboarding/business-onboarding.js`                                | M53 freezes the five-chapter/28-step Business-owned orchestration core and explicit dependency ports; browser host/adapters remain absent | PARTIAL | Complete concrete adapters and browser orchestration before PASS.                     |
| Onboarding engine                       | `js/onboarding/engine/*`                                              | M53 exposes deterministic chapters, step-state mapping and pure transition/status operations; guards/timeouts/host actions remain partial | PARTIAL | Extend only the observable engine contracts still required by the browser flow.       |
| Onboarding conversation                 | `js/onboarding/conversation/*`                                        | equivalent Assistant exists and M53 defines the Business Assistant port; concrete Business conversation adapter/host remains absent       | PARTIAL | Consume Assistant boundary; Business owns onboarding state and browser orchestration. |
| Onboarding session/workflow state       | `js/onboarding/session/*`                                             | M53 implements version 2 workflow state, seven-day TTL, statuses, resume/pause/complete and capability sets independently from Auth       | PASS    | Keep onboarding workflow state separate from authenticated Auth session state.        |
| Onboarding tours/tutorial               | `js/onboarding/tours/*`                                               | no Business onboarding browser/tutorial surface                                                                                           | GAP     | Port product tutorial behavior after concrete onboarding adapters.                    |
| Business discovery adapter              | `js/onboarding/runtime/business-discovery-adapter.js`                 | Search is equivalent and M53 defines `BusinessDiscoveryPort`; concrete Business discovery adapter remains absent                          | PARTIAL | Consume `FEATURE-0002`; do not duplicate Search/Assistant internals.                  |
| Business location resolver              | `js/onboarding/runtime/business-location-resolver.js`                 | geospatial/search are equivalent and M53 defines `BusinessLocationPort`; concrete resolver remains absent                                 | PARTIAL | Reuse existing geo/search ports through a Business-owned adapter.                     |
| Profile sandbox/runtime                 | `business-profile-sandbox.js`                                         | profile core + protected resource + mounted profile surface exist; sandbox-specific runtime remains unclassified                          | GAP     | Classify/port only observable sandbox/runtime contract if required.                   |
| Recommendation sandbox                  | `business-recommendation-sandbox.js`                                  | adjacent recommendation capabilities exist; Business port absent                                                                          | GAP     | Do not infer production recommendation ownership from sandbox alone.                  |
| Partner workspace adapter               | `business-partner-workspace-adapter.js`                               | no Business workspace port                                                                                                                | GAP     | Freeze active call sites before implementation.                                       |
| Live Business runtime                   | `business-live-runtime.js`                                            | authenticated mounted dashboard runtime and M53 onboarding core exist; wider live/analytics/onboarding browser adapters remain incomplete | PARTIAL | Extend from explicit ports; do not restore global browser state.                      |
| Commercial conversion adapter           | `business-commercial-conversion-adapter.js`                           | no Business conversion port                                                                                                               | GAP     | Keep payments/subscriptions outside Business ownership.                               |
| Checkout client                         | `business-checkout-client.js`                                         | `FEATURE-0009` remains planned                                                                                                            | N/A     | Payment execution belongs to Payments; Business only consumes future port.            |
| Dashboard visual surface                | `dashboard/*.html/css/js`                                             | M52 mounted shell reproduces/auth-tests sidebar, header, primary views, theme, logout, profile states and responsive menu                 | PASS    | Keep analytics explicitly unavailable until their endpoints are separately ported.    |
| Business onboarding visual surface      | V1 onboarding/tutorial browser flow                                   | M53 is framework-independent core only; no Business onboarding browser surface                                                            | GAP     | Freeze and port visual/browser lifecycle only after concrete adapters are executable. |

## M53 score

- `PASS`: 5
- `PARTIAL`: 8
- `GAP`: 6
- `N/A`: 1
- total: 20

M53 promotes `Onboarding session/workflow state` to `PASS`. The V2 Business package now owns a dedicated onboarding state model with the V1 session version, seven-day TTL, status lifecycle, resumability rules, conversation draft state and capability sets. This state is intentionally independent from the authenticated Auth session.

`Business onboarding orchestration` and `Onboarding engine` move from `GAP` to `PARTIAL`: the five chapters, 28 steps, step-state mapping and pure transition/status operations are executable, but concrete browser host behavior, completion guards, timeouts, tours and runtime adapters remain outside M53.

Conversation, discovery and location remain `PARTIAL`. M53 defines explicit Business-owned ports for those equivalent dependencies, but the concrete Search/geospatial/Assistant adapters are intentionally deferred to the next milestone.

## Dependency rule

No Business implementation milestone may introduce its own credential/session/cookie/CSRF logic. Those contracts belong to `FEATURE-0008` and must be consumed through an Auth-owned boundary.

M53 preserves that rule. `BusinessOnboardingSession` is workflow/product state only and is not an authentication authority. It contains no credential, signed cookie, CSRF secret, role token or tenant authorization authority.

Payment/checkout execution remains owned by `FEATURE-0009`; onboarding may expose a future commercial handoff but must not absorb Payments ownership.

## Evidence

`BUSINESS-M53-EVIDENCE.md` plus `packages/business/src/onboarding.test.ts` freeze the five-chapter/28-step flow, state mapping, session version/TTL/statuses, pause/resume/completion behavior and capability-set semantics.

Existing `Business Auth Integration Contract` and `Business Dashboard Browser Contract` must remain green to prove M53 does not regress the protected Business boundary or mounted dashboard surface.

## Next implementation milestone

M54 should bind the M53 ports to the already-equivalent Search, geospatial and Assistant capabilities, then prove the onboarding orchestration through a deterministic browser contract. Tours/tutorial presentation should remain a separate visual/lifecycle checkpoint if the adapter milestone does not fully reproduce the V1 surface.
