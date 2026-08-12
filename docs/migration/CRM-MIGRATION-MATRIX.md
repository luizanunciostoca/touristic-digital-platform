# CRM Administrativo — Migration Matrix (M71 MySQL persistence)

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

| Contract                                       | Frozen V1 evidence                                   | V2 state at M67                                                                                                    | Status  | Migration decision                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| CRM application shell and authenticated layout | React client + `CRMLayout`/dashboard layout          | no CRM app/surface                                                                                                 | GAP     | Create CRM-owned app shell only after core/API boundary is frozen.                                                     |
| Platform authentication/session integration    | V1 host auth infrastructure + client auth hook       | `@touristic/crm/authorization` consumes equivalent platform Auth; no CRM server/browser consumer yet               | PARTIAL | Auth dependency and CRM policy are executable; integration remains incomplete until a real CRM boundary consumes them. |
| Dashboard metrics and funnel                   | `Dashboard.tsx`; CRM metric procedures               | no CRM consumer/domain                                                                                             | GAP     | Freeze metric semantics before UI migration.                                                                           |
| Lead list and search/filter lifecycle          | `Leads.tsx`                                          | M70 bounded query contract plus `MySqlCrmLeadRepository.list()` with prepared filters/pagination                   | PARTIAL | Query + concrete persistence are executable; transport and browser consumer remain pending.                            |
| Lead detail and activity lifecycle             | `LeadDetail.tsx`                                     | absent                                                                                                             | GAP     | Preserve detail/history relationships.                                                                                 |
| 16-stage sales pipeline                        | full stage selector in frozen LeadDetail             | vocabulary plus validated `updateStage` command and stage-change interaction trail are executable                  | PARTIAL | Pipeline command semantics advanced; persistent adapter/browser lifecycle remain pending.                              |
| Lead CRUD and server validation                | tRPC routes + DB functions                           | M70 commands now have a concrete MySQL repository for get/create/update/updateStage/delete                         | PARTIAL | Server commands + persistence exist; transport/browser lifecycle and historical data migration remain pending.         |
| Meetings lifecycle                             | `Meetings.tsx`; create/complete/no-show/cancel       | absent                                                                                                             | GAP     | Model lifecycle as explicit commands and auditable transitions.                                                        |
| Proposals lifecycle                            | `Proposals.tsx`; proposal procedures                 | absent                                                                                                             | GAP     | Freeze proposal states and relationships.                                                                              |
| Tokenized proposal public view                 | `/proposals/view/:token`                             | absent                                                                                                             | GAP     | Preserve bounded server-validated token access.                                                                        |
| Contracts lifecycle                            | `Contracts.tsx`; create/sign/cancel behavior         | absent                                                                                                             | GAP     | Preserve proposal linkage and valid state transitions.                                                                 |
| Tokenized contract public view                 | `/contracts/view/:token`                             | absent                                                                                                             | GAP     | Preserve bounded server-validated token access.                                                                        |
| Follow-up lifecycle                            | `FollowUps.tsx`; create/generate/send/respond        | absent                                                                                                             | GAP     | Separate deterministic CRM state from AI text generation.                                                              |
| Follow-up automation settings                  | Settings + scheduled follow-up handler               | absent                                                                                                             | GAP     | Freeze settings semantics and fail-closed automation rules.                                                            |
| Trials lifecycle                               | `Trials.tsx`; convert/cancel/expire                  | absent                                                                                                             | GAP     | Preserve explicit transitions and timestamps.                                                                          |
| Trial scheduled expiry                         | `scheduledHandlers.ts`; cron documentation           | absent                                                                                                             | GAP     | Scheduled mutation must remain authenticated and idempotent.                                                           |
| Referrals lifecycle                            | `Referrals.tsx`; edit/contact/lost/benefit/link lead | absent                                                                                                             | GAP     | Freeze statuses, benefit semantics and lead relation.                                                                  |
| CRM settings                                   | `Settings.tsx`                                       | absent                                                                                                             | GAP     | Inventory each setting before porting UI.                                                                              |
| Persistence model                              | Drizzle ORM + MySQL via `server/db.ts`               | `services/crm` provides server-only MySQL schema + repository for leads/checklist/interactions                     | PARTIAL | Concrete persistence exists for the M70 slice; remaining CRM tables and historical migration are still pending.        |
| Object storage                                 | `server/storage.ts` + S3 client                      | no CRM storage adapter                                                                                             | GAP     | Keep credentials server-only; define explicit storage port if still required.                                          |
| AI-assisted CRM content                        | AI chat/generation behaviors in client/server        | platform Assistant exists, CRM adapter absent                                                                      | PARTIAL | Reuse shared AI capability where compatible; CRM owns authorization/context.                                           |
| Scheduled job protection                       | documented protected cron handlers                   | no CRM scheduled runtime                                                                                           | GAP     | Never expose unauthenticated scheduled mutations.                                                                      |
| Server-side audit/authorization                | protected tRPC procedures + host auth                | leads boundary consumes CRM policy and emits structured denial/not-found/invalid-input audit events through a port | PARTIAL | Authorization/audit decisions are executable; concrete server transport and durable audit sink remain pending.         |
| Automated regression coverage                  | `server/crm.test.ts`, auth tests                     | domain/auth/leads suites plus deterministic MySQL repository/schema contract tests run in Quality                  | PARTIAL | Core + first persistence slice are covered; transport, browser and remaining CRM modules still need regression suites. |
| Responsive/accessibility visual surface        | Radix/Tailwind CRM pages                             | no frozen V2 visual evidence                                                                                       | GAP     | Capture deterministic browser baseline before visual parity claims.                                                    |

## M71 score

- `PASS`: 0
- `PARTIAL`: 8
- `GAP`: 17
- `N/A`: 0
- total: 25

M71 adds concrete server-only MySQL persistence for the M70 leads/checklist/interactions slice. The score remains `0 PASS / 8 PARTIAL / 17 GAP / 0 N/A`: persistence is now executable, but no row reaches PASS until transport/browser parity and the remaining CRM schema/data migration are completed.

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
