# Touristic Digital Platform — Engineering Constitution

**Architecture:** Control Plane V3.2 is the current and only engineering control architecture. Its operational name is **Touristic Digital Platform — Autonomous Engineering Control Plane**. A V4/V5 or parallel control model requires a new accepted ADR.

## Source of truth

Authority order is: live observed runtime/external state; current GitHub `main`; versioned executable governance; historical machine evidence; chat or agent memory. GitHub `main` is the sole code authority. Runtime reality may invalidate cached or historical state.

## Five foundations

1. **Derived state** — calculate operational state from evidence whenever possible.
2. **Explicit contracts** — cross-domain behavior uses versioned contracts and ownership.
3. **Ephemeral workers** — bounded context, lease and disposable workspace per task.
4. **Impact-selected proof** — semantic impact plus risk selects proof; unknown risk fails closed.
5. **Immutable artifact promotion** — build once and promote the same certified artifact.

## Invariants

- Claim before write; expired authority fails closed.
- One authoritative owner per protected domain.
- Exact-head identity is mandatory for integration and release.
- A candidate cannot approve itself with a validator it changed.
- Evidence is machine-readable and bound to candidate, tree, validator and environment identities.
- Staging is not production; HTTP 200 is not health.
- Production requires staging acceptance, rollback readiness and runtime identity proof.
- Financial is the unique monetary authority; browser and Assistant do not create monetary or transactional authority.
- Tenant and destination boundaries are server-enforced.
- Destructive or irreversible operations require the configured human gate.
- Cleanup is part of the lifecycle.
- A repeatable incident must gain a preventive control.

## Scope model

Valid semantic scopes are `PLATFORM`, `DESTINATION:MORRO`, `DESTINATION:ITACARE` and `CROSS_DESTINATION`. Destination-specific behavior must not silently become Platform Core behavior.

## Proof contract

`IMPLEMENTED != INTEGRATED != PROVEN != RELEASED != PRODUCTION_VERIFIED`.

AI review is complementary. Security, release and financial invariants remain deterministic or independently evidenced.
