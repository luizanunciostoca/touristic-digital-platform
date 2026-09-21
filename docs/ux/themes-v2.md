# Theme authority — UX Design V2

The Tourist UI uses one explicit theme contract from `design-system-v2.css`.

## Supported scopes

- `data-theme="light"` — canonical public default.
- `data-theme="dark"` — semantic dark palette.
- `data-theme="high-contrast"` — explicit high-contrast palette using system colors.
- `data-destination-theme="morro"` — destination brand composition layered on top of the active theme.

Home, Commerce and Ticketing now declare the same light + Morro destination composition at their public entrypoints instead of relying on implicit defaults.

## Accessibility

The explicit high-contrast theme is not a replacement for operating-system forced-colors. `@media (forced-colors: active)` remains a separate accessibility authority and continues to use system colors/focus semantics.

## Governance

Feature CSS consumes semantic `--md-*` aliases. Theme scopes modify the token graph; they should not introduce independent component-specific palettes.
