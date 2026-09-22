# UX Design V2 - Manual Visual Conformance

Authority: `Morro_Digital_Manual_Desenvolvedor_UX_Design_V2.pdf`, especially Sections 5, 9-12, 32-34 and Appendix A.

A stable implementation screenshot is evidence only. It is not a visual authority. A new golden may be frozen only after manual comparison and human review. Quick Actions and the floating Assistant launcher are approved retired product decisions and are not defects.

| Surface          | Status | Manual authority                | Current proof                                                                           | Owner                             |
| ---------------- | ------ | ------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------- |
| Discover / Home  | PASS   | Section 32 + Appendix A         | Pure Discover artifact; map dominance; Weather/Explore/composer hierarchy               | Home/Discover                     |
| Place            | PASS   | Sections 10, 32 + Appendix A    | Initial contextual-sheet golden before state cycling; map context preserved             | Place/Search                      |
| Search / Explore | PASS   | Sections 5, 10, 32 + Appendix A | Mobile result width guard; no half-width orphan; viewport/map-context evidence          | Search/Explore visual convergence |
| Navigation       | PASS   | Sections 9, 32 + Appendix A     | Dominant instruction, route/time visibility and reachable exit                          | Navigation                        |
| Tour             | PASS   | Sections 9, 32 + Appendix A     | Successful intro/stop/finale goldens                                                    | Tour                              |
| Assistant        | PASS   | Sections 9, 11, 32 + Appendix A | Composer-first evidence; map remains dominant; no floating launcher                     | Assistant                         |
| Commerce         | PASS   | Sections 9, 12, 32 + Appendix A | Contextual handoff + return-to-tourist-context goldens and context restoration contract | Commerce                          |
| Ticketing        | PASS   | Section 32 + Appendix A         | Image-led booking hierarchy; 200% text reflow; transaction/QR authority preserved       | Ticketing visual convergence      |

## Visual reference matrix

The machine-readable matrix is `tests/visual-regression/ux-v2-manual-reference-matrix.json`.

Mandatory viewports: 360x800, 390x844, 430x932, 768x1024, 1440x900 and compact landscape. Mandatory variants: light, dark, 200% text, forced colors and reduced motion.

Each surface records state, expected hierarchy, dominant region, controls, hidden controls, geometry constraints and manual reference.

## Geometry authority

Map-first surfaces must preserve meaningful map context. Place sheet guidance follows the manual: peek about 25-30dvh, half about 50-60dvh, full for extended content. Controls, sheets, navigation, CTAs, cards and typography may not be masked from perceptual comparison.

CI must reject at least: horizontal overflow, character-by-character wrapping, offscreen touch targets, Privacy/navigation overlap, Search result collapse, full-screen sheets that erase required map context, Ticketing without image-led purchase context, and CTAs that cannot be reached in the canonical viewport.

## Golden lifecycle

1. Capture deterministic evidence.
2. Compare against the manual / Appendix A.
3. If non-conformant, fix the owning product wave.
4. Obtain human visual review.
5. Record reviewer, evidence and exact SHA.
6. Only then freeze the golden.

The current screenshot must never be promoted automatically merely because a screenshot diff is stable.

## Final candidate

`UX V2 Manual Golden Conformance` is a dedicated workflow. Pull requests validate the authority contract. Surface conformance and release certification are separate: a workflow-dispatch run is fail-closed while any surface is non-conformant or any release gate (exact-main, staging exact-SHA, Issue #33, Samsung physical) remains PENDING/FAIL.

Final Release Acceptance dispatches this workflow on the exact certifying main SHA, so a missing baseline, unresolved visual blocker or stale authority state blocks the release candidate.

## Physical acceptance

Samsung SM-X820 / Android API 36 is deliberately outside this wave. The physical visual checklist is: portrait/landscape, virtual keyboard, safe areas, map/GPU/blur behavior, Weather/Explore/composer collision, Place sheet states, Navigation exit/safety reachability, Tour controls, Assistant composer, Commerce return context and Ticketing CTA/media hierarchy.
