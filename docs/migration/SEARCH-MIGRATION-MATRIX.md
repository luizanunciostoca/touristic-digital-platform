# Search & Discovery — Migration Matrix (M43 post-M42 audit)

## Purpose

This matrix freezes the observable V1 Search & Discovery contracts and tracks their V2 equivalence after M37–M42.

Source of truth:

- V1 repository: `luizidebook/morro-de-sao-paulo-digital`
- frozen V1 commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`
- audited V2 merge: `5e66720d7c3c68086e492961162eb612fd7b8858` (M42)

Status semantics:

- `PASS` — the observable contract exists in V2 with executable evidence;
- `PARTIAL` — V2 contains part of the contract, but Search does not yet own/expose the complete behavior;
- `GAP` — no V2 Search equivalent exists;
- `N/A` — the audited V1 surface belongs to another feature or no independent V1 Search surface exists.

## Core Search & Discovery matrix

| Contract                                    | V1 evidence                                                                 | V2 evidence after M42                                                                                              | Status  | Migration decision                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------- |
| Canonical POI source of truth               | `js/map/locations/locations.js`; compatibility re-export                    | M38 `morroV1SearchCatalog`, consumed by Search and Morro Assistant/nearby adapters                                 | PASS    | Shared immutable Search-owned read model is established; do not fork a second POI database.           |
| Canonical-name resolution                   | local catalog names                                                         | M37 `searchCatalog()` exact matching + existing Assistant resolver                                                 | PASS    | Preserve deterministic exact precedence.                                                              |
| Alias resolution                            | `aliases` on V1 POIs                                                        | M37 Search aliases + M38 shared aliases + Assistant resolver regressions                                           | PASS    | Shared aliases are preserved.                                                                         |
| Case/accent normalization                   | V1 discovery/assistant normalization                                        | M37 `normalizeSearchText()` + executable tests                                                                     | PASS    | Search owns a domain-neutral normalization primitive.                                                 |
| Partial-name resolution                     | V1 assistant/discovery matching                                             | M37 prefix/contains matching + tests                                                                               | PASS    | Deterministic partial matching is Search-owned.                                                       |
| Fuzzy fallback                              | V1-compatible Dice behavior                                                 | Assistant still proves Dice threshold `0.55`; Search-owned M37 core has no fuzzy fallback                          | PARTIAL | Port/reuse Dice only after deterministic Search matching fails; keep threshold `0.55` and precedence. |
| Complete category inventory                 | category-keyed V1 `locations`                                               | M38 freezes 131 POIs across 9 exact categories/counts                                                              | PASS    | Inventory is executable and immutable.                                                                |
| Tag semantics                               | `tags` on V1 POIs                                                           | M38 freezes 90 distinct tags on shared catalog                                                                     | PASS    | Use only audited tags; no invented ranking semantics.                                                 |
| `location`/area semantics                   | `location` on V1 POIs                                                       | M38 preserves 5 explicit areas as `area`                                                                           | PASS    | Area remains a filterable audited field.                                                              |
| Category filtering                          | category-keyed discovery                                                    | M37 `SearchFilters.categories` + tests                                                                             | PASS    | Deterministic category filtering is Search-owned.                                                     |
| Tag/activity filtering                      | V1 tags                                                                     | M37 `SearchFilters.tags` + M38 full tag model                                                                      | PASS    | Deterministic all-tag filtering is Search-owned.                                                      |
| Local free-text search                      | names, aliases, local POI data                                              | M37 Search query port over shared catalog; M40 application port                                                    | PASS    | Search no longer depends on Assistant for local discovery.                                            |
| Mapbox forward search                       | `mapbox-search-service.js`                                                  | M39 Mapbox Search provider adapter                                                                                 | PASS    | Provider is behind an explicit typed Search boundary.                                                 |
| Mapbox search options                       | language, limit, types, country, proximity, bbox, `poi_category`            | M39 tests defaults, caps, global mode and optional parameters                                                      | PASS    | Frozen V1 request contract is preserved.                                                              |
| Mapbox result normalization                 | `normalizeFeature()`                                                        | M39 typed result normalization and category mapping tests                                                          | PASS    | Provider normalization stays outside presentation.                                                    |
| Mapbox Search cache                         | 5-minute in-memory cache                                                    | M39 cache key/hit/expiry tests                                                                                     | PASS    | V1 observable cache behavior is preserved.                                                            |
| Mapbox empty/error fallback                 | fail closed to `[]`                                                         | M39 missing-token, HTTP, empty payload and thrown-fetch tests                                                      | PASS    | Search failures do not break consumers.                                                               |
| Search result text formatting               | `formatSearchResult()`                                                      | M41 `formatSearchResultText()`                                                                                     | PASS    | Plain structured text avoids provider HTML trust.                                                     |
| Search result list formatting               | numbered rows/category emoji/name                                           | M41 structured presentation rows; M42 renders through Assistant browser path                                       | PASS    | Browser consumer receives safe structured rows.                                                       |
| Search result category icons                | V1 category → emoji map                                                     | M41 frozen icon map + tests                                                                                        | PASS    | Exact audited icon mapping is preserved.                                                              |
| Multilingual external search                | provider language + PT/EN/ES/HE consumer copy                               | M39 locale option; M41 PT/EN/ES/HE copy; M42 localized selection commands                                          | PASS    | Locale is explicit across provider/presentation/integration boundaries.                               |
| Keyboard/accessibility states for Search UI | no dedicated Search UI baseline; V1 discovery is consumed through Assistant | M42 uses existing production Assistant DOM/option event surface; Assistant accessibility belongs to `FEATURE-0004` | N/A     | Do not invent a standalone Search UI as an equivalence requirement.                                   |

## Adjacent V1 discovery surfaces — dependency boundaries

| Surface                             | V1 evidence                                                     | Classification               | Decision                                                                     |
| ----------------------------------- | --------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| Assistant proactive recommendations | `js/assistant/assistant-dialog/proactive-suggestions.js`        | Assistant consumer           | Keep in `FEATURE-0004`; Search supplies primitives only.                     |
| Navigation contextual suggestions   | `js/navigation/navigationSuggestions/navigation-suggestions.js` | Navigation consumer          | Keep session/GPS/cooldown/message lifecycle in `FEATURE-0003`.               |
| Business onboarding discovery       | `js/onboarding/runtime/business-discovery-adapter.js`           | Business consumer            | Preserve as `FEATURE-0005` integration contract.                             |
| Google Places wrapper               | `js/map/placesAPI.js`                                           | Secondary provider candidate | Do not port without active-call/product evidence.                            |
| Place details integration           | `js/map/integrations/place-details-service.js`                  | Discovery/details boundary   | Existing M42 Details integration is consumed rather than absorbed by Search. |
| Localized place descriptions        | `js/locations/locations_descriptions_i18n.js`                   | Content dependency           | Keep content ownership separate from query/ranking logic.                    |

## Frozen provider contract

M39 preserves the concrete V1 Mapbox Search contract:

- minimum provider query length: 2 characters;
- default locale: `pt`;
- default result limit: 5, hard-capped at 10;
- default proximity: Morro de São Paulo (`lon -38.9159`, `lat -13.3775`);
- optional `types`, `country`, `bbox`, `poi_category` and custom proximity;
- specialized POI and place/address helpers;
- normalized internal category mapping;
- five-minute in-memory cache;
- empty array on missing token, HTTP failure, empty provider response or thrown fetch;
- provider results carry `source: "mapbox"`.

M40 additionally freezes V1 local-first orchestration and regional filtering: local results return before Mapbox; remote fallback is gated by likely-place heuristics and constrained to Morro/Bahia/Brasil/Brazil or the audited 50 km radius rule.

## Post-M42 score

Core matrix rows:

- `PASS`: 20
- `PARTIAL`: 1
- `GAP`: 0
- `N/A`: 1
- total: 22

The single remaining partial contract is Search-owned Dice fuzzy fallback at threshold `0.55`. V2 already has the equivalent algorithm behind Assistant, but `@touristic/search` must own/reuse it before `FEATURE-0002` can be considered behavior/API equivalent.

The former standalone Search UI accessibility `GAP` is reclassified `N/A`: the consumer audit completed by M41/M42 proves the equivalent V1 Search path is presented through Assistant rather than through a dedicated Search-owned modal/input. Creating a separate UI would be new product scope.

## Remaining implementation order after M43

1. Port/reuse the proven V1 Dice fuzzy fallback into the Search-owned local query boundary.
2. Preserve deterministic precedence: exact/alias/partial matches must win before fuzzy.
3. Freeze threshold `0.55`, typo-tolerant positive cases and below-threshold rejection in executable tests.
4. Run repository Quality Gate plus relevant Search/Assistant browser regressions on one final head.
5. Rerun all 22 matrix rows.
6. Only when every applicable row is `PASS`, promote `FEATURE-0002` in `docs/features/registry.json`.

## M43 exit decision

M43 is an audit checkpoint, not an equivalence milestone. It may merge when this matrix and `docs/qa/SEARCH-M43-POST-M42-AUDIT.md` are the only intended changes and the official Quality Gate is green.

`FEATURE-0002` remains unpromoted until the remaining fuzzy Search contract is implemented and validated.
