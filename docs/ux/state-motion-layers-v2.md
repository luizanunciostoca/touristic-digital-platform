# Semantic state, motion, typography and layer authority

This wave closes several remaining UX Design V2 foundation gaps without changing the frozen V1 evidence.

## Layer authority

Explore controls, Explore submenu, Explore Mapbox markers and the first-person Navigation marker no longer own numeric z-index values. Their existing runtime numbers are preserved behind semantic `--md-layer-*` tokens so stacking changes have one authority.

## Motion + microinteractions

Map marker transition/pulse timing and pressed-control scaling are semantic Design System tokens. Shared primitives now expose consistent disabled, loading, pressed, selected and invalid states.

No `transition: all` is introduced; properties remain explicit.

## Tourist typography

Home/Discover/Place/Tour/Navigation/Assistant composition inherits `--md-font-family-sans` from the active UX mode. Explore, Commerce and Ticketing explicitly consume the same authority. This keeps Poppins as the tourist face while eliminating independent font stacks from migrated surfaces.

## Governance

`explore-locations.css` and `navigation-map.css` are removed from the Stylelint ignore list. They now participate in the same CI rules that reject `transition: all` and arbitrary three-or-more-digit z-index literals.
