# Tourist Surface Bottom Sheet V2

## Scope

The mobile Tourist UI uses one reusable Bottom Sheet controller for the map-driven Search, Place and Tour surfaces, while Commerce keeps its production Commerce Preview Sheet controller.

Covered surfaces:

- Search filters and result lists;
- Place detail/actions;
- Tour stage/action content;
- Commerce preview.

## Interaction contract

Search, Place and Tour share the same deterministic snap states:

- `peek`;
- `half`;
- `full`.

The visible handle supports:

- tap/click state cycling;
- pointer drag;
- touch drag;
- Arrow Up/Down;
- Home/End;
- accessible label and `aria-controls`;
- 44 px minimum touch target.

Each surface remembers its latest snap state while the user moves between Search, Place and Tour.

## Mobile behavior

The sheet is enabled only on the mobile media contract. Presentation consumes Design System V2 safe-area, layer, surface, spacing, radius and sheet sizing tokens.

The content area is scroll-contained with `overscroll-behavior: contain`, and the sheet never extends beyond the viewport or the Assistant composer.

Reduced motion remains governed by the global Design System V2 motion contract.

## Commerce

Commerce retains `installCommercePreviewSheet`, which already provides pointer/touch/keyboard snap-state behavior and the shared `md-bottom-sheet` primitive. The Tourist Surface controller does not duplicate or override Commerce state.

## Browser certification

`.github/workflows/v1-explore-locations-browser-regression.yml` validates the real mobile Mapbox flow and now certifies:

- Search sheet activation;
- half/full/peek keyboard transitions;
- pointer drag to the next snap state;
- safe viewport containment;
- 44 px handle target;
- Place sheet activation;
- Tour sheet activation;
- body/surface state synchronization.

`src/ux/tourist-bottom-sheet-v2-contract.test.ts` locks the controller, presentation and browser-gate authority.
