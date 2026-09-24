# Morro Pro — Business Self-Service Management (Wave I)

## Scope

Wave I turns Morro Pro into a tenant-scoped self-service portal without duplicating Control Center or granting platform administration.

Base: current `main` at `7c365040a13423dcb4f47ad3dfc1ca55a0dc3671`.

Branch: `wave/morro-pro-business-management-20260923`.

## Authority

Morro Pro is a consumer of canonical domain authorities:

- Business/Place identity: Wave A;
- location discovery/confirmation: Wave B;
- Place media: Wave C;
- Products/Offers/Menu: Wave D;
- publication/revision/audit: Wave J;
- Financial remains authoritative for money/ledger;
- Ticketing remains authoritative for ticket/check-in inventory.

The portal must never infer ownership from name, slug, destination, label or frontend state.

## Business context

The browser receives `businessIds[]` from the authenticated session.

Rules:

1. explicit requested business not in `businessIds[]` => fail closed with `BUSINESS_ACCESS_DENIED`;
2. switching only accepts an ID in the authenticated scope;
3. every switch aborts in-flight requests with an `AbortController`;
4. each request carries a monotonically increasing generation;
5. stale responses must not update current UI;
6. backend authorization remains mandatory on every resource call.

## Capability matrix

| Module | Viewer | Manager | Owner | Additional gate |
| --- | --- | --- | --- | --- |
| Dashboard | read | read | read | business.read |
| Perfil | read | mutate | mutate | business.update |
| Localização | read | mutate | mutate | Place directions + governance policy |
| Fotos | read | read | mutate | content.read/manage + Place photos |
| Produtos | read | mutate | mutate | business.update + Place products |
| Ofertas | read | mutate | mutate | ticketing.read/manage + Place offers |
| Cardápio | read | mutate | mutate | business.update + Place menu |
| Reservas | read | mutate | mutate | business.update + tableReservation |
| Ticketing/check-in | read | mutate | mutate | ticketing.read/manage + Place tickets |
| Financeiro | read-only | read-only | read-only | financial.read; no ledger authority |
| Conteúdo | read | read-only | mutate | content.read/manage |
| Preview | read | read | read | canonical public projection |
| Equipe | hidden | hidden | mutate | owner-only |
| Configurações | read | mutate | mutate | business.update |

Manager does not receive `content.manage` from the current canonical role map, therefore Content remains read-only for Manager until Auth policy explicitly changes.

## Cross-wave bindings

Wave I deliberately does not duplicate schemas from A/B/C/D/J.

Where those waves are not yet integrated into current `main`, Morro Pro exposes policy/module boundaries and consumes the existing protected Business/Ticketing endpoints. Control Tower must bind the final Wave B/C/D/J repositories/APIs during semantic integration.

## Tests required

- business A cannot read/switch to B;
- owner, manager, viewer matrices;
- multiple businesses;
- switch invalidates stale requests;
- Place capability filtering;
- financial read-only;
- no platform capability grant;
- profile/offers existing paths remain protected;
- mobile/browser regression after UI integration;
- accessibility for business context selector and module navigation.

## Non-scope

- no Control Center duplication;
- no platform admin capabilities;
- no Financial ledger ownership;
- no merge;
- no deploy.
