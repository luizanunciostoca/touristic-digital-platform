# Search & Discovery — Migration Matrix (M36)

## Purpose

This matrix freezes the observable V1 Search & Discovery contracts before any `@touristic/search` or `@touristic/marketplace` implementation is introduced.

Source of truth:

- repository: `luizidebook/morro-de-sao-paulo-digital`
- frozen commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`

Status semantics:

- `PASS` — the observable contract already exists in V2 with executable evidence and can be reused rather than migrated again;
- `PARTIAL` — V2 contains part of the contract, but Search does not yet own or expose the complete behavior;
- `GAP` — no V2 Search/Marketplace equivalent exists yet;
- `N/A` — audited V1 surface belongs to another feature and is recorded only as a dependency boundary.

## Core Search & Discovery matrix

| Contract | V1 evidence | V2 evidence | Status | Migration decision |
| --- | --- | --- | --- | --- |
| Canonical POI source of truth | `js/map/locations/locations.js`; compatibility re-export in `js/locations/locations.js` | `assistant-v1-destination-catalog.ts` contains a frozen projection used by Assistant | PARTIAL | Search must consume one shared canonical catalog; it must not create a divergent second POI database. |
| Canonical-name resolution | local catalog names | `assistant-destination-resolver.ts` + tests | PASS | Extract/reuse the proven normalized matcher rather than reimplementing canonical-name lookup. |
| Alias resolution | `aliases` on V1 POIs | `assistant-destination-resolver.ts`, `assistant-v1-place-resolver.ts` | PASS | Preserve aliases in the shared discovery model. |
| Case/accent normalization | normalization used by V1 discovery/assistant/onboarding flows | `normalizeAssistantText` already drives V1-equivalent Assistant matching | PASS | Reuse a domain-neutral normalization primitive or move it to a shared boundary without changing behavior. |
| Partial-name resolution | V1 assistant/discovery matching | `assistant-v1-place-resolver.ts` | PASS | Preserve precedence after exact and alias matches. |
| Fuzzy fallback | V1-compatible Dice behavior | `assistant-v1-place-resolver.ts`, threshold `0.55` | PASS | Reuse only where the Search contract requires fuzzy local POI matching; keep deterministic precedence. |
| Complete category inventory | category-keyed V1 `locations` object | Assistant projection preserves category per destination but not all Search fields | PARTIAL | Freeze exact categories and counts before implementing filters. |
| Tag semantics | `tags` on V1 POIs | not represented in the Assistant destination projection | GAP | Port tags into the canonical discovery read model and add tag-filter tests. |
| `location`/area semantics | `location` on V1 POIs | not part of the Assistant destination projection | GAP | Preserve as a filterable field only after exact V1 semantics are frozen. |
| Category filtering | category-keyed catalog and category-driven discovery | no Search package/UI contract | GAP | Implement deterministic category filtering over the shared catalog. |
| Tag/activity filtering | V1 tags encode activity, geography and venue traits | no Search package/UI contract | GAP | Implement only audited V1 tag semantics; do not invent ranking. |
| Local free-text search | canonical names, aliases and local POI data | matching exists only inside Assistant destination resolution | PARTIAL | Create a Search-owned query port by reusing proven match primitives, without coupling Search to Assistant. |
| Mapbox forward search | `js/map/integrations/mapbox-search-service.js` | no Search equivalent | GAP | Port behind an explicit provider adapter; query length `< 2` must return no results. |
| Mapbox search options | language, limit, types, country, proximity, bbox, `poi_category` | no Search equivalent | GAP | Preserve only options exercised by the V1 call graph; default proximity remains Morro unless user proximity is supplied. |
| Mapbox result normalization | `normalizeFeature()` maps Search Box features to internal categories | no Search equivalent | GAP | Define a typed external-result model and deterministic category mapping. |
| Mapbox Search cache | in-memory cache, 5 minute TTL, key = normalized query + serialized options | no Search equivalent | GAP | Preserve observable cache semantics unless evidence proves it is non-observable implementation detail. |
| Mapbox empty/error fallback | empty query, missing token, HTTP error, empty features and thrown fetch all degrade to `[]` | no Search equivalent | GAP | Search must fail closed to an empty result set and must not break Map/Assistant. |
| Search result text formatting | `formatSearchResult()` | no Search equivalent | GAP | Preserve name + formatted place copy at the presentation adapter, not in provider core. |
| Search result list formatting | `formatSearchResultsList()` with numbered rows, category emoji and strong name | no Search equivalent | GAP | Port only after DOM/UI baseline is captured; sanitize output rather than trusting provider HTML. |
| Search result category icons | V1 category → emoji mapping | no Search equivalent | GAP | Freeze icon/category map before UI implementation. |
| Multilingual external search | Mapbox service accepts `language`; V1 Assistant/proactive surfaces provide PT/EN/ES/HE copy | Assistant is equivalent in PT/EN/ES/HE; standalone Search does not exist | PARTIAL | Search API must accept locale explicitly; UI copy requires PT/EN/ES/HE evidence. |
| Keyboard/accessibility states for Search UI | no dedicated Search baseline frozen yet | no Search UI | GAP | Capture V1 consumer UI states before implementing an independent Search surface. |

## Adjacent V1 discovery surfaces — dependency boundaries

These files participate in discovery, but they are not automatically owned by `FEATURE-0002`:

| Surface | V1 evidence | Classification | M36 decision |
| --- | --- | --- | --- |
| Assistant proactive recommendations | `js/assistant/assistant-dialog/proactive-suggestions.js` | Assistant consumer | Keep in `FEATURE-0004`; Search may provide query primitives but must not absorb Assistant profile/time/weather orchestration. |
| Navigation contextual suggestions | `js/navigation/navigationSuggestions/navigation-suggestions.js` | Navigation consumer | Keep session/cooldown/GPS/message lifecycle in `FEATURE-0003`; Search may expose catalog filtering only. |
| Business onboarding discovery | `js/onboarding/runtime/business-discovery-adapter.js` | Business consumer | Preserve as a future `FEATURE-0005` integration contract; it currently routes discovery through Assistant menu/text/voice. |
| Google Places wrapper | `js/map/placesAPI.js` | Secondary provider candidate | Do not port automatically. First prove active V1 call sites and product requirement; avoid carrying unused provider surface into V2. |
| Place details integration | `js/map/integrations/place-details-service.js` | Discovery/details boundary | Audit call graph separately before assigning to Search vs Marketplace. |
| Localized place descriptions | `js/locations/locations_descriptions_i18n.js` | Content dependency | Keep content ownership separate from query/ranking logic; audit locales and fallback before migration. |

## V1 provider contract frozen in M36

`mapbox-search-service.js` establishes the following concrete contract:

- minimum query length: 2 characters;
- default locale: `pt`;
- default result limit: 5, hard-capped at 10;
- default proximity: Morro de São Paulo (`lon -38.9159`, `lat -13.3775`);
- optional `types`, `country`, `bbox`, `poi_category` and custom proximity;
- specialized helpers for POI and place/address searches;
- normalized internal categories including restaurants, hotels, shops, nightlife, emergencies, attractions, places and addresses;
- five-minute in-memory cache;
- empty array on missing token, HTTP failure, empty provider response or thrown fetch;
- provider results carry `source: "mapbox"`.

The V1 also contains a broader Google Places wrapper (`js/map/placesAPI.js`) with nearby search, text search, details and photos. Its existence is evidence of a provider experiment/capability, not sufficient evidence that all of it is required for `FEATURE-0002` equivalence.

## Current M36 score

Core matrix rows:

- `PASS`: 5
- `PARTIAL`: 4
- `GAP`: 13
- total: 22

This score is intentionally conservative. Existing Assistant matching reduces implementation work, but it does not make Search equivalent because there is no Search-owned query API, filter model, provider adapter or result UI contract yet.

## Mandatory implementation order after M36

1. Freeze exact POI category/count/tag/location inventory from the V1 canonical catalog.
2. Establish a shared, immutable V1 POI read model without changing the equivalent Map/Assistant/Navigation behavior.
3. Create Search core primitives for normalization, local matching and deterministic filtering.
4. Add the Mapbox Search provider adapter with the frozen V1 fallback/options/cache contract.
5. Add a Search application port that combines local and external discovery without inventing ranking.
6. Capture and port result presentation, empty/error/loading states and PT/EN/ES/HE copy.
7. Add browser regressions for query → results → map/details/navigation integration.
8. Only then consider `FEATURE-0002` for `equivalent`.

## M36 exit decision

M36 is a baseline milestone, not an equivalence milestone. It may close when this matrix, the source inventory and the Quality Gate are green. `FEATURE-0002` must remain `baseline-pending` and no row may be promoted merely because adjacent Assistant or Navigation behavior is already equivalent.
