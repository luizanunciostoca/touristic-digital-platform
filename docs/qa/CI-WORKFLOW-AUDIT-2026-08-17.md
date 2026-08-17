# CI / Quality / Repository Governance Audit — 2026-08-17

Repository: `luizidebook/touristic-digital-platform`
Audited `main`: `ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6`
Scope: CI, Quality and repository governance preparation only.

## Executive result

The versioned repository has a valid permanent Quality Gate and multiple permanent domain contracts, but GitHub Actions execution is currently blocked by the incident tracked in Issue #282. Current affected PR events resolve to deleted workflow id `334828426` and finish as `startup_failure` without real jobs.

The repository also has substantial workflow-registry debt: the Actions API reports 359 registered workflows, including many active historical formatter/fixer/one-shot/temporary workflows. That debt must be cleaned after Actions execution is restored, because mass deletion during the incident can add more deleted-workflow records and complicate diagnosis.

This CI preparation introduces a stable granular Quality topology, a repository-governance contract, an exact-SHA release smoke gate and an executable restore/promotion runbook. It does not merge itself and does not change product behavior.

## Revalidated blocker

### Issue #282

Issue #282 remains the canonical blocker for Actions restoration.

Observed on 2026-08-17:

- no current versioned file contains `BuildFailed`;
- PR #268 current head is `ab583a107e7de8afd78501b4aca574b9cf688b13`;
- PR #268 has no commit statuses and its observed PR run is `startup_failure` from workflow id `334828426`;
- PR #264 head is `823a8661c0ca18edbb4ea4f2d753d191305ab17e`;
- PR #264 has repeated `startup_failure` runs from workflow id `334828426` and no real named workflow jobs;
- the repository Actions permissions endpoint is not readable through the connected integration, so the owner/admin must perform the administrative restore in GitHub Settings.

This confirms that no direct-merge workaround is justified.

## Historical execution evidence

The permanent Quality Gate executed successfully immediately before the current incident. A representative historical run is Quality Gate run `31946480588`, created 2026-08-16 12:13:35Z, conclusion `success`, whose single historical `quality` job completed formatting, architecture, Feature Registry, lint, typecheck, test and build.

The current incident is therefore not evidence that these commands are inherently absent or invalid; the immediate blocker is workflow execution/registration. The new branch still requires fresh exact-head CI before promotion.

## Permanent workflow audit

### Global Quality Gate

File: `.github/workflows/quality.yml`

Baseline behavior on `main`:

- `pull_request`: opened, synchronize, reopened, ready-for-review and converted-to-draft;
- `push`: `main`;
- no path filters, which is correct for a globally required check;
- `contents: read` only;
- concurrency cancels stale runs;
- format, architecture, Feature Registry, lint, typecheck, test and build are present.

Preparation change:

- emits `quality / preflight`, `quality / lint`, `quality / typecheck`, `quality / test`, `quality / build` and aggregate `quality`;
- drafts emit stable test/build contexts but defer their heavy commands;
- `ready_for_review` forces real test/build execution;
- aggregate `quality` cannot succeed unless every component job succeeds;
- `quality / preflight` now runs `pnpm ci:governance:check`.

This provides a single stable branch-protection context (`quality`) without losing granular diagnostics.

### Auth

File: `.github/workflows/auth-integration-contract.yml`

Audit result: permanent/path-scoped.

- PR + push-to-main triggers exist.
- Paths cover Auth packages, Auth browser, Auth server, the Auth runtime adapter/dev server and lockfile.
- Permissions are read-only.
- Job validates Auth packages and real HTTP security/RBAC/tenant boundaries.

Do not make `auth-contract` globally required because unrelated PRs do not emit it.

### Business

File: `.github/workflows/business-auth-integration-contract.yml`

Audit result: permanent/path-scoped.

- PR + push-to-main triggers exist.
- Paths cover Business/Auth packages plus Business/Auth runtime adapters and dev server.
- Permissions are read-only.
- Job validates Business/Auth packages and protected Business HTTP behavior.

Do not make `business-auth-contract` globally required.

### CRM

Files reviewed:

- `.github/workflows/crm-platform-auth-integration-contract.yml`
- `.github/workflows/crm-equivalence-browser-contract.yml`

Audit result: permanent/path-scoped.

The platform/Auth integration contract covers `crm-api.mjs`, `auth-api.mjs`, `dev-server.mjs`, CRM packages/services and lockfile. The equivalence/browser contract covers focused CRM equivalence/browser/runtime evidence. Both use PR + push-to-main triggers; the focused equivalence contract also supports manual dispatch.

Do not make these globally required.

### Payments

Files reviewed:

- `.github/workflows/payments-subscription-recurrence-contract.yml`
- `.github/workflows/payments-browser-checkout-contract.yml`

Audit result: permanent/path-scoped.

Payments is correctly validated through Ordering/Financial/server/browser authority paths rather than a duplicate standalone Payments package. The recurrence contract covers Financial, Ordering, Ordering server and Payments runtime files. The browser checkout contract covers browser checkout clients, Ordering and runtime server surfaces. Both have PR + push-to-main triggers and manual dispatch.

Do not make these globally required.

### Ticketing

Files reviewed:

- `.github/workflows/ticketing-m147-contract.yml`
- `.github/workflows/ticketing-m148-transaction-contract.yml`

Audit result: permanent/path-scoped.

Both validate Ticketing plus Ordering/Financial dependencies with deterministic MySQL execution. Both have PR + push-to-main triggers and manual dispatch. Their path filters are appropriate for Ticketing domain changes; runtime-only platform composition changes still receive global Quality/Platform validation and must use the applicable integration contract when the runtime adapter itself is changed.

Do not make these globally required.

### Platform

There is intentionally no duplicate always-running Platform workflow added by this preparation.

Platform's canonical contract gate is `pnpm platform:contracts:check`, executed by `pnpm architecture:check`, which is already part of global `quality / preflight`. It validates the canonical `PLATFORM-EVENT-ENVELOPE`, `PLATFORM-OBSERVATION` and `PLATFORM-HEALTH-SNAPSHOT` registry/schema/runtime/evidence relationship.

Adding a second always-running Platform workflow would duplicate global Quality work without adding a new trust boundary.

### Release / smoke

New file: `.github/workflows/release-promotion-gate.yml`

Audit intent: permanent/manual promotion gate.

- trigger is `workflow_dispatch` only;
- operator supplies `expected_sha`;
- checkout uses that exact SHA;
- the job proves both checked-out HEAD and current `origin/main` equal the approved SHA;
- validates Platform contracts;
- builds the release candidate;
- starts the local runtime and smokes deterministic local surfaces;
- never deploys, activates a provider, or changes product data.

It is not a PR required check. It is post-merge release evidence.

## Package scripts / local gates

Current repository scripts include:

- `format:check`;
- `architecture:check`;
- `features:check`;
- `lint`;
- `typecheck`;
- `test`;
- `build`;
- `platform:contracts:check`;
- aggregate `check`.

This preparation adds `ci:governance:check` and includes it in aggregate `check`.

`tooling/quality/check-ci-governance.mjs` inspects every versioned workflow file for stale `BuildFailed` references, validates the permanent Quality topology and domain contract markers, validates Platform/release-gate invariants, validates critical CODEOWNERS entries and reports high-confidence temporary/one-shot cleanup candidates.

The script deliberately reports legacy temporary workflows instead of failing merely because they exist; otherwise the prepared Quality Gate would be guaranteed red before the controlled cleanup PR can occur.

## YAML validation strategy

Permanent workflow YAML is protected through multiple layers:

1. `pnpm format:check` uses Prettier across the repository and therefore parses changed YAML as part of Quality preflight.
2. `pnpm ci:governance:check` validates critical workflow structure and trigger/contract markers.
3. GitHub's own workflow registration/parser is the final platform-specific parser once Actions execution is restored.
4. Fresh exact-head named jobs remain mandatory promotion evidence; static parsing alone never authorizes a merge.

## Trigger and path-filter policy

### Global gate

`Quality Gate` must remain without PR path filters so required context `quality` always appears.

### Domain contracts

Permanent Auth/Business/CRM/Payments/Ticketing contracts remain path-scoped to avoid unnecessary MySQL/Chromium/runtime work and Actions consumption. They are affected-change evidence, not global branch-protection contexts.

### Release gate

Release Promotion Gate remains manual only so a successful PR cannot accidentally become deployment/promotion authorization.

## Quality duplication audit

The old Quality workflow serialized all checks inside one `quality` job. It was efficient but gave poor failure isolation and no granular contexts.

The prepared topology parallelizes lint/typecheck/test/build and keeps a small aggregate `quality` context. This increases setup/install work per full ready PR, but provides deterministic named gates and allows failures to complete independently. `setup-node`/pnpm store caching and Turbo caches on static jobs reduce the repeated setup cost; concurrency still cancels stale PR runs.

Domain workflows are not folded into global Quality because they require materially different environments (MySQL, Chromium, focused runtime fixtures) and are already path-scoped.

Platform contract validation remains inside global preflight instead of being duplicated into a second always-running workflow.

## Temporary / one-shot workflow debt

The Actions API currently reports 359 registered workflows. High-confidence temporary families observed include:

- M52–M58 formatter/fix/once helpers;
- M134–M148 temporary formatter/fixer/prepare/probe/reconcile helpers;
- M146 clock/database/fixture/isolation/documentation one-shot workflows;
- M148 browser/import-map/MySQL/static formatter/fix helpers;
- Payments M153 documentation/format/recurrence one-shot helpers;
- PR-specific formatters such as PR248/PR260 helpers;
- Affiliates temporary formatter/reconcile helpers;
- Assistant temporary format/sync/one-shot helpers;
- diagnostic workflows such as routing/CSS/cascade diagnostics;
- `ci-phase2-one-shot.yml`;
- `placeholder-invalid.yml`.

The registry count includes workflow history and should not be treated as the eventual versioned-file target. Cleanup acceptance is based on the contents of `.github/workflows`, not on instantly forcing historical registry entries to disappear.

### Removal policy

After CI restore:

- delete high-confidence one-shot/formatter/fixer/probe/temporary workflows through a dedicated PR;
- preserve permanent contract/regression/release workflows;
- confirm no open PR depends on a candidate before deletion;
- require Quality on the cleanup PR and resulting main;
- do not recreate temporary workflows merely to edit code when equivalent local/PR development is possible.

## CODEOWNERS audit

`.github/CODEOWNERS` exists and has a default owner `@luizidebook`, explicit ownership for `/.github/`, docs, tooling, infrastructure, apps, core/shared/design/geospatial/services and critical root foundation files.

That is sufficient for current single-maintainer ownership. No duplicate ownership file is needed. Branch protection should require Code Owner review only when an independent reviewer actually exists; governance must not deadlock the repository.

## Branch protection / ruleset audit

The connected integration cannot read classic `main` protection (`403 Resource not accessible by integration`). The rulesets API is also inaccessible for this current private-repository plan and returns a plan/visibility restriction. Therefore repository protection cannot be truthfully asserted or changed from this integration.

Target configuration is documented in `docs/operations/CI-RESTORE-PROMOTION-RUNBOOK.md`:

- PR required;
- conversation resolution required;
- `quality` required;
- up-to-date branch required when available;
- force push blocked;
- deletion blocked;
- admin/broad bypass disabled;
- no path-scoped domain contract configured globally;
- one approval + Code Owner review only when an independent reviewer exists.

## Promotion decision

**Current decision: HOLD.**

The CI/governance branch is prepared, but GitHub Actions has not yet produced fresh named checks on its exact head. No merge is authorized until Issue #282's execution blocker is administratively restored and the sequence in the CI restore runbook succeeds.
