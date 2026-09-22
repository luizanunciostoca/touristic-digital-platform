# UX Design V2 — Visual Golden Conformance Authority

This wave changes the meaning of visual regression for the Tourist UI.

The approved UX Design V2 manual, especially Section 32 and Appendix A, is the visual authority. Screenshots emitted by the current implementation are evidence only. A workflow is not allowed to certify manual conformance merely because the implementation is stable relative to itself.

## Enforced in this wave

- The canonical Place screenshot is captured in the initial `half` state, before the harness exercises `peek → half → full`.
- A single Search/Explore result on canonical mobile widths must occupy the contextual action width. A half-width orphan result now fails with `MANUAL_CONFORMANCE_SEARCH_RESULT_GEOMETRY`.
- Place initial-state drift fails with `MANUAL_CONFORMANCE_PLACE_INITIAL_STATE`.
- The durable authority manifest records the current audited status and proof obligations for Discover, Place, Search/Explore, Navigation, Tour, Assistant, Commerce and Ticketing.
- Certification remains forbidden while any audited surface is FAIL/PENDING or while the physical Samsung SM-X820 / Android API 36 gate is incomplete.

## Scope boundary

This change does not redesign Home, Place, Search/Explore, Navigation, Tour, Assistant, Commerce or Ticketing. It only turns known visual-conformance gaps into machine-checkable obligations and corrects misleading evidence capture.

`public/legacy/**` remains untouched. Quick Actions and the floating Assistant launcher remain intentionally retired.
