# Wave 8 — Analytics Consent UX Evidence

## Scope

Wave 8 closes the end-user Analytics consent gap without weakening the existing privacy boundary.

The canonical default remains unknown. The collector still drops events while consent is unknown or denied.

## End-user choices

The public Home runtime and Ticketing runtime now install the same consent/preferences surface.

The surface provides three explicit actions:

- Allow analytics -> calls setConsent("granted");
- Necessary only -> calls setConsent("denied");
- Not now -> leaves the state unchanged, therefore unknown remains fail-closed when no earlier choice exists.

No timer, bootstrap routine, page view, onboarding action, or browser notification permission implicitly grants Analytics consent.

After an explicit decision the surface collapses into a privacy control that can reopen the preferences UI.

## Privacy and accessibility

The UI:

- never sends search text, Assistant message text, payment data, or other personal data;
- exposes a dialog role only while the preference panel is expanded;
- keeps allow and deny as explicit peer choices;
- supports Portuguese, English, and Spanish based on the document locale;
- re-renders when the document language changes;
- keeps a no-decision path that does not change consent;
- remains usable with forced-colors and reduced-motion preferences.

## Tests

The Analytics unit contract verifies that:

- later does not call setConsent;
- denied calls setConsent("denied");
- granted calls setConsent("granted");
- consent preference copy is localized for pt/en/es.

Production Analytics activation still depends on infrastructure/database configuration and is tracked separately from the existence of this consent UX.
