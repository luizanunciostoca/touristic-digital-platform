# Product Brand Adoption V2

## Scope

ChangeSet `MD-BRAND-ADOPTION-001` applies the governed Brand Family V2 source to product surfaces without publishing production.

## Brand authority by surface

- Morro tourist runtime, PWA metadata, ticketing, tour booking, affiliate portal, Morro Pro and CRM use **Morro Digital — PERCURSO**.
- Platform-wide Control Center uses the **Touristic Digital Platform — REDE** master identity.
- Itacaré Digital remains part of the governed family source and is not falsely presented as an active Morro runtime.
- Territorial validation remains `INTERNAL`.
- Itacaré tagline remains `NEEDS_HUMAN_VALIDATION`.

## Runtime adoption

The product consumes exact copies of the canonical governed SVGs from `packages/design-system/src/brand/v2/assets`. The compatibility path `public/assets/morro-digital-mark.svg` now contains the Morro V2 micro mark, preventing the previous palm/sun/wave mark from resurfacing through legacy consumers.

The tourist shell uses a dedicated `brand-v2.css` layer to bind Brand V2 colors and artwork without rewriting semantic success, warning or error meanings.

Discover mode displays the compact Morro brand mark without the duplicated destination-name cluster beside weather. The accessible destination identity remains in the document structure and other contexts.

## PWA

The web manifest uses the Morro Digital V2 name, background and theme colors and governed SVG app icons. The complete PNG/WebP/PDF/favicon/app-icon matrix remains preserved in the institutional Brand V2 package.

## Administrative products

CRM carries the Morro destination identity. Control Center carries the TDP master identity because it operates across destinations and platform capabilities.

## Release boundary

This ChangeSet is code integration only:

- no Render production deploy;
- no database mutation;
- no secret mutation;
- no real-money action;
- no claim of community validation.

Promotion requires exact-head CI, browser/visual/accessibility evidence and automated independent proof.
