# Workflow hardening status

## Coordination baseline

This file describes the stacked CI hardening layer prepared after canonical recovery PR #286. The common `main` baseline at preparation time is `ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6`, but #286 is the immediate PR base until it is promoted.

PR #286 remains sole owner of the canonical Quality topology, repository-governance checker, exact-SHA Release Promotion Gate and restore runbook. This layer adds supply-chain hardening, domain trigger/path reconciliation, one-shot cleanup and local reproducibility without creating a competing Quality or release workflow.

## Workflow inventory after this layer

After removing the three historical V2 capture one-shots and using #286's single Release Promotion Gate, the stacked tree contains 39 workflow files.

All 39 workflow files were included in the hardening pass. External GitHub Actions references in the current stacked tree use reviewed immutable commit SHAs, and `pnpm ci:supply-chain:strict` is now part of the canonical full quality contract.

### Canonical/domain hardening

The canonical Quality/Release, Auth, Business, CRM, Map, Payments and Ticketing workflows were reviewed for supply-chain references and for trigger/path drift against the execution graph. Notable fixes include:

- restoring all three Map regressions from historical `feat/mapbox-gl-runtime` push targets to `main`;
- removing broad `MASTER-MIGRATION-TRACKER.md` triggers from runtime-heavy Payments/Ticketing gates where they caused unrelated executions;
- expanding composed Auth/Business/CRM/Payments filters to include packages, services, runtime tooling and manifests actually built or exercised;
- expanding Payments M149 Browser Checkout to observe its Auth/Business/CRM/Financial/Ordering runtime graph;
- keeping Platform contracts permanent through `pnpm architecture:check` → `pnpm platform:contracts:check`, global Quality and the exact-SHA Release Promotion Gate rather than creating a weaker duplicate Platform workflow.

### Specialized browser/evidence hardening

The previous specialized migration set is complete. These 18 permanent evidence workflows were read before modification, had their external Actions pinned, and had path filters reconciled where their browser/runtime graph required it:

- `assistant-photo-browser-contract.yml`
- `assistant-voice-browser-contract.yml`
- `business-dashboard-browser-contract.yml`
- `business-dashboard-client-contract.yml`
- `business-live-runtime-browser-contract.yml`
- `business-onboarding-adapter-browser-contract.yml`
- `business-onboarding-browser-contract.yml`
- `business-onboarding-commercial-browser-contract.yml`
- `business-onboarding-lifecycle-browser-contract.yml`
- `business-onboarding-profile-browser-contract.yml`
- `business-onboarding-route-browser-contract.yml`
- `business-onboarding-workspace-browser-contract.yml`
- `business-production-profile-browser-contract.yml`
- `crm-equivalence-browser-contract.yml`
- `crm-lead-detail-browser-contract.yml`
- `navigation-accessibility-baseline.yml`
- `navigation-visual-baseline.yml`
- `search-browser-contract.yml`

These remain path-scoped evidence workflows, not global required branch-protection contexts.

## Supply-chain contract

Global Quality runs `pnpm ci:supply-chain:strict` after `pnpm ci:governance:check`. The root `pnpm check` also enforces strict supply-chain validation.

Strict mode fails on:

- external GitHub Actions not pinned to immutable 40-character commit SHAs;
- mutable `docker://` action references without SHA-256 digest;
- `pull_request_target`;
- `permissions: write-all`;
- missing explicit top-level `permissions`;
- `secrets: inherit`.

`pnpm ci:supply-chain` remains available as a diagnostic inventory command. Dependabot is configured for `github-actions` so later pin changes are reviewable.

Container service images such as `mysql:8.4` are outside the Action-reference contract and remain a separate digest-pinning hardening concern.

## Secrets and provider prerequisites

The known CI secret name is `MAPBOX_PUBLIC_TOKEN_CI`. Its value must never enter repository content or diagnostics. Repository-secret metadata cannot currently be listed through the connected integration.

Mapbox-authenticated evidence remains specialized and must never make global Quality depend on a provider secret.

## Promotion boundary while Actions is broken

- #286 remains the first recovery probe and must stay unmerged until #282 is resolved.
- This stacked layer must also stay draft/unmerged while its official exact-head gates cannot execute.
- Deleted `BuildFailed` startup failures are not product test results.
- Do not enable required `quality` branch protection until GitHub can create that named context again.
- Do not use direct merge as a CI bypass.

After #286 is promoted, retarget/recompare this PR to resulting `main`, require 0-behind/mergeable state, then run fresh exact-head `quality` plus every affected path-scoped contract before promotion.
