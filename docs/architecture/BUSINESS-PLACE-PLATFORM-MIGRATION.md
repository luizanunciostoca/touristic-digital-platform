# Business / Place Platform — Migration and Legacy Debt

## Principle

Legacy fallbacks may preserve current user experience during migration but must
never become canonical identity or authorization authority.

## Temporary fallbacks

### Legacy photo lookup

`resolveAssistantV1Photos(location.name)` remains fallback-only when no
canonical Media / PlaceMedia projection is available.

Removal gate:

1. all published Places have a canonical media projection or explicit no-image
   state;
2. Assistant, Search and Map read media by canonical `placeId`;
3. parity tests show no required legacy-only photo coverage.

### Legacy commerce references

Legacy `product.reference` and `offer.label` may be consumed only through
explicit compatibility records that already identify canonical Business,
Product and Offer IDs.

They must never resolve a new Place by name, slug, alias or display label.

### Legacy Place commerce capability

The browser-local `place-commerce-capability.ts` resolver has been removed.
Canonical public presentation now consumes server-resolved Place Actions from
the Place Action Registry instead of inferring commercial CTAs from category,
name, slug, alias, label or local inventory guesses.

The legacy `commerce:place:` value parser remains available only for backward
compatibility with historical action values; it is not Place authority and must
not be used to derive new canonical relationships.

### Existing Business 360 surfaces

Existing read-only Business 360 capabilities remain available while the new CMS
is adopted. Mutations must use owner-backed Business / Place contracts.

## Migration order

1. backfill canonical Business and Place IDs;
2. bind destination ownership;
3. backfill canonical location;
4. backfill MediaAsset / PlaceMedia;
5. backfill Product / Offer / Menu relations;
6. create publication revisions and published snapshots;
7. expose published-only public projections;
8. switch Assistant, Search and Map to canonical `placeId`;
9. remove legacy name-based fallbacks after parity evidence.

## Explicit debt classifications

- name-based photo lookup: TEMPORARY
- product/reference compatibility: TEMPORARY
- offer/label compatibility: TEMPORARY
- V1 local CTA capability helper: REMOVED
- canonical ID authority: PERMANENT
- published-only public read model: PERMANENT
- owner-backed tenant isolation: PERMANENT

## Prohibited migration shortcuts

- no new relationship by Place name;
- no new relationship by slug or alias;
- no frontend-derived tenant authority;
- no draft exposure to public APIs;
- no direct provider ID becoming canonical identity;
- no bulk conflict resolution using `ours` or `theirs`.
