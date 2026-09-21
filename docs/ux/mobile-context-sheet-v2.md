# Mobile contextual Bottom Sheet — UX Design V2

## Scope

The public tourist shell now uses a real mobile Bottom Sheet for the contextual Search, Place and Tour surfaces. Commerce keeps its existing dedicated preview sheet, so the canonical journey has sheet behavior across Search → Place/Tour → Commerce without turning the Assistant itself into a blocking modal.

## Runtime composition

`premium-ux-mode.ts` publishes an explicit `search` mode when Explore is in the `filters` or `places` stage. `place` remains the detail stage and immersive `tour` remains driven by the Tour flow contract.

`mobile-context-sheet.ts` observes the live presentation mode and the mobile media query. When active it composes the existing `#assistant-messages` surface with the shared `md-bottom-sheet` primitive and a dedicated, keyboard-focusable handle.

Supported states are `peek`, `half` and `full`.

## Interaction and accessibility

The handle supports:

- click cycling;
- Arrow Up / Arrow Down;
- Home / End;
- Escape collapse to `peek`;
- pointer drag;
- touch drag/swipe.

The handle preserves a 44px target through `md-icon-button`. The content region receives `md-bottom-sheet-content`, scroll containment and safe-area-aware positioning. Reduced-motion and forced-colors continue to come from the Design System V2 Bottom Sheet primitive.

The sheet is non-modal: Map context remains available and focus is not trapped.

## Browser evidence

- `V1 Explore Locations Browser Regression` validates mobile Search and Place modes, snap states and keyboard control in the real category/filter/place flow.
- `Map Tour Browser Regression` validates the same Bottom Sheet contract while the guided Tour is active.
- Commerce continues to be covered by its existing Bottom Sheet browser contract.

This closes the planned real Bottom Sheet adoption for Search, Place, Tour and Commerce while preserving the existing product state machines.
