# Search M36 — Baseline Evidence

## Scope

M36 freezes the Search & Discovery V1 contract for `FEATURE-0002` without adding a Search or Marketplace runtime implementation.

## Frozen source

- Repository: `luizidebook/morro-de-sao-paulo-digital`
- Commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`
- Canonical POI catalog: `js/map/locations/locations.js`
- Search provider audited: `js/map/integrations/mapbox-search-service.js`

## Ownership decision

The audit separates Search core from adjacent consumers:

- Assistant retains profile, time, weather and conversational recommendation orchestration.
- Navigation retains GPS proximity, cooldown, session priority and message lifecycle.
- Business onboarding remains a future `FEATURE-0005` consumer.
- Search owns deterministic catalog querying/filtering and external-search provider contracts.

## Matrix result

`SEARCH-MIGRATION-MATRIX.md` records 22 core contracts:

- PASS: 5
- PARTIAL: 4
- GAP: 13

The score is intentionally conservative. Existing V2 Assistant matching proves reusable behavior but does not constitute a Search-owned API or UI.

## Implementation order frozen

1. Freeze exact POI category/count/tag/location inventory.
2. Establish one shared immutable V1 POI read model.
3. Create domain-neutral local query/filter primitives.
4. Add the audited Mapbox Search provider adapter.
5. Compose local and external discovery without invented ranking.
6. Port result presentation and PT/EN/ES/HE states.
7. Add browser integration regressions.
8. Consider equivalence only after every matrix row is green.

## Decision

M36 is a baseline milestone. `FEATURE-0002` remains `baseline-pending`. No `packages/search`, `packages/marketplace`, provider credential or production behavior is introduced by this PR.
