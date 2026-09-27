---
description: Monitor release-candidate evidence for exact-head, immutable artifact and staging readiness gaps.
on:
  workflow_run:
    workflows: ["Release Candidate Certification", "Release OCI Image", "OCI Release Promotion Gate", "Staging OCI Promotion"]
    types: [completed]
engine: copilot
max-turns: 12
tools:
  github:
    toolsets: [repos, actions, pull_requests]
permissions:
  contents: read
  actions: read
  pull-requests: read
safe-outputs:
  staged: true
  create-issue:
    max: 1
---

# Release Readiness Monitor

Inspect the triggering release-related run and the current canonical release chain.

Validate:
- exact main SHA and tree identity;
- candidate/artifact/OCI digest continuity;
- provenance/attestation presence when required;
- staging acceptance before production eligibility;
- absence of stale or cross-SHA evidence.

Do not dispatch workflows, deploy, merge, activate providers, access secrets or perform financial effects.

If a release-blocking gap is detected, prepare one staged issue with exact run IDs, SHAs/digests and the minimum safe remediation. If evidence is complete, do not create a success issue.
