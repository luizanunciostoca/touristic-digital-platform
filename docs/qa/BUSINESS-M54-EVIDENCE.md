# Business M54 — Onboarding Adapter Evidence

## Scope

M54 binds the framework-independent Business onboarding ports introduced in M53 to already-equivalent Search, geospatial and Assistant capabilities. It does not introduce a standalone onboarding UI, duplicate Search/Geo/Assistant logic or absorb Payments ownership.

## Base

- V2 base: `luizidebook/touristic-digital-platform@1e16da9ba70868c76923c06876dd3d4c16c03f58`
- frozen V1 baseline: `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`
- Business matrix before M54: `5 PASS / 8 PARTIAL / 6 GAP / 1 N/A`

## Concrete adapters

`apps/morro-digital-platform/src/business-onboarding-adapters.ts` now binds:

- `BusinessDiscoveryPort` to the shared immutable `morroV1SearchCatalog` through `@touristic/search`;
- `BusinessLocationPort.findExistingLocation()` to Search-backed catalog coordinates represented by `@touristic/geospatial` `Coordinates`;
- `BusinessLocationPort.requestDeviceLocation()` to a browser geolocation capability boundary with the same high-accuracy/timeout policy already used by the Assistant;
- `BusinessAssistantPort` to the real `AssistantDialogController` and existing Morro domain handlers.

The M53 onboarding contracts remain exposed through the dedicated `@touristic/business/onboarding` subpath. The app does not import internal Business source files, and M54 exposes concrete typed adapter interfaces that specialize the core `unknown` port responses without weakening the framework-independent Business contract.

No Business-owned credential, cookie, CSRF, session-signing or tenant-authorization logic is introduced.

## Runtime-boundary regression found and fixed

An early M54 head re-exported onboarding from the main `@touristic/business` entrypoint. Package build/typecheck remained green, but the Node dev-server imports that main TypeScript entrypoint directly. The re-export used the build-oriented relative specifier `./onboarding.js`, which changed the server runtime module graph and prevented the Business runtime from becoming ready.

The regression was proven with an A/B control: the unchanged Business Auth contract remained green on `main@1e16da9`, while the M54 branch failed at runtime startup. M54 now keeps the existing main Business entrypoint unchanged and imports onboarding contracts through the already-declared `@touristic/business/onboarding` package subpath. After this correction the deterministic M54 browser contract starts the dev-server and completes successfully.

## Deterministic unit evidence

`business-onboarding-adapters.test.ts` proves:

- a Business discovery query resolves `Toca do Morcego` from the shared V1 Search catalog;
- the location adapter resolves the same POI to finite catalog coordinates;
- browser device location is delegated through the explicit geolocation port and fails safely when unavailable;
- the Assistant port uses the real dialog controller/domain handlers and resolves the existing `help` domain;
- dependency responses remain typed at the app adapter boundary rather than leaking implementation-specific globals into the Business core.

## Browser evidence

The permanent `Business Onboarding Adapter Browser Contract` builds the real workspace, starts the deterministic same-origin app server and validates in Chromium:

- Search-backed Business discovery;
- catalog-backed coordinates;
- browser geolocation through the explicit capability port;
- real Assistant dialog/domain-handler integration;
- preservation of onboarding locale and Assistant options.

The contract requires no live Mapbox request. The final authored checkpoint must repeat this browser contract together with the repository Quality Gate after the matrix and evidence are finalized.

## Matrix effect

After executable M54 evidence, the Business matrix becomes:

- `PASS`: 8
- `PARTIAL`: 5
- `GAP`: 6
- `N/A`: 1

M54 promotes `Onboarding conversation`, `Business discovery adapter` and `Business location resolver` to `PASS`.

`Business onboarding orchestration` and `Onboarding engine` remain `PARTIAL`; the full browser host, guards/timeouts, tutorial lifecycle and step presentation are not yet reproduced. `Onboarding tours/tutorial` and `Business onboarding visual surface` remain `GAP`.

## Security and ownership

M54 keeps the Wave 6 dependency direction intact:

`Auth -> Business core -> Business onboarding adapters -> Search / Geo / Assistant consumers`

The onboarding workflow session remains product/workflow state and is not an authentication authority. Search, geospatial and Assistant stay owned by their already-equivalent feature boundaries.

## Non-goals

- No tutorial/browser presentation parity is claimed here.
- No commercial conversion or checkout execution is moved into Business.
- No new persistence source is introduced.
- No live Mapbox request is required for the M54 deterministic contract.

## Exit gate

M54 may merge only when:

1. the permanent adapters, tests, evidence, matrix update and permanent M54 contract are the only intended diff;
2. no helper workflow remains;
3. Quality Gate passes installation, formatting, architecture, Feature Registry, lint, typecheck, tests and build;
4. the deterministic M54 contract passes;
5. existing Business Auth behavior remains unchanged by the M54 diff;
6. no unresolved review thread remains.
