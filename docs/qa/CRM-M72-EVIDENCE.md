# CRM M72 — Authenticated Transport and Durable Audit Evidence

## Scope

M72 adds the first CRM-owned HTTP transport primitive for the M70 leads boundary and a durable MySQL audit sink. It remains intentionally framework-independent and does not create the CRM browser application.

## Architecture

- `CrmLeadHttpTransport` exposes the M70 lead operations at `/api/crm/leads` and delegates all domain validation/role decisions to `CrmLeadServerBoundary`.
- `CrmTransportAuthPort` accepts a platform-verified `AuthSessionIdentity` and delegates mutation security to the platform Auth owner instead of duplicating cookie, origin or CSRF implementation inside CRM.
- `MySqlCrmLeadAuditPort` implements the M70 `CrmLeadAuditPort` with prepared statements.
- `crm_audit_events` provides durable storage for CRM boundary authorization, invalid-input and not-found audit events.
- cross-origin/CSRF security remains platform Auth-owned; M72 does not duplicate those algorithms.

## Transport contract

The service now maps:

- `GET /api/crm/leads` → bounded list/search;
- `POST /api/crm/leads` → create;
- `GET /api/crm/leads/:id` → detail read;
- `PATCH /api/crm/leads/:id` → update;
- `DELETE /api/crm/leads/:id` → delete;
- `POST /api/crm/leads/:id/stage` → stage transition.

Boundary failures are normalized to HTTP status contracts: authentication/session failures `401`, read-only role `403`, not found `404`, invalid input `400` and unsupported method `405`.

## Executable evidence

Temporary validation run `31552180090` completed successfully before helper cleanup:

- lockfile generation + frozen reinstall;
- Prettier on permanent M72 artifacts;
- `@touristic/crm-server` lint;
- `@touristic/crm-server` typecheck;
- transport/audit/repository tests;
- `@touristic/crm-server` build;
- repository `pnpm check` including format, architecture, registry, lint, typecheck, tests and build;
- permanent integration commit `a7741bf4959974faa62a0af9e372e89dd7b62491`.

The tests prove unauthenticated fail-closed behavior, authenticated viewer reads, read-only mutation denial, delegated invalid-CSRF denial, boundary query validation, durable prepared audit writes and the audit schema contract.

## Conservative status decision

The CRM matrix remains `0 PASS / 8 PARTIAL / 17 GAP / 0 N/A`.

M72 materially advances authentication/session integration, lead list/search, pipeline commands, CRUD transport, server-side audit/authorization and regression coverage. They remain PARTIAL because the concrete Node/platform composition with `apps/morro-digital-platform/tooling/auth-api.mjs` is not part of M72, the CRM browser consumer does not exist, and historical V1 data migration remains open.

`MIG-0008` remains `migrating`. `FEATURE-0006` remains `baseline-pending`.

## Next milestone

M73 should compose this transport with the existing platform Auth server boundary and a concrete Node HTTP adapter, proving real cookie/session/origin/CSRF behavior end-to-end without moving those security rules into CRM.
