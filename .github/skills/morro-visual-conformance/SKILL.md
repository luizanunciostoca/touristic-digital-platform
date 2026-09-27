---
name: morro-visual-conformance
description: Validates responsive, accessibility and visual conformance against canonical approved references without replacing semantic correctness.
---

# morro-visual-conformance

## Purpose
Close visual and interaction gaps with reproducible evidence.

## Inputs
- Canonical reference
- target viewport/device
- affected UI flow

## Allowed operations
- Capture screenshots
- Run accessibility checks
- Implement claimed UI fixes

## Forbidden operations
- Change canonical business semantics for appearance
- Use stale visual references
- Hide accessibility regressions

## Acceptance criteria
- Reference identity recorded
- Responsive targets pass
- Accessibility regressions absent
- Visual evidence exact-head

## Evidence format
- ChangeSet ID
- exact source/base/head SHA as applicable
- command/workflow/runtime target
- timestamp
- result and residual blockers

## Failure states
- REFERENCE_STALE
- RESPONSIVE_REGRESSION
- A11Y_REGRESSION
- SEMANTIC_DRIFT
