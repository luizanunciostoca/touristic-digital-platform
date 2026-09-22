# UX Design V2 — Manual Conformance Audit

Date: 2026-09-22

Authority: `Morro_Digital_Manual_Desenvolvedor_UX_Design_V2.pdf`, especially Section 32 and Appendix A.

This audit deliberately separates functional/browser regression from visual conformance. A green journey test or visual self-regression baseline is not sufficient to certify correspondence with the approved manual reference.

## Product decisions preserved

- Quick Actions remain intentionally absent.
- The floating Assistant launcher remains intentionally absent.
- `public/legacy/**` historical source remains frozen. Comparison from the manual baseline `a29599e0226a6b61429257069c254cf113085585` to audited main `e0d004999cd6c9efa3f7c7b1a35108d7bae59284` found no changed historical legacy source path.

## Evidence reviewed

| Surface                  | Exact evidence                                                                                          | Result against manual                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Discover / Home          | Mapbox Visual Contract run 35670011933 on `de63d8abf7e0079406c870b71c5cfd3afce68c8d`                    | Functional/map-first evidence exists, but the committed screenshot represents a routed/tour map state rather than the approved pure Discover composition. Manual golden proof remains pending.                                                         |
| Place / Search / Explore | Place Search Explore V2 Visual Regression run 35676182768 on `c83226880a6a25d78f98b10b4047e54d86d5b508` | FAIL for certification evidence. The harness validates containment/state mechanics, but the captured Place reference is taken after cycling to `full`, and Explore renders the result action with materially poor geometry at canonical mobile widths. |
| Navigation               | Navigation Visual Baseline run 35670012022                                                              | Closest current match to the approved composition: dominant instruction, route, distance/time and reachable exit. Exact-main revalidation is still required.                                                                                           |
| Tour                     | Map Tour Browser Regression run 35670012013                                                             | Functional evidence is strong, but the artifact exposes fallback screenshots while successful guided-tour states are primarily JSON evidence. Manual visual golden proof remains pending.                                                              |
| Ticketing                | Ticketing V2 Visual Regression run 35676975753 on `3a00e0e92ae61a2b9ca819f9c93d7859c5f04707`            | FAIL for manual visual conformance. Typography/tokens are unified, but the ready composition remains a long availability + form + wallet layout and does not match the approved contextual, image-led purchase hierarchy.                              |
| Shared component states  | UX V2 Component State Visual Regression run 35677874493 on `e0f06a886931f79cd111cd8b7dd394f1eed28a29`   | PASS as component regression evidence, not sufficient by itself as whole-surface manual conformance.                                                                                                                                                   |

## Evidence freshness

From `e0f06a886931f79cd111cd8b7dd394f1eed28a29` to audited main `e0d004999cd6c9efa3f7c7b1a35108d7bae59284`, GitHub comparison reported 63 commits but only nine changed files; no Tourist UI visual runtime path in the audited set changed. The only matching `apps/morro-digital-platform/src/ux/**` change was a Control Center contract test. Therefore the screenshots remain useful for identifying the manual-conformance gaps, but they do not replace the required final exact-main rerun.

## Root cause of the false green

The existing visual workflows primarily prove regression against their own implementation and mechanical invariants such as viewport containment, target size, state transitions, forced colors and absence of runtime errors. They do not currently prove the higher-level composition, hierarchy and geometry of Appendix A.

Two concrete examples:

1. The Place/Search visual workflow cycles `peek -> half -> full` before writing the canonical Place screenshot, so the evidence file is not the intended initial Place presentation.
2. Ticketing V2 regression validates the current Ticketing composition as its baseline. That protects against accidental drift but cannot prove that the baseline itself matches the approved manual reference.

## Certification state by surface

- Discover / Home: **MANUAL_GOLDEN_PENDING**
- Place: **MANUAL_CONFORMANCE_PENDING**
- Search / Explore: **MANUAL_CONFORMANCE_FAIL**
- Navigation: **MANUAL_CONFORMANCE_PASS_PENDING_EXACT_MAIN**
- Tour: **MANUAL_GOLDEN_PENDING**
- Assistant: **MANUAL_GOLDEN_PENDING**
- Commerce: **MANUAL_GOLDEN_PENDING**
- Ticketing: **MANUAL_CONFORMANCE_FAIL**
- Physical Samsung SM-X820 / API 36: **NOT_EXECUTED**

## Release rule

Do not publish `UX_DESIGN_V2 = CERTIFIED` while any surface above is FAIL/PENDING or before the physical Samsung acceptance is complete.

The final acceptance workflow must also execute the dedicated Place/Search/Explore, Ticketing V2 and component-state visual suites, plus PWA and performance gates, on the exact certifying main SHA.
