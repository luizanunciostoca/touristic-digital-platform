# Wave 8 — Analytics Consent UX Evidence

## Scope

Wave 8 closes the transferred end-user Analytics consent gap without changing the privacy-safe default.

## Verified contract

- consent still defaults to `unknown`;
- the canonical collector still drops events while consent is `unknown` or `denied`;
- the preference surface writes only explicit `granted` or `denied`;
- `later` leaves the existing state unchanged;
- Home and Ticketing both install the same canonical preference surface;
- a collapsed Privacy trigger remains available after a choice so the user can revise it;
- no Push permission or production provider is activated by this work.

## Localization and accessibility

The surface supports the four public browser locales:

- `pt-BR`;
- `en-US`;
- `es-ES`;
- `he-IL` (including legacy `iw` browser language alias).

The CSS uses logical inline positioning for RTL, minimum touch targets, reduced-motion handling and forced-colors handling.

## PWA behavior

`privacy-preferences.css` is included in the service-worker precache so the privacy surface remains styled in the offline shell and does not depend on a previous runtime cache fill.

## Data minimization

This change does not expand the Analytics schema or payload. Existing instrumentation continues to exclude raw search text, Assistant messages, card data, payment amounts and unnecessary personal data.

## Non-blocking presentation

The privacy preference control starts collapsed, including when consent is `unknown`.
This is intentional: `unknown` already disables Analytics at the collector boundary, so blocking Home, onboarding, map or Assistant interactions is unnecessary.
The persistent Privacy trigger lets the visitor open the preference surface and explicitly choose `granted` or `denied` at any time.

## Release boundary

This closes the browser consent UX implementation gap only. Production Analytics activation still requires the production environment/database to be configured and verified by the Wave 8 infrastructure gates.
