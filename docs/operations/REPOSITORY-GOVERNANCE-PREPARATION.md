# Repository Governance Preparation — `main`

Date: 2026-08-16
Repository: `luizidebook/touristic-digital-platform`

## Observed repository state

- Repository rulesets API currently returns no configured rulesets.
- The connected GitHub integration cannot read or modify classic `main` branch protection (`403 Resource not accessible by integration`).
- `.github/CODEOWNERS` already exists and assigns the repository, `.github`, docs, apps, shared/core foundation and services to `@luizidebook`.
- The canonical always-running merge gate is the Quality Gate job named `quality`.
- Domain/browser/MySQL contracts remain permanent CI evidence but are path-scoped; they must not be configured as globally required status contexts unless they are changed to emit a status on every PR.

No governance write should be attempted through an integration that lacks repository-administration authority.

## Target configuration

Prefer one active branch ruleset targeting exactly the default branch `main` rather than overlapping classic protection plus rulesets.

Configure:

1. **Target**: branch `main` only.
2. **Enforcement**: Active.
3. **Restrict deletions**: enabled.
4. **Block force pushes / non-fast-forward updates**: enabled.
5. **Require a pull request before merging**: enabled.
6. **Required approvals**: 1 when a second independent reviewer is available. If the repository is intentionally single-maintainer, do not configure an impossible approval requirement; retain PR-only changes plus CODEOWNERS and required checks until a second reviewer exists.
7. **Dismiss stale pull request approvals when new commits are pushed**: enabled when approval requirements are active.
8. **Require review from Code Owners**: enabled when approval requirements are active. Existing CODEOWNERS is authoritative; do not create duplicate ownership metadata.
9. **Require conversation resolution before merging**: enabled.
10. **Require status checks to pass before merging**: enabled.
11. **Required status check**: `quality`.
12. **Require branch to be up to date before merging**: enabled if the selected GitHub ruleset UI exposes this option for required checks.
13. **Bypass list**: empty by default. Do not grant broad organization/repository-role bypass simply for convenience.

Do not add path-scoped checks such as `auth-contract`, MySQL contracts or Chromium browser contracts as global required status contexts unless their workflows are first redesigned to produce a deterministic successful/skipped status for every pull request. Otherwise unrelated PRs can be permanently blocked waiting for a check that never starts.

## Owner manual procedure

The connected integration does not have Administration permission, so the repository owner must apply this in GitHub:

1. Open repository `luizidebook/touristic-digital-platform`.
2. Open **Settings**.
3. Open **Rules** → **Rulesets**.
4. Choose **New ruleset** → **New branch ruleset**.
5. Name it `main-production-protection`.
6. Set **Enforcement status** to **Active**.
7. Under **Target branches**, include the default branch or exact branch `main`; verify no feature branches are unintentionally targeted.
8. Enable deletion protection.
9. Enable non-fast-forward/force-push protection.
10. Enable **Require a pull request before merging**.
11. If an independent reviewer is available, set required approvals to `1`, enable stale-approval dismissal and **Require review from Code Owners**. If only the repository owner can review, leave the approval count at `0` rather than creating a governance deadlock.
12. Enable **Require conversation resolution before merging**.
13. Enable **Require status checks to pass**.
14. Add exactly the canonical required check `quality`.
15. Enable the option requiring the PR branch to be current with `main` before merge, if shown for the rule.
16. Inspect **Bypass list**. Leave it empty. Remove any broad role/team/application bypass that is not an explicitly documented emergency control.
17. Save/create the ruleset.
18. Re-open the ruleset and verify it is **Active**, targets only `main`, blocks deletion and force push, and lists `quality` as required.
19. Open a harmless test PR and verify direct update/merge behavior is actually blocked until `quality` succeeds.
20. Do not merge a production PR merely to test the ruleset; use a disposable documentation-only test branch if validation is needed.

## Emergency governance rule

If an emergency requires bypass, prefer a temporary, named, auditable exception with the narrowest scope possible. Remove it immediately after recovery and record why it was used. Never leave a permanent broad admin/app bypass on `main` as a convenience path.

## CI relationship

Issue #240's useful invariants are already represented by the current Quality Gate strategy:

- draft PR: formatting, architecture, feature registry, lint and typecheck;
- ready PR and `main`: the same gates plus test and build;
- concurrency cancels stale runs;
- timeouts bound runner usage;
- MySQL/Chromium/domain contracts remain separate permanent evidence where their environment is materially required.

This preparation intentionally does not trade away coverage to reduce Actions consumption.
