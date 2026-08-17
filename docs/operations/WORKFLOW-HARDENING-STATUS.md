# Workflow hardening status

## Coordination baseline

This file describes the stacked CI hardening layer prepared after canonical recovery PR #286. The common `main` baseline at preparation time is `ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6`, but #286 is the immediate PR base until it is promoted.

PR #286 remains sole owner of the canonical Quality topology, repository-governance checker, exact-SHA Release Promotion Gate and restore runbook. This layer adds supply-chain hardening, domain trigger/path reconciliation, one-shot cleanup and local reproducibility without creating a competing Quality or release workflow.

## Workflow inventory after this layer

After removing the three historical V2 capture one-shots and using #286's single Release Promotion Gate, the stacked tree contains 39 workflow files.

### Hardened set

The following 21 workflows are in the hardened set. Their relevant external Actions use reviewed immutable commit SHAs, and their trigger/path contracts were reconciled where the execution graph was audited:

- `quality.yml`
- `release-promotion-gate.yml`
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

Platform contracts remain permanent through `pnpm architecture:check` → `pnpm platform:contracts:check`, validated by the global Quality Gate and exact-SHA Release Promotion Gate. No weaker duplicate Platform workflow is introduced.

Notable trigger fixes include restoring all three Map regressions from historical `feat/mapbox-gl-runtime` push targets to `main`, removing broad `MASTER-MIGRATION-TRACKER.md` triggers from runtime-heavy Payments/Ticketing gates, and expanding composed Auth/CRM/Payments filters to include packages/services actually built or exercised. Payments M149 now observes its Auth/Business/CRM/Financial/Ordering runtime graph.

### Specialized migration set

The following 18 specialized workflows remain outside the completed SHA-pinning/path-filter migration set:

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

These remain permanent evidence workflows, not global required contexts. Do not rewrite them mechanically: read each full workflow, preserve evidence logic, reconcile `paths` to the actual execution graph, then replace mutable external Action refs with reviewed SHAs.

## Supply-chain contract

Global Quality now runs `pnpm ci:supply-chain` after `pnpm ci:governance:check`. The root full `pnpm check` also includes both governance and supply-chain audit.

Audit mode fails on unsafe configuration (`pull_request_target`, `permissions: write-all`, missing top-level permissions, `secrets: inherit`) while reporting remaining mutable external refs. `pnpm ci:supply-chain:strict` already exists as the end-state but is not required yet.

Strict promotion rule:

1. migrate all 18 specialized workflows;
2. run strict mode and require zero mutable external Action refs;
3. only then replace audit mode with strict enforcement in the global Quality contract;
4. verify a real exact-head `quality` check before branch-protection policy changes.

Dependabot is configured for `github-actions` so later pin updates are reviewable.

## Secrets and provider prerequisites

The known CI secret name is `MAPBOX_PUBLIC_TOKEN_CI`. Its value must never enter repository content or diagnostics. Repository-secret metadata cannot currently be listed through the connected integration.

Mapbox-authenticated evidence remains specialized and must never make global Quality depend on a provider secret.

## Promotion boundary while Actions is broken

- #286 remains the first recovery probe and must stay unmerged until #282 is resolved.
- This stacked layer must also stay draft/unmerged while its official exact-head gates cannot execute.
- Deleted `BuildFailed` startup failures are not product test results.
- Do not enable required `quality` branch protection until GitHub can create that named context again.
- Do not use direct merge as a CI bypass.
