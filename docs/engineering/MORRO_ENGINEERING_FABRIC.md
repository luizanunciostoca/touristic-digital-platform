# Morro Engineering Fabric V1

## Purpose

Run many development agents in parallel while preserving exact-head, domain invariants and release authority.

## Roles

- **Orchestrator**: decomposes goals, assigns non-overlapping ChangeSets and prioritizes the release critical path.
- **Worker**: implements one ChangeSet on one branch/worktree. It may push and open a PR, but does not publish.
- **Integrator**: reconciles dependencies and validates composition. It is the only role that marks a PR merge-ready.
- **Adversarial QA**: attempts regressions and failure paths; it does not author the feature under test.
- **Release Manager**: certifies the exact merged main SHA and performs promotion/rollback.

## Daily operating protocol

1. Start every feature from the current `main`.
2. Give each chat one semantic ChangeSet and one branch.
3. Keep the PR **Draft** while implementation is active. Draft PRs get fast feedback while the heavyweight Quality Gate intentionally skips Test/Build.
4. Do not let two independent chats edit the same ownership area. If they must, stack them explicitly: B depends on A.
5. A worker stops at **REMOTE_PROVEN**. It does not merge or deploy.
6. The integrator checks current main, reconciles the PR, validates the exact current HEAD and cross-PR composition, then moves it to **MERGE_READY**.
7. Merge with expected head SHA. If the PR HEAD moves, evidence for the old head is stale.
8. Treat the resulting new `main` SHA as the release candidate.
9. Run Final Release Acceptance and Release Promotion Gate for that exact SHA.
10. Production promotion must target that same SHA. Never substitute a newer main SHA without certifying it.

## State machine

`IMPLEMENTING -> LOCAL_PROVEN -> REMOTE_PROVEN -> COMPOSITION_PROVEN -> POLICY_SATISFIED -> MERGE_READY -> MERGED -> RELEASE_CANDIDATE -> RELEASED`

## Parallelization rule

Parallelize independent ChangeSets. Serialize shared ownership and monetary/release authority. Optimize the critical path to production, not the number of simultaneous chats.

## Evidence rule

Evidence is valid only for the inputs it proves. Prefer reusable content-addressed build/test cache, but never reuse an integration or release result after its relevant source inputs changed.

## Chat assignment template

Give a worker:

- repository and exact base SHA;
- ChangeSet ID and acceptance criteria;
- owned paths;
- forbidden paths;
- dependencies;
- required evidence;
- branch name;
- instruction to open/update a Draft PR and stop before merge.

Give the integrator:

- PR numbers/HEAD SHAs;
- dependency ordering;
- instruction to compare with current main, reconcile, validate cross-PR composition, and merge only with expected_head_sha.

Give the release manager:

- exact merged main SHA;
- instruction to validate Final Release Acceptance and Release Promotion Gate for the same SHA before production promotion.
