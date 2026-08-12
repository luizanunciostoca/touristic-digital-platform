# CRM M90 — Trials MySQL persistence evidence

## Scope

M90 makes the M89 Trials domain boundary durable in MySQL without introducing HTTP transport, automatic expiry, notifications, or browser behavior.

## Persistence contract

`crm_trials` stores:

- stable numeric trial and lead identifiers;
- start/end dates and duration;
- V1 lifecycle statuses `active`, `expired`, `converted`, `cancelled`;
- conversion timestamp;
- notification and scheduler claim fields reserved for later scheduled-expiry work;
- millisecond created/updated timestamps;
- foreign-key ownership by `crm_leads` with cascade deletion;
- indexes for lead history and future status/end-date scheduling queries.

## Repository guarantees

`MySqlCrmTrialRepository` implements `CrmTrialBoundaryRepository` with prepared statements for all user/domain values.

Lifecycle updates are compare-and-set operations using `WHERE id = ? AND status = 'active'`. A lost transition race fails closed instead of silently succeeding. Inserts and lifecycle mutations require a readback before returning a domain object.

Successful M89 mutations can persist lead-stage changes and system interactions through the same repository. Conversion writes both `active_client` and the conversion timestamp to the lead.

## Audit

`MySqlCrmTrialAuditPort` persists M89 denied-operation evidence into the shared durable `crm_audit_events` table using stable actor subject and lead context. Trial identifiers remain in the domain audit event and can be added to the shared audit schema in a later cross-domain audit migration without blocking durable authorization evidence today.

## Bootstrap

The historical `applyCrmM71Schema` contract remains unchanged. `applyCrmM90Schema` applies the M71 baseline first and then the incremental Trials schema, preserving existing consumers while providing an explicit current bootstrap path.

## Executable evidence

Focused tests: `services/crm/src/mysql-trials-repository.test.ts`.

Coverage includes schema vocabulary, relational constraints, prepared lead filtering, row mapping, generated-id readback, guarded conversion/cancel/expire transitions, race conflict failure, lead conversion persistence, interaction persistence, and audit persistence.

## Deliberately excluded

- authenticated Trials HTTP transport;
- automatic/scheduled expiry execution;
- scheduler claiming semantics;
- notification delivery;
- browser/UI migration;
- historical V1 data migration.

## Promotion rule

Keep M90 draft until Quality Gate and CRM Platform Auth Integration Contract are green on the same final helper-free head, the diff contains only permanent M90 files, and no unresolved review thread remains.
