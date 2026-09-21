# Deterministic legacy CSS bundle

## Goal

Reduce the public Home runtime from a browser `@import` fan-out across the frozen V1 checkpoint to one deterministic legacy stylesheet without editing the preserved V1 source files.

## Build

`tooling/build-legacy-css.mjs` owns the ordered source list. On every Morro Digital application build it:

1. reads `public/legacy/checkpoint.css`;
2. verifies that its local import order exactly matches the canonical source order;
3. rejects path traversal and nested imports;
4. normalizes line endings only in the generated artifact;
5. concatenates every frozen checkpoint source in order;
6. appends the externalized V1 index-inline CSS in its original runtime position;
7. writes `public/legacy/legacy.bundle.css`.

The generated file is intentionally not a new source of truth. The immutable legacy files and their existing blob-hash snapshot remain the evidence authority.

## Runtime

`index.html` loads `legacy.bundle.css` where the checkpoint and index-inline styles previously appeared. The service worker precaches the generated bundle. V2 styles remain after the legacy layer exactly as before.

## Failure behavior

The build fails instead of silently changing CSS order when:

- checkpoint imports are added, removed or reordered;
- an import escapes the legacy root;
- a nested `@import` appears in a bundled source;
- a source file is missing.

This keeps bundle creation deterministic and reviewable while preserving rollback to the original frozen files.
