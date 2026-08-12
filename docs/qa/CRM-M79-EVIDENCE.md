# CRM M79 — Contracts authenticated boundary

## Scope

M79 introduces the framework-independent authenticated Contracts domain boundary after the merged Proposals server/API slice.

## Frozen V1 contract

- authenticated contract list with optional lead filter;
- authenticated create with optional proposal linkage;
- server-generated share token;
- `draft`, `sent`, `signed`, `cancelled` status vocabulary;
- draft contracts may be sent;
- draft or sent contracts may be signed from the authenticated panel;
- signed or already-cancelled contracts cannot be cancelled;
- signing advances the related lead to `contract_signed`;
- create/send/sign/cancel append contract interaction evidence;
- viewer mutations remain denied by the shared CRM authorization policy.

## Architecture

`CrmContractServerBoundary` consumes repository, audit and token-factory ports. It does not depend on MySQL, HTTP, Node, browser code or AI generation. Validation and lifecycle guards remain server-authoritative.

## Deliberately deferred

- MySQL Contracts persistence and audit adapter;
- authenticated HTTP/Node composition;
- public token view/sign routes;
- signer IP/name capture for public signatures;
- AI-assisted contract content generation;
- CRM browser UI and visual parity;
- historical V1 data migration.

## Promotion rule

Keep the PR draft until the repository Quality Gate is green on the final helper-free head. No Contracts parity PASS is claimed in this milestone; persistence, transport, public token behavior and browser parity remain separate work.
