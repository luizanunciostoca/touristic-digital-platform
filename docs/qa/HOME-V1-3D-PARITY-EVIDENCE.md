# Home V1 → V2 3D Perspective Parity Evidence

## Scope

This evidence covers the V1 home-map 3D perspective contract restored by PR #42.

Canonical base before the change:

`59899a0bfd4b9d1f90945d71b8220275b07c8700`

## Restored contract

- `#toggle-3d-mode` is available in the existing home map controls.
- The control reuses the canonical Mapbox instance already owned by the application; it does not create a second map or switch provider ownership.
- Active state reproduces the frozen V1 contract through `map-3d-mode`, `navigation-3d-active`, `data-3d-view`, and `aria-pressed`.
- Perspective changes are limited to the existing Mapbox camera through `easeTo`.
- A known non-Mapbox fallback fails closed by disabling the 3D control.
- Cleanup removes active state and event handling.

## Validation evidence

Temporary isolated validation run `34737739938` completed successfully before this evidence commit. The run used the repository-pinned toolchain and confirmed:

- Prettier formatting: PASS
- `git diff --check`: PASS
- `pnpm --filter @touristic/morro-digital-platform test`: PASS
- `pnpm --filter @touristic/morro-digital-platform build`: PASS

The validation helper removed itself after completion and is not part of the final functional diff.

Earlier stale-head failures were corrected before this evidence commit: an undeclared `jsdom` test dependency was removed in favor of repository-compatible DOM mocks, and a TypeScript mock typing error that blocked the workspace build was fixed.

## Safety boundary

- No production deployment or production mutation.
- No Release Promotion Gate execution.
- No credential, secret, payment, or financial changes.
- No external side effects beyond normal GitHub branch/PR validation.

## Final acceptance

Merge is allowed only after the repository's official Quality Gate and applicable browser regression workflows pass on the exact final PR head.
