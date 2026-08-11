# Business Dashboard — Frozen V1 Baseline (M51)

## Frozen source

- repository: `luizidebook/morro-de-sao-paulo-digital`
- commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`
- primary surface: `dashboard/index-v3-improved.html`
- visual stylesheet: `dashboard/dashboard-v2.css`
- dashboard runtime: `dashboard/dashboard-v2.js`
- authenticated browser boundary: `dashboard/auth-client.js`

M51 freezes this surface before the V2 dashboard UI is ported. Documentation is not visual-equivalence evidence.

## Entry and authenticated state

The V1 dashboard browser boundary loads `/api/dashboard/auth/session`, uses same-origin credentials, stores only the browser-safe CSRF projection in `sessionStorage`, redirects `401` to the dashboard login surface and retries an unsafe mutation once after `INVALID_CSRF`.

The dashboard must not own session cookies, credentials, signing secrets or CSRF generation. In V2 those responsibilities remain under `@touristic/auth-browser` / Auth server boundaries.

## Observable shell

The canonical `index-v3-improved.html` contains two major states:

1. `#search-screen` — initial Business registration/access card;
2. `#main-dashboard` — the authenticated dashboard shell.

The dashboard shell contains:

- responsive sidebar plus mobile overlay;
- Morro Pro identity/header;
- sidebar collapse and mobile menu controls;
- navigation groups for Dashboard, Performance, Audiência, Ofertas, Promoções and Configurações;
- theme toggle;
- logout action;
- main content header with current Business name;
- live visitor indicator;
- multiple content views selected from the sidebar.

## Dashboard view baseline

The main Dashboard view includes:

- a prominent daily insight banner;
- an action to create an offer;
- metric cards including total reach, active routes, Assistant/AI recommendations and conversion/click metrics;
- live visitor and route counts;
- charts and analytical cards;
- weather/strategy and predictive information where available;
- notification and predictive-alert presentation.

`dashboard-v2.js` also freezes the following behavior relevant to future parity:

- dashboard requires a Business ID;
- DashboardBridge is preferred when available;
- mock/demo data remains an explicit fallback;
- performance and forecast charts are rendered with Chart.js in V1;
- auto-refresh must not duplicate DashboardBridge polling;
- theme and responsive behavior are observable shell state;
- metric values can animate rather than jump directly.

## Data/API baseline

The V1 dashboard inventory includes authenticated endpoints for metrics, performance, forecast, weather, routes, funnel, sentiment and audience. M51 does not claim those analytical endpoints are ported by the M50 profile resource.

The M51 V2 consumer is intentionally limited to the protected Business profile resource delivered in M50. Analytics/offers and the complete dashboard visual surface remain later contracts.

## M51 parity boundary

M51 may advance the `Authenticated dashboard consumer` contract only when V2 has executable browser-facing code that:

- obtains the session through `@touristic/auth-browser`;
- selects a Business scope from the authenticated projection without treating UI selection as authorization;
- loads the protected Business profile through Auth `secureFetch`;
- saves mutations through the same Auth boundary so same-origin, CSRF retry, role and tenant policies remain centralized;
- fails closed when no usable authenticated Business scope exists.

M51 must not promote `Dashboard visual surface` to `PASS`. That line requires a dedicated browser/visual implementation and V1 × V2 regression evidence.
