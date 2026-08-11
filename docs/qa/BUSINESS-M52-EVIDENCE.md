# Business M52 — Mounted Dashboard Evidence

## Scope

M52 mounts the authenticated Business dashboard consumer delivered in M51 into a browser surface while preserving the frozen V1 dashboard shell contract without inventing analytics data that V2 does not yet own.

## Implementation

Permanent M52 surface:

- `apps/morro-digital-platform/public/business-dashboard.html`;
- `apps/morro-digital-platform/public/business-dashboard.css`;
- `apps/morro-digital-platform/src/business-dashboard-entry.ts`;
- `apps/morro-digital-platform/src/business-dashboard-surface.ts`;
- `apps/morro-digital-platform/src/business-dashboard-surface.test.ts`.

The surface consumes the existing `createBusinessDashboardClient()` and `DashboardAuthClient`. It does not read session cookies, sign session material, derive CSRF tokens or decide tenant authorization.

## Observable contract implemented

The mounted surface reproduces the frozen M51 baseline at the shell/lifecycle boundary:

- authenticated entry state and fail-closed entry screen;
- responsive sidebar and mobile overlay;
- Morro Pro identity and Business header;
- primary views: Dashboard, Performance, Audiência, Ofertas, Promoções and Configurações;
- persisted light/dark theme;
- logout through the Auth browser boundary;
- protected Business profile rendering;
- protected profile editing/save through M51/M50;
- responsive mobile menu lifecycle.

Analytics cards whose V1 endpoints have not yet been migrated intentionally render as unavailable (`—` / `Endpoint ainda não migrado`). M52 does not generate fake reach, route, recommendation, conversion, audience, forecast or predictive values.

## Executable browser evidence

Permanent workflow: `.github/workflows/business-dashboard-browser-contract.yml`.

The Chromium contract uses the real Auth and Business runtime:

1. creates an owner identity scoped to `toca-do-morcego`;
2. logs in through `/api/dashboard/auth/login` and receives the browser-safe CSRF projection;
3. seeds the Business profile through the protected PUT resource;
4. opens the mounted M52 dashboard with the authenticated cookie jar;
5. proves `#search-screen` transitions to the authenticated `#main-dashboard`;
6. verifies the protected Business name is rendered;
7. verifies analytics placeholders remain explicitly unavailable rather than invented;
8. navigates between Dashboard/Performance/Configurações views;
9. edits and saves the profile through the protected client and verifies the persisted HTTP resource;
10. toggles and persists dark theme;
11. exercises the mobile sidebar/overlay lifecycle;
12. logs out through the Auth client and verifies the session is revoked.

The contract also fails on uncaught browser errors.

## Promotion decision

After the browser contract is green:

- `Authenticated dashboard consumer` → `PASS`;
- `Dashboard visual surface` → `PASS`;
- `Live Business runtime` → `PARTIAL` because a real mounted runtime now exists, while the wider V1 live adapters/analytics remain incomplete.

No other Business row is promoted by M52. In particular, onboarding, discovery/location adapters owned by onboarding, recommendation sandbox, partner workspace, commercial conversion and analytics remain incomplete.

`FEATURE-0005` remains `baseline-pending`.

## Final-head discipline

The final authored M52 head intentionally re-runs the permanent dashboard browser contract together with the Quality Gate and triggered accessibility regression after the matrix is formatted and the promotion decision is recorded.

## Exit gate

M52 may merge only when the final authored head passes:

- Quality Gate;
- Business Dashboard Browser Contract;
- triggered accessibility/regression checks;
- final diff audit with no temporary helper workflow or unresolved review thread.
