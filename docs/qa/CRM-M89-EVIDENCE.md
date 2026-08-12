# CRM M89 — Trials domain boundary evidence

## Scope

M89 freezes the V2 server/domain contract for CRM Trials before persistence, HTTP transport, scheduled expiry, or browser migration.

## Frozen V1 baseline

Reference repository: `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`.

Observed V1 semantics:

- trial creation requires a lead;
- default duration is 30 days;
- `endDate = startDate + durationDays`;
- creation moves the lead stage to `trial`;
- statuses are `active`, `expired`, `converted`, `cancelled`;
- manual lifecycle transitions originate from `active`;
- conversion writes `convertedAt` and moves the lead to `active_client`;
- create/convert/cancel/expire append CRM interaction history;
- the V1 backend did not enforce `endDate <= now` for the manual expire command; the browser only hid that action before expiry.

## M89 V2 contract

`CrmTrialServerBoundary` provides:

- authenticated list access;
- viewer-safe reads and mutation denial through the shared CRM authorization policy;
- bounded lead/trial identifier validation;
- deterministic trial creation with a 30-day default and explicit start-date support;
- missing-lead rejection;
- lead stage update to `trial` on creation;
- `active -> converted`, `active -> cancelled`, and `active -> expired` transitions;
- terminal-state protection against later mutations;
- conversion timestamp and lead promotion to `active_client`;
- interaction append hooks for every successful mutation;
- denied-operation audit events with operation, actor, trial and lead context where available.

## Deliberately excluded

- MySQL repository/schema migration for trials;
- authenticated HTTP transport;
- scheduled/automatic trial expiry;
- notification delivery;
- browser/UI migration;
- historical V1 data migration.

## Executable evidence

Focused tests: `packages/crm/src/trials-boundary.test.ts`.

Coverage includes authentication, viewer authorization, default creation, deterministic dates, validation, missing leads, conversion, cancellation, manual expiry, terminal-state rejection, invalid identifiers, and audit evidence.

## Promotion rule

M89 must remain draft until the official Quality Gate and CRM Platform Auth Integration Contract are green on the same final head, the PR diff contains only permanent M89 files, and no unresolved review thread remains.
