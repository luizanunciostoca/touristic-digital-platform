# Cascade Layers V2

## Runtime order

Morro Digital now establishes the runtime cascade order before any generated legacy rule:

`reset → vendor → legacy → tokens → base → components → features → utilities → overrides`.

The deterministic legacy bundle generator wraps all frozen V1 checkpoint CSS and the externalized V1 inline CSS in `@layer legacy`.

## Premium UX

The former unlayered compatibility bridge is now part of `@layer overrides`. Navigation, mode composition, one-hand ergonomics and other migrated selectors therefore rely on explicit cascade ordering rather than unlayered precedence.

## Why this matters

Before this migration, the layer architecture existed but the browser runtime remained hybrid: historical unlayered CSS outranked named V2 layers, so migrated rules had to escape the layer system. Layering the deterministic legacy bundle removes that structural exception.

## Source-of-truth boundary

Frozen files under `public/legacy/**` remain unchanged. Layering is applied only to the generated runtime artifact, so byte-level V1 evidence and rollback remain intact.

## Verification

- `legacy-css-bundle-v2-contract.test.ts` requires the generated legacy layer.
- `premium-ux-mode.test.ts` rejects the old unlayered bridge marker.
- `cascade-layers-v2-contract.test.ts` verifies the runtime order and stylesheet loading sequence.
