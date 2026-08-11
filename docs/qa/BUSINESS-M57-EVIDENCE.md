# Business M57 — Onboarding Route Parity Evidence

## Scope

M57 closes the remaining route-specific onboarding orchestration gap left intentionally fail-closed by M56. The implementation introduces an explicit Business onboarding route port while preserving routing ownership in Navigation/geospatial.

## Frozen V1 source

Repository: `luizidebook/morro-de-sao-paulo-digital`

Frozen commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`

Primary evidence:

- `js/onboarding/runtime/business-tutorial-route-adapter.js`
- `js/onboarding/__tests__/business-tutorial-route-adapter.test.js`
- `js/onboarding/business-onboarding.js`

The V1 route adapter validates origin/destination coordinates, requests a walking route, rejects invalid route responses, exposes distance/duration, renders the tutorial route through the active map implementation, emits a tutorial route event and keeps failures fail-closed.

## M57 implementation

M57 adds `BusinessRoutePort` to the isolated onboarding contract. Business owns only the onboarding decision and normalized tutorial result; it does not own routing algorithms, credentials, map providers or navigation lifecycle.

The concrete app adapter delegates route calculation to the shared `@touristic/navigation` `requestRoute()` contract. That contract already provides:

- same-origin `/api/routing/directions` as the primary provider;
- normalized coordinate validation;
- `foot-walking` routing profile;
- PT/EN/ES/HE language normalization;
- bounded timeout and cancellation;
- validated `LineString` route responses;
- optional routing fallback supplied from `@touristic/geospatial` when configured.

The adapter normalizes a successful route into a tutorial-only result containing distance, duration and route geometry. Every tutorial route result is marked `excludeFromBusinessMetrics: true`.

## Guard behavior

The `route → conversion` transition remains fail-closed by default.

On route step entry, the runtime resets `businessTutorialRouteReady` to `false`. It requires a confirmed Business destination, derives a bounded tutorial origin near that destination, calls the route port and only sets the route guard to `true` after a verified route result.

A successful result is persisted in onboarding runtime context and emits `businessTutorialRouteRendered`. The runtime then hands route intent back to Navigation through `morro:navigation-requested` with `source: business-onboarding`.

A failed or unavailable route leaves the guard closed, persists the normalized failure result and emits `businessOnboardingRouteFailed`. No fabricated route success is allowed.

## Ownership boundary

M57 deliberately does not duplicate the V1 map drawing implementation inside Business.

V2 Navigation/geospatial already owns route calculation, navigation lifecycle and map presentation. Business verifies the tutorial route result and hands the destination to that existing Navigation boundary. Existing Navigation browser/accessibility contracts remain the evidence for the navigation-owned visual/runtime behavior.

This preserves the architectural rule established in prior milestones: Business coordinates onboarding behavior through explicit ports instead of rebuilding Search, geospatial, Assistant, Auth or Navigation internals.

## Executable evidence

`business-onboarding-adapters.test.ts` proves both route outcomes:

- success through the real shared Navigation routing contract with the expected same-origin POST payload;
- fail-closed behavior when routing rejects the request.

The permanent `Business Onboarding Route Browser Contract` proves in Chromium:

- the same-origin route request uses `POST`;
- profile is `foot-walking` and language is `pt`;
- the deterministic `LineString` response is accepted;
- 310 m distance and 240 s duration are persisted;
- tutorial routing is excluded from Business metrics;
- `businessTutorialRouteRendered` is emitted;
- `morro:navigation-requested` is emitted with Business onboarding as source;
- the route guard becomes ready only after verification;
- the host advances from `route` to `conversion` only after that verified result.

The first executable browser run passed before final repository-gate normalization. The final merge decision still requires the same contract and all existing permanent gates to be green on one permanent final head.

## Security and resilience

The route port introduces no credential, cookie, CSRF, role or tenant authorization authority into Business onboarding state.

Routing stays behind the existing same-origin Navigation boundary. Coordinates are validated, timeout/cancellation are bounded, invalid responses remain failures and Business metrics explicitly exclude tutorial route activity.

## Migration decision

M57 is sufficient to promote `Business onboarding orchestration` from `PARTIAL` to `PASS` once the final permanent head is green. The full 28-step Business-owned orchestration now has executable host/presentation/input behavior plus explicit Search, location, Assistant and route effects.

`Live Business runtime` remains `PARTIAL` because wider analytics, partner-workspace and unrelated sandbox/runtime breadth is still incomplete. Commercial conversion and checkout remain outside Business ownership.

## Non-goals

M57 does not implement Business-owned routing providers, duplicate Navigation map rendering, absorb Payments, invent analytics endpoints, or claim unrelated recommendation/profile/workspace sandbox parity.
