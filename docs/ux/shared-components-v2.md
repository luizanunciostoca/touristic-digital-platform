# Shared component adoption — UX Design V2

The V2 primitive library is now consumed by real tourist surfaces rather than existing only as a foundation stylesheet.

## Active consumers

- Home map controls: `md-icon-button`.
- Runtime-created 3D control: `md-icon-button`.
- Assistant trigger, minimize, send, voice and settings controls: `md-icon-button`.
- Navigation stop action: `md-button md-button--destructive`.
- Commerce: shared buttons, cards and skeletons.
- Ticketing: shared buttons, cards and skeletons.
- Commerce preview: shared bottom-sheet primitive.

Feature classes remain alongside primitives when they own domain-specific layout or parity behavior. The shared primitive owns common touch target, state, focus, typography and semantic styling contracts; the feature class owns context-specific placement/presentation.

This composition approach avoids a risky wholesale rewrite of the frozen V1 evidence while making shared components real runtime dependencies.

- Navigation guidance banner: `md-banner` composed with the specialized `md-navigation-banner` authority while preserving the existing layout contract.
- Public onboarding completion: `md-toast` with polite live-region semantics; the frozen V1 visual selector remains the higher-specificity presentation bridge.
