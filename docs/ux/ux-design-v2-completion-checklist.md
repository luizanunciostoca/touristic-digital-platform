# UX Design V2 — Completion Checklist

Canonical source of truth: GitHub LIVE + `Morro_Digital_Manual_Desenvolvedor_UX_Design_V2`.

This checklist reconciles the manual with the implementation already merged into `main` and the final Assistant/composer closure in PR #217. A status is only upgraded to **DONE** after code, accessibility, browser regression and exact-head CI evidence agree.

> **Control Tower audit 2026-09-22:** functional/browser PASS is not equivalent to manual visual conformance. See [UX-DESIGN-V2-MANUAL-CONFORMANCE-AUDIT-2026-09-22.md](./UX-DESIGN-V2-MANUAL-CONFORMANCE-AUDIT-2026-09-22.md). Any older `DONE` label is subordinate to the manual-conformance status below until exact-main visual evidence and the physical Samsung gate pass.

## Unified Contextual Assistant Dock convergence

Implementation candidate: `wave/ux-v2-unified-assistant-dock-convergence-20260922`.

- [x] One fixed dock owns Assistant message, composer and five-action navigation.
- [x] Horizontal category rail is integrated between message and composer inside the same dock.
- [x] Category chips dispatch existing Assistant option routing and do not duplicate business logic.
- [x] Category rail is touch-scrollable, single-row, scroll-snapped, RTL-aware and 44px-target-safe.
- [x] Legacy external Discover category rail is visually retired while unified dock authority is active.
- [x] Standard Assistant text is bounded and internally scrollable.
- [x] Rich Assistant content has a separate bounded presentation cap.
- [x] Send and Voice remain persistently reachable before input focus.
- [x] Composer focus no longer controls primary action visibility.
- [x] Runtime dock height is measured and published as map/UI inset state.
- [x] Explore map framing consumes dock-aware bottom padding.
- [x] Discover category rail and map controls consume measured dock height.
- [x] Onboarding/finish-toast positioning consumes measured dock height.
- [x] Persistent message semantics are a region rather than a modal dialog.
- [x] Wave B / Home / Wave G source contracts updated for the new composition.
- [x] Bounded long-response browser assertion added.
- [ ] Exact-head CI green on the candidate branch.
- [ ] Dedicated candidate visual evidence reviewed on 390x844 / 430x932.
- [ ] Safari iPhone physical screenshot reviewed against the approved mockup.
- [ ] Merge to `main` and post-merge exact-main regression certification.

## Visual reference surfaces

| Surface                    | Manual-conformance status                  | Current implementation / evidence                                                                                                                                                                                                       | Remaining work                                                                            |
| -------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Discover / Home            | MANUAL_GOLDEN_PENDING                      | Map-first runtime, Weather, Explore and canonical Assistant composer are implemented. Existing Mapbox evidence does not capture the approved pure Discover composition as its canonical screenshot.                                     | Capture and review exact-main Discover golden against Appendix A.                         |
| Place                      | MANUAL_CONFORMANCE_PENDING                 | Real `md-bottom-sheet` consumer with peek/half/full and canonical actions exists. Current visual harness writes the canonical Place screenshot after cycling to `full`, so that artifact does not prove the intended initial hierarchy. | Correct visual evidence and compare exact-main initial Place geometry against Appendix A. |
| Search / Explore           | MANUAL_CONFORMANCE_FAIL                    | Shared Bottom Sheet and semantic flow authority are implemented. Canonical mobile evidence shows materially poor result-card geometry despite the workflow passing.                                                                     | Dedicated visual convergence and a regression assertion that rejects the bad geometry.    |
| Navigation                 | MANUAL_CONFORMANCE_PASS_PENDING_EXACT_MAIN | Dominant guidance, route, distance/time and reachable exit closely match the approved hierarchy.                                                                                                                                        | Re-run visual/a11y evidence on the final exact-main SHA and physical device.              |
| Tour                       | MANUAL_GOLDEN_PENDING                      | V1 controller authority is preserved and V2 sheet/card presentation exists. Current artifact contains fallback screenshots; successful guided states are mostly JSON evidence.                                                          | Capture exact-main guided-tour goldens for intro/stop/finale and compare with Appendix A. |
| Assistant                  | MANUAL_GOLDEN_PENDING                      | Shared accessible shell, contextual map behavior, text/voice/photos and composer-only entry are active. Floating launcher/Quick Actions remain intentionally retired.                                                                   | Exact-main manual visual review together with Home/Place and physical keyboard.           |
| Commerce                   | MANUAL_GOLDEN_PENDING                      | Semantic components, contextual preview sheet and tourist snapshot/return path exist.                                                                                                                                                   | Exact-main contextual handoff/return visual proof against the unified journey.            |
| Ticketing                  | MANUAL_CONFORMANCE_FAIL                    | Poppins/tokens/components and transaction/QR contracts are implemented, but current ready-state visual evidence remains a long availability/form/wallet composition rather than the approved contextual image-led purchase hierarchy.   | Dedicated Ticketing visual convergence while preserving M147/M148 behavior.               |
| Business/Admin foundations | PARTIAL / SEPARATE WORKSTREAM              | Shared accessibility/design-token foundations exist; B2B density may differ as allowed by the manual.                                                                                                                                   | Control Center convergence remains independent of Tourist UI certification.               |

## Manual master checklist reconciled

### Foundations and Design System

- [x] Mobile zoom remains enabled.
- [x] `.sr-only` remains in the accessibility tree.
- [x] 44 px minimum interactive target foundation.
- [x] Global `:focus-visible` contract.
- [x] `svh` / `dvh` safe viewport strategy.
- [x] Reduced-motion contract.
- [x] Forced-colors contract.
- [x] Design Tokens V2 promoted to canonical semantic authority.
- [x] Tourist UI typography converged on the canonical font token.
- [x] Light/dark/high-contrast/destination theme composition.
- [x] Semantic z-layer authority for migrated V2 surfaces.
- [x] Semantic motion-duration/easing authority for migrated V2 surfaces.
- [x] Shared Button/IconButton/Card/Input/Dialog/Skeleton foundations.
- [x] Shared Banner/Toast adopted by real feedback surfaces.
- [x] Stylelint governance is part of Quality Gate.
- [x] Deterministic `legacy.bundle.css` build exists while `public/legacy/**` remains frozen evidence.
- [x] Hardcoded pixel debt reduced on migrated V2 surfaces.
- [~] Cascade remains intentionally hybrid while frozen V1 evidence is still loaded; migration is surface-by-surface.
- [~] `!important` retirement remains surface-by-surface; frozen legacy is not bulk-edited.

### Tourist experience

- [x] Map-first Home/Discover hierarchy.
- [x] Experience mode runtime and presentation precedence.
- [x] Navigation mode reduces unrelated discovery controls.
- [x] Outdoor readability foundations and Navigation/Tour ergonomics.
- [x] One-hand placement contracts for operational actions.
- [x] Progressive skeleton adoption across core tourist surfaces.
- [x] Commerce mobile Bottom Sheet.
- [x] Place Bottom Sheet as a real runtime consumer with peek/half/full and no duplicated initial Assistant action set.
- [x] Search/Explore Bottom Sheet as a real runtime consumer while retaining map-first context and semantic flow authority.
- [x] Tour visible intro/list/stop/finale surfaces converged on the shared Bottom Sheet/Card composition without changing Tour controller authority.
- [x] Tourist experience snapshot across Commerce handoff/return.
- [~] Full end-to-end context restoration is implemented for current snapshot fields; revalidate after Place/Search/Tour sheet adoption.
- [x] Navigation banner V2.
- [x] Onboarding modularization.
- [x] Assistant accessible shell V2.
- [x] Assistant photo Carousel V2.
- [x] Assistant contextual text/voice/photo/place-action behavior.
- [x] Assistant loading skeleton and semantic state feedback.
- [x] Floating Assistant icon / quick-actions removed from UX V2 in PR #217.
- [x] Onboarding reduced to six real steps in PR #217.
- [x] Weather modal initial focus hardened in PR #217.
- [x] Assistant composer-focus / mobile-keyboard refocus regression fixed in PR #217.

### Commerce and Ticketing

- [x] Commerce shares Tourist UI semantic tokens/components.
- [x] Contextual Commerce preview uses `md-bottom-sheet` on mobile.
- [x] Commerce return path preserves tourist context.
- [~] Ticketing typography/tokens are converged, but Appendix A composition/hierarchy is **not yet visually certified**.
- [x] Ticketing uses shared typography/tokens/components.
- [x] Ticketing loading skeletons.
- [x] Reservation, quantity, checkout, QR and transaction behavior preserved.
- [x] Exact-head Ticketing M147 and M148 evidence exists for merged PR #217; the final convergence SHA must re-run the affected matrix before certification.

### Accessibility, responsive and QA

- [x] Browser keyboard/focus contracts.
- [x] 200% text/reflow coverage in relevant browser gates.
- [x] Reduced motion and forced colors coverage.
- [x] Expanded canonical viewport matrix including portrait and landscape cases.
- [x] Home/Mapbox/Navigation/Tour/Assistant/Commerce browser regression gates.
- [x] Dedicated component-state visual regression exists.
- [ ] Whole-surface visual conformance against Appendix A is complete for Discover, Place/Search, Tour, Commerce and Ticketing.
- [ ] Physical Samsung SM-X820 / Android API 36 certification with real keyboard, orientation, blur/GPU/map and Assistant evidence.
- [ ] Final exact-main post-merge audit and Issue #33 certification update.

## PR #217 merged baseline ledger

Current product decisions:

- Assistant composer = canonical entry.
- Floating Assistant icon = retired.
- Quick actions = retired.
- Onboarding = 6 steps.
- `public/legacy/**` remains frozen historical evidence.

Mandatory exact-head gates include the automatically triggered UX/browser/security matrix plus explicit:

- Map Provider Regression;
- Ticketing M147 Contract;
- Ticketing M148 Transaction Contract;
- Morro Runtime Startup Performance.

PR #217 was merged only after its exact-head UX matrix was green. The final Place/Search/Tour convergence still requires a fresh exact-head matrix because evidence from #217 does not certify a newer SHA.

## Remaining implementation order after Control Tower audit

1. Close the manual-conformance gaps for Search/Explore and Ticketing without changing `public/legacy/**`.
2. Produce missing exact visual goldens for Discover, initial Place, successful Tour states, Assistant and Commerce handoff/return.
3. Reconcile all visual waves onto current `main`, require 0-behind, zero unresolved review threads and exact-head CI.
4. Run Final Release Acceptance with dedicated V2 visual, PWA and performance gates on the certifying SHA.
5. Publish staging exactly from that SHA and prove release identity.
6. Execute physical SM-X820/API36 acceptance and record durable evidence.
7. Update Issue #33 / canonical UX certification record only when blockers are genuinely zero.

## Definition of done

UX Design V2 is not certified merely because foundations exist. Certification requires:

- Place/Search/Tour presentation gaps closed and exact-head verified;
- PR #217 merged and the final convergence merge commit exact-main verified;
- required exact-head CI green;
- no unresolved review threads;
- Android physical gate completed;
- no known UX blocker remaining.
