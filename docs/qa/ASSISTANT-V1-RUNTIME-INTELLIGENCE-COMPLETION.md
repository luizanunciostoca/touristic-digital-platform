# Assistant V1 Runtime Intelligence Completion — Exact-Head Evidence

## Scope

PR #73 (`fix/assistant-v1-runtime-intelligence-completion`) closes runtime/intelligence gaps found after the V1→V2 assistant parity review.

The implementation preserves the canonical V1 deterministic-first architecture: typed input, voice input, visible options and allowlisted LLM actions converge on the same semantic execution path; local/catalog resolution remains authoritative before LLM fallback; navigation requires explicit confirmation before starting; profile/favorites/context use the shared runtime instances.

## Functional changes validated

- semantic Explore command execution is injected into the production browser runtime instead of using DOM `.click()` as the production domain core;
- typed, voice and programmatic inputs share the same processing path;
- strict LLM actions (`show_category:*`, `show_place:*`) are translated into the same typed Explore commands and have direct allowlist regression coverage;
- asynchronous Explore/geolocation results are generation-guarded against stale UI mutation;
- routed Explore commands record dialogue history and profile interactions while preserving the shared user-profile instance;
- Explore detail/tour/menu transitions synchronize into assistant context through the observable Explore state event;
- favorites support add, remove, list and multi-turn `awaiting_place` operation persistence;
- successful navigation arrival records profile navigation success;
- navigation uses `navigate → awaiting_confirmation → confirm/deny`, with pending route lifecycle in dialogue context;
- explicit domain/navigation commands interrupt stale `awaiting_*` slot capture rather than being reinterpreted as slot values;
- legacy DOM fallback is guarded against synchronous option-event re-entry; production remains on the injected typed Explore port;
- `place_search` remains local/catalog/Mapbox-first and can escalate to LLM only through the existing policy when deterministic search does not resolve;
- V1 `recommendation`, `compare` and filtered-category intent families are restored to the central intent contract;
- contextual menu / proactive recommendation logic is connected to the shared profile and runtime intelligence handlers;
- explicit category routing no longer misclassifies place-detail text such as `Fale sobre Primeira Praia` merely because the place name contains `praia`;
- V1 global Explore commands (`show all`, nearby, back to filters/menu and map aliases) execute through the typed Explore port;
- numeric assistant option selection resolves against the current presentation while preserving the user's submitted text in UI/history.

## Validation evidence

The guarded runtime-intelligence closure that produced `5c71b8d53f49ab189494c7bca0076487c30818a9` passed Assistant tests/typecheck, platform tests/typecheck, workspace build and staged diff validation before committing.

Subsequent guarded closures validated runtime-review synchronization/profile changes and V1 global-command/numeric-selection parity. The final remaining-review gate completed successfully and produced functional commit `8ef9d9b6cc52b200c8414349de31270b0ba769df` after all of these stages passed:

- patch application — PASS;
- affected-file formatting — PASS;
- `pnpm --filter @touristic/assistant test` — PASS;
- `pnpm --filter @touristic/assistant typecheck` — PASS;
- `pnpm --filter @touristic/morro-digital-platform test` — PASS;
- `pnpm --filter @touristic/morro-digital-platform typecheck` — PASS;
- `pnpm -w build` — PASS;
- `git diff --cached --check` and validated-result commit — PASS;
- temporary finalizer workflow/script removed in the validated functional commit.

## Exact-head gate

Bot-authored functional commits can cause this repository's PR-triggered workflows to be marked `action_required` before jobs are created. This is an execution-policy condition rather than a test conclusion. This normal repository-authored evidence commit exists to produce the final exact-head on which the standard PR workflow matrix must execute.

The PR must not be merged until this exact-head has completed the required workflow matrix successfully and review findings are reconciled.
