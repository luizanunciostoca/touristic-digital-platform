# Platform Contracts / Observability — QA Evidence

## Scope

This evidence reconciles the cross-cutting Platform / QA / Observability / Contracts layer against the canonical architecture documents on base `97454fdd1173af2460757f8e9c18e9ff2d7dd4c2`.

No business feature, payment behavior, CRM lifecycle, Ticketing flow, browser UI or provider integration is introduced by this change.

## Drift found

`PLATFORM-BIBLE.md` already required versioned domain-event envelopes with destination/tenant/correlation context and treated observability as part of Definition of Done. `MODULE-CONTRACTS.md` also assigned event envelopes and standardized errors/context to Core.

The executable `PlatformEvent` contract in `@touristic/core` only carried `type`, `payload` and `occurredAt`, so canonical documentation and runtime were inconsistent. The repository Quality Gate also had no dedicated step that verified cross-links between canonical contracts, schemas, runtime and QA evidence.

## Canonical contracts

### PLATFORM-EVENT-ENVELOPE

Schema: `docs/contracts/platform-event-envelope.v1.schema.json`

Required envelope fields are `eventId`, `type`, `version`, `occurredAt`, `destinationId`, `correlationId` and `payload`. `tenantId` and `causationId` are optional when not applicable. The Core runtime now builds immutable envelopes, generates secure event/correlation identities by default and fails closed when destination context is unavailable.

### PLATFORM-OBSERVATION

Schema: `docs/contracts/platform-observation.v1.schema.json`

The minimum structured observation envelope covers logs, metrics, traces, audit and alerts with `observationId`, `kind`, `name`, `severity`, `occurredAt`, `destinationId`, `correlationId` and primitive-only `attributes`. `tenantId` and `causationId` are optional when not applicable.

This contract does not claim that every existing domain has already migrated all telemetry. It establishes the canonical cross-domain envelope and a gate that prevents the platform contract itself from drifting again.

## Runtime evidence

`@touristic/core` now provides:

- `createPlatformEvent()` with bounded identifiers, positive safe-integer versions, ISO timestamps, destination context and correlation/causation support;
- `EventBus` publication through the canonical event envelope;
- `createPlatformObservation()` with a closed observation vocabulary and primitive structured attributes;
- deterministic injection points for ID/time generation in tests while production defaults require secure `crypto.randomUUID()`.

Focused Core tests prove full envelope shape, immutability, fail-closed missing destination context and structured observation creation.

## Transverse Quality Gate

`pnpm platform:contracts:check` validates:

- canonical registry uniqueness and ownership;
- schema version/status/kind;
- closed JSON schemas and their required fields;
- runtime field presence in `packages/core/src/runtime.ts`;
- evidence references;
- reconciliation in both `PLATFORM-BIBLE.md` and `MODULE-CONTRACTS.md`.

The command is included in both root `pnpm check` and `.github/workflows/quality.yml` before lint/typecheck/tests/build.

## Promotion rule

This change may be merged only after the final branch head passes the repository Quality Gate, including formatting, architecture, Feature Registry, Platform Contracts, lint, typecheck, full tests and build. Any path-triggered permanent regression workflow must also remain green on the same final head/merge ref.
