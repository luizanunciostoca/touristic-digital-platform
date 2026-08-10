# Search & Discovery — Migration Matrix (M44 final audit)

## Purpose

This matrix freezes the observable V1 Search & Discovery contracts and tracks their V2 equivalence after M37–M44.

Source of truth:

- V1 repository: `luizidebook/morro-de-sao-paulo-digital`
- frozen V1 commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`
- audited V2 base: `02623622c043af12d662898cce878a522f93f8e8` (M43)
- M44 evidence: `docs/qa/SEARCH-M44-EVIDENCE.md`

Status semantics:

- `PASS` — the observable contract exists in V2 with executable evidence;
- `PARTIAL` — V2 contains part of the contract, but Search does not yet own/expose the complete behavior;
- `GAP` — no V2 Search equivalent exists;
- `N/A` — the audited V1 surface belongs to another feature or no independent V1 Search surface exists.

## Core Search & Discovery matrix

| Contract                                    | V1 evidence                                                                 | V2 evidence after M42                                                                                              | Status | Migration decision                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------- |
| Canonical POI source of truth               | `js/map/locations/locations.js`; compatibility re-export                    | M38 `morroV1SearchCatalog`, consumed by Search and Morro Assistant/nearby adapters                                 | PASS   | Shared immutable Search-owned read model is established; do not fork a second POI database. |
| Canonical-name resolution                   | local catalog names                                                         | M37 `searchCatalog()` exact matching + existing Assistant resolver                                                 | PASS   | Preserve deterministic exact precedence.                                                    |
| Alias resolution                            | `aliases` on V1 POIs                                                        | M37 Search aliases + M38 shared aliases + Assistant resolver regressions                                           | PASS   | Shared aliases are preserved.                                                               |
| Case/accent normalization                   | V1 discovery/assistant normalization                                        | M37 `normalizeSearchText()` + executable tests                                                                     | PASS   | Search owns a domain-neutral normalization primitive.                                       |
| Partial-name resolution                     | V1 assistant/discovery matching                                             | M37 prefix/contains matching + tests                                                                               | PASS   | Deterministic partial matching is Search-owned.                                             |
| Fuzzy fallback                              | V1-compatible Dice behavior                                                 | M44 Search-owned normalized Dice fallback, threshold `0.55`, canonical + alias matching, deterministic precedence  | PASS   | Keep fuzzy as fallback only after deterministic Search matching returns no result.          |
| Complete category inventory                 | category-keyed V1 `locations`                                               | M38 freezes 131 POIs across 9 exact categories/counts                                                              | PASS   | Inventory is executable and immutable.                                                      |
| Tag semantics                               | `tags` on V1 POIs                                                           | M38 freezes 90 distinct tags on shared catalog                                                                     | PASS   | Use only audited tags; no invented ranking semantics.                                       |
| `location`/area semantics                   | `location` on V1 POIs                                                       | M38 preserves 5 explicit areas as `area`                                                                           | PASS   | Area remains a filterable audited field.                                                    |
| Category filtering                          | category-keyed discovery                                                    | M37 `SearchFilters.categories` + tests                                                                             | PASS   | Deterministic category filtering is Search-owned.                                           |
| Tag/activity filtering                      | V1 tags                                                                     | M37 `SearchFilters.tags` + M38 full tag model                                                                      | PASS   | Deterministic all-tag filtering is Search-owned.                                            |
| Local free-text search                      | names, aliases, local POI data                                              | M37 Search query port over shared catalog; M40 application port                                                    | PASS   | Search no longer depends on Assistant for local discovery.                                  |
| Mapbox forward search                       | `mapbox-search-service.js`                                                  | M39 Mapbox Search provider adapter                                                                                 | PASS   | Provider is behind an explicit typed Search boundary.                                       |
| Mapbox search options                       | language, limit, types, country, proximity, bbox, `poi_category`            | M39 tests defaults, caps, global mode and optional parameters                                                      | PASS   | Frozen V1 request contract is preserved.                                                    |
| Mapbox result normalization                 | `normalizeFeature()`                                                        | M39 typed result normalization and category mapping tests                                                          | PASS   | Provider normalization stays outside presentation.                                          |
| Mapbox Search cache                         | 5-minute in-memory cache                                                    | M39 cache key/hit/expiry tests                                                                                     | PASS   | V1 observable cache behavior is preserved.                                                  |
| Mapbox empty/error fallback                 | fail closed to `[]`                                                         | M39 missing-token, HTTP, empty payload and thrown-fetch tests                                                      | PASS   | Search failures do not break consumers.                                                     |
| Search result text formatting               | `formatSearchResult()`                                                      | M41 `formatSearchResultText()`                                                                                     | PASS   | Plain structured text avoids provider HTML trust.                                           |
| Search result list formatting               | numbered rows/category emoji/name                                           | M41 structured presentation rows; M42 renders through Assistant browser path                                       | PASS   | Browser consumer receives safe structured rows.                                             |
| Search result category icons                | V1 category → emoji map                                                     | M41 frozen icon map + tests                                                                                        | PASS   | Exact audited icon mapping is preserved.                                                    |
| Multilingual external search                | provider language + PT/EN/ES/HE consumer copy                               | M39 locale option; M41 PT/EN/ES/HE copy; M42 localized selection commands                                          | PASS   | Locale is explicit across provider/presentation/integration boundaries.                     |
| Keyboard/accessibility states for Search UI | no dedicated Search UI baseline; V1 discovery is consumed through Assistant | M42 uses existing production Assistant DOM/option event surface; Assistant accessibility belongs to `FEATURE-0004` | N/A    | Do not invent a standalone Search UI as an equivalence requirement.                         |

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

## Post-M44 score

Core matrix rows:

- `PASS`: 21
- `PARTIAL`: 0
- `GAP`: 0
- `N/A`: 1
- total: 22

Every applicable Search equivalence contract is now `PASS`. The only `N/A` row is the standalone Search UI accessibility surface, because the audited V1 product path is consumed through Assistant rather than through an independent Search-owned modal/input.

M44 closes the final functional gap by moving the already-proven V1 Dice fuzzy fallback into `@touristic/search` while preserving deterministic precedence and threshold `0.55`.

## Promotion order after M44

1. Run the complete repository Quality Gate on the final authored M44 head.
2. Run Search Browser Contract on that same head.
3. Confirm no temporary workflow remains in the diff.
4. Promote `FEATURE-0002` only after those gates are green.
5. Treat the visual equivalence contract as the audited Search presentation inside the existing Assistant consumer surface; do not invent a standalone Search UI.

## M44 exit decision

M44 is the final Search equivalence implementation milestone. It may close only when code, evidence, final matrix and Feature Registry promotion are validated together on one authored head with Quality Gate and Search Browser Contract green.
