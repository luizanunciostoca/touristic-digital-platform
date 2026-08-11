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

The M53 onboarding contracts are re-exported from the public `@touristic/business` entrypoint. The app does not import internal Business source files, and M54 exposes concrete typed adapter interfaces that specialize the core `unknown` port responses without weakening the framework-independent Business contract.

No Business-owned credential, cookie, CSRF, session-signing or tenant-authorization logic is introduced.

## Deterministic unit evidence

`business-onboarding-adapters.test.ts` proves:

- a Business discovery query resolves `Toca do Morcego` from the shared V1 Search catalog;
- the location adapter resolves the same POI to finite catalog coordinates;
- browser device location is delegated through the explicit geolocation port and fails safely when unavailable;
- the Assistant port uses the real dialog controller/domain handlers and resolves the existing `help` domain;
- dependency responses remain typed at the app adapter boundary rather than leaking implementation-specific globals into the Business core.

## Security and ownership

M54 keeps the Wave 6 dependency direction intact:

`Auth -> Business core -> Business onboarding adapters -> Search / Geo / Assistant consumers`

The onboarding workflow session remains product/workflow state and is not an authentication authority. Search, geospatial and Assistant stay owned by their already-equivalent feature boundaries.

## Non-goals

- No tutorial/browser presentation parity is claimed here.
- No commercial conversion or checkout execution is moved into Business.
- No new persistence source is introduced.
- No live Mapbox request is required for the M54 deterministic contract.

## Promotion policy

Discovery, location and conversation rows may move to `PASS` only after both the repository Quality Gate and a permanent deterministic M54 browser/integration contract are green on the same final authored head.

Business onboarding orchestration and engine remain `PARTIAL` unless that browser contract also proves the observable host/orchestration behavior. Tours/tutorial and the onboarding visual surface remain separate checkpoints.

## Exit gate

M54 may merge only when:

1. the permanent adapters, tests, evidence, matrix update and permanent M54 contract are the only intended diff;
2. no helper workflow remains;
3. Quality Gate passes installation, formatting, architecture, Feature Registry, lint, typecheck, tests and build;
4. the deterministic M54 contract passes;
5. existing Business Auth and Dashboard regressions remain green when triggered;
6. no unresolved review thread remains.
