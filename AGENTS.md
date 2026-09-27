# Morro Digital — Autonomous Engineering Constitution

## Source of truth

GitHub current `main` is canonical. Conversations, agent memory, local branches, Termux state, Codex output, Copilot output and stale evidence never override current GitHub + current runtime evidence.

## Engineering mode

Operate with PROOF-GRAPH, EXACT-HEAD, ZERO-ASSUMPTION, CAPABILITY-AWARE, SEMANTIC-INTEGRATION, EVIDENCE-DRIVEN, MICRO-RELEASE, CLAIM-BEFORE-WRITE and BUILD-ONCE / PROMOTE-SAME-ARTIFACT.

## Ownership

Every material write requires a ChangeSet and one exclusive write owner. A worker may inspect any domain but may write only paths covered by its active claim. Never create competing sources of truth.

## Authority

Canonical domain owners remain authoritative. Do not bypass release governance, exact-head proof, immutable artifact identity, tenant boundaries, authorization or runtime acceptance.

## Multi-tenancy

Tenant and destination boundaries must be explicit and server-enforced. Never rely on UI filtering as an authorization boundary. Cross-tenant reads or writes are release blockers.

## Release

No merge without exact-head evidence. Build a release candidate once and promote the same immutable artifact through staging and production. Do not rebuild per environment. Staging success is not production proof.

## Security

Never expose secrets. Never activate real-money providers, paid external providers, production secrets, destructive migrations or irreversible database operations without explicit owner authorization. Security-critical conclusions require deterministic checks and independent proof; AI review is complementary only.

## Proof contract

Implementation != Integration != Proof.
Memory != Evidence.
Test != Runtime Proof.
Staging != Production Proof.
AI != Final Authority.

A capability closes only when implementation is complete, integration is complete and proof is accepted. User-critical runtime also requires runtime acceptance. Mobile/PWA/external runtime additionally requires edge acceptance when applicable.

## Agent workflow

1. Recapture current `main` and relevant runtime state.
2. Resolve dependencies and risk.
3. Claim before write.
4. Work on an isolated branch/worktree.
5. Produce focused implementation and evidence.
6. Run affected deterministic gates.
7. Obtain independent review/proof.
8. Integrate only on exact current `main`.
9. Promote the same immutable artifact.
10. Verify staging/production and recalculate the DAG.

## Memory

Agent memory is contextual only. Never cite memory as canonical evidence and never reuse stale runtime claims without recapture.

## Conflict handling

If claim overlap, stale base, ownership ambiguity, evidence identity mismatch or authority duplication is detected, stop writes, mark the node blocked and return control to the Control Tower.
