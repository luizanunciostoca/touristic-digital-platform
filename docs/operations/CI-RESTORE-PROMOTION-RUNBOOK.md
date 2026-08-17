# CI Restore → Checks → Promotion Runbook

Date: 2026-08-17
Repository: `luizidebook/touristic-digital-platform`
Baseline `main`: `ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6`
Tracking incident: Issue #282

## Purpose

Restore GitHub Actions without bypassing CI, prove the canonical checks on exact commit SHAs, promote the CI/governance change first, then re-run blocked product PRs against the resulting `main`.

This runbook deliberately does **not** authorize a direct merge while Actions is unavailable.

## Current incident acceptance criteria

The incident is considered restored only when a fresh repository event produces real named jobs from versioned workflows. A run from deleted workflow id `334828426` with `startup_failure` and no jobs is **not** CI evidence.

Current observations at the latest coordinator reconciliation:

- `main` is `ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6`.
- PR #268 is open/draft/mergeable and 0-behind on branch `chore/platform-production-readiness-final`; its revalidated production-readiness scope is separate from this CI change.
- PR #264 is open/draft/mergeable and 0-behind on branch `docs/feature-0010-affiliates-canonical-definition`.
- PR #288 is intentionally stacked on #264 and must not be promoted before #264.
- PR #285 is closed unmerged as a superseded CI/governance candidate. Its branch remains historical evidence only.
- No `BuildFailed` reference exists in the current versioned repository.
- Fresh connector-triggered events still resolve only to deleted workflow id `334828426` with `startup_failure`; the failure mode remains Actions execution/registration.

## Canonical Quality topology

Quality stays a **single provisioned job named `quality`**. This preserves the repository's established cost-control rule from Issue #240: avoid multiple small jobs that repeat checkout/setup/install and per-job minute rounding when the same gate can run safely in one job.

The job runs, in order:

1. frozen dependency installation;
2. formatting;
3. architecture + Platform contracts;
4. Feature Registry validation;
5. CI/repository governance validation;
6. lint;
7. typecheck;
8. full tests for non-draft PRs, pushes to `main`, and manual dispatch;
9. full build for non-draft PRs, pushes to `main`, and manual dispatch.

Draft PRs retain fast validation through typecheck. `ready_for_review` retriggers the same exact-head workflow and executes Test + Build. `workflow_dispatch` is available for administrative recovery and executes the full gate.

## Phase 1 — restore Actions administration

Repository owner/admin procedure:

1. Open **Settings → Actions → General**.
2. Confirm GitHub Actions is enabled for the repository.
3. Confirm the allowed-actions policy permits every action used by permanent workflows. At minimum the canonical gate needs `actions/checkout@v4`, `actions/setup-node@v4`, `actions/cache@v4` and `pnpm/action-setup@v4`; domain workflows also use `actions/upload-artifact@v4`.
4. Do not recreate a `BuildFailed` YAML file. It is not part of the current repository contract.
5. If the Actions UI exposes an obsolete/deleted `BuildFailed` workflow entry, disable/archive it if the UI permits. Historical deleted-workflow records may remain visible; the acceptance condition is that **new events no longer resolve exclusively to workflow id `334828426`**.
6. Verify Actions workflow permissions remain least-privilege. Permanent validation workflows need only `contents: read` unless a separately reviewed workflow explicitly documents additional permissions.
7. Do not change branch protection to allow a direct merge while restoring CI.

## Phase 2 — prove the CI infrastructure PR first

Use PR #286 / branch `chore/ci-restore-quality-governance` as the first safe probe.

1. Re-read `main` and record its exact SHA.
2. Compare #286 to `main`; make it 0-behind without force-pushing shared history.
3. Confirm #286 remains limited to CI/Quality/governance/runbook scope.
4. Convert #286 from draft to ready-for-review. `ready_for_review` is an intentional Quality Gate trigger.
5. Confirm a fresh **Quality Gate / `quality`** job exists on the exact #286 head SHA.
6. Confirm the job executes `pnpm ci:governance:check` and, because the PR is ready, executes real `pnpm test` and `pnpm build` commands.
7. Confirm there are no unexpected additional provisioned Quality jobs such as `quality / lint` or `quality / typecheck`; the canonical topology is consolidated.
8. If the only new run is still workflow id `334828426` / `startup_failure`, stop. Issue #282 remains active; do not merge.

## Phase 3 — promote the CI/governance PR

Only after Phase 2 is green:

1. Revalidate #286 is mergeable and 0-behind.
2. Record the exact green head SHA.
3. Merge through the PR flow; do not push directly to `main`.
4. Read `main` again and record the resulting merge SHA as `CI_RESTORE_MAIN_SHA`.
5. Require the push-to-`main` **Quality Gate / `quality`** job green on exactly `CI_RESTORE_MAIN_SHA`.
6. Run **Release Promotion Gate** manually from `main` with `expected_sha=CI_RESTORE_MAIN_SHA`.
7. Require `release / smoke` green. The workflow refuses promotion if the checked-out SHA or `origin/main` differs from the approved SHA, then validates Platform contracts, builds the workspace and starts/smokes the local platform surface.

The CI/governance change is promoted only after both main Quality and the explicit release smoke are green on the same exact SHA.

## Phase 4 — configure repository protection after real contexts exist

Use classic branch protection if rulesets are unavailable for the current private-repository plan.

Target: `main`.

Required configuration:

1. Require a pull request before merging.
2. Require conversation resolution before merging.
3. Require status checks before merging.
4. Globally require exactly the stable status `quality`.
5. Require branches to be up to date before merging when the GitHub UI supports it for this protection mode.
6. Block force pushes.
7. Block branch deletion.
8. Apply the protection to administrators / disable broad admin bypass where the available UI exposes that control.
9. Do not configure permanent path-scoped domain contracts as global required statuses; an unrelated PR may never emit them.
10. Keep bypass/exception lists empty by default. Any emergency exception must be temporary, named and documented.
11. If independent review is available, require one approval and Code Owner review. If this remains a single-maintainer repository, do not configure an impossible approval rule; retain PR-only changes, CODEOWNERS, required checks and no-bypass enforcement.

## Phase 5 — re-run blocked PRs

For each blocked PR, one at a time:

1. Re-read current `main` after the CI/governance merge.
2. Update the PR branch through normal branch history so it is 0-behind; do not bypass the PR.
3. Revalidate semantic scope and mergeability.
4. Trigger a new `synchronize` or `ready_for_review` event.
5. Require `quality` green on the exact new head.
6. Require every **affected** permanent domain contract emitted by the PR's path changes to be green.
7. Never use an older green run from a previous head SHA as promotion evidence.

Permanent affected contracts currently include:

- Platform: `Platform Production Readiness Contract / platform-production` for #268's production runtime/Auth surface.
- Auth: `Auth Integration Contract / auth-contract`.
- Business: `Business Auth Integration Contract / business-auth-contract`.
- CRM: `CRM Platform Auth Integration Contract` and focused CRM equivalence contracts when their paths are affected.
- Payments: permanent Payments contracts including subscription/recurrence and browser checkout when their paths are affected.
- Ticketing: Ticketing domain/transaction contracts when their paths are affected.
- Affiliates: `Affiliates FEATURE-0010 Contract` for #264.
- Platform schema/event/health validation also remains globally consumed through `pnpm architecture:check` → `pnpm platform:contracts:check` inside `quality`.

Coordinator promotion order after CI restoration:

1. #286 — CI/Quality/governance recovery;
2. #268 — Platform / production readiness;
3. #264 — Affiliate policy-neutral foundation;
4. #288 — final documentary truth, only after retargeting from #264 to the resulting `main`;
5. subsequent Payments/Affiliates runtime work only when their explicit external/product blockers are satisfied.

Do not batch-merge blocked PRs merely because Actions has returned.

## Phase 6 — temporary workflow cleanup

Do this **after** the first restored Quality/main promotion, not before it.

1. Run `pnpm ci:governance:check` and capture the temporary/one-shot candidate list.
2. Inventory current `.github/workflows` with `find .github/workflows -maxdepth 1 -type f | sort`.
3. Review candidates matching names such as `*-once.yml`, `*-one-shot.yml`, `*-temp.yml`, temporary formatter/fixer/probe/prepare/reconcile/diagnose workflows and `placeholder-invalid.yml`.
4. Before deleting each file, confirm no open PR or documented recovery procedure still depends on it.
5. Remove temporary workflows in a dedicated cleanup PR, not by direct push.
6. Run Quality on the cleanup PR and again on the resulting `main`.
7. Historical deleted workflow records may remain in GitHub's Actions history; distinguish those records from current versioned workflow files.
8. Keep only permanent validation, contract, regression, release and operational workflows that have a current owner and trigger rationale.

## Exact stop conditions

Do not promote when any of the following is true:

- only `BuildFailed`/workflow id `334828426` startup failures are produced;
- `quality` is absent, skipped unexpectedly or non-green on the exact head;
- an affected permanent domain contract fails or is absent;
- the PR is behind `main` at the promotion point;
- the Release Promotion Gate expected SHA differs from current `main`;
- branch protection had to be bypassed to make the merge possible.

## Completion record

For every promoted PR record:

- PR number;
- exact green head SHA;
- `main` SHA before merge;
- resulting `main` SHA;
- Quality Gate run URL/id;
- affected contract run URLs/ids;
- Release Promotion Gate run URL/id when the change is release-significant;
- branch-protection state at promotion time;
- any temporary exception used (normally `none`).
