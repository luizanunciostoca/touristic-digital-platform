# Design Tokens V2 — canonical authority

`public/design-system-v2.css` is the canonical source for reusable `--md-*` design tokens.

## Token families

The authority includes:

- brand and semantic color;
- typography;
- spacing;
- radius and elevation;
- motion;
- interactive states;
- responsive documentation tokens;
- safe areas and touch targets;
- semantic z-layers;
- Navigation component tokens;
- outdoor-readability tokens;
- Bottom Sheet sizing tokens.

Premium UX and feature styles consume those tokens but no longer redefine the reusable outdoor/sheet token families.

## Feature-local custom properties

A feature may still define a local derived variable when it represents runtime state or a computed presentation value rather than a reusable design token. Examples are `--md-active-mode`, `--md-map-ui-priority` and the Navigation gradient composed from canonical color tokens.

This boundary prevents competing token authorities while keeping runtime state close to the feature that owns it.
