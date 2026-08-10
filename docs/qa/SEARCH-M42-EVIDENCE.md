# Search M42 — Browser Integration Evidence

## Scope

M42 implements step 7 of `docs/migration/SEARCH-MIGRATION-MATRIX.md`: browser evidence for the Search path integrated with the existing Assistant, Details and Navigation runtime.

## Integration boundary

The Assistant intent engine already classifies likely place names as `place_search`. M42 registers a browser handler for that existing intent rather than creating a second Search UI or intercepting unrelated Assistant intents.

The handler composes:

- `morroV1SearchCatalog`;
- `createSearchApplication()` local-first behavior;
- Mapbox Search fallback when a runtime token is available;
- M41 structured presentation/copy;
- existing Assistant option rendering;
- existing `more_info` handler;
- existing Navigation runtime.

## Browser contract

`.github/workflows/search-browser-contract.yml` runs Chromium against the authenticated V2 runtime and proves this observable chain:

1. open the existing Assistant shell;
2. submit `Toca do Morcego`;
3. receive Search-owned result presentation containing the canonical POI;
4. select the result through the existing Assistant option event path;
5. reach the existing Details handler for the same place;
6. choose `Como chegar` through the existing Details options;
7. reach the existing Navigation runtime and observe `body.navigation-active` plus the end-navigation control;
8. keep the real Mapbox map provider active and emit no browser page errors.

## Architectural constraint

M42 does not create standalone Search DOM, modal, CSS, map renderer, details client or navigation session. Search owns query/result orchestration only; existing domain consumers keep their established ownership.

## Exit gate

M42 may close only when the Search Browser Contract and the complete repository Quality Gate pass on the same final authored head and no temporary helper workflow remains in the PR diff.
