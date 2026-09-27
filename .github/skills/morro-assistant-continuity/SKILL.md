---
name: morro-assistant-continuity
description: Protects the single conversation authority, causal turn ordering and deterministic critical Assistant flows.
---

# morro-assistant-continuity

## Purpose
Keep long-session continuity and prevent stale async overwrites.

## Inputs
- Assistant/UI ChangeSet
- conversation state owner
- affected navigation/error/payment flows

## Allowed operations
- Implement conversation-safe changes
- Add unit/browser tests
- Inspect causal state

## Forbidden operations
- Create competing presenters
- Depend on LLM for deterministic critical actions
- Expose technical state publicly

## Acceptance criteria
- Single authority retained
- Stale async results dropped
- Continuity browser contract green
- Critical flows deterministic

## Evidence format
- ChangeSet ID
- exact source/base/head SHA as applicable
- command/workflow/runtime target
- timestamp
- result and residual blockers

## Failure states
- DUPLICATE_PRESENTER
- STALE_TURN_OVERWRITE
- CONTEXT_LOSS
- NONDETERMINISTIC_CRITICAL_FLOW
