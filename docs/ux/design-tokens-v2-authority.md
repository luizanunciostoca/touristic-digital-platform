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
- Bottom Sheet sizing tokens;
- Unified Contextual Assistant Dock sizing, message-height, divider and radius tokens.

Premium UX and feature styles consume those tokens but no longer redefine the reusable outdoor/sheet token families.

## Feature-local custom properties

A feature may still define a local derived variable when it represents runtime state or a computed presentation value rather than a reusable design token. Examples are `--md-active-mode`, `--md-map-ui-priority` and the Navigation gradient composed from canonical color tokens.

This boundary prevents competing token authorities while keeping runtime state close to the feature that owns it.

## Unified Assistant Dock tokens

Reusable geometry is canonical in `public/design-system-v2.css`:

- `--md-unified-dock-max-inline-size`
- `--md-unified-dock-message-max-height`
- `--md-unified-dock-rich-max-height`
- `--md-unified-dock-radius`
- `--md-unified-dock-divider`

Runtime-measured values such as `--md-unified-dock-height` and `--md-unified-dock-map-inset` remain feature-local because they are computed from the rendered composition rather than reusable design constants.

### Category rail additions

- `--md-unified-dock-category-height`
- `--md-unified-dock-category-gap`
- `--md-unified-dock-category-min-width`

### Context Rail button system

The shared Category → Filters → Places → Actions control family also owns:

- `--md-context-rail-control-height`
- `--md-context-rail-control-radius`
- `--md-context-rail-control-gap`
- `--md-context-rail-control-padding-inline`
- `--md-context-rail-label-size`
- `--md-context-rail-icon-size`
- `--md-context-rail-category-min-width`
- `--md-context-rail-place-min-width`
- `--md-context-rail-action-min-width`

These are reusable geometry tokens. Horizontal scroll position remains runtime state and is not tokenized.
