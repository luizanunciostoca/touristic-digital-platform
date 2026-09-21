# Control Center Visual Regression

Status: active qualification contract.

This document defines the reproducible visual-regression system for the Morro Digital Control Center. It complements functional, security, accessibility and responsive contracts; it does not replace them.

## Visual authority

Primary authority:
- Morro Digital Control Center — Manual UX Design V1.
- SHA-256: ae9aa18a07462ccab44b79250a9d28580a21ecae5ef2d3d2343d998b946c77ab.

Engineering and regression discipline:
- Morro Digital — Manual do Desenvolvedor UX Design V2.
- SHA-256: 9e4c5a637c703a6f43764f9c3ec971f4b48294ac649076fddb134ccd712de0ed.

Approved product overrides:
1. Quick Actions do not exist.
2. A floating Assistant launcher does not exist.

Those two absences are intentional and are asserted by the automated manual-compliance contract.

## What is under visual regression

The matrix contains 19 administrative surfaces:
Overview, Businesses, Business 360, Affiliates, Affiliate 360, Users, User 360, CRM, Products, Reservations, Ticketing, Orders, Financial, Content, Destinations, Support, Audit, System and Settings.

Every surface is captured at all six canonical viewports:
- 1440 × 900
- 1280 × 800
- 1024 × 768
- 768 × 1024
- 430 × 932
- 390 × 844

Total baseline count: 114 PNG images.

## Determinism

The visual runner freezes or pins every source of presentation drift that is practical to control:
- Playwright Chromium 1.54.2;
- deviceScaleFactor 1;
- locale pt-BR;
- timezone America/Bahia;
- fixed clock 2026-09-21T18:00:00.000Z;
- deterministic Math.random;
- pinned Inter 5.2.5 loaded from local WOFF2 files;
- reduced-motion media emulation;
- all CSS animations and transitions disabled during capture;
- caret hidden;
- deterministic read-only administrative fixtures;
- exact viewport dimensions;
- scroll positions reset before every capture;
- no live external network data in the visual fixture layer.

The deterministic fixtures exercise the real Control Center renderer and interaction shell. They are visual fixtures only. Domain correctness, ownership, persistence, authorization and mutation behavior remain proven by the existing owner-backed functional/browser/security contracts.

## Diff policy

Comparison engine:
- pixelmatch 5.3.0;
- PNG decoding/encoding through pngjs 7.0.0.

Thresholds:
- per-pixel threshold: 0.08;
- maximum changed-pixel ratio: 0.0002, equivalent to 0.02%.

The per-pixel threshold suppresses subpixel anti-aliasing noise. The total changed-pixel ratio remains deliberately small so geometry, spacing, typography, hierarchy, color and component drift cannot be hidden by tolerance.

A viewport fails when:
- the expected baseline is absent;
- image dimensions differ;
- changed pixels exceed 0.02%;
- a P0/P1 automated manual invariant fails;
- runtime page errors or browser console errors occur.

## Artifacts

Every comparison run emits four independent artifacts:
- control-center-visual-expected
- control-center-visual-actual
- control-center-visual-diff
- control-center-visual-report

The report records source SHA, manual hashes, toolchain, deterministic environment, viewport/surface matrix, pixel counts, diff ratios, manual-contract findings and runtime errors.

Expected baselines are also versioned in:
tests/visual-regression/control-center/baselines

The manifest records SHA-256 for each committed PNG.

## Baseline lifecycle

A new baseline is not accepted merely because the UI changed.

Normal rule:
1. change the UI for an approved requirement;
2. execute the visual comparison;
3. inspect actual and diff artifacts;
4. classify the divergence against the manual;
5. correct P0/P1 divergences;
6. update expected baselines only when the new output is the approved visual state;
7. rerun comparison on the new exact head.

The workflow contains a one-time branch-scoped bootstrap guard for the initial 114-image set. Once manifest.json sets bootstrapPending to false, pull-request runs are comparison-only.

## Manual compliance classification

P0 — blocks visual equivalence:
- wrong structural model;
- reintroduced Quick Actions;
- reintroduced floating Assistant launcher;
- broken destination-first shell;
- major missing/incorrect navigation or entity surface.

P1 — relevant divergence:
- incorrect canonical tokens;
- horizontal overflow;
- material spacing/geometry/typography/density drift;
- responsive behavior materially inconsistent with the manual;
- table/card/entity treatment materially inconsistent with the manual.

P2 — polish:
- small non-structural refinements that do not change hierarchy, clarity, readability or interaction semantics.

P0 and P1 are release-blocking for this visual contract.

## Commands

Run comparison after the deterministic runtime is available on port 4194:

node apps/morro-digital-platform/tooling/control-center-visual-regression.mjs

Explicit local baseline regeneration:

node apps/morro-digital-platform/tooling/control-center-visual-regression.mjs --update

The update mode must not be used to approve unexplained drift.

## CI

Workflow:
.github/workflows/control-center-visual-regression.yml

The workflow installs the pinned visual toolchain, builds the repository, starts an authenticated Control Center runtime, executes the matrix and uploads expected/actual/diff/report artifacts.

This visual gate is additive. Quality Gate, Security Scanning, Control Center Browser Contract, responsive/accessibility contracts and owner-domain contracts remain independently required evidence.

## Intentionally unsupported behavior

The following are not gaps:
- Quick Actions;
- floating Assistant launcher.

The following are also intentionally outside visual authority:
- arbitrary editing of balances, postings or financial state;
- client-side authorization as a substitute for server authority;
- inference of destination ownership from labels, names, addresses or location text;
- cross-domain table reads when an owner API/adapter exists;
- critical mutations while Support Mode policy denies them.

Visual fixtures do not create authority for any of those behaviors.
