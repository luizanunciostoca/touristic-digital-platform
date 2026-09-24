# Wave D — Business Commerce Contracts

Branch: `wave/business-catalog-offers-menus-20260923`

Stack dependency: Wave A / PR #344
(`wave/place-business-canonical-model-20260923`).

## Domain ownership

`@touristic/business/commerce-domain` owns catalog identity and relationships:

- Business → Product → Offer
- Business/Place → Menu → MenuCategory → MenuItem

Canonical identity comes from Wave A:

- `BusinessId`
- `PlaceId`
- `ProductId`
- `OfferId`

Names, slugs, aliases, `product.reference`, and `offer.label` are never
identity authority for new data.

## Product

`Product` is the permanent commercial item. It carries explicit
`businessId`, optional `placeId`, optional `destinationId`, lifecycle
status, tags, and an optional legacy reference retained only for migration.

## Offer

`Offer` is a sellable commercial condition attached explicitly to one
`productId` and `businessId`, with optional `placeId` and
`destinationId`.

It carries:

- catalog/display amount and ISO-style currency code;
- sales window;
- experience window;
- capacity metadata;
- lifecycle status.

The amount in this contract is not transaction authority. Financial remains
authoritative for checkout/payment price confirmation. Inventory and Ticketing
remain authoritative for stock/capacity. The browser must not derive an
authoritative price or inventory state.

`evaluateOfferSellability()` accepts an optional
`authoritativeAvailableQuantity` supplied by the owning subsystem. Absence of
that fact does not cause this layer to infer stock.

## Menu

`Menu` is a first-class structured catalog. A PDF/image may be attached as
fallback through `fallbackMediaId` or `fallbackDocumentUrl`, but structured
categories/items remain canonical.

`MenuItem` includes:

- `id`
- `businessId`
- `menuId`
- `categoryId`
- `name`
- `description`
- `price`
- `mediaId`
- `available`
- `tags`
- `allergens`
- `sortOrder`

## Isolation

All service mutations require an explicit `CatalogScope.businessId`.
Cross-business writes fail with `CATALOG_CROSS_BUSINESS_DENIED`.

Offer/Product, Menu/Category, and Menu/Category/Item relationships are checked
by canonical IDs.

## Legacy compatibility

`resolveLegacyCommerceReference()` exists only for migration compatibility.
It can consume pre-existing `product.reference` or `offer.label` values only
when a compatibility record already binds them to canonical
Business/Product/Offer IDs.

It never resolves a Place from:

- Place name;
- slug;
- alias;
- Product display name;
- Offer label.

## Integration handoff

### Chat 5

Consume `Product`, `Offer`, and canonical IDs from
`@touristic/business/commerce-domain`. Do not recreate Product/Offer identity
types. Any CTA/action layer should receive canonical IDs, not labels.

### Chat 6

For public/search/map read models, project `businessId`, `placeId`,
`productId`, and `offerId` explicitly. Legacy text matching may remain
fallback-only for legacy rows.

### Chat 7

For Ordering/Ticketing integration, translate canonical `productId` and
`offerId` at the boundary. Existing `TicketProductReference` may remain a
legacy/provider compatibility field, but must not become Place identity
authority. Inventory/Ticketing remain stock owners.

### Chat 8

For Financial/payment integration, treat `Offer.price` and `MenuItem.price`
as catalog/display amounts. Re-confirm authoritative money in Financial before
transaction execution.

### Chat 9

For Control Center/Morro Pro/admin surfaces, create/update products, offers,
menus, categories, and items through canonical IDs and explicit Business scope.
Do not add browser-side authoritative price calculations.

## Required regression cases

Implemented domain tests cover:

- Product create/update;
- Offer → Product relation;
- explicit Business isolation;
- explicit Place relation;
- Menu creation;
- category ordering;
- item availability;
- cross-business denial;
- invalid currency;
- expired offer;
- sold-out fact supplied by authority;
- legacy reference compatibility;
- no name matching required for new data.

## Non-scope

This wave does not:

- change public frontend;
- implement CTA behavior;
- change Financial authority;
- change Inventory/Ticketing authority;
- merge;
- deploy.

Validation checkpoint: exact-head CI must pass on the permanent source tree.
