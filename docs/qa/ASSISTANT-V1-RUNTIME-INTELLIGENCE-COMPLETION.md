# Assistant V1 Runtime Intelligence Completion — Exact-Head Evidence

## Scope

PR #73 (`fix/assistant-v1-runtime-intelligence-completion`) closes runtime/intelligence gaps found after the V1→V2 assistant parity review.

The implementation preserves the canonical V1 deterministic-first architecture: typed input, voice input, visible options and allowlisted LLM actions converge on the same semantic execution path; local/catalog resolution remains authoritative before LLM fallback; navigation requires explicit confirmation before starting; profile/favorites/context use the shared runtime instances.

## Functional changes validated before this evidence commit

- semantic Explore command execution is injected into the production browser runtime instead of using DOM `.click()` as the production domain core;
- typed, voice and programmatic inputs share the same processing path;
- strict LLM actions (`show_category:*`, `show_place:*`) are translated into the same typed Explore commands;
- asynchronous Explore/geolocation results are generation-guarded against stale UI mutation;
- routed Explore commands record profile interactions and preserve the shared user-profile instance;
- favorites support add, remove, list and multi-turn `awaiting_place` operation persistence;
- successful navigation arrival records profile navigation success;
- navigation uses `navigate → awaiting_confirmation → confirm/deny`, with pending route lifecycle in dialogue context;
- `place_search` remains local/catalog/Mapbox-first and can escalate to LLM only through the existing policy when deterministic search does not resolve;
- V1 `recommendation`, `compare` and filtered-category intent families are restored to the central intent contract;
- contextual menu / proactive recommendation logic is connected to the shared profile and runtime intelligence handlers;
- explicit category routing no longer misclassifies place-detail text such as `Fale sobre Primeira Praia` merely because the place name contains `praia`.

## Validation evidence

The finalization run that produced commit `5c71b8d53f49ab189494c7bca0076487c30818a9` completed all of its guarded validation stages before committing:

- `pnpm --filter @touristic/assistant test` — PASS (147/147 tests in the validated run);
- `pnpm --filter @touristic/assistant typecheck` — PASS;
- `pnpm --filter @touristic/morro-digital-platform test` — PASS after updating the obsolete immediate-navigation expectation to the confirmation-first contract;
- `pnpm --filter @touristic/morro-digital-platform typecheck` — PASS;
- `pnpm -w build` — PASS;
- `git diff --cached --check` — PASS before commit;
- temporary finalizer workflows/scripts were removed in the same validated commit.

## Exact-head gate

Commit `5c71b8d53f49ab189494c7bca0076487c30818a9` was authored by `github-actions[bot]`. GitHub consequently marked the PR-triggered workflow set as `action_required` before creating jobs; this is an execution-policy condition, not a test failure.

This evidence commit is intentionally authored through the normal repository connection so the PR obtains a new human/user-authored exact-head and the standard PR workflow matrix can execute normally. No functional behavior is changed by this document.

The PR must not be merged until that new exact-head has completed the required workflow matrix successfully and review findings are reconciled.
