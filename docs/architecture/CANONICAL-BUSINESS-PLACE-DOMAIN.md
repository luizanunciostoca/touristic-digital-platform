# Canonical Business + Place Domain — Wave A

Status: implemented on `wave/place-business-canonical-model-20260923` as an additive domain-contract wave.

Base main at wave start: `084e041747447a2374a2b89bbfb3cad23c670b58`.

## Goal

Replace fragile semantic correlation of businesses and map places with explicit canonical identity while preserving the current public experience during migration.

Canonical identity introduced by this wave:

- `BusinessId`
- `PlaceId`
- existing `DestinationId` from `@touristic/core`
- `CategoryId`
- `SubcategoryId`
- `ProductId`
- `OfferId`

Names, labels, aliases, slugs and legacy product references remain display/search/migration material only. They are not tenant, ownership, place or commerce authority.

## Domain authority

### Business

Owns the commercial/tenant identity. A Business declares the destinations where it may own Places.

### Place

Owns the geographic and public presence of a Business. Every Place contains an explicit `businessId` and `destinationId`.

### BusinessPlaceRelationship

Represents explicit ownership. Validation fails closed when:

- the Business ID differs from the Place owner;
- the relationship points at another Place;
- the Place destination is not included in the Business destination scope.

### Product and Offer

This wave introduces canonical identity references only:

- `CanonicalProductReference`
- `CanonicalOfferReference`

It does not move Ticketing, Ordering, Payments, Financial or Commerce execution authority.

## Place contract

`Place` contains:

- identity: `id`, `businessId`, `destinationId`;
- presentation: `name`, `slug`, descriptions;
- taxonomy: `categoryId`, `subcategoryIds`;
- `PlaceLocation`;
- `PlaceContact`;
- optional `PlaceHours`;
- amenities and tags;
- `PlaceCapabilities`;
- `PlaceVisibility`;
- `PlacePublicationState`;
- timestamps.

The model deliberately does not aggregate media, menus, products or offers into the Place entity.

## Location contract

`PlaceLocation` supports:

- latitude / longitude;
- address / area;
- source;
- external provider;
- external provider place ID;
- verification timestamp;
- verifier identity.

This is only a contract. Provider search and Mapbox discovery are intentionally left for the dedicated geospatial/search wave.

## Canonical taxonomy

The initial canonical category vocabulary is:

- `restaurants`
- `nightlife`
- `hotels`
- `tours`
- `transport`
- `shops`
- `attractions`
- `beaches`
- `emergencies`

`Category.key` remains extensible while `CategoryId` is the authoritative relation.

A compatibility normalizer maps known legacy labels to canonical keys, but that normalizer does not assign ownership or entity identity.

## Place capabilities

Category answers “what is this place?”

Capabilities answer “what can this place actually do?”

Initial capability vocabulary:

- directions
- photos
- menu
- tableReservation
- tickets
- booking
- whatsapp
- call
- website
- products
- offers
- tourBooking
- transportBooking

The final action resolver is not part of this wave.

## Security and tenancy

`authorizePlaceAccess` requires server-provided explicit scope:

- `businessIds`;
- `destinationIds`;
- Auth capabilities.

Mutation requires `business.update`.

The API does not infer tenant scope from frontend state, names, slugs, category labels or destination-only matches.

## Duplicate semantics

A duplicate is detected by:

1. identical canonical `PlaceId`; or
2. identical external-provider identity inside the same Business and Destination.

Matching slug alone is explicitly not treated as canonical identity.

## Legacy compatibility

Two additive migration helpers are introduced.

### BusinessProfile

`migrateLegacyBusinessProfileToPlace` converts the existing BusinessProfile shape into a private/draft Place only when the caller supplies explicit:

- `placeId`;
- `businessId`;
- `destinationId`;
- `categoryId`.

Legacy profile IDs, aliases, category labels and references are preserved in `LegacyPlaceCompatibility` and never promoted into canonical authority.

### V1 map/search catalog

`migrateLegacyCatalogItemToPlace` preserves valid V1 coordinates and aliases, but also requires explicit canonical IDs supplied by the migration owner.

This lets Search, Assistant, map and the current public experience continue consuming V1 during phased migration.

## Persistence / schema decision

No database migration is included in Wave A.

Reason: current `@touristic/business` BusinessProfile is repository/contract based and this wave was explicitly scoped to modeling and contracts. Introducing storage tables now would prematurely choose persistence ownership and collide with Control Center / Business / Commerce waves.

A later persistence wave should create tables with foreign-key or equivalent server constraints for:

- businesses;
- places;
- business-place ownership;
- categories;
- subcategories;
- place-subcategories;
- place capabilities;
- provider identity uniqueness.

Required uniqueness should include canonical Place ID and, where populated, provider identity scoped by Business + Destination.

## Compatibility lifecycle

Compatibility is temporary.

1. Write canonical IDs alongside legacy records.
2. Backfill BusinessProfile and V1 catalog through explicit migration mappings.
3. Update Search / Assistant / map / Ticketing integrations to consume canonical IDs.
4. Remove destination-as-place and label/reference inference.
5. Remove legacy adapters only after parity evidence exists.

## Scope intentionally not implemented

- UI rewrite;
- upload;
- Mapbox search;
- menus;
- Place Action Registry;
- map rewrite;
- deployment;
- production data migration;
- persistent schema.

## Concurrent-wave overlap

Known open work at implementation time includes:

- Commerce Core PRs that already define canonical business/place/offer identity at the orchestration boundary;
- Assistant contextual presentation work;
- Control Center gap/recovery work.

This wave therefore owns only Business/Place domain identity and validation. Commerce remains consumer-side orchestration; Assistant/Search/Map remain readers; Control Center remains administration/UI.

## Test coverage

`place-domain.test.ts` covers:

- canonical IDs;
- Business ↔ Place ownership;
- cross-business rejection;
- cross-destination rejection;
- business with multiple Places;
- category/subcategory validation;
- capability normalization;
- tenant/destination/capability authorization;
- duplicate Place detection;
- slug non-authority;
- BusinessProfile migration;
- V1 catalog migration;
- legacy category compatibility.

## Handoff

Consumers should import canonical contracts from either:

- `@touristic/business`; or
- `@touristic/business/place-domain`.

New integrations must carry canonical IDs end-to-end. Any adapter still depending on label/name/alias/reference matching must be treated as migration-only compatibility and must not become write authority.
