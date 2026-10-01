# Touristic Digital Platform — Institutional Hub V1

Wave 3 / Chat B implementation surface.

## Status

- Mode: non-production preview.
- Master language: pt-BR.
- Indexing: disabled by design.
- Production deployment: not authorized by this app.
- Public downloads: disabled until their separate publication gates pass.
- Contact submission: disabled until an authoritative endpoint and privacy configuration exist.

## Institutional authority

The implementation consumes the frozen Wave 2 institutional authority and does not reopen it:

1. WAVE_2_INSTITUTIONAL_BASELINE_V1 — FROZEN.
2. TDP_INSTITUTIONAL_MASTER_BOOK_V3_1.
3. TDP_MASTER_BRAND_FAMILY_SYSTEM_V2_GOVERNANCE.
4. TDP_BRAND_V2_FINAL_ACCEPTANCE_REGISTER.
5. TDP_PRODUCT_VISUAL_EVIDENCE_INDEX_V1_1.
6. Latest accepted Investor, Sponsorship and Destination lane handoffs.
7. Wave 2 Publication Acceptance V1 for time-sensitive publication qualifiers.

Brand architecture is fixed for this surface:

- Touristic Digital Platform = REDE.
- Morro Digital = PERCURSO.
- Itacaré Digital = FLUXO.

## Routes

The preview builds sixteen institutional routes:

- /
- /platform/
- /product/
- /destinations/
- /destinations/morro-digital/
- /destinations/itacare-digital/
- /business/
- /market/
- /investors/
- /sponsorship/
- /destination-partners/
- /technology/
- /governance/
- /about/
- /resources/
- /contact/

Standalone Impact-results, Analytics, Growth/Journey/Rewards and Data Room routes are intentionally excluded because the frozen evidence does not support those surfaces in this lane.

## Development

Run:

    pnpm --filter @touristic/institutional-hub lint
    pnpm --filter @touristic/institutional-hub test
    pnpm --filter @touristic/institutional-hub build

The build copies the canonical Brand Family V2 SVG masters from @touristic/design-system and emits a static dist package.

## Release boundary

This workspace is a Wave 3 implementation candidate, not a production target. Adding it to the monorepo does not authorize hosting, DNS, indexing, public download activation, contact submission, production deployment or publication of controlled materials.
