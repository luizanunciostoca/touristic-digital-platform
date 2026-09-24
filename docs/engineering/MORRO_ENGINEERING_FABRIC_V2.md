# Morro Engineering Fabric V2

V2 moves coordination state out of chat memory and into versioned repository contracts.

## Core controls

1. ChangeSet Registry under `.morro/changesets/`.
2. Exact-HEAD proof bundles with source and tree identity.
3. Required evidence cannot be satisfied by skipped or missing checks.
4. Semantic ownership includes contracts in addition to paths.
5. External gates cannot be marked VERIFIED without evidence.
6. Hard ChangeSet size limits force decomposition before review debt accumulates.
7. Integrators must re-prove both current main and expected PR HEAD immediately before merge.
8. Auto-merge is an integration action and must only be enabled after MERGE_READY.
9. Shadow-main/speculative composition may anticipate tests but never authorize release.
10. Publication remains exact-SHA, fail-closed and release-manager owned.

## Evidence lifecycle

Evidence is valid only when:

- ChangeSet identity matches;
- HEAD SHA matches;
- tree SHA matches when reuse is claimed;
- every required check reports success.

A skipped required check is failure, not success.

## State machine

IMPLEMENTING → LOCAL_PROVEN → REMOTE_PROVEN → COMPOSITION_PROVEN → POLICY_SATISFIED → MERGE_READY → MERGED → POST_MERGE_PROVEN → RELEASE_CANDIDATE → STAGING_PROVEN → CERTIFIED → RELEASED → PRODUCTION_VERIFIED.

## Parallelism

Parallelize only independent ownership. Path independence is necessary but not sufficient: shared contracts, events, DB tables, routes and auth capabilities also create semantic collisions.

## External gates

Effects not provable by repository automation stay PREPARED or AWAITING_OPERATOR. Documentation never upgrades an external effect to VERIFIED.

## PR size policy

Soft warning: more than 15 files or 800 changed lines.
Hard stop: more than 30 files or 1500 changed lines unless the work is explicitly classified as generated/mechanical and reviewed as such.

## Recommended pipeline

Local proof → Draft fast proof → Ready full required matrix → shadow/integration candidate → adversarial QA → exact-SHA release certification → promotion.
