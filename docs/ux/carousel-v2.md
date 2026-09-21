# Carousel V2

The Assistant photo gallery is now a Design System V2 surface rather than an isolated legacy-styled strip.

## Runtime contract

- the gallery is a labelled `role="region"`;
- the horizontal track is a focusable `role="list"`;
- each photo is a labelled `role="listitem"`;
- Arrow Left/Right moves one logical photo at a time;
- Home and End jump to the first and last photo;
- keyboard movement respects document direction and reduced-motion preference;
- the existing photo bytes, lazy-loading policy and place-action continuity remain unchanged.

## Presentation contract

`assistant-photo-carousel.css` now consumes semantic V2 surface, border, typography, radius, spacing, elevation, focus and skeleton tokens. It includes explicit reduced-motion and forced-colors behavior and no longer owns a separate hardcoded palette.

## Verification

The permanent Assistant Photo Browser Contract verifies the real Mapbox-backed Assistant journey, physical photo assets, semantic region/list/listitem structure, keyboard index transitions and preserved detail actions.

The V1 `public/legacy/**` carousel CSS remains immutable evidence; this migration targets the active Assistant photo carousel used by the current runtime.
