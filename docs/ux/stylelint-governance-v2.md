# UX Design V2 — Stylelint governance

Stylelint is now a required CSS quality gate for the V2 visual authority and
migrated Tourist UI surfaces.

## Enforced now

The exact pinned CLI version is executed against:

- `public/design-system-v2.css`;
- `public/premium-ux-v2.css`;
- `public/commerce.css`;
- `public/ticketing.css`.

The base rules reject invalid CSS, duplicate declarations and unknown
properties/functions/selectors. V2 governance additionally rejects
`transition: all` and large arbitrary numeric z-index values.

Commerce and Ticketing are fully migrated consumers, so their stricter contract
also rejects:

- `!important`;
- hexadecimal colors outside semantic-token authority;
- pixel-based `font-size`;
- independent `font-family` stacks.

Their only accepted font-family authority is
`var(--md-font-family-sans)`.

## Explicit transition allowlist

`.stylelintignore` excludes frozen `public/legacy/**` and the remaining
transitional runtime bridges. This is intentional: the V1 snapshot remains
evidence and must not be mass-rewritten just to satisfy a new linter.

A transitional file leaves the allowlist only after its component wave has:

1. frozen visual/browser evidence;
2. introduced the V2 consumer;
3. passed accessibility and functional parity;
4. removed the corresponding legacy bridge.

## Quality Gate

`pnpm css:stylelint` is an explicit Quality Gate step and is also part of the
root `pnpm check` chain. The Stylelint package version is pinned in the
command so CI does not float to a newer major/minor implicitly.
