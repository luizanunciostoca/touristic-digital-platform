# Wave D — Business Commerce Contracts

Branch: `wave/business-catalog-offers-menus-20260923`

Stack dependency: Wave A / PR #344\n(`wave/place-business-canonical-model-20260923`).

## Domain ownership

`@touristic/business/commerce-domain` owns catalog identity and relationships for:

- Business → Product → Offer
- Business/Place → Menu → MenuCategory → MenuItem

Canonical identity comes from Wave A:

- `BusinessId`
- `PlaceId`
- `ProductId`
- `OfferId`

Names, slugs, aliases, `product.reference`, and `offer.label` are never identity\nauthority for new data.

## Product

`Product` is the permanent/conceptual commercial item. It carries explicit\n`businessId`, optional `placeId`, optional `destinationId`, lifecycle status, tags,\nand an optional legacy reference retained only for migration compatibility.

## Offer

`Offer` is a sellable commercial condition attached explicitly to one `productId`\nand `businessId`, with optional `placeId` and `destinationId`.

It carries:

- catalog/display amount and ISO-style currency code;
- sales window;
- experience window;
- capacity metadata;
- lifecycle status.

The amount in this contract is not transaction authority. Financial remains the\nauthoritative source for checkout/payment price confirmation. Inventory and\nTicketing remain authoritative for stock/capacity state. The browser must not\nderive an authoritative price or inventory state.

`evaluateOfferSellability()` accepts an optional\n`authoritativeAvailableQuantity` supplied by the owning subsystem. Absence of\nthat fact does not cause this layer to infer stock.

## Menu

`Menu` is a first-class structured catalog. A PDF/image may be attached as\nfallback through `fallbackMediaId` or `fallbackDocumentUrl`, but structured\ncategories/items remain canonical.

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

All service mutations require an explicit `CatalogScope.businessId`.\nCross-business writes fail with `CATALOG_CROSS_BUSINESS_DENIED`.

Offer/Product, Menu/Category, and Menu/Category/Item relationships are checked\nby canonical IDs.

## Legacy compatibility

`resolveLegacyCommerceReference()` exists only for migration compatibility. It\ncan consume pre-existing `product.reference` or `offer.label` values only when a\ncompatibility record already binds them to canonical Business/Product/Offer IDs.

It never resolves a Place from:

- Place name;
- slug;
- alias;
- Product display name;
- Offer label.

## Integration handoff

### Chat 5
Consume `Product`, `Offer`, and canonical IDs from\n`@touristic/business/commerce-domain`. Do not recreate Product/Offer identity\ntypes. Any CTA/action layer should receive canonical IDs, not labels.

### Chat 6
For public/search/map read models, project `businessId`, `placeId`, `productId`,\nand `offerId` explicitly. Legacy text matching may remain fallback-only for\nlegacy rows.

### Chat 7
For ordering/ticketing integration, translate canonical `productId`/`offerId` at\nthe boundary. Existing `TicketProductReference` may remain a legacy/provider\ncompatibility field, but must not become Place identity authority.\nInventory/Ticketing remain stock owners.

### Chat 8
For Financial/payment integration, treat `Offer.price` and `MenuItem.price` as\ncatalog/display amounts. Re-confirm authoritative money in Financial before\ntransaction execution.

### Chat 9
For Control Center/Morro Pro/admin surfaces, create/update products, offers,\nmenus, categories and items through canonical IDs and explicit Business scope.\nDo not add browser-side authoritative price calculations.

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
