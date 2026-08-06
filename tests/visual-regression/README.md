# V1 × V2 Visual Regression

This directory defines the reproducible visual-equivalence process for the Touristic Digital Platform migration.

## Gates

A journey can move from `baseline-pending` to `equivalent` only when all configured viewports have:

1. a captured V1 baseline;
2. a captured V2 image from the same state;
3. a generated diff;
4. a reviewed report;
5. a recorded rollback reference.

## Artifact layout

```text
reports/visual-regression/<journey>/<viewport>/
├── baseline.png
├── current.png
├── diff.png
└── report.json
```

## Determinism requirements

- Use the same viewport, device scale factor, locale and timezone.
- Disable animations and transitions during capture.
- Freeze time-dependent content.
- Replace remote or rotating media with audited fixtures.
- Wait for fonts, images and network-idle before capture.
- Do not approve differences caused by missing V1 evidence.

## Statuses

- `baseline-pending`: V1 evidence has not yet been materialized.
- `captured`: both images exist.
- `diff-review`: comparison was generated and awaits review.
- `equivalent`: approved within the declared threshold.
- `blocked`: deterministic comparison is not currently possible.

The manifest is the source of truth for journeys, viewports, thresholds and artifact references.
