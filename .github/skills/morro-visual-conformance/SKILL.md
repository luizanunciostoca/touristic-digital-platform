---
name: morro-visual-conformance
description: Validate responsive, accessibility, and visual conformance against canonical approved references.
---

# morro-visual-conformance

## Purpose

Close visual/interaction gaps without changing semantic authority.

## Inputs

- Canonical reference identity
- viewport/device
- affected UI flow

## Allowed operations

- Capture screenshots
- Run accessibility checks
- Implement claimed UI fixes

## Forbidden operations

- Change backend truth for appearance
- Use stale references
- Hide accessibility regressions

## Acceptance criteria

- Reference identity recorded
- Responsive targets pass
- No accessibility regression
- Evidence exact-head

## Evidence format

- ChangeSet ID.
- Exact base/head/source SHA as applicable.
- Command, workflow run, or runtime target.
- Timestamp, result, and residual blockers.

## Failure states

- REFERENCE_STALE
- RESPONSIVE_REGRESSION
- A11Y_REGRESSION
- SEMANTIC_DRIFT
