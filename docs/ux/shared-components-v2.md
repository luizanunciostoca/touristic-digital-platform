# Shared component adoption — UX Design V2

The V2 primitive library is now consumed by real tourist surfaces rather than existing only as a foundation stylesheet.

## Active consumers

- Home map controls: `md-icon-button`.
- Runtime-created 3D control: `md-icon-button`.
- Assistant minimize, send, voice and settings controls: `md-icon-button`; the persistent composer remains the canonical Assistant entry surface.
- Navigation stop action: `md-button md-button--destructive`.
- Commerce: shared buttons, cards and skeletons.
- Ticketing: shared buttons, cards and skeletons.
- Commerce preview: shared bottom-sheet primitive.
- Place details: shared `md-bottom-sheet` primitive with peek/half/full state and canonical contextual actions.
- Search/Explore: shared `md-bottom-sheet` primitive while the original semantic flow node remains the event/state authority.
- Tour: shared `md-bottom-sheet` + `md-card` composition for intro/list/stop/finale while the V1 Tour controller remains authoritative.
- Navigation guidance: `md-banner` composed with the specialized navigation banner contract.
- Onboarding completion feedback: accessible `md-toast` with semantic V2 motion/layer tokens.

Feature classes remain alongside primitives when they own domain-specific layout or parity behavior. The shared primitive owns common touch target, state, focus, typography and semantic styling contracts; the feature class owns context-specific placement/presentation.

This composition approach avoids a risky wholesale rewrite of the frozen V1 evidence while making shared components real runtime dependencies.

- Assistant entry authority: the persistent composer (text/voice/settings) is the canonical entry surface; the floating mood/quick-action trigger is retired from UX V2.
