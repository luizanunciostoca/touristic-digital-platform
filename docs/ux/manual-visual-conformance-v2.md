# UX Design V2 - Manual Visual Conformance

Authority: `Morro_Digital_Manual_Desenvolvedor_UX_Design_V2.pdf`, especially Sections 5, 9-12, 32-34 and Appendix A.

A stable implementation screenshot is evidence only. It is not a visual authority. A new golden may be frozen only after manual comparison and human review. Quick Actions and the floating Assistant launcher are approved retired product decisions and are not defects.

| Surface | Status | Manual authority | Current blocker / proof still required | Owner |
| --- | --- | --- | --- | --- |
| Discover / Home | PARTIAL | Section 32 + Appendix A | Pure Discover golden; map dominance; Weather/Explore/composer collision proof | Home/Discover |
| Place | PARTIAL | Sections 10, 32 + Appendix A | Initial contextual-sheet golden before state cycling; preserve map context | Place/Search |
| Search / Explore | FAIL | Sections 5, 10, 32 + Appendix A | Mobile result geometry can collapse into an orphan action; CI now rejects it | Search/Explore visual convergence |
| Navigation | PARTIAL | Sections 9, 32 + Appendix A | Exact-main golden with dominant instruction and reachable exit | Navigation |
| Tour | PARTIAL | Sections 9, 32 + Appendix A | Successful intro/stop/finale goldens; fallback screenshots are insufficient | Tour |
| Assistant | PARTIAL | Sections 9, 11, 32 + Appendix A | Composer-first golden; map remains dominant; keyboard does not destroy hierarchy | Assistant |
| Commerce | PARTIAL | Sections 9, 12, 32 + Appendix A | Contextual handoff and return goldens | Commerce |
| Ticketing | FAIL | Section 32 + Appendix A | Current availability + form + wallet composition is not an accepted consumer-booking golden; CI now requires image-led purchase context | Ticketing visual convergence |

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

`UX V2 Manual Golden Conformance` is a dedicated workflow. Pull requests validate the authority contract. A workflow-dispatch run is fail-closed and refuses final certification while the conformance manifest contains FAIL/PENDING states.

Final Release Acceptance dispatches this workflow on the exact certifying main SHA, so a missing baseline, unresolved visual blocker or stale authority state blocks the release candidate.

## Physical acceptance

Samsung SM-X820 / Android API 36 is deliberately outside this wave. The physical visual checklist is: portrait/landscape, virtual keyboard, safe areas, map/GPU/blur behavior, Weather/Explore/composer collision, Place sheet states, Navigation exit/safety reachability, Tour controls, Assistant composer, Commerce return context and Ticketing CTA/media hierarchy.
