# Assistant V1 Personalized Greeting / Menu Parity Recertification

Date: 2026-09-17

## Scope

This evidence records a residual V1 → V2 parity gap found after the broader Assistant equivalence milestone had already been marked PASS.

The canonical V1 source was revalidated directly from `morro-de-sao-paulo-digital-main.zip`.

Relevant V1 sources:

- `js/assistant/assistant-dialog/assistant-dialog.js`
- `js/assistant/assistant-dialog/proactive-suggestions.js`
- `js/assistant/assistant-context/user-profile.js`

## V1 observable contract

For a greeting intent, V1:

1. obtains the personalized profile greeting from `getPersonalizedSuggestions().greeting`;
2. appends a continuation message when `lastPlace` exists;
3. otherwise appends a recent-category continuation when `lastCategory` and recent history exist;
4. uses `getContextualMenu()` only to prioritize readable contextual labels;
5. maps contextual labels that match main-menu labels back to the canonical main-menu action value;
6. keeps unmatched contextual labels as readable label/value actions;
7. appends every missing canonical main-menu option, so the full V1 menu remains available after a greeting.

The contextual menu itself remains capped at eight buttons. That cap does **not** apply to the final merged greeting options returned by `assistant-dialog.js`.

## Residual V2 gap

The V2 browser intelligence adapter returned:

- `text: menu.intro` instead of the already-ported V1 personalized profile greeting;
- only `menu.buttons`, preserving the eight-button contextual cap instead of merging back the complete main menu;
- no `lastPlace` / recent-category continuation text.

The profile implementation already contained the V1 personalized greeting variants for tourist, resident, returning, romantic, adventurous and family profiles, including PT/EN/ES/HE. The missing behavior was composition/wiring, not missing editorial copy.

## Correction

This front:

- makes `getPersonalizedSuggestions(locale)` accept an explicit presentation locale without mutating persisted profile language;
- restores V1 personalized greeting composition in `assistant-v1-intelligence-adapter.ts`;
- restores last-place and recent-category continuation copy in PT/EN/ES/HE;
- merges contextual labels first and then completes the full canonical main menu;
- preserves canonical main-menu values for recognized category labels;
- keeps weather as contextual prioritization metadata/options instead of replacing the V1 profile greeting;
- adds unit coverage and deterministic Chromium regression;
- adds `Assistant Input Menu Flow V1 Parity` to Final Release Acceptance.

## Acceptance

This correction is only considered complete when the final authored exact-head passes:

- Quality Gate;
- Assistant Input Menu Flow V1 Parity;
- all other applicable PR checks;
- review reconciliation with no unresolved blocking thread.

After merge, Final Release Acceptance must rerun the deterministic matrix on the merge SHA and prove staging `releaseSha` equals that exact main SHA before this residual parity correction is considered released to staging.
