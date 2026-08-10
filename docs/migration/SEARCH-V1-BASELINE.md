# Search & Discovery — V1 Baseline (M36)

## Scope

This baseline starts Wave 5 / `FEATURE-0002` without implementing new behavior. Its purpose is to freeze the V1 source of truth and define the evidence required before migration.

## Frozen source

Repository: `luizidebook/morro-de-sao-paulo-digital`

Commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`

Primary catalog source identified in the frozen V1:

- `js/map/locations/locations.js` — canonical POI object shared by map, assistant, filters, suggestions and navigation.
- `js/locations/locations.js` — legacy compatibility re-export that explicitly delegates to the canonical map catalog.
- `js/map/locations/dados.geojson` and `dadosLocations.js` — parallel location representations that must not become a second Search source of truth.
- `js/locations/locations_descriptions_i18n.js` — localized descriptions/content dependency.

The V1 compatibility module explicitly states that map, assistant, filters, suggestions and navigation share the same `locations` object. Search/discovery therefore must not fork a second POI source of truth in V2.

## Canonical POI contract

The canonical V1 catalog is grouped by categories. POIs expose, where applicable:

- `name`;
- `lat` / `lon`;
- `aliases`;
- `description`;
- `location`;
- `tags`.

Examples in the frozen baseline include aliases such as `1a praia`, `praia 1`, `first beach`, `garapua`/`garapuá`, and tags representing intent, activity, geography and venue characteristics.

The current V2 already contains a frozen V1 projection in `apps/morro-digital-platform/src/assistant/assistant-v1-destination-catalog.ts`, but that projection intentionally retains only fields required by Assistant destination resolution. It is therefore evidence and reusable input, not yet a complete Search read model.

## V1 Search core inventory

### Local POI discovery

The local catalog is the primary deterministic discovery source. Matching behavior is distributed across V1 consumers rather than isolated in a dedicated Search package.

V2 already proves several matching primitives through the equivalent Assistant migration:

- canonical-name matching;
- aliases;
- case/accent normalization;
- partial-name matching;
- Dice fuzzy fallback at threshold `0.55`;
- deterministic precedence before fuzzy matching.

These capabilities live behind Assistant boundaries today and must not make Search depend on Assistant. M36 records them as behavior to extract or reuse through a domain-neutral boundary in a later milestone.

### Mapbox Search Box provider

`js/map/integrations/mapbox-search-service.js` is a concrete V1 external-search provider. Its observed contract is:

- endpoint family: Mapbox Search Box API v1 forward search;
- minimum query length: 2 characters;
- default language: `pt`;
- default limit: 5, hard-capped at 10;
- default proximity bias: Morro de São Paulo (`-38.9159`, `-13.3775`);
- optional filters: `types`, `country`, `bbox`, `poi_category` and custom proximity;
- specialized helpers for POIs and places/addresses;
- five-minute in-memory cache keyed by lower-cased query plus serialized options;
- normalized internal results with `name`, coordinates, description/address fields, feature type, internal category, Mapbox metadata and `source: "mapbox"`;
- deterministic Mapbox POI-category mapping to restaurants, hotels, shops, nightlife, emergencies and attractions;
- missing token, HTTP failure, empty provider response and thrown fetch all degrade to `[]`;
- presentation helpers format one result or a numbered HTML list with category emoji.

This provider behavior is not present behind a Search-owned V2 port yet.

### Google Places capability

`js/map/placesAPI.js` contains a second, broader provider surface:

- nearby search;
- text search;
- details;
- photos;
- type/field validation;
- distance calculation;
- normalized place formatting.

M36 does **not** treat the mere presence of this wrapper as proof that all Google Places behavior is required for equivalence. Active call sites and product ownership must be proven before any port. This avoids carrying experimental/unused V1 provider surface into V2.

## V1 discovery consumers and ownership boundaries

### Assistant proactive recommendations

`js/assistant/assistant-dialog/proactive-suggestions.js` combines time, weather, recent places, profile/interests and localized PT/EN/ES/HE copy. This is recommendation orchestration owned by Assistant, not Search core.

Search may eventually supply deterministic query/filter primitives, but it must not absorb Assistant profile, weather, time-of-day or conversational lifecycle.

### Navigation contextual suggestions

`js/navigation/navigationSuggestions/navigation-suggestions.js` consumes the canonical `locations` object and adds navigation-specific behavior:

- GPS proximity;
- movement threshold;
- navigation warmup;
- category/sponsor priority;
- per-place cooldown;
- one visible suggestion per cycle;
- session maximums;
- navigation message lifecycle and speech.

These are Navigation responsibilities. Search must not duplicate session, GPS, cooldown or message state; at most it may expose catalog filtering/query primitives.

### Business onboarding discovery

`js/onboarding/runtime/business-discovery-adapter.js` demonstrates four discovery entry points used by the business tutorial:

- assistant menu selection;
- generic text search;
- business-name search;
- voice-triggered discovery.

It normalizes accents/case to locate Assistant options and maps business categories to discovery phrases. This is a future `FEATURE-0005` consumer contract, not a reason to couple Search to onboarding.

## Multilingual contract

V1 discovery is not uniformly localized in one layer:

- Mapbox Search accepts a provider `language` option and defaults to Portuguese;
- Assistant proactive suggestions carry explicit PT/EN/ES/HE copy;
- canonical POIs contain aliases that may include English terms;
- localized place descriptions exist separately in `locations_descriptions_i18n.js`.

Therefore the future Search API must accept locale explicitly, while presentation/content localization remains a separate adapter/content concern. M36 does not assume that translating provider results and translating local POI descriptions are the same contract.

## Current V2 reuse evidence

The following V2 assets are relevant but do not make `FEATURE-0002` equivalent:

- `assistant-v1-destination-catalog.ts` — frozen V1 names/categories/coordinates/aliases projection;
- `assistant-destination-resolver.ts` — exact/alias/substring compatibility resolution;
- `assistant-v1-place-resolver.ts` — exact → alias → partial → alias partial → Dice fuzzy precedence;
- equivalent Assistant/Navigation browser contracts that must remain unaffected by Search extraction.

The formal status breakdown is maintained in `SEARCH-MIGRATION-MATRIX.md`.

## Architectural decision for M36

`FEATURE-0002` remains `baseline-pending`. No `packages/search` or `packages/marketplace` implementation is created in this milestone.

The implementation sequence must begin with a shared immutable POI read model and domain-neutral query primitives, not with a new UI or remote provider.

## Security/provider boundary

M36 does not copy V1 provider credential patterns automatically. Provider configuration must respect the V2 security model:

- do not introduce a new secret into browser code;
- keep public Mapbox configuration explicit and bounded;
- any provider credential that is not safe as a public browser token must stay behind a server/same-origin boundary;
- Search failures must not break the already equivalent Map, Assistant or Navigation runtime.

## Non-goals

- Do not invent ranking, recommendations, marketplace scoring or remote search APIs.
- Do not duplicate the V1 POI catalog into an independent source of truth before ownership is defined.
- Do not change Mapbox, Navigation or Assistant contracts during baseline discovery.
- Do not automatically port every experimental V1 provider wrapper.
- Do not promote `FEATURE-0002` or a migration item to `equivalent` from documentation alone.

## M36 exit criteria

M36 can close when:

1. core Search and adjacent discovery modules are classified by ownership;
2. the formal PASS/PARTIAL/GAP matrix is committed;
3. implementation order and rollback boundaries are explicit;
4. the PR diff contains documentation/evidence only;
5. the official Quality Gate is green on the final head.

Implementation starts in a later milestone from the matrix. `FEATURE-0002` remains `baseline-pending` after M36.
