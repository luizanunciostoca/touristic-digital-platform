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
RECAPTURE → DIAGNOSE → PLAN → CLAIM → ISOLATE → IMPLEMENT → TEST →
ADVERSARIAL TEST → READBACK → EXACT-HEAD → INDEPENDENT PROOF →
INTEGRATE → RECAPTURE AFFECTED STATE.

## Stop-the-line
Fail closed for data integrity, auth/tenant isolation, financial authority,
exact-head, artifact identity, rollback/DR, wrong production target or unresolved
authority conflict.

## Final challenge
Before COMPLETE, actively search for wrong SHA/branch/environment/service/digest,
fixture/fallback, stale cache, no-jobs/skipped tests, weak assertions, empty data,
partial integration, false readiness, stale claims, unproven rollback or later
contradictory evidence.
