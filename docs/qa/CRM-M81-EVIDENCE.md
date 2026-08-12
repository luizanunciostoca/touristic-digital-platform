# CRM M81 — Contracts authenticated HTTP/Node composition

## Scope

M81 exposes the merged Contracts boundary and MySQL persistence through the authenticated CRM HTTP surface without introducing public-token behavior.

## Transport contract

- `GET /api/crm/contracts` lists contracts with an optional `leadId` filter;
- `POST /api/crm/contracts` creates a draft contract;
- `POST /api/crm/contracts/:id/send` sends a draft contract;
- `POST /api/crm/contracts/:id/sign` signs a draft or sent contract from the authenticated CRM panel;
- `POST /api/crm/contracts/:id/cancel` cancels a draft or sent contract;
- request IDs are normalized only when they are positive safe integers;
- domain authorization remains authoritative for viewer/read-only roles and lifecycle transitions;
- transport security reuses the shared CRM session/origin/CSRF boundary;
- domain failures map to stable HTTP 400/401/403/404/409 responses.

## Node composition

`crm-api.mjs` now composes `CrmContractServerBoundary` with `MySqlCrmContractRepository`, `MySqlCrmContractAuditPort`, a server-generated share-token factory and `CrmContractHttpTransport`. The CRM router recognizes `/api/crm/contracts` and still applies the existing authenticated mutation security contract.

The body ceiling is 128 KiB so the transport can carry the domain's bounded contract content while remaining explicitly size-limited.

## Deliberately deferred

- public share-token contract view/sign routes;
- public signer name/IP capture behavior;
- AI-assisted contract generation;
- CRM browser UI and visual parity;
- historical V1 data migration.

## Promotion rule

Keep the PR draft until Quality and CRM Platform Auth Integration Contract are green on the same final helper-free head. No Contracts parity PASS is claimed yet.
