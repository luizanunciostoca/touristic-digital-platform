# Wave H — Public Map Place Presentation V2

## Purpose

Render canonical public Place projections without recreating business, commerce, publication, media, or action-resolution rules in the browser.

## Authority boundaries

- Public Place detail is supplied by Wave G.
- Action availability and ordering are supplied by the server-side Place Action Registry projection.
- Canonical media wins over legacy name-based photo lookup.
- Legacy photo resolution remains fallback-only while migration is active.
- The browser does not infer sellability, publication, tenant ownership, or financial authority.

## Implementation

- `public-place-presentation-v2.ts` converts `PublicPlaceDetail` to the map/bottom-sheet presentation contract.
- `place-bottom-sheet.ts` now accepts generic canonical actions and an optional canonical hero image while retaining structural compatibility with V1 callers.
- Opaque media provider identifiers are not guessed into browser URLs; only already-public absolute/path references are rendered.
- Partial upstream degradation maps to an explicit presentation error state.

## Migration

Legacy `resolveAssistantV1Photos(location.name)` remains only as a fallback when no canonical hero image is supplied. New canonical callers should always pass the Wave G media projection.

Legacy `place-commerce-capability.ts` remains outside this presentation adapter. Canonical callers render the supplied `PublicPlacePresentationActions` and do not resolve CTA rules locally.

## Integration handoff

Control Tower must bind the canonical map/detail fetch path to this presentation adapter after Waves E and G are composed on the integrated HEAD. Do not reintroduce name/slug/alias matching during that binding.

Validation checkpoint: exact-head CI must pass after the canonical formatter is removed; no merge or deploy is authorized by this document.
