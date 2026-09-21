# Active CSS governance — UX Design V2

The active tourist CSS surface is governed separately from frozen V1 evidence.

## Governed runtime files

The Quality Gate now covers the active base stylesheet together with Design System V2, Premium UX, Assistant V2, Carousel V2, Commerce, Ticketing, Explore and Navigation map styles.

The contract forbids:

- `transition: all`;
- arbitrary three-or-more-digit numeric `z-index` declarations.

## `!important` boundary

`!important` is not a general styling tool. It is allowed only where a migrated surface must neutralize immutable V1 selectors or where the utility itself requires hard hiding.

The active base stylesheet is reduced to exactly the `.hidden` and `.sr-only` utility declarations. Remaining compatibility declarations are isolated to Premium UX, Assistant V2, Explore and Navigation map bridges and are documented as legacy interoperability debt.

Commerce, Ticketing, Design System V2 and Carousel V2 must contain no `!important` declarations.

## Frozen legacy

`public/legacy/**` remains outside this rule because it is audit evidence and is protected by the V1 byte-for-byte snapshot. New work must not add to that directory.
