---
description: Discover stale open PR branches and propose semantic reconciliation without mutating or merging them.
on:
  schedule: daily around 06:00 utc-3
engine: copilot
max-turns: 14
tools:
  github:
    toolsets: [repos, pull_requests, search]
permissions:
  contents: read
  pull-requests: read
safe-outputs:
  staged: true
  create-issue:
    max: 1
---

# Stale Branch Reconciler

Inspect open pull requests relative to current main.

For each materially stale PR:
- compare its base/head lineage to current main;
- classify semantics as PRESENT_IN_MAIN, SUPERSEDED, VALID_MISSING or OBSOLETE;
- never equate commit presence with semantic completion;
- identify path conflicts and authority duplication risks;
- recommend rebase/port/close only as a proposal.

Do not push branches, close PRs, merge PRs, or modify code. If actionable reconciliation work exists, prepare one consolidated staged issue with exact PR numbers and evidence.
