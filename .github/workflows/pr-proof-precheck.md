---
description: Perform exact-head proof precheck for pull requests before independent proof and integration.
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
engine: copilot
max-turns: 12
tools:
  github:
    toolsets: [repos, pull_requests, actions]
permissions:
  contents: read
  actions: read
  checks: read
  pull-requests: read
safe-outputs:
  staged: true
  add-comment:
    max: 1
  add-labels:
    allowed: ["proof-ready", "proof-blocked", "stale-base"]
    create-if-missing: true
    max: 1
---

# PR Proof Precheck

Evaluate the triggering pull request using PROOF-GRAPH and EXACT-HEAD rules.

- Read the PR ChangeSet metadata and active claim.
- Verify the PR base is current main and identify the exact PR head SHA.
- Verify changed paths are consistent with the declared domain and claim.
- Enumerate deterministic required checks for the affected risk.
- Reject stale workflow evidence or evidence from a different head/tree.
- Do not approve, merge, push, deploy or change secrets.
- Produce a concise staged comment and at most one staged status label.
- Use `proof-ready` only when precheck evidence is complete; otherwise use `proof-blocked` or `stale-base`.

This precheck is complementary evidence, never final merge authority.
