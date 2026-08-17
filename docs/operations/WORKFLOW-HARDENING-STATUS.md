# Workflow hardening status

## Baseline

Prepared against `main` commit `ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6` on 2026-08-17 while GitHub Actions event execution was still failing through deleted workflow registration `334828426` (`BuildFailed`). Revalidate the base SHA before promotion.

The branch contains CI, repository-governance, operational documentation and quality-tooling changes only. It does not intentionally change product runtime or business rules.

## Current workflow inventory

The preparation branch contains 40 workflow files after removal of three one-shot V2 capture workflows and addition of the permanent Platform and manual Release Smoke gates.

### Hardened in this preparation

The following 22 workflows are in the hardened set: their relevant external Actions are pinned to reviewed immutable commits, and their trigger/path contracts were reconciled where the workflow's execution graph was audited in this preparation.

- `quality.yml`
- `platform-contract.yml`
- `release-smoke-gate.yml`
- `auth-integration-contract.yml`
- `auth-login-browser-contract.yml`
- `business-auth-integration-contract.yml`
- `crm-platform-auth-integration-contract.yml`
- `map-provider-regression.yml`
- `map-tour-browser-regression.yml`
- `mapbox-visual-contract-regression.yml`
- `payments-browser-checkout-contract.yml`
- `payments-operational-ledger-contract.yml`
- `payments-persistence-integration.yml`
- `payments-reconciliation-contract.yml`
- `payments-refund-command-contract.yml`
- `payments-sandbox-provider-contract.yml`
- `payments-settlement-contract.yml`
- `payments-subscription-recurrence-contract.yml`
- `payments-verified-outcome-contract.yml`
- `payments-verified-webhook-contract.yml`
- `ticketing-m147-contract.yml`
- `ticketing-m148-transaction-contract.yml`

Notable trigger fixes include restoring all three Map regressions from the historical `feat/mapbox-gl-runtime` push target to `main`, removing broad `MASTER-MIGRATION-TRACKER.md` triggers from runtime-heavy Payments/Ticketing gates, and expanding composed Auth/CRM/Payments path filters to include the packages/services they actually build or exercise.

### Specialized migration set

The following 18 specialized workflows remain outside the completed SHA-pinning/path-filter migration set. They remain permanent evidence workflows, not globally required branch-protection contexts:

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

Do not rewrite these large browser contracts mechanically. For each file, read the full workflow, preserve its evidence logic, reconcile `paths` against the packages/services/runtime actually built, then replace mutable external Action references with reviewed immutable SHAs.

## Supply-chain contract

`pnpm ci:quality` now calls `pnpm ci:supply-chain` before the existing repository quality checks. Audit mode fails on unsafe workflow configuration but reports, rather than blocks on, remaining mutable Action references.

`pnpm ci:supply-chain:strict` is already available and is the target end-state. Promotion rule:

1. migrate all 18 specialized workflows;
2. run strict mode and require zero mutable external Action references;
3. only then change the canonical `ci:quality` command from audit mode to strict mode;
4. verify the exact-head `quality` check in GitHub Actions before making it a required branch-protection context.

Dependabot is configured for the `github-actions` ecosystem so later pin changes are reviewable.

## Secrets and provider prerequisites

The known CI secret name found in current workflows is `MAPBOX_PUBLIC_TOKEN_CI`. Its value must never be copied into repository content or diagnostics. Repository-secret metadata could not be listed through the current GitHub integration, so availability remains a settings/readback check for Actions restoration.

Mapbox-authenticated evidence is specialized and must not be used to make the global `quality` context depend on a provider secret.

## Required-check policy

The stable global required context should be `quality` only after a real exact-head run succeeds again. Path-scoped domain contracts are required by promotion procedure when their affected paths trigger; they must not all be configured as global required checks because unrelated PRs can legitimately skip them.

`platform-contract` is path-scoped. `release-smoke` is manual and should be executed on an exact release-candidate head.

## Promotion boundary while Actions is broken

- Keep the CI preparation PR draft/unmerged.
- Keep feature/product PRs unmerged when their official gates cannot execute.
- Do not treat deleted `BuildFailed` startup failures as product test results.
- Do not enable a required `quality` context in branch protection until GitHub can actually create that named check again.
- Do not use direct merge as a CI bypass.

When Actions returns, follow `CI-RESTORE-PROMOTION.md` exactly and discard historical green evidence in favor of exact-head reruns.
