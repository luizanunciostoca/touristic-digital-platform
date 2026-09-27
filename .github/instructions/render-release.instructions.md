---
applyTo: ".github/workflows/*release*,.github/workflows/*promotion*,render*.yaml,render*.yml,docs/operations/**/*release*"
---

# render-release

These instructions extend the repository constitution for matching paths.

- Current main is the release source of truth.
- Build once; promote the same immutable OCI digest.
- Require exact SHA/tree/artifact/provenance identity across environments.
- Staging proof precedes production; production requires independent smoke/runtime evidence.
- A material write requires an active ChangeSet claim covering the exact path.
- Evidence must name the exact source SHA and cannot be reused across non-equivalent trees.
