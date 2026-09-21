# UX Design V2 — Completion Checklist

Canonical source of truth: GitHub LIVE + `Morro_Digital_Manual_Desenvolvedor_UX_Design_V2`.

This checklist reconciles the manual with the implementation already merged into `main` and the final Assistant/composer closure in PR #217. A status is only upgraded to **DONE** after code, accessibility, browser regression and exact-head CI evidence agree.

## Visual reference surfaces

| Surface                    | Status                              | Current implementation                                                                                                                                                                                              | Remaining work                                                                                                                           |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Discover / Home            | DONE                                | Map-first shell, Weather, Explore, canonical persistent Assistant composer, responsive matrix and semantic V2 tokens.                                                                                               | Final post-merge exact-main revalidation.                                                                                                |
| Place                      | IMPLEMENTED / CERTIFICATION PENDING | Selected-place presentation now uses a real `md-bottom-sheet` consumer with peek/half/full, verified local media/metadata, existing semantic actions and Commerce/Ticketing CTA preservation.                       | Exact-head browser/CI certification and physical Android verification.                                                                   |
| Navigation                 | DONE                                | Canonical V2 navigation banner, outdoor hierarchy, one-hand end action, turn-by-turn, accessibility and visual contracts.                                                                                           | Final post-merge exact-main revalidation.                                                                                                |
| Tour                       | IMPLEMENTED / CERTIFICATION PENDING | Immersive map flow keeps V1 controller authority while visible intro/list/stop/finale content is projected into the shared V2 Bottom Sheet/Card composition with narration and controls preserved.                  | Exact-head Map Tour/Tour responsive browser certification and physical Android verification.                                             |
| Assistant                  | DONE / REVALIDATING MAIN            | PR #217 is merged. Shared accessible shell, text/voice/photos/place actions, contextual map behavior, loading skeleton and canonical composer-only entry are active; floating mood/quick-action trigger is retired. | Revalidate exact-main together with the converged Place/Search/Tour surfaces and Weather focus trap.                                     |
| Commerce                   | DONE                                | Tourist UI identity, shared cards/buttons, contextual mobile bottom sheet and preserved tourist snapshot/return path.                                                                                               | Final post-merge exact-main revalidation.                                                                                                |
| Ticketing                  | DONE                                | Poppins/semantic Design System V2 convergence, shared components, skeletons, transaction/QR flows and Ticketing contracts.                                                                                          | Final exact-head M147/M148 evidence for the certifying SHA.                                                                              |
| Business/Admin foundations | PARTIAL                             | Shared accessibility/design-token foundations exist; business density may remain B2B-specific as allowed by the manual.                                                                                             | Continue Control Center visual convergence in its dedicated workstream; do not couple unrelated admin PRs into Tourist UI certification. |

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
- [x] Ticketing visual identity converged with Tourist UI.
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
- [~] Journey-level visual regression is broad; dedicated component-state snapshot coverage can still be expanded for the complete manual table.
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

## Remaining implementation order after PR #217

1. Certify the Place/Search/Tour convergence branch on its exact HEAD and merge only at 0-behind with zero unresolved review threads.
2. Revalidate the resulting merge commit on `main`, including the Weather focus contract.
3. Expand component-state visual regression where the manual matrix is not yet explicitly covered.
4. Execute physical SM-X820/API36 acceptance and record durable evidence.
5. Update Issue #33 / canonical UX certification record only when blockers are genuinely zero.

## Definition of done

UX Design V2 is not certified merely because foundations exist. Certification requires:

- Place/Search/Tour presentation gaps closed and exact-head verified;
- PR #217 merged and the final convergence merge commit exact-main verified;
- required exact-head CI green;
- no unresolved review threads;
- Android physical gate completed;
- no known UX blocker remaining.
