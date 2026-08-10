# Search M42 — Browser Integration Evidence

## Scope

M42 implements step 7 of `docs/migration/SEARCH-MIGRATION-MATRIX.md`: browser evidence for the Search path integrated with the existing Assistant, Details and Navigation boundaries.

## Integration boundary

The Assistant intent engine already classifies likely place names as `place_search`. M42 registers that intent in the browser domain adapter rather than creating a second Search UI or intercepting unrelated Assistant intents.

The handler composes:

- `morroV1SearchCatalog`;
- `createSearchApplication()` local-first behavior;
- Mapbox Search fallback when a runtime token is available;
- M41 structured presentation/copy;
- existing Assistant option rendering;
- existing `more_info` handler;
- existing Navigation adapter.

## Browser contract

`.github/workflows/search-browser-contract.yml` runs Chromium against the built V2 runtime using the deterministic map fallback. This intentionally removes live Mapbox SDK availability from the Search integration proof; real Mapbox behavior remains owned by the dedicated Mapbox regressions.

The contract proves this chain:

1. load the built V2 shell and wait for its map runtime to reach `ready`;
2. install the same production `BrowserAssistantRuntime` with an instrumented Navigation port;
3. open the existing Assistant shell;
4. submit `Toca do Morcego`;
5. receive Search-owned result presentation containing the canonical POI;
6. select the result through the existing Assistant option event path;
7. reach the existing Details handler for the same place;
8. choose `Como chegar` through the existing Details options;
9. verify the existing Navigation adapter calls its `start()` port exactly once with finite destination coordinates;
10. emit no browser page errors.

This separates deterministic Search integration evidence from live provider availability while still exercising the production Assistant/Search/Details/Navigation adapters in a real browser DOM.

## Architectural constraint

M42 does not create standalone Search DOM, modal, CSS, map renderer, details client or navigation session. Search owns query/result orchestration only; existing domain consumers keep their established ownership.

## Exit gate

M42 may close only when the Search Browser Contract and the complete repository Quality Gate pass on the same final authored head and no temporary helper workflow remains in the PR diff.
