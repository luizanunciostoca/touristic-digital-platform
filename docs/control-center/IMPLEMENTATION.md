# Morro Digital Control Center — Implementation State

This file is the current implementation index. Historical wave notes, old GAP/PASS tables and superseded readiness claims were removed because they are not exact-head release evidence.

Canonical current-state ledger:
docs/control-center/CONTROL-CENTER-LEDGER.md

Visual authority mapping:
docs/control-center/UX-DESIGN-V1.md

Deterministic visual regression:
docs/control-center/VISUAL-REGRESSION.md

## Current implementation boundaries

The Control Center is an administrative projection over domain-owned capabilities. It does not become the owner of Auth, Business, CRM, Ticketing, Financial, Affiliates, Content or Destination state.

Presentation files:
- apps/control-center/public/index.html
- apps/control-center/public/control-center.css
- apps/control-center/public/control-center.js
- apps/control-center/public/control-center-ux-v1.js
- apps/control-center/public/control-center-primitives.js

Administrative boundary:
- apps/morro-digital-platform/tooling/admin-api.mjs
- apps/morro-digital-platform/tooling/admin-domain-adapters.mjs

## Product decisions

The approved Control Center UX manual remains the visual and structural authority with two later product overrides:
- no Quick Actions;
- no floating Assistant launcher.

Neither absence is a gap.

## Ownership invariants

Destination:
- destinationId must come from an explicit canonical owner relation;
- destination is never inferred from names, labels, addresses or location text.

Affiliates:
- affiliates belong to Morro Digital;
- destination assignment is an explicit relationship;
- businesses do not own affiliates;
- Financial retains payout, wallet and settlement authority.

Support:
- real actor remains identifiable;
- effective user is separate;
- reason is mandatory;
- support context is visibly distinct;
- policy-denied critical mutations remain denied.

Security:
- browser visibility is not authorization;
- critical actions retain server capability checks and their applicable step-up/reason/confirmation/audit controls;
- secrets remain server-side.

## Qualification model

A state is not complete merely because code exists.

Current evidence must be tied to the exact candidate head and must include the relevant subset of:
- static contracts;
- lint/typecheck/build;
- domain/unit/integration tests;
- browser contracts;
- accessibility and responsive contracts;
- security checks;
- deterministic visual regression;
- cross-PR semantic validation.

Skipped workflows are not PASS evidence.

## Visual regression

The visual system covers 19 surfaces at 6 exact viewports for 114 expected images.

It provides:
- deterministic fixtures;
- frozen time/locale/timezone;
- pinned Chromium;
- pinned embedded Inter;
- disabled motion;
- exact viewport capture;
- versioned expected baselines;
- actual, expected, diff and JSON report artifacts;
- strict pixel-diff tolerance;
- P0/P1 automated manual-invariant checks.

The definitive policy is in:
docs/control-center/VISUAL-REGRESSION.md

## Status reporting

Do not copy a historical branch SHA, workflow result or readiness label into this document as if it were current.

For a release or PR decision, read GitHub LIVE and report:
- current main SHA;
- current candidate HEAD;
- stacked/base HEAD when applicable;
- relevant CI from the same candidate state;
- unresolved P0/P1 findings;
- semantic collisions with parallel PRs.

This keeps documentation descriptive and durable while release status remains evidence-driven.
