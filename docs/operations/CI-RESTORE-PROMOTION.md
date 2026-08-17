# CI Restore → Checks → Promotion

Date: 2026-08-17
Repository: `luizidebook/touristic-digital-platform`
Scope: CI, Quality and repository governance only.

## 1. Source-of-truth snapshot

At preparation time:

- `main`: `ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6`;
- classic branch protection on `main`: disabled;
- repository rulesets endpoint: unavailable for this private repository on the current GitHub plan;
- Issue #282 remains the CI restore blocker;
- deleted workflow id `334828426`, path `BuildFailed`, is still the stale workflow associated with observed `startup_failure` runs;
- current `main` contains 41 workflow files;
- the Actions registry contains hundreds of historical workflow registrations, including format/fix/reconcile/prepare workflows no longer present in the current tree.

Do not use the historical Actions registry as the source of truth for current workflow files. The current Git tree is authoritative for repository content; Actions run metadata is authoritative only for execution evidence.

## 2. Canonical Quality Gate

The only globally required merge check should be the stable job context:

`quality`

The workflow is `.github/workflows/quality.yml` (`Quality Gate`). It must remain unfiltered and run for every pull request. It performs:

1. frozen-lockfile dependency installation;
2. formatting validation;
3. architecture validation, including canonical Platform contracts;
4. Feature Registry validation;
5. lint;
6. typecheck;
7. tests for non-draft PRs, pushes to `main`, and manual dispatch;
8. build for non-draft PRs, pushes to `main`, and manual dispatch.

Draft PRs may skip test/build to reduce runner consumption, but a PR must not be promoted while draft. `workflow_dispatch` exists specifically so the canonical gate can be re-executed immediately during CI recovery.

Do not make path-scoped domain workflows globally required. GitHub can leave a required path-filtered check absent/pending on unrelated PRs. Domain contracts remain conditional promotion evidence when their paths are affected.

## 3. Permanent contract topology

### Auth

Permanent:

- `auth-integration-contract.yml`;
- `auth-login-browser-contract.yml`.

Audit result: YAML structure is coherent and permissions are read-only. Path-filter debt remains where browser/runtime contracts build or execute shared Auth/Business runtime without observing every shared runtime dependency. Before treating these contracts as exhaustive affected-domain selectors, include the runtime dependencies actually consumed by each workflow, especially `services/auth/**`, `apps/morro-digital-platform/tooling/dev-server.mjs`, and the relevant API adapters.

### Business

Permanent:

- `business-auth-integration-contract.yml`;
- `business-dashboard-browser-contract.yml`;
- `business-dashboard-client-contract.yml`;
- `business-live-runtime-browser-contract.yml`;
- `business-onboarding-adapter-browser-contract.yml`;
- `business-onboarding-browser-contract.yml`;
- `business-onboarding-commercial-browser-contract.yml`;
- `business-onboarding-lifecycle-browser-contract.yml`;
- `business-onboarding-profile-browser-contract.yml`;
- `business-onboarding-route-browser-contract.yml`;
- `business-onboarding-workspace-browser-contract.yml`;
- `business-production-profile-browser-contract.yml`.

Audit result: these are real reusable browser/integration contracts, not one-shot formatters. Several call the shared `dev-server.mjs` and/or perform a full workspace build without including `dev-server.mjs` and `pnpm-lock.yaml` in their path filters. Add those dependencies to the affected workflows in a dedicated filter-hardening change; do not broaden every Business workflow to every repository path.

### CRM

Permanent:

- `crm-platform-auth-integration-contract.yml`;
- `crm-lead-detail-browser-contract.yml`;
- `crm-equivalence-browser-contract.yml`.

Audit result: the contracts are substantive and reusable. Their runtime graphs include Auth and other shared services, while current path filters focus mostly on CRM paths. `crm-platform-auth-integration-contract.yml` must observe Auth changes; the browser contracts must observe the shared runtime/API adapter paths they actually start.

### Payments

Permanent:

- `payments-persistence-integration.yml`;
- `payments-sandbox-provider-contract.yml`;
- `payments-verified-webhook-contract.yml`;
- `payments-verified-outcome-contract.yml`;
- `payments-operational-ledger-contract.yml`;
- `payments-refund-command-contract.yml`;
- `payments-reconciliation-contract.yml`;
- `payments-settlement-contract.yml`;
- `payments-browser-checkout-contract.yml`;
- `payments-subscription-recurrence-contract.yml`.

Audit result: MySQL contracts generally have good timeout, concurrency, manual dispatch and lockfile coverage. The main filter debt is in composed-runtime workflows that build Auth/Ordering/Financial/Business dependencies without observing all of them. `payments-browser-checkout-contract.yml` is the clearest example. Broad triggers on `MASTER-MIGRATION-TRACKER.md` also cause expensive unrelated domain runs; prefer the domain matrix/evidence files plus runtime sources when the tracker change does not alter executable behavior.

### Ticketing

Permanent:

- `ticketing-m147-contract.yml`;
- `ticketing-m148-transaction-contract.yml`.

Audit result: both have pull-request, `push(main)`, manual dispatch, bounded execution and MySQL-backed validation. M147 watches `docs/features/registry.json` and the global master tracker, which can cause unrelated documentation changes to launch Ticketing. Preserve runtime/package paths; narrow global documentation paths when the evidence policy no longer requires them.

### Platform

Permanent gate added by this preparation:

- `platform-contract.yml`.

It validates the existing canonical Platform contract registry/schema/runtime/evidence relationship and the `@touristic/core` lint/typecheck/test/build surface. It is path-scoped and manually dispatchable. It is not a replacement for Quality.

## 4. Specialized regression workflows

Keep as specialized/path-scoped evidence rather than global required checks:

- `assistant-photo-browser-contract.yml`;
- `assistant-voice-browser-contract.yml`;
- `search-browser-contract.yml`;
- `navigation-accessibility-baseline.yml`;
- `navigation-visual-baseline.yml`;
- `map-provider-regression.yml`;
- `map-tour-browser-regression.yml`;
- `mapbox-visual-contract-regression.yml`.

The three Map regressions still have `push` pinned to historical branch `feat/mapbox-gl-runtime`. Because they are reusable regressions, migrate their `push` target to `main` rather than deleting them. Keep `workflow_dispatch` and PR path filters.

Navigation and Assistant browser contracts are PR/manual evidence and depend on external Mapbox credentials in some cases. Do not make those checks globally required unless secret availability and deterministic skipped/success behavior are redesigned.

## 5. One-shot workflows removed

The following workflows were tied only to historical branch `feat/v1-app-shell-checkpoint` and are removed by this preparation:

- `capture-v2-accessibility.yml`;
- `capture-v2-map-ready.yml`;
- `capture-v2-text-enlargement.yml`.

Their historical runs remain Actions evidence. Removing workflow files does not delete historical run records.

Historical Actions registrations with names such as formatter, format-fix, sync, prepare or PR-specific reconcile are not current-tree CI and must not be reintroduced as permanent gates. In particular, `BuildFailed` is already a deleted workflow record and must never be recreated as a repository file.

## 6. Release smoke gate

`release-smoke-gate.yml` is manual by design. It:

1. installs from the frozen lockfile;
2. re-runs `pnpm check`;
3. starts the already-built local application runtime;
4. validates `runtime-config.js` and the public application entry over HTTP;
5. emits server diagnostics on failure;
6. always terminates the runtime.

After Platform production-readiness changes containing canonical `/healthz` and `/readyz` are merged, extend this smoke gate in a later CI-only PR to assert those endpoints and immutable release identity. Do not require endpoints that do not exist on the current `main`.

## 7. Desired classic branch protection for `main`

Rulesets are unavailable on the current private-repository plan, so use classic branch protection.

Configure:

- require a pull request before merging;
- require status checks to pass;
- required status context: `quality` only;
- require branches to be up to date before merging, if available;
- require conversation resolution before merging;
- require Code Owner review when an independent reviewer exists;
- require 1 approval when an independent reviewer exists; for a deliberately single-maintainer repository, do not create an impossible self-approval deadlock;
- dismiss stale approvals when new commits are pushed, when approvals are enabled;
- block force pushes;
- block branch deletion;
- apply/enforce the rules to administrators (`Do not allow bypassing the above settings` / equivalent UI wording);
- keep bypass/exception actors empty by default.

Do not configure Auth/Business/CRM/Payments/Ticketing/Platform path-scoped jobs as global required contexts. Their absence on an unrelated PR must not block merge.

## 8. CODEOWNERS policy

`/.github/CODEOWNERS` remains authoritative. The default owner is `@luizidebook`; CI-critical paths are explicitly owned as well:

- `/.github/workflows/`;
- `/.github/CODEOWNERS`;
- `/tooling/quality/`;
- `/docs/operations/`;
- root package/lock/workspace/Turbo/TypeScript/ESLint configuration.

Do not create a second ownership file or duplicate governance source.

## 9. Exact Actions restoration checklist

When GitHub Actions is available again, execute in this order:

- [ ] Open **Settings → Actions → General** and confirm Actions are enabled for the repository.
- [ ] Confirm repository/organization policy permits the actions used by permanent workflows: `actions/checkout`, `actions/setup-node`, `actions/cache`, `actions/upload-artifact`, and `pnpm/action-setup`.
- [ ] Keep default workflow token permissions read-only unless a specific workflow has a documented write requirement; current Quality/domain gates require read-only repository content.
- [ ] Inspect the Actions workflow list for stale `BuildFailed`. If GitHub surfaces it as active/runnable, disable/remove it in the UI. Do not create a replacement file named `BuildFailed`.
- [ ] Confirm `Quality Gate` is recognized from `.github/workflows/quality.yml` and exposes manual dispatch.
- [ ] Trigger a fresh event on the CI-governance PR head; do not rely on an old failed run.
- [ ] Verify the new run is attached to the exact current PR head SHA.
- [ ] Verify the run name is `Quality Gate` and the job/check context is exactly `quality`.
- [ ] Verify no new run uses deleted workflow id `334828426`.
- [ ] Run/confirm `Platform Contract` on the exact governance PR head.
- [ ] Manually dispatch `Release Smoke Gate` on the exact governance branch/head.
- [ ] Require all three recovery probes to complete successfully before treating Actions as restored: `quality`, `platform-contract`, `release-smoke`.
- [ ] Only after `quality` has produced a real successful context, configure classic branch protection and select `quality` as the required status check.
- [ ] Re-open branch protection settings and verify PR-only changes, no force-push, no deletion, admin enforcement, conversation resolution, and the required `quality` context.

If the fresh event still produces only `BuildFailed` `startup_failure` with no jobs, CI is not restored. Keep all production PRs unmerged and update Issue #282 with the exact run id, workflow id, event, head SHA and timestamp.

## 10. Re-run and promotion sequence

### Phase A — promote CI governance

1. Revalidate `main` SHA.
2. Rebase/update `chore/ci-restore-governance-prep` if `main` moved.
3. Generate a fresh PR event on the exact governance head.
4. Require `quality` success.
5. Require `platform-contract` success.
6. Manually require `release-smoke` success.
7. Review the PR diff and resolve conversations.
8. Enable classic `main` protection with required `quality` before merge when possible.
9. Merge the governance PR through the PR flow only; never direct-push it to `main`.
10. Confirm `main` receives a successful `Quality Gate` push run.

### Phase B — revalidate blocked product PRs

After the governance merge:

1. Revalidate current `main` and record its new SHA.
2. Update/rebase PR #268 and PR #264 onto that exact `main`; do not reuse old check evidence.
3. For each PR, record the exact new head SHA.
4. Require `quality` on the exact head.
5. Require every path-selected domain/browser/integration contract that GitHub actually schedules for that head.
6. For #268, additionally require `platform-contract` because Platform/Core/runtime hardening is in scope once the governance workflow is present.
7. Investigate any expected domain contract that does not schedule because of a path-filter gap; do not infer PASS from absence.
8. Keep the PR unmerged until missing filter coverage is either corrected in CI or replaced by an explicit manual dispatch of the permanent contract on the exact head.
9. Resolve review conversations and confirm the branch is current with `main`.
10. Merge only through the protected PR path after required evidence is green.

### Phase C — release promotion

1. Revalidate the post-merge `main` SHA.
2. Require the `Quality Gate` push run for that exact SHA.
3. Manually dispatch `Release Smoke Gate` against that exact `main` revision.
4. Run any release-specific Platform/domain contract required by the changed surface.
5. Record exact run ids and SHA in release/QA evidence.
6. Promote only when Quality, smoke and applicable contract evidence all refer to the same release lineage.

## 11. Definition of CI restored

CI is considered restored only when all conditions are true:

- a fresh PR event creates real named workflows rather than deleted `BuildFailed` startup failures;
- `quality` completes successfully on the exact PR head;
- manual workflow dispatch works;
- `platform-contract` completes successfully when applicable;
- `release-smoke` completes successfully when dispatched;
- classic `main` protection is active with `quality` required;
- force-push and deletion are blocked;
- administrator bypass is not an implicit escape path;
- subsequent production PRs are promoted only with exact-head evidence.

Until then, absence of red checks is not evidence of a green build.
