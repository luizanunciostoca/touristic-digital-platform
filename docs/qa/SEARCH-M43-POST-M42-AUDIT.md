# Search M43 — Post-M42 Equivalence Audit

## Scope

M43 is a read-only equivalence audit over `main` after M42. It does not add Search behavior and does not promote `FEATURE-0002` by documentation alone.

Audited merge base:

- M42 squash merge: `5e66720d7c3c68086e492961162eb612fd7b8858`
- frozen V1 source: `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`

## Evidence chain

The audit cross-checks:

- M36 baseline and migration matrix;
- M37 deterministic local Search core;
- M38 shared immutable V1 catalog and exact inventory;
- M39 Mapbox Search provider contract;
- M40 local-first Search application port;
- M41 structured result presentation and PT/EN/ES/HE copy;
- M42 browser integration through Assistant → Details → Navigation.

## Post-M42 result

The 22-row core matrix resolves to:

- `PASS`: 20
- `PARTIAL`: 1
- `GAP`: 0
- `N/A`: 1
- total: 22

### Remaining PARTIAL — Dice fuzzy fallback

V1-equivalent fuzzy place resolution still exists and is executable in the Assistant resolver at threshold `0.55`, but the Search-owned local core (`@touristic/search`) currently stops at deterministic exact/alias/prefix/contains/tag/area matching.

That means fuzzy behavior is available in V2 but not owned by the Search query port. The matrix therefore cannot mark this row `PASS` yet.

The next implementation milestone must port/reuse the proven Dice fallback into the Search boundary without changing deterministic precedence:

1. exact;
2. alias;
3. partial/prefix/contains behavior already frozen by M37;
4. fuzzy only after deterministic local matching fails;
5. V1 threshold `0.55`;
6. no fuzzy result may outrank an existing deterministic result.

Executable tests must freeze typo tolerance and reject below-threshold candidates.

### N/A — standalone Search UI keyboard/accessibility states

M36 conservatively recorded a `GAP` because no dedicated Search UI baseline had been frozen. M41 and M42 completed the consumer audit and proved the actual V1-equivalent product path is Search presented through the existing Assistant option surface, not a separate standalone Search modal/input owned by `FEATURE-0002`.

M42 exercises that production Assistant DOM and option event path in Chromium. Accessibility of the Assistant surface remains owned by `FEATURE-0004`; a new standalone Search UI would be new product scope rather than V1 equivalence. The row is therefore reclassified `N/A`.

## Promotion decision

`FEATURE-0002` must remain unpromoted after M43. Documentation cannot make the feature equivalent while the fuzzy Search-owned contract is still partial.

The next correct order is:

1. implement Search-owned V1 Dice fuzzy fallback with executable parity tests;
2. run the full Quality Gate and relevant Search/Assistant browser regressions on one final head;
3. rerun this 22-row matrix;
4. only if all applicable rows are `PASS`, update `docs/features/registry.json` to `equivalent` with behavior/API equivalence true;
5. do not claim a standalone Search visual surface that did not exist in the audited V1 contract.

## Exit gate

M43 may merge when this audit and the updated matrix contain no implementation changes, the official Quality Gate is green, and the diff contains only permanent documentation.
