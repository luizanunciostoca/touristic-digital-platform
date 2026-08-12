# CRM M78 — Proposals authenticated transport and Node composition

## Scope

M78 composes the authenticated Proposals boundary and M77 MySQL repository with the same platform Auth/Node runtime already proven for Leads and Meetings.

## Contract

- `GET /api/crm/proposals?leadId=<id>` — authenticated list.
- `POST /api/crm/proposals` — authenticated create with Origin/CSRF enforcement.
- `GET /api/crm/proposals/accepted?leadId=<id>` — authenticated accepted proposal lookup.
- `POST /api/crm/proposals/:id/send` — authenticated state transition.
- `POST /api/crm/proposals/:id/respond` — authenticated internal response transition.
- Viewer mutations remain denied by the shared CRM authorization policy.
- Runtime share tokens are generated server-side with Node cryptographic randomness.
- No public token route is introduced in this milestone.

## Architecture

`CrmProposalHttpTransport` remains framework-independent and consumes the existing `CrmTransportAuthPort`. The Node adapter in `crm-api.mjs` owns platform session/Origin/CSRF composition and instantiates the MySQL repository/audit ports.

## Promotion rule

Keep the PR draft until package tests, repository Quality Gate and CRM Platform Auth Integration Contract are green on the same final helper-free head. Expand the permanent MySQL integration contract with proposal create/send/respond/list/audit evidence before promotion.
