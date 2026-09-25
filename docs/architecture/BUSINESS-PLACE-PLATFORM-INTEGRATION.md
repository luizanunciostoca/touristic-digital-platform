# Business / Place Platform — Integrated Architecture

Integration branch: `integration/place-business-platform-20260923`

Initial base authority: `7c365040a13423dcb4f47ad3dfc1ca55a0dc3671`

Current main observed during composition:
`f9d33bf91a1bf8a8c285d331066a1e4b675bcf7c`

Integration PR: #357 (draft)

## Source waves

| Wave |   PR | Source HEAD                                |
| ---- | ---: | ------------------------------------------ |
| A    | #344 | `5aaea6c0650deb1cc7bdf29c9cc1b05239f2fe01` |
| B    | #348 | `1c83ccd56b27aa53176a69a74523915448f81fb6` |
| C    | #345 | `8c014fdfd485816960d1b10e51dcdd44024d7507` |
| D    | #346 | `275b31588132873ffa3316e093001ccce720e2c6` |
| E    | #351 | `01dd13020d9264ae01fdf946695435d287d677fc` |
| F    | #352 | `be6948309695557576b23d4513703949f191af4e` |
| G    | #353 | `e04022856ee698dc8bdd218e9b00e4d6a6aa3b08` |
| H    | #355 | `293b8a1d8c84b148b9fcaf4742c69012eddea431` |
| I    | #354 | `3347651ff78a38c832590cdbea57f42ffefc7130` |
| J    | #347 | `66269d5f8c494c807a02d94fd5678b33b5fa00e3` |

## Canonical ownership

- Wave B supplies the evolved canonical `Place` location contract on top of A.
- Wave D owns Product, Offer, Menu, MenuCategory and MenuItem identity.
- Wave E owns Place action resolution.
- Wave G owns public Place read models and published-only API projection.
- Wave J owns revision/publication governance.
- Wave C owns MediaAsset / PlaceMedia and media persistence.
- Wave F owns Control Center Business / Place administration UX.
- Wave H owns public map presentation of canonical projections.
- Wave I owns governed Morro Pro self-service UX.

## Shared package composition

`packages/business/src/index.ts` exposes the canonical Place domain plus
Commerce, Place Action Registry and Public Place Projection.

`packages/business/package.json` exposes explicit subpaths for:

- `./place-domain`
- `./commerce-domain`
- `./place-action-registry`
- `./public-place-projection`
- `./place-publication-governance`

Publication governance intentionally remains an explicit subpath rather than
becoming an implicit browser authority.

## Security invariants

- Canonical IDs are the only new relationship authority.
- Cross-business writes fail closed.
- Cross-destination mutations fail closed.
- Published read models never read editable draft state.
- Mapbox remains a provider, not canonical authority.
- Financial remains transaction-money authority.
- Inventory/Ticketing remain availability authorities.
- The Action Registry owns CTA resolution.
- Public map code consumes actions; it does not infer sellability.
- Media ownership remains Business-backed.
- Control Center and Morro Pro do not become owner authorities themselves.

## Integrated proof

`place-platform-integration.test.ts` exercises one continuous flow across
canonical Place, catalog, action resolution, publication state and public
projection, including cross-business denial and draft-leak prevention.

Additional wave-specific tests continue to own detailed Media, CMS, Morro Pro,
map presentation and publication adversarial cases.

## Release boundary

This integration branch and PR are validation artifacts only until explicit
authorization is given for merge and deployment.
