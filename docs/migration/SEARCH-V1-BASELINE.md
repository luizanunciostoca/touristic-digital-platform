# Search & Discovery — V1 Baseline (M36)

## Scope

This baseline starts Wave 5 / `FEATURE-0002` without implementing new behavior. Its purpose is to freeze the V1 source of truth and define the evidence required before migration.

## Frozen source

Repository: `luizidebook/morro-de-sao-paulo-digital`

Commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`

Primary catalog source identified in the frozen V1:

- `js/map/locations/locations.js` — canonical POI object shared by map, assistant, filters, suggestions and navigation.
- `js/locations/locations.js` — legacy compatibility re-export that explicitly delegates to the canonical map catalog.
- `js/map/locations/dados.geojson` and `dadosLocations.js` — location datasets that must be classified as source, generated representation or compatibility artifact before porting.
- `js/locations/locations_descriptions_i18n.js` — localized descriptions that must be inventoried before any content migration.

The V1 compatibility module explicitly states that map, assistant, filters, suggestions and navigation share the same `locations` object. Search/discovery therefore must not fork a second POI source of truth in V2.

## Initial contract observed

The canonical V1 catalog is grouped by categories such as beaches and restaurants. POIs expose, where applicable:

- `name`;
- `lat` / `lon`;
- `aliases`;
- `description`;
- `location`;
- `tags`.

Examples in the frozen baseline include aliases such as `1a praia`, `praia 1`, `first beach`, `garapua`/`garapuá`, and tags representing intent, activity, geography and venue characteristics.

## Architectural decision for M36

`FEATURE-0002` remains `baseline-pending`. No `packages/search` or `packages/marketplace` implementation is created in this milestone.

Before implementation, the migration must prove:

1. the complete category and POI inventory from the frozen V1;
2. which V1 modules actually perform filtering, suggestions, keyword/alias matching and result presentation;
3. normalization behavior for case, accents and aliases;
4. tag/category semantics and ordering rules;
5. interaction boundaries with Map, Assistant and Navigation;
6. multilingual behavior and fallbacks;
7. empty/no-match/error behavior;
8. visual states and accessibility contracts for any search/discovery UI;
9. rollback path that keeps the current equivalent Home/Map/Assistant/Navigation behavior intact.

## Non-goals

- Do not invent ranking, recommendations, marketplace scoring or remote search APIs.
- Do not duplicate the V1 POI catalog into an independent source of truth before ownership is defined.
- Do not change Mapbox, Navigation or Assistant contracts during baseline discovery.
- Do not promote `FEATURE-0002` or a migration item to `equivalent` from documentation alone.

## M36 exit criteria

M36 can close only after the V1 search/discovery surface is fully inventoried and a formal migration matrix exists with explicit PASS/PARTIAL/GAP rows. Implementation starts in a later milestone from that matrix.
