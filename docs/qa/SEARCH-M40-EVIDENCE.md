# Search M40 — Application Port Evidence

## Scope

M40 implements step 5 of the frozen Search migration order: a Search-owned application port that orchestrates the already-migrated local catalog/core and Mapbox provider without adding Search UI or inventing hybrid ranking.

## Frozen V1 source

- repository: `luizidebook/morro-de-sao-paulo-digital`
- commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`
- primary consumer: `js/assistant/assistant-dialog/assistant-dialog.js`
- provider: `js/map/integrations/mapbox-search-service.js`

## Audited orchestration contract

The V1 consumer proves that Mapbox is a fallback, not a peer result source:

1. local place resolution runs first;
2. a successful local match returns immediately;
3. only after local resolution fails does the flow consider Mapbox;
4. Mapbox is skipped for inputs below three normalized characters and for generic question prefixes such as `como`, `onde`, `qual`, `quem`, `me`, `tem`, `ha`, `existe` and related V1 terms;
5. external search uses the active locale with Portuguese fallback and a five-result default;
6. returned Mapbox results are filtered to entries with no formatted region copy, formatted copy mentioning Bahia/Brasil/Brazil/Morro, or coordinates within 50 km of the V1 Morro filter center;
7. no local + external merge or cross-source score exists in the audited V1 path;
8. provider failures degrade to no result.

M40 therefore intentionally implements local-first fallback rather than concatenating local and external arrays.

## V2 boundary

The application port composes:

- `searchCatalog()` for deterministic local discovery and filters;
- the M39 `SearchExternalProvider`/Mapbox adapter boundary for external discovery;
- a typed application result that identifies `local`, `mapbox` or `none` without presentation markup.

No Map, Assistant, Navigation, browser DOM or localization presentation code is imported into `@touristic/search`.

## Regional filter

The V1 regional acceptance rule is frozen in executable tests:

- formatted place copy containing `Bahia`, `Brasil`, `Brazil` or `Morro` is accepted;
- empty `placeFormatted` is accepted, matching the V1 guard;
- otherwise coordinates inside 50 km of `-13.376,-38.917` are accepted;
- remote results outside those rules are rejected.

The radius check uses the same Haversine earth radius (`6,371,000 m`) as the audited V1 helper.

## Non-goals

- no Search UI or result formatting;
- no loading/empty copy;
- no local/Mapbox merged ranking;
- no new fuzzy algorithm;
- no Google Places port;
- no browser integration;
- no change to Feature Registry status.

## Exit gate

M40 may close only after the final authored head passes installation, formatting, architecture, Feature Registry, lint, typecheck, tests and build, and the final PR diff contains no temporary workflow or unrelated file.
