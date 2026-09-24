# Wave G — Public Place Projection / Map Read Model

Status: implemented on `wave/public-place-projection-20260923`.

Base: Wave A exact head `5ed3fa161b2fa8304ebdb99022f36beff022ac33`.

Dependencies reviewed:

- Wave A / PR #344 — canonical Business + Place identity and capabilities.
- Wave C / PR #345 — published media projection contract.
- Wave D / PR #346 — Product / Offer / Menu relations and public-active semantics.
- Wave J / PR #347 — publishedRevision authority and suspended/archived removal.
- Wave E / PR #351 exact audited head `47b44d9fad4e6d40d83349bee1e31bd7191aff9a` — canonical Place Action Registry / CTA resolver.

## Public endpoints

Canonical HTTP contract:

- `GET /api/places/v1/map`
- `GET /api/places/v1/:placeId`

The reusable adapter is `handlePublicPlaceApiRequest`. It is transport-neutral and can be mounted by the platform HTTP runtime without moving domain logic into the browser.

### GET /api/places/v1/map

Required:

- `destinationId`
- `bbox=west,south,east,north`

Optional:

- `category` (legacy/internal alias `categoryId` is accepted by the parser)
- `zoom` (default 14, valid 0..24)
- `limit` (default 250, hard cap 1000)
- `cursor`

Response: a paginated `PublicPlaceMapPage` containing only canonical `PlaceId`, name, `CategoryId`, coordinates and marker presentation (`markerKey`, `priority`), plus `nextCursor`.

The map payload intentionally excludes descriptions, contacts, media arrays, business/admin identity and audit metadata.

### GET /api/places/v1/:placeId

Returns one cohesive published read model containing the public profile, published media, public commerce, server-resolved actions, per-section partial status and public revision identity. The action envelope contains canonical place/business/destination IDs plus primary and ordered secondary actions.

## Publication authority

`publishedRecordFromGovernedRecord` implements Wave J's public visibility rule:

- never-published draft/review => hidden;
- published revision + editable draft/review => previous published revision remains public;
- suspended => hidden;
- archived => hidden.

The read model additionally fails closed on `visibility !== "public"` and invalid/missing coordinates.

No editable revision is accepted by the public projection contract.

The publication adapter also rejects any canonical Place snapshot whose `placeId`, `businessId` or `destinationId` differs from the governed record, preventing accidental cross-Place/cross-tenant joins.

## Media

Wave G does not own storage or media publication logic.

`PublicPlaceMediaPort.getPublishedMedia` is the only media dependency. The adapter must use Wave C and return only its public/published projection:

- cover;
- gallery;
- logo.

Draft assets, ownership metadata, checksums and storage-internal fields must not enter the public payload.

## Commerce

Wave G does not infer transactional state.

`PublicPlaceCommercePort.getPublicCommerce` must adapt Wave D using explicit IDs:

- active Products only;
- active/non-expired Offers according to Wave D semantics;
- active Menu only;
- available MenuItems as appropriate for public display.

Inventory/ticketing authority remains external. Wave G must not manufacture authoritative stock from `Offer.capacity`.

## Actions

Wave G contains no category -> action table.

`PublicPlaceActionPort.resolvePublicActions` receives:

- published public profile;
- available public media;
- available public commerce;
- locale.

Wave E is the authority for action selection/resolution. `PublicPlaceActionPort` now mirrors the Wave E `PlacePresentationActions` wire contract and the public detail includes that result verbatim. Wave G validates `placeId + businessId + destinationId` before emitting it and contains no category-to-action rules.

## Partial failures

Media, Commerce and Actions are isolated sections.

A failed Media call cannot substitute media from another Place and does not make the profile itself unavailable. The response marks that section `unavailable`.

The same applies to Commerce and Actions.

Place identity is never recovered by name/slug/alias matching inside Wave G.

## Cache / ETag

Both endpoints return:

- weak ETag derived from public revision identity and query scope;
- `Cache-Control: public, max-age=..., stale-while-revalidate=...`.

Conditional requests with matching `If-None-Match` return 304.

Default TTL:

- map: 30s;
- detail: 60s.

Adapters may tune TTLs without changing public identity semantics.

## Scale

The repository port is responsible for indexed/materialized query execution.

Required indexes/materialized-read-model strategy for the persistent adapter:

- destinationId;
- publication visibility/public projection;
- geospatial location/bbox;
- categoryId;
- PlaceId primary lookup.

The service enforces a maximum page size of 1000 and exposes a cursor. Clustering remains presentation/query-strategy dependent on zoom; Wave G exposes `zoom` to the repository/presentation layer without implementing UI clustering.

## Privacy boundary

Public projection does not expose:

- business administration/profile metadata (the action authority envelope may carry canonical `businessId` solely for scope identity);
- publication state;
- editable revision;
- admin metadata;
- internal notes;
- audit events;
- external provider IDs;
- verification actor;
- credentials;
- storage checksums;
- unpublished media/data.

## Handoff to Chat 8 / Wave H

Wave H consumes only `GET /api/places/v1/map` and `GET /api/places/v1/:placeId`. Browser identity is always `PlaceId`; it must not reconstruct Place data by independently joining Business, Media, Catalog or Actions, nor recover by name/label/alias/slug. It must honor ETag/304, treat partial failures as section degradation, use supplied marker presentation, and render/dispatch the server-resolved action order and values without reimplementing action selection.

## Tests implemented

Coverage includes published-only lifecycle behavior (including retained prior publication during edit/review and suspended/archived hiding), destination/bbox/category isolation, canonical Place IDs, cohesive detail composition, delegated actions, privacy boundaries, partial degradation, malformed queries/IDs, ETag/304 and page-size limits.

No UI, Control Center, merge or deployment is part of Wave G.
