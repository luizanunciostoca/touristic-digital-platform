# TDP-MAX Canonical Engineering Policy

## Mission

Converge the real Touristic Digital Platform to the requested state with minimum
blast radius, maximum reversibility and current verifiable evidence.

## Authority

Recapture current GitHub `main` and relevant runtime before material decisions.
Read `AGENTS.md`, `CONSTITUTION.md` and executable governance. For Termux, always
read the LIVE `luizanunciostoca/morro-termux-control/CHATGPT-START-HERE.md`.

Never hardcode mutable operational state such as current SHA, branch, PR, issue,
PID, heartbeat, claim, worktree, deploy, runtime identity or transport preference.

## Invariants

- Current LIVE evidence outranks memory and historical reports.
- Claim before write; ambiguous or overlapping ownership fails closed.
- Use an isolated exact-base workspace under the LIVE runbook.
- Search existing work before creating parallel authority.
- Diagnose root cause before patching symptoms.
- Implementation != Integration != Proof.
- Test != Runtime Proof.
- CI success is not semantic proof unless the required assertion actually ran.
- Staging != Production Proof.
- AI != Final Authority.
- Every external mutation requires post-action readback.
- Evidence invalidated by state change must be recaptured before reuse.
- Build once and promote the same immutable certified artifact for release.
- Technically Ready != Authorized to Release.
- COMPLETE requires sufficient current proof; otherwise PARTIAL, BLOCKED or NOT PROVEN.

## Execution

RECAPTURE → DIAGNOSE → PLAN → CLAIM → ISOLATE → REPRODUCE → IMPLEMENT →
PREPARE → LOCAL ADMISSION → DRAFT REVIEW → BATCH FIX FINDINGS → CERTIFY →
FREEZE HEAD → AFFECTED REMOTE PROOF → REVIEW RECONCILIATION → MERGE GATE →
INTEGRATE → POST-MERGE READBACK → CLAIM RETIREMENT → RECONCILE.

## FastFix efficiency contract

- Do not use remote CI to discover formatting, diff-check, stale-base, claim or workspace errors that local admission can determine.
- PREPARE may mutate deterministic local formatting/preparation; CERTIFY must start and finish with a clean worktree.
- Keep implementation PRs Draft while the candidate is still changing.
- Complete an independent review, collect all known findings, then fix/disposition them as one batch before the next candidate push when possible.
- After certification, freeze the candidate SHA/tree. Any new commit invalidates dependent evidence and returns the task to the appropriate earlier stage.
- Resolve review findings only with regression/readback evidence; before merge-ready, provider readback must show zero unresolved blocking findings.
- Rerun only evidence invalidated by the changed state. A PR metadata transition may invalidate review/merge-gate evidence without invalidating code-quality evidence.
- Post-merge closure includes exact-main readback, applicable post-merge proof, claim retirement, projection reconciliation and bounded workspace cleanup before dependent work is dispatched.
- Track avoidable remote CI rounds as engineering waste; safety and semantic proof must never be weakened to improve the metric.

## Stop-the-line

Fail closed for data integrity, auth/tenant isolation, financial authority,
exact-head, artifact identity, rollback/DR, wrong production target or unresolved
authority conflict.

## Final challenge

Before COMPLETE, actively search for wrong SHA/branch/environment/service/digest,
fixture/fallback, stale cache, no-jobs/skipped tests, weak assertions, empty data,
partial integration, false readiness, stale claims, unproven rollback or later
contradictory evidence.
