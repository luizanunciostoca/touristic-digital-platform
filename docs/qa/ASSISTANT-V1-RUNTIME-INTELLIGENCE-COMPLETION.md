# Assistant V1 Runtime Intelligence Completion — Exact-Head Evidence

## Scope

PR #73 (`fix/assistant-v1-runtime-intelligence-completion`) closes runtime/intelligence gaps found after the V1→V2 assistant parity review.

The canonical V1 source was revalidated directly from `morro-de-sao-paulo-digital-main.zip`. Its intent engine exposes 36 canonical intents, all of which are represented by the V2 contract. The implementation preserves the V1 deterministic-first architecture: typed input, voice input, visible options and allowlisted LLM actions converge on the same semantic execution path; local/catalog resolution remains authoritative before LLM fallback; navigation requires explicit confirmation before starting; profile/favorites/context use shared runtime instances.

## Functional changes validated

- semantic Explore command execution is injected into the production browser runtime instead of using DOM `.click()` as the production domain core;
- typed, voice and programmatic inputs share the same processing path;
- strict LLM actions (`show_category:*`, `show_place:*`) are translated into the same typed Explore commands and have direct allowlist regression coverage;
- asynchronous Explore/geolocation results are generation-guarded against stale UI mutation;
- routed Explore commands record dialogue history and profile interactions while preserving the shared user-profile instance;
- Explore detail/tour/menu transitions synchronize into assistant context through the observable Explore state event;
- favorites support add, remove, list and multi-turn `awaiting_place` operation persistence;
- successful navigation arrival records profile navigation success;
- navigation uses `navigate → awaiting_confirmation → confirm/deny`, with pending-route lifecycle in dialogue context;
- explicit domain/navigation commands interrupt stale `awaiting_*` slot capture rather than being reinterpreted as slot values;
- legacy DOM fallback is guarded against synchronous option-event re-entry; production remains on the injected typed Explore port;
- `place_search` remains local/catalog/Mapbox-first and preserves the V1 Dice fuzzy threshold of `0.55` before provider fallback;
- V1 `recommendation`, `compare` and `category_filtered` intent families are restored to the central intent contract and executable handlers;
- filtered category requests execute the real typed Explore sequence (`open_category` followed by the canonical filter/nearby command), rather than returning recommendation text without applying the map filter;
- V1 `transport`, `accessibility` and `practical_tips` are handled deterministically before LLM fallback, matching the canonical V1 ordering;
- contextual menu / proactive recommendation logic is connected to the shared profile and runtime intelligence handlers and can consume the live weather provider;
- direct category intents produce deterministic typed category actions;
- explicit category routing no longer misclassifies place-detail text such as `Fale sobre Primeira Praia` merely because the place name contains `praia`;
- V1 global Explore commands (`show all`, nearby, back to filters/menu and map aliases) execute through the typed Explore port;
- numeric assistant option selection resolves against the current presentation while preserving the user's submitted text in UI/history;
- multilingual PT/EN/ES/HE intent aliases and response paths remain covered by the assistant/domain suites.

## Canonical V1 reconciliation

The ZIP audit confirmed the canonical intent set:

`accessibility`, `cancel_navigation`, `category_attractions`, `category_beaches`, `category_emergencies`, `category_filtered`, `category_hotels`, `category_nightlife`, `category_restaurants`, `category_shops`, `category_tours`, `compare`, `confirm`, `cultural_history`, `deny`, `favorites`, `greeting`, `help`, `hours`, `more_info`, `my_location`, `navigate`, `nearby`, `open_now`, `photos`, `place_search`, `practical_tips`, `price`, `recommendation`, `select_option`, `show_all`, `show_map`, `thanks`, `transport`, `unknown`, `weather`.

The reconciliation also confirmed: awaiting-state precedence; local/exact/alias/partial/fuzzy search before Mapbox; the `0.55` fuzzy threshold; contextual navigation confirmation; numeric option selection; proactive time/weather/profile/history inputs; deterministic transport/accessibility/practical-tip handling; and real subcategory-filter application for `category_filtered`.

## Validation evidence

Earlier guarded closures produced and validated the semantic runtime, awaiting lifecycle, profile/favorites integration, recommendation/compare support, global command handling, numeric selection, stale-result guards and review findings. Functional commit `8ef9d9b6cc52b200c8414349de31270b0ba769df` closed the remaining runtime review findings after Assistant/platform tests, typechecks and workspace build passed.

The final ZIP-driven parity closure produced functional commit `b3058395300fad3663903ef8db3dc61bc1b36d09`. Before that commit was promoted, the guarded run passed all of these gates on the exact generated source tree:

- patch application — PASS;
- affected-file Prettier formatting — PASS;
- `pnpm --filter @touristic/assistant test` — **149/149 PASS** across 19 files;
- `pnpm --filter @touristic/assistant typecheck` — PASS;
- `pnpm --filter @touristic/morro-digital-platform test` — **503/503 PASS** across 100 files;
- `pnpm --filter @touristic/morro-digital-platform typecheck` — PASS;
- `pnpm -w build` — **22/22 packages PASS**;
- `git diff --check` — PASS.

The original attempt to push the same validated tree failed only because the Actions token is intentionally not allowed to update `.github/workflows`. Source promotion was therefore separated from workflow/evidence maintenance: the bot pushed only validated source/test files, while the normal repository connection performs the browser-gate update and removes temporary finalizers.

## Exact-head gate

Bot-authored functional commits can cause this repository's pull-request workflows to be marked `action_required` before jobs are created. This is an execution-policy condition rather than a test conclusion.

The normal repository-authored cleanup/evidence commit that contains this document, removes temporary finalizers and updates the V1 browser regression is the candidate exact-head. PR #73 must not be merged until the complete standard PR workflow matrix succeeds on that same exact SHA and review findings are reconciled.
