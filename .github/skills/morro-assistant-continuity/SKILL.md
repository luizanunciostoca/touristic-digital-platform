---
name: morro-assistant-continuity
description: Protect single conversation authority, causal turn ordering, and deterministic critical Assistant flows.
---

# morro-assistant-continuity

## Purpose

Preserve contextual continuity and reject stale asynchronous presentation.

## Inputs

- Assistant/UI ChangeSet
- conversation state owner
- affected navigation/error/payment flows

## Allowed operations

- Implement claimed conversation changes
- Add unit/browser tests
- Inspect causal state

## Forbidden operations

- Create competing presenters
- Use LLM for deterministic critical actions
- Expose internal technical state

## Acceptance criteria

- Single authority retained
- Stale async dropped
- Continuity contract passes
- Critical flows deterministic

## Evidence format

- ChangeSet ID.
- Exact base/head/source SHA as applicable.
- Command, workflow run, or runtime target.
- Timestamp, result, and residual blockers.

## Failure states

- DUPLICATE_PRESENTER
- STALE_TURN_OVERWRITE
- CONTEXT_LOSS
- NONDETERMINISTIC_CRITICAL_FLOW
