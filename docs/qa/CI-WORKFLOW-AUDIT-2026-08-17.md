# CI / Quality / Repository Governance Audit — 2026-08-17

Repository: `luizidebook/touristic-digital-platform`
Audited `main`: `ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6`
Scope: CI, Quality and repository-governance preparation only.

## Executive result

The versioned repository already has a permanent global Quality Gate and multiple path-scoped domain contracts. GitHub Actions execution is currently blocked by Issue #282: fresh connector-triggered events resolve only to deleted workflow id `334828426` and finish as `startup_failure` without real named jobs.

This preparation does not bypass that incident. It makes the validation topology deterministic and locally inspectable so the first restored Actions event can immediately prove whether CI is healthy.

Canonical decisions of this branch:

- keep exactly one globally provisioned Quality job named `quality`;
- preserve one checkout/setup/install/cache lifecycle per Quality run;
- preserve draft-fast validation and full ready/main/manual validation;
- add `workflow_dispatch` for controlled recovery;
- add executable `pnpm ci:governance:check` repository-governance validation;
- add an explicit exact-SHA `Release Promotion Gate`;
- keep Auth/Business/CRM/Payments/Ticketing contracts path-scoped;
- do not add a weaker duplicate Platform workflow because PR #268 now owns the stronger production-readiness contract;
- defer mass temporary-workflow cleanup until Actions registration is healthy.

PR #285 is superseded and closed unmerged. PR #286 is the canonical CI/governance recovery candidate.

## Revalidated blocker — Issue #282

Current coordinator observations:

- `main` remains `ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6`;
- no current versioned workflow file contains `BuildFailed`;
- current PR #268 and #264 heads are 0-behind and mergeable but their fresh connector-triggered runs still resolve only to workflow id `334828426` / `startup_failure`;
- #286 itself has also reproduced the same deleted-workflow startup failure;
- the connected integration cannot perform the owner-side Actions settings remediation.

Therefore lack of current named checks is an external CI execution blocker, not green evidence and not a reason to merge directly.

## Historical execution evidence

The permanent Quality Gate executed successfully immediately before the current incident. Historical green runs prove the repository had a functioning full Quality topology before the registration failure, but they are not promotion evidence for any current head.

Every current candidate still requires fresh exact-head checks after Actions restoration.

## Canonical global Quality Gate

File: `.github/workflows/quality.yml`

### Trigger contract

- `pull_request`: opened, synchronize, reopened, ready-for-review and converted-to-draft;
- `push`: `main`;
- `workflow_dispatch`: administrative recovery/manual full validation;
- no PR path filters;
- `contents: read` only;
- concurrency cancels stale runs for the same PR/ref.

### One-job topology

Quality intentionally uses one provisioned job named `quality`.

That job performs one:

- checkout;
- pnpm setup;
- Node setup;
- Turbo cache restore;
- frozen dependency install.

It then runs these named steps in sequence:

1. formatting;
2. architecture boundaries plus canonical Platform contracts;
3. Feature Registry validation;
4. CI/repository governance validation;
5. lint;
6. typecheck;
7. tests when the event is not a draft PR;
8. build when the event is not a draft PR.

Draft PRs therefore remain fast through typecheck. `ready_for_review` retriggers the same exact head and executes full Test + Build. Pushes to `main` and manual dispatch also execute the full gate.

### Why Quality is not split into component jobs

Issue #240 already establishes the cost rule: avoid multiple small jobs that repeat setup and per-job minute rounding when a domain/gate can run safely as one job.

A temporary #286 design split preflight/lint/typecheck/test/build into separate runners. Coordinator revalidation rejected that design before promotion because it would multiply checkout/setup/install work without measured benefit and contradict the repository's CI cost architecture.

Failure isolation remains available through named steps and logs inside `quality`; separate runners are not required to know which command failed.

The globally required branch-protection context remains exactly `quality`.

## CI governance executable contract

File: `tooling/quality/check-ci-governance.mjs`
Root script: `pnpm ci:governance:check`

The checker validates that:

- versioned workflow files exist;
- no versioned workflow or filename contains stale `BuildFailed` references;
- root scripts for format, architecture, registry, lint, typecheck, test, build, Platform contracts, governance and aggregate check exist;
- global Quality has PR, push-to-main and manual recovery triggers;
- global Quality has no PR path filters;
- global Quality contains all required commands;
- global Quality uses exactly one provisioned job and does not reintroduce `quality / ...` component jobs;
- permanent Auth, Business, CRM, Payments and Ticketing contract files retain their owner/path/permissions markers;
- canonical Platform schema/event/health validation remains registered;
- Release Promotion Gate remains explicit/manual and exact-SHA aware;
- critical CODEOWNERS/root-foundation entries exist;
- likely temporary/one-shot workflow files are reported for later controlled cleanup.

The temporary-workflow inventory is informational until the dedicated cleanup phase; merely finding historical helper files does not make the current recovery gate red.

## Permanent domain contract policy

Domain contracts are affected-change evidence and must not become global required contexts.

### Auth

`auth-integration-contract.yml` remains path-scoped to Auth/runtime changes and validates Auth packages plus real HTTP security/RBAC/tenant boundaries.

### Business

`business-auth-integration-contract.yml` remains path-scoped to Business/Auth integration changes.

### CRM

`crm-platform-auth-integration-contract.yml` and focused CRM equivalence/browser contracts remain path-scoped to CRM/Auth/runtime changes.

### Payments

Payments continues to be validated through Ordering/Financial/runtime authority contracts, including recurrence and browser checkout where affected. These remain path-scoped.

### Ticketing

Ticketing domain/transaction/MySQL contracts remain path-scoped and retain canonical Ordering/Financial authority boundaries.

### Affiliates

PR #264 introduces its own permanent `Affiliates FEATURE-0010 Contract`, intentionally scoped to the Affiliate policy-neutral documentary/architecture surface. It is not part of #286 and must not become globally required.

## Platform validation ownership

Two layers are intentionally distinct:

1. `pnpm platform:contracts:check`, consumed by global `architecture:check`, validates the canonical `PLATFORM-EVENT-ENVELOPE`, `PLATFORM-OBSERVATION` and `PLATFORM-HEALTH-SNAPSHOT` contract registry/schema/runtime relationship.
2. PR #268 owns the stronger runtime/production-specific `Platform Production Readiness Contract / platform-production`, including real MySQL shared Auth, probes, release/correlation identity and shutdown behavior.

#286 does not create another parallel Platform runtime gate. Doing so would duplicate responsibility and make promotion semantics ambiguous.

## Release Promotion Gate

File: `.github/workflows/release-promotion-gate.yml`

Permanent/manual promotion contract:

- `workflow_dispatch` only;
- operator supplies `expected_sha`;
- checkout is pinned to that exact SHA;
- workflow verifies checked-out HEAD and current `origin/main` equal the approved SHA;
- validates canonical Platform contracts;
- builds the release candidate;
- boots the local runtime;
- smokes deterministic local surfaces;
- does not deploy, activate providers or mutate product data.

This is post-merge/release evidence, not a globally required PR context.

## Package scripts / local gates

The branch preserves root scripts for:

- `format:check`;
- `architecture:check`;
- `features:check`;
- `lint`;
- `typecheck`;
- `test`;
- `build`;
- `platform:contracts:check`.

It adds:

- `ci:governance:check`;
- inclusion of governance validation in aggregate `check`.

This makes the repository's permanent CI structure inspectable without depending on GitHub-hosted execution.

## YAML/static validation strategy

Permanent workflow syntax/structure is protected in layers:

1. Prettier parsing through `pnpm format:check`;
2. semantic marker/topology checks through `pnpm ci:governance:check`;
3. GitHub workflow registration/parser after Actions restoration;
4. fresh exact-head execution as the final acceptance gate.

Static validation never substitutes for the official execution gate.

## Trigger and path-filter policy

### Global Quality

No PR path filters. The stable `quality` context must appear for every PR once Actions is working.

### Domain contracts

Keep expensive MySQL/Chromium/domain runtime workflows path-scoped. They are required only when affected and must not deadlock unrelated PRs through global branch protection.

### Release gate

Manual only. A PR success must never implicitly become deployment/promotion authority.

## Temporary / one-shot workflow debt

GitHub's Actions registry contains substantial historical workflow metadata, including deleted and one-shot registrations. That registry history is not the same thing as current versioned files.

Cleanup policy after CI restoration:

- inventory current `.github/workflows` files;
- use `pnpm ci:governance:check` to report high-confidence helper candidates;
- verify no open PR/recovery path still needs each candidate;
- delete helpers in a dedicated cleanup PR;
- require Quality on the cleanup PR and resulting `main`;
- preserve permanent validation/regression/release workflows.

Do not mass-delete files while the Actions registration incident itself is unresolved.

## CODEOWNERS

`.github/CODEOWNERS` has a default owner and critical repository ownership. No duplicate ownership mechanism is needed.

If independent review becomes available, Code Owner review can be required. In a single-maintainer state, governance must not create an impossible approval deadlock; PR-only changes, exact checks and no-bypass protection remain the enforceable controls.

## Branch protection / rulesets

Current `main` is unprotected. The rulesets capability is unavailable for this private repository on the current plan; use classic branch protection after real check contexts are restored.

Target protection:

- pull request required;
- conversation resolution required;
- globally require exactly `quality`;
- require branch up-to-date where supported;
- block force pushes;
- block deletion;
- disable broad admin bypass where the UI supports it;
- do not globally require path-scoped domain contracts.

## Promotion decision

**HOLD until Issue #282 is restored.**

#286 is the designated CI/governance recovery candidate, but it must remain draft/unmerged until:

1. its exact final head is 0-behind and mergeable;
2. real `Quality Gate / quality` executes and is green on that exact head with Test + Build enabled;
3. it is merged through the PR flow;
4. resulting `main` Quality is green;
5. `Release Promotion Gate / release / smoke` succeeds against the exact resulting main SHA;
6. classic branch protection is configured around the real `quality` context.

No startup-failed, skipped-required, historical or absent check is acceptance evidence.
