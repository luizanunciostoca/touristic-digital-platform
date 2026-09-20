# Navigation Banner V2

## Scope

This wave promotes the active Navigation guidance presentation from runtime-injected, hardcoded CSS to the Morro Digital UX Design V2 system.

The frozen V1 files under `apps/morro-digital-platform/public/legacy/**` remain immutable migration evidence. They are not rewritten by this change.

## Runtime authority

- `navigation-guidance-ui.ts` owns navigation state and content only.
- `design-system-v2.css` owns semantic Navigation tokens.
- `premium-ux-v2.css` owns the post-legacy Navigation V2 presentation bridge.
- `app-shell.ts` composes the shared V2 action/icon primitives and scoped live-region semantics.

Runtime JavaScript no longer creates a `<style>` element for the guidance banner.

## Accessibility contract

- instruction updates are exposed through a scoped `role="status"` live region;
- the live region does not contain the minimize/end interactive controls;
- the minimize control retains the 44 px shared target and declares `aria-controls`;
- the end action uses the shared destructive button primitive;
- forced-colors receives explicit system-color presentation;
- reduced-motion remains controlled by the Design System V2 global motion contract.

## Transitional CSS boundary

A small number of `!important` declarations remain in the post-legacy bridge solely to neutralize declarations in the immutable V1 checkpoint. They are not new product styling authority and must disappear when the runtime legacy bundle is split by migrated surface.

No arbitrary numeric Navigation z-index remains in the runtime controller; the surface consumes `--md-layer-navigation`.

## Verification

The permanent contract `src/ux/navigation-banner-v2-contract.test.ts` fails if:

- runtime-injected style authority returns;
- hardcoded Navigation colors/z-index values return to the controller;
- required semantic Navigation tokens disappear;
- the shell loses its shared primitive or live-region composition.

Browser/visual Navigation workflows remain the final integration evidence before merge.
