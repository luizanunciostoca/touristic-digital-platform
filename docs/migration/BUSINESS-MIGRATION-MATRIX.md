# Business Portal — Migration Matrix (M46 baseline)

## Status semantics

- `PASS` — V2 already exposes the audited Business-owned contract with executable evidence.
- `PARTIAL` — some reusable dependency exists, but the Business-owned contract is incomplete.
- `GAP` — no V2 Business-owned equivalent exists yet.
- `N/A` — contract belongs to another feature.

At M46, `FEATURE-0005` remains `baseline-pending`.

| Contract | Frozen V1 evidence | V2 evidence at M46 | Status | Migration decision |
| --- | --- | --- | --- | --- |
| Business domain/browser behavior | `js/business/*` | no `@touristic/business` package | GAP | Extract Business domain without Auth internals. |
| Business profile behavior | `js/business/profile/*` | no Business package | GAP | Create explicit profile model/ports. |
| Authenticated dashboard consumer | `dashboard/*` | no `apps/business-dashboard` | GAP | Implement only after Auth/session boundary. |
| Protected dashboard API consumption | `dashboard/auth-client.js` protects `/api/dashboard` and `/api/offers` | Auth not yet implemented | GAP | Business consumes authenticated fetch/session ports. |
| Business tenant selection/authorization | dashboard requests carry business IDs; server Auth enforces scope | no Business consumer + no Auth scope port | GAP | UI selection never substitutes server authorization. |
| Business onboarding orchestration | `js/onboarding/business-onboarding.js` | no `apps/business-onboarding` | GAP | Port orchestration after Business core. |
| Onboarding engine | `js/onboarding/engine/*` | no Business onboarding app | GAP | Keep workflow engine separate from persistence/security. |
| Onboarding conversation | `js/onboarding/conversation/*` | equivalent Assistant exists, Business consumer absent | PARTIAL | Consume Assistant boundary; Business owns onboarding state. |
| Onboarding session/workflow state | `js/onboarding/session/*` | no Business onboarding state port | GAP | Do not confuse onboarding state with Auth session. |
| Onboarding tours/tutorial | `js/onboarding/tours/*` | no Business onboarding app | GAP | Port product tutorial behavior after core dependencies. |
| Business discovery adapter | `js/onboarding/runtime/business-discovery-adapter.js` | Search is equivalent; Business adapter absent | PARTIAL | Consume `FEATURE-0002`; do not duplicate Search/Assistant internals. |
| Business location resolver | `js/onboarding/runtime/business-location-resolver.js` | geospatial/search equivalent; Business adapter absent | PARTIAL | Reuse existing geo/search ports. |
| Profile sandbox/runtime | `business-profile-sandbox.js` | no Business implementation | GAP | Classify demo/sandbox behavior before production persistence. |
| Recommendation sandbox | `business-recommendation-sandbox.js` | adjacent recommendation capabilities exist; Business port absent | GAP | Do not infer production recommendation ownership from sandbox alone. |
| Partner workspace adapter | `business-partner-workspace-adapter.js` | no Business workspace port | GAP | Freeze active call sites before implementation. |
| Live Business runtime | `business-live-runtime.js` | no Business runtime | GAP | Build from explicit ports, not global browser state. |
| Commercial conversion adapter | `business-commercial-conversion-adapter.js` | no Business conversion port | GAP | Keep payments/subscriptions outside Business ownership. |
| Checkout client | `business-checkout-client.js` | `FEATURE-0009` remains planned | N/A | Payment execution belongs to Payments; Business only consumes future port. |
| Dashboard visual surface | `dashboard/*.html/css/js` | no Business dashboard app | GAP | Freeze visual baseline before implementation. |
| Business onboarding visual surface | V1 onboarding/tutorial browser flow | no Business onboarding app | GAP | Freeze visual/browser contract before equivalence claim. |

## M46 score

- `PASS`: 0
- `PARTIAL`: 3
- `GAP`: 16
- `N/A`: 1
- total: 20

The three partial rows reflect reusable equivalent dependencies, not Business equivalence. Search, Assistant and geospatial are already available, but Business-owned adapters/orchestration are not.

## Dependency rule

No Business implementation milestone may introduce its own credential/session/cookie/CSRF logic. Those contracts belong to `FEATURE-0008` and must be consumed through an Auth-owned boundary.

## Implementation order

After Auth core/integration is executable, Business migration should proceed from domain models and API ports to dashboard consumers, then onboarding orchestration/adapters. Payment checkout remains blocked on `FEATURE-0009` ownership rather than being absorbed into `FEATURE-0005`.
