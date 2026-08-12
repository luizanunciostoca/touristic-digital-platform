# CRM M91 — Trials authenticated HTTP transport evidence

## Scope

M91 exposes the merged M89 Trials domain boundary and M90 MySQL persistence through the shared authenticated CRM HTTP transport contract.

## Permanent implementation

- `services/crm/src/trials-http-transport.ts`
- `services/crm/src/trials-http-transport.test.ts`
- `services/crm/src/index.ts`

## Frozen routes

- `GET /api/crm/trials`
  - authenticated read
  - optional `leadId` filter
- `POST /api/crm/trials`
  - authenticated mutable role
  - shared Origin/CSRF transport authorization
  - accepts `leadId`, optional `durationDays`, optional `startDate`
- `POST /api/crm/trials/:id/convert`
- `POST /api/crm/trials/:id/cancel`
- `POST /api/crm/trials/:id/expire`

M91 intentionally does not expose a generic lifecycle `PATCH` or `DELETE`. Trial state transitions remain explicit domain actions from M89.

## HTTP mapping

- authentication/session failure → `401 AUTH_REQUIRED`
- viewer mutation → `403 READ_ONLY_ROLE`
- transport CSRF/origin denial → shared `403` response
- missing resource → `404 NOT_FOUND`
- invalid terminal-state mutation → `409 INVALID_TRANSITION`
- malformed input → `400 INVALID_INPUT`
- unsupported method → `405 METHOD_NOT_ALLOWED`

## Security invariants

All requests resolve the shared CRM transport security context before entering the domain boundary. Mutations therefore preserve the same session, Origin and CSRF contract already used by Meetings, Proposals, Contracts and Follow-ups.

The boundary remains responsible for role authorization, validation, audit evidence and trial lifecycle semantics.

## Deliberately excluded from M91

- automatic/scheduled expiry
- scheduler claim/retry semantics
- notifications
- browser UI
- historical V1 migration

## Promotion rule

M91 may leave draft only when Quality Gate and CRM Platform Auth Integration Contract are green on the same final helper-free head, the PR diff contains only permanent M91 files, and no review thread remains unresolved.
