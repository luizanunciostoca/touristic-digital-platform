# Onboarding V2 modular architecture

The public onboarding runtime is split into explicit responsibilities without changing the user-visible V1-compatible journey.

## Modules

- `public-onboarding.ts` — lifecycle/orchestration only.
- `public-onboarding-storage.ts` — persistence key, completion read/write and browser storage resolution.
- `public-onboarding-dialog.ts` — dialog markup, background inert handling, focus restoration and keyboard focus trap.
- `public-interactive-tour.ts` — guided tutorial runtime and step presentation.

## Accessibility boundary

The dialog module owns `role="dialog"`, `aria-modal`, labelled/described relationships, fallback focusability, background inert state, Escape handling and cyclic Tab focus. The controller does not duplicate those mechanics.

## Compatibility

Existing exports for the onboarding storage key and persistence helpers continue to be re-exported from `public-onboarding.ts`, so browser/runtime consumers do not need a breaking import migration.

The frozen V1 CSS and public onboarding/tour visual contracts remain unchanged. Existing first-run, locale, responsive and assistant-visibility browser workflows remain the integration gate.

## Regression rule

`src/ux/onboarding-modular-v2-contract.test.ts` prevents the controller from absorbing storage or dialog DOM responsibilities again.
