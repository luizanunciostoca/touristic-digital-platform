# Search M38 — Shared V1 Catalog Evidence

## Scope

M38 establishes the shared immutable V1 POI read model required by the Search migration matrix before any remote provider or standalone Search UI is introduced.

## Frozen source

- repository: `luizidebook/morro-de-sao-paulo-digital`
- commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`
- canonical source: `js/map/locations/locations.js`
- source blob: `79abf19b1a8843ac90a444de8f99e4f66631bfa8`

## Audited inventory

An executable export over the frozen source produced:

- 131 POIs;
- 9 categories;
- 90 distinct tags;
- 5 explicit areas: `caminho`, `gamboa`, `garapua`, `praia`, `vila`.

Category counts:

| Category    | Count |
| ----------- | ----: |
| beaches     |     8 |
| restaurants |    45 |
| hotels      |    35 |
| shops       |    12 |
| transport   |     8 |
| attractions |     8 |
| nightlife   |     5 |
| emergencies |     4 |
| tours       |     6 |

## Ownership change

The frozen Assistant destination projection is moved from the app adapter into `@touristic/search`. The Morro app consumes the shared catalog through the Search package rather than owning a second local POI projection.

The original Assistant-visible base fields remain preserved:

- canonical name;
- latitude / longitude;
- category;
- aliases.

The M38 enrichment overlay adds only fields audited from the same frozen canonical source:

- `area` from V1 `location` when present;
- `tags` when present.

No missing value is synthesized.

## Integrity contract

The enrichment overlay contains exactly 131 rows keyed by `(category, name)`. Catalog composition throws if an expected enrichment row is missing. Tests freeze:

- total POI count;
- exact category counts;
- overlay count;
- distinct tag count;
- explicit area inventory;
- coordinate sanity;
- immutable catalog/item/tag boundaries.

## Consumer boundary

M38 changes ownership, not observable Assistant behavior. Existing Morro Assistant destination resolution and nearby discovery consume `morroV1SearchCatalog` from `@touristic/search`. Mapbox Search, fuzzy Search ownership, external providers, UI and presentation remain outside this milestone.

## Exit gate

M38 may close only after the final authored head passes installation, formatting, architecture, Feature Registry, lint, typecheck, tests and build, and the final diff contains no temporary workflows.
