# CRM Administrativo — Migration Matrix (M69 authorization policy)

## Status semantics

- `PASS` — V2 exposes the audited contract with executable evidence.
- `PARTIAL` — a reusable V2 primitive exists, but CRM-owned integration is incomplete.
- `GAP` — no CRM-owned V2 equivalent exists yet.
- `N/A` — contract is intentionally owned by another feature and must be consumed, not duplicated.

## Baseline

- frozen CRM V1: `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`;
- V2 target feature: `FEATURE-0006`;
- tracker item: `MIG-0008`;
- current V2 state: no `apps/admin-crm` application exists.

| Contract                                       | Frozen V1 evidence                                   | V2 state at M67                                                                                      | Status  | Migration decision                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| CRM application shell and authenticated layout | React client + `CRMLayout`/dashboard layout          | no CRM app/surface                                                                                   | GAP     | Create CRM-owned app shell only after core/API boundary is frozen.                                                     |
| Platform authentication/session integration    | V1 host auth infrastructure + client auth hook       | `@touristic/crm/authorization` consumes equivalent platform Auth; no CRM server/browser consumer yet | PARTIAL | Auth dependency and CRM policy are executable; integration remains incomplete until a real CRM boundary consumes them. |
| Dashboard metrics and funnel                   | `Dashboard.tsx`; CRM metric procedures               | no CRM consumer/domain                                                                               | GAP     | Freeze metric semantics before UI migration.                                                                           |
| Lead list and search/filter lifecycle          | `Leads.tsx`                                          | absent                                                                                               | GAP     | Preserve CRM record semantics and bounded queries.                                                                     |
| Lead detail and activity lifecycle             | `LeadDetail.tsx`                                     | absent                                                                                               | GAP     | Preserve detail/history relationships.                                                                                 |
| 16-stage sales pipeline                        | full stage selector in frozen LeadDetail             | `@touristic/crm` freezes 18 persisted stages, 16 active funnel stages and terminal classification    | PARTIAL | Vocabulary/order are executable; server-authoritative transition commands remain pending.                              |
| Lead CRUD and server validation                | tRPC routes + DB functions                           | absent                                                                                               | GAP     | Create server-authoritative domain/API contract first.                                                                 |
| Meetings lifecycle                             | `Meetings.tsx`; create/complete/no-show/cancel       | absent                                                                                               | GAP     | Model lifecycle as explicit commands and auditable transitions.                                                        |
| Proposals lifecycle                            | `Proposals.tsx`; proposal procedures                 | absent                                                                                               | GAP     | Freeze proposal states and relationships.                                                                              |
| Tokenized proposal public view                 | `/proposals/view/:token`                             | absent                                                                                               | GAP     | Preserve bounded server-validated token access.                                                                        |
| Contracts lifecycle                            | `Contracts.tsx`; create/sign/cancel behavior         | absent                                                                                               | GAP     | Preserve proposal linkage and valid state transitions.                                                                 |
| Tokenized contract public view                 | `/contracts/view/:token`                             | absent                                                                                               | GAP     | Preserve bounded server-validated token access.                                                                        |
| Follow-up lifecycle                            | `FollowUps.tsx`; create/generate/send/respond        | absent                                                                                               | GAP     | Separate deterministic CRM state from AI text generation.                                                              |
| Follow-up automation settings                  | Settings + scheduled follow-up handler               | absent                                                                                               | GAP     | Freeze settings semantics and fail-closed automation rules.                                                            |
| Trials lifecycle                               | `Trials.tsx`; convert/cancel/expire                  | absent                                                                                               | GAP     | Preserve explicit transitions and timestamps.                                                                          |
| Trial scheduled expiry                         | `scheduledHandlers.ts`; cron documentation           | absent                                                                                               | GAP     | Scheduled mutation must remain authenticated and idempotent.                                                           |
| Referrals lifecycle                            | `Referrals.tsx`; edit/contact/lost/benefit/link lead | absent                                                                                               | GAP     | Freeze statuses, benefit semantics and lead relation.                                                                  |
| CRM settings                                   | `Settings.tsx`                                       | absent                                                                                               | GAP     | Inventory each setting before porting UI.                                                                              |
| Persistence model                              | Drizzle ORM + MySQL via `server/db.ts`               | framework-independent CRM record models and repository ports now exist in `@touristic/crm`           | PARTIAL | Schema vocabulary/ports are frozen; persistent adapter and migration remain pending.                                   |
| Object storage                                 | `server/storage.ts` + S3 client                      | no CRM storage adapter                                                                               | GAP     | Keep credentials server-only; define explicit storage port if still required.                                          |
| AI-assisted CRM content                        | AI chat/generation behaviors in client/server        | platform Assistant exists, CRM adapter absent                                                        | PARTIAL | Reuse shared AI capability where compatible; CRM owns authorization/context.                                           |
| Scheduled job protection                       | documented protected cron handlers                   | no CRM scheduled runtime                                                                             | GAP     | Never expose unauthenticated scheduled mutations.                                                                      |
| Server-side audit/authorization                | protected tRPC procedures + host auth                | CRM policy now requires active session and denies viewer mutations; server boundary/audit absent     | PARTIAL | Reuse the CRM policy in mutable/read APIs and add structured denial audit before PASS.                                 |
| Automated regression coverage                  | `server/crm.test.ts`, auth tests                     | no CRM test suite                                                                                    | GAP     | Port contract tests alongside each milestone, not after UI completion.                                                 |
| Responsive/accessibility visual surface        | Radix/Tailwind CRM pages                             | no frozen V2 visual evidence                                                                         | GAP     | Capture deterministic browser baseline before visual parity claims.                                                    |

## M69 score

- `PASS`: 0
- `PARTIAL`: 5
- `GAP`: 20
- `N/A`: 0
- total: 25

M69 adds a CRM-owned authorization policy over equivalent platform Auth. The score remains unchanged because no real CRM server/browser boundary consumes the policy yet: `0 PASS / 5 PARTIAL / 20 GAP / 0 N/A`.

## Migration order derived from dependency graph

1. Domain vocabulary + persistence/schema baseline.
2. CRM authorization policy consuming platform Auth.
3. Server/API ports for leads and pipeline.
4. Related commercial records: meetings → proposals → contracts.
5. Follow-ups, trials and referrals.
6. Scheduled jobs/storage/AI adapters.
7. Browser shell and authenticated dashboard.
8. Public token views.
9. Full visual/accessibility/browser equivalence.

This order prevents V1 framework coupling from becoming the V2 architecture and keeps security/persistence authoritative on the server.
