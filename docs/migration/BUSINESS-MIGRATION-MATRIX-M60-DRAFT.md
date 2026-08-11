# M60 migration decision draft

This checkpoint exists only to record the M60 status transition candidate before final CI.

If the final permanent PR head passes the official Quality Gate plus Business Auth, Dashboard, Onboarding Adapter, Onboarding Browser, Route Browser, Profile Browser, Workspace Browser and Navigation Accessibility contracts, `Partner workspace adapter` may move from `GAP` to `PASS` in `BUSINESS-MIGRATION-MATRIX.md`.

Expected score after that validated transition: `15 PASS / 3 PARTIAL / 1 GAP / 1 N/A` across 20 frozen contracts.

No other row should be promoted as part of M60. In particular:

- `Live Business runtime` remains `PARTIAL`.
- `Business profile behavior` remains `PARTIAL`.
- `Commercial conversion adapter` remains `GAP`.
- `Checkout client` remains `N/A` under Payments ownership.

This draft must be removed or folded into the canonical migration matrix before merge.
