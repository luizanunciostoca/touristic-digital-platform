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

## Localized result selection

The frozen V1 Assistant intentionally preserves a substring-based language heuristic. M42 does not change that behavior. Reusing a single Portuguese sentence such as `mais informações sobre <place>` as an internal option value would therefore allow legacy substring matching to reclassify the next turn incorrectly.

Search result options instead remain natural user-visible commands in the active language:

- PT: `Fale sobre <place>`;
- EN: `Tell me more about <place>`;
- ES: `Detalles sobre <place>`;
- HE: `פרטים על <place>`.

The existing `more_info` intent keeps its V1 patterns and receives only the missing additive ES/HE synonyms needed by these localized commands. A dedicated unit regression freezes all four language paths without changing the legacy language detector.

## Browser contract

`.github/workflows/search-browser-contract.yml` runs Chromium against the built V2 shell without making Search evidence depend on live Mapbox SDK readiness. Real Mapbox behavior remains owned by the dedicated Mapbox regressions.

The contract proves this chain:

1. load the production HTML/import-map contract while preventing only the map entrypoint from starting;
2. mount the production app shell and remove the loading overlay only inside the isolated Search fixture;
3. install the same production `AssistantShellUi` and `BrowserAssistantRuntime` with an instrumented Navigation port;
4. open the existing Assistant shell;
5. submit `Toca do Morcego`;
6. receive Search-owned result presentation containing the canonical POI;
7. select the result through the existing Assistant option event path using the localized PT value `Fale sobre Toca do Morcego`;
8. reach the existing Portuguese Details handler for the same place and render `Como chegar`;
9. choose `Como chegar` through the existing Details options;
10. verify the existing Navigation adapter calls its `start()` port exactly once with finite destination coordinates;
11. emit no browser page errors.

Place identity is compared case-insensitively at the Details boundary because the legacy resolver normalizes the place entity before composing fallback copy. The semantic place identity and navigation coordinates remain mandatory.

This separates deterministic Search integration evidence from map-provider availability while still exercising the production Assistant/Search/Details/Navigation adapters in a real browser DOM. The Navigation runtime itself and the real Mapbox map remain covered by their dedicated regressions.

## Architectural constraint

M42 does not create standalone Search DOM, modal, CSS, map renderer, details client or navigation session. Search owns query/result orchestration only; existing domain consumers keep their established ownership.

## Exit gate

M42 may close only when the Search Browser Contract and the complete repository Quality Gate pass on the same final authored head and no temporary helper workflow remains in the PR diff.
