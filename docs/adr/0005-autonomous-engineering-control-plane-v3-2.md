# ADR 0005 — Freeze Autonomous Engineering Control Plane on V3.2

- **Status:** Accepted
- **Date:** 2026-10-01

## Context

The repository already contains Control Plane V3.2 Fabric, ownership, risk, claim, workspace, impact and release primitives. Repeated redesign would create parallel authorities and more reconciliation work.

## Decision

Control Plane V3.2 is the only control architecture. Its operational name is **Touristic Digital Platform — Autonomous Engineering Control Plane**.

The implementation completes, simplifies and hardens V3.2 rather than introducing V4/V5. The five mandatory foundations are derived state, explicit contracts, ephemeral workers, impact-selected proof and immutable artifact promotion.

GitHub current `main` is the only code authority. Live runtime/external observation outranks historical documentation. Chat memory is context only.

Platform Core, Morro Digital, Itacaré Digital and future destinations are explicit scopes. Destination-specific changes cannot silently mutate Platform Core.

AI has no final authority over security, release or financial invariants.

## Alternatives considered

- A new control-plane generation: rejected because it duplicates authority and increases migration risk.
- Operational state in chat/documents: rejected because it is stale and not machine-verifiable.
- Full release proof on every PR: rejected because deterministic impact/risk selection improves throughput without weakening critical gates.

## Consequences

Positive: one architecture, smaller worker context, deterministic authority, lower stale-state risk and a clear migration path.

Negative: legacy paths coexist temporarily until pilots prove replacements; trusted-validator changes require an independent migration.

## V1 preservation impact

No product behavior or V1 parity contract is changed.

## Migration and rollback

Changes land as bounded V3.2 ChangeSets. Legacy paths retire only after equivalent replacement proof. A failed control-plane increment can be reverted without changing product runtime state.

## Evidence

- `AGENTS.md`
- `.morro/fabric.json`
- `.github/morro-control/policy.json`
- `CONSTITUTION.md`
- `ENGINEERING-OPERATING-MANUAL.md`
