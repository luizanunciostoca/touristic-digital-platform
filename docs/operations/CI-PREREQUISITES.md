# CI prerequisites and reproducible gates

## Purpose

This document records only the prerequisites needed to reproduce repository CI safely. It intentionally contains secret **names**, never secret values.

## Canonical local commands

Run from the repository root with Node.js 22+ and pnpm 10.15.0:

```bash
pnpm install --frozen-lockfile
pnpm ci:supply-chain
pnpm ci:quality
pnpm ci:platform
pnpm ci:smoke
```

`pnpm ci:supply-chain:strict` is the zero-tolerance target for external GitHub Actions references. Audit mode is kept available while the historical workflow set is migrated to immutable pins; it still fails immediately on unsafe constructs such as `pull_request_target`, `permissions: write-all`, missing top-level permissions, or `secrets: inherit`.

## GitHub Actions permissions

Permanent workflows should default to:

```yaml
permissions:
  contents: read
```

Additional permissions must be granted only to the job/workflow that requires them. `pull_request_target`, `write-all`, broad inherited secrets and direct product writes from validation workflows are not part of the CI contract.

## Immutable Action references

Recovery/control workflows pin external Actions to immutable commits. The reviewed v4 commit targets on 2026-08-17 are:

- `actions/checkout`: `11d5960a326750d5838078e36cf38b85af677262`
- `actions/setup-node`: `49933ea5288caeca8642d1e84afbd3f7d6820020`
- `actions/cache`: `0057852bfaa89a56745cba8c7296529d2fc39830`
- `pnpm/action-setup`: `b906affcce14559ad1aafd4ab0e942779e9f58b1`
- `actions/upload-artifact`: `ea165f8d65b6e75b540449e92b4886f43607fa02`

Dependabot is configured for the `github-actions` ecosystem so pin updates can arrive as reviewable PRs instead of mutable tag movement.

## Repository secret names

The current workflow search found the following repository-level CI secret name:

- `MAPBOX_PUBLIC_TOKEN_CI` — consumed by specialized Map/Navigation/Assistant browser evidence workflows. It is **not** required by the canonical `quality`, `platform-contract`, or `release-smoke` gates.

The GitHub integration currently cannot list repository secret metadata, so presence must be verified in repository settings after Actions execution is restored. Never copy the value into issues, logs, docs, PR bodies, workflow defaults, artifacts, or screenshots.

## Specialized runner prerequisites

Browser evidence workflows may install Playwright/Chromium and should remain path-scoped. Persistence/integration workflows may require their declared MySQL service. These specialized contracts are permanent evidence but are not globally required branch-protection contexts.

## Restore validation order

1. `pnpm ci:supply-chain` locally.
2. `pnpm ci:quality` locally.
3. `pnpm ci:platform` locally.
4. `pnpm ci:smoke` locally.
5. After GitHub Actions returns, require an exact-head named `quality` run.
6. Require the affected path-scoped domain contracts that actually trigger for that diff.
7. Run `platform-contract` when its paths are affected.
8. Run manual `release-smoke` on the exact release-candidate head.
9. Only then promote through protected PR flow.
