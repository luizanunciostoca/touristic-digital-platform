# CI prerequisites and reproducible gates

## Purpose

This document records only the prerequisites needed to reproduce repository CI safely. It intentionally contains secret **names**, never secret values.

This hardening is stacked after the canonical Actions recovery preparation in PR #286. PR #286 remains the first recovery probe; this layer must not compete with its Quality/release topology.

## Canonical local commands

Run from the repository root with Node.js 22+ and pnpm 10.15.0:

```bash
pnpm install --frozen-lockfile
pnpm ci:quality
pnpm ci:platform
pnpm ci:smoke
```

`pnpm ci:quality` executes the full repository `check`: formatting, architecture/Platform contracts, Feature Registry, CI governance, workflow supply-chain audit, lint, typecheck, test and build.

For diagnostics only, `pnpm ci:supply-chain` can be run independently. `pnpm ci:supply-chain:strict` is the zero-tolerance target for external GitHub Actions references. Audit mode is intentionally retained while the specialized historical workflow set is migrated to immutable pins; it still fails immediately on unsafe constructs such as `pull_request_target`, `permissions: write-all`, missing top-level permissions, or `secrets: inherit`.

`pnpm ci:smoke` runs the full local quality gate first and then starts the application runtime locally to verify non-empty `/runtime-config.js` and `/apps/morro-digital-platform/public/index.html` responses. The hosted release authority remains PR #286's exact-SHA `Release Promotion Gate / release / smoke`.

## GitHub Actions permissions

Permanent workflows should default to:

```yaml
permissions:
  contents: read
```

Additional permissions must be granted only to the job/workflow that requires them. `pull_request_target`, `write-all`, broad inherited secrets and direct product writes from validation workflows are not part of the CI contract.

## Immutable Action references

The canonical Quality/Release gates and the domain contracts hardened by this preparation pin external Actions to reviewed immutable commits:

- `actions/checkout`: `11d5960a326750d5838078e36cf38b85af677262`
- `actions/setup-node`: `49933ea5288caeca8642d1e84afbd3f7d6820020`
- `actions/cache`: `0057852bfaa89a56745cba8c7296529d2fc39830`
- `pnpm/action-setup`: `b906affcce14559ad1aafd4ab0e942779e9f58b1`
- `actions/upload-artifact`: `ea165f8d65b6e75b540449e92b4886f43607fa02`

Dependabot is configured for the `github-actions` ecosystem so pin updates arrive as reviewable PRs instead of mutable tag movement.

The repository is **not yet declared fully SHA-pinned**. Eighteen specialized browser/evidence workflows remain visible to `ci:supply-chain` audit mode and are tracked in `WORKFLOW-HARDENING-STATUS.md`. Strict mode must not become required until the mutable-reference count reaches zero.

## Repository secret names

The current workflow search found the following repository-level CI secret name:

- `MAPBOX_PUBLIC_TOKEN_CI` — consumed by specialized Map/Navigation/Assistant browser evidence workflows. It is not required by the global Quality Gate or exact-SHA Release Promotion Gate.

The GitHub integration currently cannot list repository secret metadata. Presence must be verified in repository settings after Actions execution is restored. Never copy the value into issues, logs, docs, PR bodies, workflow defaults, artifacts or screenshots.

## Specialized runner prerequisites

Browser evidence workflows may install Playwright/Chromium and should remain path-scoped. Persistence/integration workflows may require their declared MySQL service. These specialized contracts are permanent evidence but are not globally required branch-protection contexts.

Container service images such as `mysql:8.4` remain tag-pinned, not digest-pinned. Digest migration requires compatibility validation and is not silently enforced by the current Action-reference auditor.

## Restore validation order

1. Promote #286 first only after a real exact-head `Quality Gate / quality` succeeds.
2. Verify resulting `main` Quality and exact-SHA `Release Promotion Gate / release / smoke` as defined by #286.
3. Retarget/recompare this stacked hardening layer to the resulting `main` and require 0-behind/mergeable state.
4. Run full `quality` on its exact head plus every affected path-scoped Auth/Business/CRM/Payments/Ticketing contract.
5. Keep supply-chain strict mode informational until all 18 specialized workflows are migrated.
6. Promote only through protected PR flow; never use direct merge as a CI bypass.
