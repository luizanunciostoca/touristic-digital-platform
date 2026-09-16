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
- explicit category routing no longer misclassifies place-detail text such as `Fale sobre Primeira Praia` merely because the place name contains `praia`;
- V1 global Explore commands (`show all`, nearby, back to filters/menu and map aliases) execute through the typed Explore port;
- numeric assistant option selection resolves against the current presentation while preserving the user's submitted text in UI/history.

## Validation evidence

The finalization run that produced commit `5c71b8d53f49ab189494c7bca0076487c30818a9` completed all of its guarded validation stages before committing:

- `pnpm --filter @touristic/assistant test` — PASS (147/147 tests in the validated run);
- `pnpm --filter @touristic/assistant typecheck` — PASS;
- `pnpm --filter @touristic/morro-digital-platform test` — PASS after updating the obsolete immediate-navigation expectation to the confirmation-first contract;
- `pnpm --filter @touristic/morro-digital-platform typecheck` — PASS;
- `pnpm -w build` — PASS;
- `git diff --cached --check` — PASS before commit;
- temporary finalizer workflows/scripts were removed in the same validated commit.

Subsequent guarded closures also validated runtime-review synchronization/profile changes and V1 global-command/numeric-selection parity before their functional commits were pushed. The remaining review-findings gate is intentionally re-triggered from a normal repository-authored commit so it can apply only the still-missing awaiting-interrupt/re-entry protections and direct typed-LLM-action regressions on top of the latest branch state.

## Exact-head gate

Bot-authored functional commits can cause this repository's PR-triggered workflows to be marked `action_required` before jobs are created. This is an execution-policy condition rather than a test conclusion. A normal repository-authored evidence commit is therefore used after each guarded functional closure to produce the exact-head on which the standard PR workflow matrix must execute.

The PR must not be merged until the final normal-authored exact-head has completed the required workflow matrix successfully and review findings are reconciled.
