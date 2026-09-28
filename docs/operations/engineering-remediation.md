# Engineering remediation

## Reverified baseline — 2026-09-28

Source: `edc7380c11774d475af2e80ddf75b7b1e53e9046`, tree
`4e539525d85b285fe7fa31eddc56cf9f2034b415`.
GitHub reported 848 branches and 40,000 Actions runs (API total, not a proven
lifetime count). There were 114 versioned workflow files, 47 acceptance suites,
100 workflow files installing dependencies, and 62 installing Playwright.
Termux had 73 worktrees; 29 contained tracked changes or untracked files.
The only required check was `quality`, strict, with no required human approval.

Acceptance run `36377155660` succeeded for this main. The preceding runs
`36376422265` and `36375921878` failed. Staging was live at this main via
`dep-dasus0npn0mc73a6cji0`; production was live at
`20453f829477c74d9111e17292da628aa5149c52` via `dep-dasmhs59fdbs73e4674g`.
Both readiness endpoints returned HTTP 200 with a degraded status. Staging
reported `COMMERCE_RUNTIME_UNAVAILABLE`; production reported denied database
access for place-platform. Native production readiness was not configured.
Neither environment was using immutable OCI promotion.

## Dependency order

1. Freeze the baseline and resolve the existing claim handoff PR #465.
2. Decouple acceptance from main pushes and freeze source identity.
3. Enforce tested impact classification and consolidate duplicated setup.
4. Prove CI before branch/worktree cleanup.
5. Enable real immutable artifact promotion and verify domain readiness.
6. Project live platform state through existing tooling; simplify agent routing.
7. Exercise a complete delivery, measure observed results, then clean safe residue.

## Explicit candidate acceptance

Dispatch `final-release-acceptance.yml` on `main` when a release is intended:

```bash
gh workflow run final-release-acceptance.yml --ref main
```

The workflow captures its immutable event SHA, creates the lightweight tag
`rc/<40-character-sha>`, and dispatches the unified 60-suite inventory and staging on that tag.
Every promotion proves the exact checkout, the remote candidate tag, and that
the candidate is an ancestor of protected main. Advancing main does not revoke
candidate evidence. A missing/moved tag, an unmerged source, or a mismatched
checkout fails closed. Configure an active tag ruleset for `refs/tags/rc/**`
with update and deletion restrictions and no bypass actors before rollout.
Ruleset `24097548` (`immutable-release-candidates`) was installed with these
restrictions. The existing main ruleset was preserved.

Acceptance still originates on protected main. A PR validates contracts without
publishing a release. Pages consumes a successful explicitly dispatched
acceptance and rechecks its candidate. It refuses to deploy an older acceptance
after a newer candidate was accepted. Production remains explicitly dispatched;
this change does not initiate a production deploy.

The existing bootstrap proof workflow resolves the registered branch ChangeSet
instead of accumulating a ternary for every new branch. Its trusted reusable
proof implementation remains pinned; candidate code does not become the proof
authority.

## One release dispatcher

Live evidence exposed another automatic fan-out: Control Center Final
Qualification dispatched 15 workflows after the CI merge. Merge Queue Full
Regression was a third full-matrix dispatcher. Both orchestration files are
removed; their tests are preserved in the existing acceptance manifest. The
union is 60 unique suites (47 original plus 13 unique Control Center/security
suites), avoiding two duplicated ticketing dispatches. Required Quality still
handles PRs, main and merge groups. Candidate-tag runs explicitly force full
impact, even when the latest source change is documentation.

This changes full-suite frequency and removes duplicate orchestration, not the
coverage of an intentional release. Individual affected PR workflows remain.
Retries reuse successful suites bound to the same immutable candidate; only
missing or failed suites are dispatched again. Acceptance evidence includes the
attempt number, preserving failed-attempt evidence without upload collisions.

## Impact enforcement, first stage

Quality calls the existing impact workflow once. The duplicate standalone PR
impact run and selective-core setup are removed. Docs/governance-only changes
retain formatting, secrets, repository policy, and deterministic governance
contracts; they do not provision MySQL or run product lint, typecheck, tests,
build or the MySQL matrix. Any classification job failure makes required
`quality` fail rather than report a skipped success. Mixed or unknown changes
cannot take this lane. Product changes retain the full existing quality gate,
including on draft PRs. Broader domain selection remains conservative until its
dependency coverage is proven.

The manifest now recognizes financial/ordering/ticketing authority paths and
nested migrations. Release candidate packaging runs only when called explicitly,
not on every PR. No product suites were deleted. The impact analyzer's negative
cases cover executable docs, unknown paths, mixed changes, invalid Git refs,
financial changes, nested migrations and an explicit full release override.

## Rollback and remaining boundaries

### First consolidated candidate proof and Pages correction

PR #467 merged as `e12d997edabe308297c3b6083a609af1710aa99b`.
Acceptance run `36383480413` passed all 60 unique suites on that exact candidate;
staging promotion `36384777261` passed and Render deployment
`dep-dat081ojo6nc73dnoqg0` became live on the same SHA. Acceptance took 21m33s,
including queue contention from 93 workflows triggered by Dependabot PR #220.
This is an observed duration, not a controlled before/after speed comparison.

The following Pages run `36385081934` built its certified artifact but failed
before deployment: its checkout-free deploy job used `gh run list` without an
explicit repository. The command now binds `--repo` to `GITHUB_REPOSITORY`.
A regression test executes the actual promotion shell outside a Git checkout
and also rejects a newer accepted candidate or a moved candidate tag.

Passing acceptance does not mean every product domain is healthy. Direct probes
still found unavailable Commerce in staging and denied Business database access
in production. The earlier staging pre-deploy failure coincided with a MySQL
restart at 99.2% of its 512 MiB memory limit; the new pre-deploy passed all 11
steps. Memory pressure remains a capacity risk, not a proven permanent fix.

Revert the remediation merge through a reviewed PR to restore the previous CI
contract. Keep candidate tags and their evidence; do not retag published sources.
The tag ruleset can be disabled separately by a repository administrator if the
candidate feature is fully rolled back. Do not loosen main protection.

The first explicit run `36380623305` failed safely before dispatching suites:
GitHub CLI printed a 404 JSON body to stdout, which the bootstrap misread as an
existing tag. The bootstrap now queries Git refs directly and tests its actual
shell against an absent and an existing tag. This preserves idempotence without
swallowing API or Git transport failures. The initial candidate tag was registered
explicitly at merged SHA `2f5c1fcf42b9b300aecc650a12ba57fada007f0f` before retry.

Source deployments still rebuild on Render; source identity is not image digest
identity. OCI build-once promotion, broader affected-domain enforcement, runtime degradation,
branch/worktree lifecycle, and measured before/after delivery metrics remain
separate uncompleted steps until platform evidence proves them.
