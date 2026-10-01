# Brand Family V2 — Product Application

## ChangeSet

`MD-BRAND-002` applies the approved V2 family to representative runtime surfaces without publishing production.

## Runtime hierarchy

- Traveler app, Business Portal, Affiliate Portal and CRM use **Morro Digital** as the destination identity.
- Control Center uses **Touristic Digital Platform** as the platform identity.
- Destination selection remains a product capability and is not replaced by master-brand decoration.

## Applied assets

The traveler runtime now consumes the governed Morro V2 symbol/micro geometry and byte-pinned PWA assets:

- 192×192 app icon;
- 512×512 app icon;
- 192×192 maskable icon;
- 512×512 maskable icon;
- Apple touch icon;
- SVG favicon/micro mark;
- shared runtime brand CSS.

The same PWA PNG bytes are stored in the canonical institutional Drive under the Morro Digital V2 CURRENT package.

## Surface coverage

- traveler metadata, favicon, manifest and service-worker cache;
- visible traveler-shell mark;
- business login;
- Business Portal;
- Affiliate Portal;
- CRM shell;
- Touristic Digital Platform Control Center.

## Color behavior

Morro destination accents are scoped under `data-destination-theme="morro"`. Product semantic colors remain separate from destination accent colors.

## Accessibility

Decorative mark images use empty alt text and `aria-hidden`; accessible product names remain textual. Focus indication remains non-color-only and uses high-visibility cyan in the updated branded surfaces. Forced-colors behavior remains governed by the existing design-system contracts.

## Validation boundary

This is runtime integration evidence, not community validation. `TERRITORIAL_DESIGN_VALIDATION` remains `INTERNAL`.

Production publication remains unauthorized by this ChangeSet.
