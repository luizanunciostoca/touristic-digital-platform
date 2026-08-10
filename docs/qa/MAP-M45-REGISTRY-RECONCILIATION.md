# Map M45 — Feature Registry Reconciliation

## Scope

M45 reconciles the Feature Registry with the already-merged and already-validated Map migration evidence. It does not change geospatial runtime behavior, provider configuration, browser UI, routing, tour selection or fallback implementation.

Audited main base:

- `2a0d23b2a026ca4e3f3966d1af235b5ba85f811a`

Frozen V1 source used by the existing Map migration evidence:

- `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`

## Existing equivalent migration items

The Master Migration Tracker already records all Map-owned migration items as equivalent:

- `MIG-0004` — `js/map*` → `packages/geospatial`: equivalent;
- `MIG-0012` — map runtime/bootstrap → `packages/geospatial` + app geospatial bootstrap: equivalent;
- `MIG-0015` — V1 markers/map center/tour switching → V2 tour markers/selection: equivalent.

The tracker also records the evidence chain from PR #17:

- Quality Gate: `31237633579` — success;
- Map Provider Regression: `31237633601` — success;
- Map Tour Browser Regression: `31237633588` — success;
- Mapbox Visual Contract Regression: `31237633577` — success;
- validated head: `2d84629bafbcfa1dc48ec6203b2a26625ac88bcb`;
- squash merge into `main`: `41f0588d3f5bf18ea03394dbd0137bd7e2821b3c`.

## Audited Map contract

The existing permanent evidence covers:

1. Mapbox GL JS provider initialization;
2. V1 style and initial camera contract;
3. source/layer creation and V1 route paints;
4. route/tour marker replacement;
5. 8 → 5 → 5 → 8 tour switching and restoration;
6. `fitBounds`/recentring behavior;
7. provider-unavailable behavior;
8. Leaflet cartographic fallback;
9. rollback after Mapbox SDK/initialization failure;
10. browser keyboard behavior and vendor attribution/logo contract;
11. mobile/tablet/desktop visual contract;
12. forced-colors/high-contrast behavior.

No independent unresolved Map migration row is identified in the Master Migration Tracker. Navigation-specific runtime behavior remains owned by `FEATURE-0003`, which is already equivalent.

## Registry inconsistency

Before M45, `docs/features/registry.json` still reports `FEATURE-0001 — Mapa Interativo` as:

- `status: baseline-pending`;
- behavior: false;
- visual: false;
- api: false.

That state conflicts with the permanent migration tracker, which already marks the Map migration items equivalent and records executable behavioral, provider, visual and rollback evidence.

## Reconciliation decision

M45 promotes `FEATURE-0001` to:

- `status: equivalent`;
- behavior: true;
- visual: true;
- api: true.

This is a metadata/evidence reconciliation only. It does not claim a new release and does not alter the distinction between `equivalent` and `released` in the Master Migration Tracker.

## Exit gate

M45 may merge only when:

- the final diff contains documentation/registry changes only;
- the official Quality Gate is green on the final authored head;
- `features:check` accepts the promoted Registry;
- no temporary helper workflow remains in the diff;
- no unresolved PR review thread remains.
