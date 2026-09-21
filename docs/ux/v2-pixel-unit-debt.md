# V2 pixel-unit debt reduction

The active Tourist UI now treats arbitrary pixel geometry as migration debt rather than a default authoring unit.

## Migrated surfaces

This wave converts the remaining obvious fixed geometry in the active V2-owned surface set:

- Design System elevations, modal viewport offsets, safe-area fallbacks and pill radius;
- Premium UX outdoor shadow fallback;
- Explore blur, compact breakpoint and forced-colors focus outline;
- Navigation user-marker dimensions and drop shadows;
- Commerce press offset.

Equivalent values use `rem` so the interface scales with user text/root-size preferences. The only permitted `px` literal in the governed surface set is the deliberate `1px` optical hairline used for borders and inset outlines.

## Guardrail

`src/ux/v2-pixel-unit-debt-contract.test.ts` scans the active V2-owned CSS files and fails if a non-hairline pixel literal reappears.

Frozen `public/legacy/**` evidence is explicitly outside this rule and remains byte-identical.
