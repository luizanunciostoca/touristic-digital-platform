# CRM M80 — Contracts MySQL persistence

## Scope

M80 adds durable MySQL persistence behind the M79 authenticated Contracts boundary without introducing HTTP, Node composition or public-token behavior.

## Persistence contract

- `crm_contracts` preserves V1 statuses `draft | sent | signed | cancelled`;
- contracts belong to a lead and may reference a proposal from the same CRM graph;
- proposal linkage is nullable and uses `ON DELETE SET NULL`;
- share tokens are unique and bounded to 64 characters;
- creator identity is stored as stable `created_by_subject`;
- contract body uses `MEDIUMTEXT` and money uses `DECIMAL(10,2)`;
- sent/signed timestamps, signature data and future public-signature metadata are durable;
- list/find/create/update operations use prepared statements;
- signing can advance the related lead to `contract_signed`;
- contract timeline interactions use the existing durable `crm_interactions` table;
- authorization decisions use the existing durable `crm_audit_events` table.

## Architecture

`MySqlCrmContractRepository` implements the M79 repository port and `MySqlCrmContractAuditPort` implements its audit port. The domain boundary remains independent from MySQL.

## Deliberately deferred

- authenticated Contracts HTTP transport and Node composition;
- public token view/sign routes;
- public signer name/IP capture behavior;
- AI-assisted contract content generation;
- CRM browser UI and visual parity;
- historical V1 data migration.

## Promotion rule

Keep the PR draft until Quality and the CRM Platform Auth Integration Contract are green on the same final helper-free head. No Contracts parity PASS is claimed yet.
