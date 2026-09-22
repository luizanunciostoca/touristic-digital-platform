# UX Design V2 — Visual Golden Conformance Authority

This wave changes the meaning of visual regression for the Tourist UI.

The approved UX Design V2 manual, especially Section 32 and Appendix A, is the visual authority. Screenshots emitted by the current implementation are evidence only. A workflow is not allowed to certify manual conformance merely because the implementation is stable relative to itself.

## Enforced in this wave

- The canonical Place screenshot is captured in the initial `half` state, before the harness exercises `peek → half → full`.
- A single Search/Explore result on canonical mobile widths must occupy the contextual action width. A half-width orphan result now fails with `MANUAL_CONFORMANCE_SEARCH_RESULT_GEOMETRY`.
- Place initial-state drift fails with the stronger `MANUAL_CONFORMANCE_PLACE_INITIAL_GEOMETRY` guard, including state and viewport geometry.
- The durable authority manifest records the current audited status and proof obligations for Discover, Place, Search/Explore, Navigation, Tour, Assistant, Commerce and Ticketing.
- Surface conformance is recorded independently from release certification. All current surfaces may be PASS while exact-main, staging, Issue #33 or Samsung SM-X820 / Android API 36 gates remain PENDING.
- `--enforce-release` remains fail-closed while any release gate is PENDING/FAIL.

## Scope boundary

This change does not redesign Home, Place, Search/Explore, Navigation, Tour, Assistant, Commerce or Ticketing. It only turns known visual-conformance gaps into machine-checkable obligations and corrects misleading evidence capture.

`public/legacy/**` remains untouched. Quick Actions and the floating Assistant launcher remain intentionally retired.
