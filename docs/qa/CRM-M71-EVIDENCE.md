# CRM M71 — MySQL Persistence Evidence

## Scope

M71 adds the first concrete server-only CRM persistence adapter behind the M70 leads boundary. It covers only leads, checklist items and interactions; other CRM entities remain outside this milestone.

## Architecture

- `@touristic/crm` remains framework/database agnostic.
- `@touristic/crm-server` lives under `services/crm` and owns `mysql2` plus `CRM_DATABASE_URL`.
- credentials are never exposed through browser/domain packages.
- `MySqlCrmLeadRepository` implements the M70 repository port.
- all dynamic values use prepared placeholders.

## Schema decisions

The M71 schema freezes leads, checklist and interactions with InnoDB foreign keys/cascade behavior and a unique `(lead_id, step)` checklist constraint.

The frozen V1 used numeric `assignedToId` identities from its previous host. V2 Auth uses stable subjects, so M71 deliberately persists `assigned_to_subject` and interaction `actor_subject` instead of fabricating incompatible numeric user IDs. This is a migration correction, not a parity omission.

Historical V1 data migration remains separate and is not claimed by M71.

## Executable evidence

Temporary validation run `31550026217` completed successfully before helper cleanup:

- lockfile generation and frozen reinstall;
- Prettier on M71 artifacts;
- `@touristic/crm-server` lint;
- `@touristic/crm-server` typecheck;
- deterministic repository/schema tests;
- `@touristic/crm-server` build;
- repository `pnpm check` (format, architecture, registry, lint, typecheck, tests and build);
- permanent integration commit `6d4116dfb1a7fd2bc341339472667ed198bda500`.

Tests prove prepared filtering/pagination, generated-ID readback, idempotent 16-step checklist initialization, parameterized interaction metadata and the stable-subject relational schema.

## Matrix decision

The score remains `0 PASS / 8 PARTIAL / 17 GAP / 0 N/A`.

Persistence is materially stronger but remains PARTIAL because M71 covers only the M70 lead slice. Transport/browser lifecycle, remaining CRM tables and historical data migration are still open.

## State decision

`MIG-0008` remains `migrating`. `FEATURE-0006` remains `baseline-pending`.

## Next milestone

M72 should add an authenticated CRM transport boundary for the M70 commands over the M71 repository, including structured HTTP/API validation and durable audit integration, before browser UI work begins.
