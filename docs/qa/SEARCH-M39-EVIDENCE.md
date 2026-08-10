# Search M39 — Mapbox Provider Evidence

## Scope

M39 ports only the frozen V1 Mapbox Search Box provider contract into `@touristic/search`. It does not add a standalone Search UI, merge local and remote results, or change Map/Assistant/Navigation behavior.

## Frozen source

- repository: `luizidebook/morro-de-sao-paulo-digital`
- commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`
- source: `js/map/integrations/mapbox-search-service.js`

## Provider contract

The V2 adapter preserves the audited V1 behavior:

- query length below 2 characters returns an empty result;
- missing token returns an empty result without calling the provider;
- default language is `pt`;
- default limit is 5 and the upper bound is 10;
- default proximity is Morro de São Paulo (`-38.9159,-13.3775`);
- custom `types`, `country`, `proximity`, `bbox` and `poi_category` are supported;
- global search removes the default proximity unless a custom proximity is supplied;
- POI and places helpers preserve the V1 type filters;
- successful results use a five-minute in-memory cache keyed by lower-cased query plus serialized options;
- HTTP failures, empty provider payloads and thrown fetch errors degrade to `[]`.

## Result normalization

Mapbox features are normalized into the V1 internal result shape with canonical fields for name, coordinates, address copy, feature type, category, POI categories, Maki, Mapbox ID and `source: "mapbox"`.

The frozen feature and POI category mappings are covered by unit tests rather than delegated to UI code.

## Test boundary

The M39 test suite covers request construction, defaults, optional parameters, global search, result normalization, cache hit/expiry and fail-closed behavior. Network access is injected through the provider config, so tests remain deterministic and do not require a live Mapbox request.

## Exit gate

M39 may close only after the final authored head passes installation, formatting, architecture, Feature Registry, lint, typecheck, tests and build, and the PR diff contains no temporary workflow.
