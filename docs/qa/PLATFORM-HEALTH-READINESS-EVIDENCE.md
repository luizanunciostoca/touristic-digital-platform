# Platform Health / Readiness — Contract Evidence

## Scope

This evidence covers only the cross-cutting Platform / QA / Observability / Contracts layer. It does not introduce business-domain behavior.

## Reconciled contract

`PLATFORM-HEALTH-SNAPSHOT` is the canonical health/readiness snapshot for platform runtimes.

- Registry: `docs/contracts/registry.json`
- Schema: `docs/contracts/platform-health-snapshot.v1.schema.json`
- Runtime: `packages/core/src/health.ts`
- Public export: `packages/core/src/index.ts`
- Real consumer: `apps/morro-digital-platform/src/bootstrap/runtime.ts`

The contract derives status instead of trusting callers to declare readiness:

- any failed **critical** check => `status=unhealthy`, `readiness=not_ready`;
- non-critical warning/failure => `status=degraded`, `readiness=ready`;
- all checks passing => `status=healthy`, `readiness=ready`.

Destination context and correlation are mandatory. Tenant context is propagated when applicable. Check names are unique, bounded and immutable; forged check states and malformed inputs are rejected.

## Canonical fixtures

The permanent fixtures exercise both promotion-safe outcomes:

- `docs/contracts/fixtures/platform-health-ready.v1.json`
- `docs/contracts/fixtures/platform-health-not-ready.v1.json`

`pnpm platform:contracts:check` validates fixture structure, status vocabulary, uniqueness and the semantic relationship between critical failures, aggregate health and readiness. This prevents documentation-only or fixture-only drift.

## Runtime consumption

`bootstrapMorroDigital` now returns a canonical `readiness` snapshot after bootstrap work completes. The bootstrap and module registry are critical checks. When a geospatial initializer is explicitly requested, the geospatial runtime becomes a critical readiness check; an engine that reports `initialized=false` produces `unhealthy/not_ready` instead of a false green result.

No payment, ordering, CRM, ticketing, assistant, security-policy or UI behavior is changed.

## Permanent tests

- `packages/core/src/health.test.ts`
  - immutable healthy/ready snapshot;
  - degraded but ready non-critical failure;
  - critical failure => unhealthy/not_ready;
  - empty, duplicate and forged checks rejected.
- `apps/morro-digital-platform/src/bootstrap/runtime.test.ts`
  - canonical readiness returned by the real Morro bootstrap;
  - correlation context present;
  - requested geospatial runtime participates in readiness;
  - uninitialized critical runtime fails readiness closed.

## Quality gates

The canonical registry/schema/runtime/evidence/fixture reconciliation remains chained into:

`pnpm architecture:check` -> `pnpm platform:contracts:check`

The official full promotion gate remains:

`pnpm format:check && pnpm architecture:check && pnpm features:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

No coverage is removed or replaced by this contract.
