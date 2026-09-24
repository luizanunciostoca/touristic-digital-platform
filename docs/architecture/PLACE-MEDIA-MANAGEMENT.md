# Place Media Management — Wave C

Status: implemented on `wave/place-media-management-20260923`.

Base main: `499cb1eab0353d72b4e988ac1eb1ad0da17405c9`.

## Authority

The future media authority is the explicit relation `Business -> MediaAsset -> PlaceMedia -> Place`.

Names, labels, aliases and slugs are never ownership authority. The current `resolveAssistantV1Photos(location.name)` catalog remains a migration-only fallback through the injected `resolveWithLegacyFallback` boundary.

## Canonical contracts

`MediaAsset` stores: `id`, `businessId`, media type, provider/reference, MIME, dimensions, byte size, SHA-256 checksum, alt text, publication state and timestamps.

`PlaceMedia` stores: `placeId`, `mediaId`, role, sort order and timestamps.

Roles: `cover`, `gallery`, `logo`, `menu`, `product`, `other`.

Wave A's BusinessId and PlaceId contracts are intentionally not imported yet because Wave A is still unmerged/diverged from current main. Field names and authority semantics are aligned for reconciliation after Wave A lands.

## Durable persistence

The existing `@touristic/content-server` MySQL authority is reused.

`applyContentM156Schema` now creates:

- `media_assets`, with business-scoped SHA-256 uniqueness;
- `place_media`, with an FK to `media_assets` and place/order/role indexes.

`MySqlPlaceMediaRepository` implements the same `PlaceMediaRepository` contract used by the domain service. No new database product or media vendor is introduced.

## Storage

No Cloudinary or other concrete media provider was found in current main. This wave therefore does not introduce a new vendor.

`MediaStoragePort` is a server-side storage boundary. It returns only provider metadata and an opaque provider reference; no provider secret is exposed in the domain or browser contract.

Provider failures fail closed. Persistence failure after upload performs best-effort object rollback. Duplicate uploads are detected by business-scoped SHA-256 and the newly uploaded duplicate object is best-effort deleted.

## Validation

Uploads reject unsupported MIME, zero/oversized payloads, mismatched byte size, invalid dimensions, empty filenames, invalid provider metadata, duplicates and per-place count overflow.

Default limits:

- MIME: JPEG, PNG, WebP, AVIF.
- size: 12 MiB.
- max dimension: 8192 px.
- count: 40 linked assets per place.
- alt text: max 300 characters.

Published images require non-empty alt text.

## Ownership

Every read/mutation receives explicit `PlaceMediaOwner { placeId, businessId }` plus server-derived `MediaAccessScope`.

A business cannot access another business's assets. Mutation additionally requires `canMutate=true`. No decision is derived from place name, slug or frontend state.

## Service APIs

`createPlaceMediaService` exposes:

- `upload`
- `list`
- `updateAlt`
- `setPublished`
- `setRole`
- `setCover`
- `setLogo`
- `reorder`
- `delete`
- `projection`
- `resolveWithLegacyFallback`

`projection` is the future read model for `place.coverImage`, `place.gallery` and `place.logo`; only published assets are projected.

## Migration notes

1. Merge/reconcile Wave A first and bind these string ID fields to `BusinessId` / `PlaceId`.
2. Select the existing platform storage provider when one is introduced; do not put credentials in browser code.
3. Backfill legacy named photo catalog entries into MediaAsset + PlaceMedia with explicit canonical IDs.
4. Update Assistant/Search/Map readers to request projection by PlaceId.
5. Keep `resolveAssistantV1Photos` only as fallback while parity is measured.
6. Remove name-based fallback after all public places have canonical media or an intentional no-image state.

## Out of scope

No map renderer changes, Action Registry changes, Control Center UI build, merge, deploy, or production migration are included.
