# Wave G — Public Place Projection / Map Read Model

Status: implemented on `wave/public-place-projection-20260923`.

Base: Wave A exact head `5ed3fa161b2fa8304ebdb99022f36beff022ac33`.

Dependencies reviewed:
- Wave A / PR #344 — canonical Business + Place identity and capabilities.
- Wave C / PR #345 — published media projection contract.
- Wave D / PR #346 — Product / Offer / Menu relations and public-active semantics.
- Wave J / PR #347 — publishedRevision authority and suspended/archived removal.
- Wave E action registry was not yet available as an implemented branch/PR at audit time; Wave G therefore consumes an injected `PublicPlaceActionPort` and contains no duplicated action-selection rules.

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
- `categoryId`
- `zoom` (default 14, valid 0..24)
- `limit` (default 250, hard cap 1000)
- `cursor`

Response:
```ts
{
  items: Array<{
    id: PlaceId;
    name: string;
    categoryId: CategoryId;
    latitude: number;
    longitude: number;
    presentation: {
      markerKey: string;
      priority: number;
    };
  }>;
  nextCursor: string | null;
}
```

The map payload intentionally excludes descriptions, contacts, media arrays, business/admin identity and audit metadata.

### GET /api/places/v1/:placeId

Returns one cohesive published read model:
```ts
{
  profile: {
    id;
    destinationId;
    name;
    slug;
    categoryId;
    subcategoryIds;
    shortDescription;
    description;
    location;
    contact;
    openingHours;
    amenities;
    tags;
    capabilities;
  };
  media;
  commerce;
  actions;
  partial: {
    media: "ready" | "unavailable";
    commerce: "ready" | "unavailable";
    actions: "ready" | "unavailable";
  };
  revision: {
    id;
    number;
  };
}
```

## Publication authority

`publishedRecordFromGovernedRecord` implements Wave J's public visibility rule:
- never-published draft/review => hidden;
- published revision + editable draft/review => previous published revision remains public;
- suspended => hidden;
- archived => hidden.

The read model additionally fails closed on `visibility !== "public"` and invalid/missing coordinates.

No editable revision is accepted by the public projection contract.

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

Wave E remains authority for action selection/resolution. When its contract lands, adapt it behind this port rather than copying its rules.

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
- businessId;
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

Consume only these public contracts:
- `GET /api/places/v1/map` for map pins.
- `GET /api/places/v1/:placeId` for place detail.
- Pin identity is always `PlaceId`.
- Never join Browser UI data by name, label, alias or slug.
- Never call Business, Media, Catalog and Actions independently from the browser to reconstruct a Place.
- Respect ETag/304.
- Treat `partial.* === "unavailable"` as section degradation, not as permission to recover legacy data from another Place.
- Do not display admin fields because they are intentionally absent.
- Marker presentation may use `presentation.markerKey` and `priority`, but Wave H owns visual rendering.
- Wave H must not reimplement action selection. Render `actions` as supplied by the resolver.

## Tests implemented

Coverage includes:
- published-only authority;
- draft/review hidden when never published;
- previous published revision retained during edit/review;
- suspended/archived hidden;
- destination isolation;
- bbox;
- category;
- correct Place IDs;
- public detail composition;
- action resolver delegation;
- no admin fields in map/detail;
- partial section degradation;
- malformed query handling;
- malformed Place IDs;
- ETag / 304;
- limit cap for scale fixtures.

No UI, Control Center, merge or deployment is part of Wave G.
