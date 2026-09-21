# Runtime modes — UX Design V2

The public tourist experience has one presentation-mode contract:

- `discover`
- `place`
- `navigation`
- `tour`
- `commerce`
- `assistant`

The Home runtime derives the active mode from existing product state and publishes it as `body[data-md-mode]`. The presenter is presentation-only and does not become a second source of business/navigation state.

Standalone Commerce and Ticketing entrypoints declare `data-md-mode="commerce"` directly because they do not use the Home DOM observer.

Premium UX contains the visual composition for every mode. Navigation has highest precedence, followed by Tour, Place, Commerce, Assistant and Discover fallback, preventing overlapping surfaces from producing ambiguous presentation state.
