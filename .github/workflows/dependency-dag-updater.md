---
description: Recalculate the control-plane dependency DAG from current repository evidence and propose updates through a draft PR.
on:
  schedule: every 6h
engine: copilot
max-turns: 14
tools:
  edit:
  github:
    toolsets: [repos, issues, pull_requests, actions]
permissions:
  contents: read
  actions: read
  issues: read
  pull-requests: read
safe-outputs:
  staged: true
  create-pull-request:
    draft: true
    title-prefix: "[control-plane] "
    protected-files: fallback-to-issue
    max: 1
---

# Dependency DAG Updater

Recalculate only control-plane metadata from current GitHub evidence.

- Read `.github/morro-control/backlog.json`, `dependency-graph.json`, `claims.json` and `policy.json`.
- Recapture current main and current open/merged PR state.
- Never infer runtime proof from tests or memory.
- Preserve ChangeSet IDs and canonical ownership.
- Update only metadata that can be proven from current repository evidence.
- Never move a node to PROOF_ACCEPTED, STAGING_VERIFIED or PRODUCTION_VERIFIED without corresponding exact identity evidence.
- Never merge, deploy, alter secrets or perform product-code changes.

If a metadata change is justified, prepare one staged draft PR. Otherwise produce no write.
