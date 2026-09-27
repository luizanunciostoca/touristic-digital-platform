---
description: Investigate failed deterministic CI runs and produce bounded, reviewable findings.
on:
  workflow_run:
    workflows: ["Quality Gate"]
    types: [completed]
if: github.event.workflow_run.conclusion == 'failure'
engine: copilot
max-turns: 12
tools:
  github:
    toolsets: [repos, pull_requests, actions]
permissions:
  contents: read
  actions: read
  pull-requests: read
safe-outputs:
  staged: true
  add-comment:
    max: 1
  create-issue:
    max: 1
---

# CI Failure Investigator

Investigate only the failed run that triggered this workflow.

1. Identify the exact workflow run, source SHA, PR if any, failed jobs and first causal failure.
2. Distinguish product failure, infrastructure failure, stale evidence, flaky evidence and configuration failure.
3. Do not rerun, merge, deploy, expose secrets or modify repository state.
4. Prefer deterministic logs and repository evidence over speculation.
5. If a PR exists, prepare one concise comment with root cause, affected domains, reproducible evidence and the next safe action.
6. If the failure is systemic and not tied to one PR, prepare one issue instead.
7. State explicitly when the evidence is insufficient.

The workflow is in staged safe-output mode until first-run acceptance is complete.
