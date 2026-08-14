# CRM Administrativo — Migration Matrix (M133 reconciliation)

## Status semantics

- `PASS` — V2 exposes the audited contract with executable evidence.
- `PARTIAL` — a material V2 path exists, but the complete frozen V1 contract or final browser/release evidence is not closed.
- `GAP` — no CRM-owned V2 equivalent exists yet.
- `N/A` — contract is intentionally owned by another feature and must be consumed, not duplicated.

## Baseline and current checkpoint

- frozen CRM V1: `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`;
- V2 target feature: `FEATURE-0006`;
- tracker item: `MIG-0008`;
- reconciled V2 checkpoint: `main@a18eb9d0166f4ee0d7debe1f701c21ae00ce3996` (M133);
- current feature status: `migrating`, not `equivalent` and not `released`.

The former M72 statement that no `apps/admin-crm` application existed is obsolete. M73–M133 added real platform Auth/Node composition, MySQL persistence across the commercial aggregates, schedulers, public token flows, authenticated browser surfaces and mutation lifecycles. This matrix deliberately remains conservative where the frozen V1 contract is not fully reproduced or where a formal visual/release gate is still open.

| Contract | Frozen V1 evidence | V2 state at M133 | Status | Remaining decision |
| --- | --- | --- | --- | --- |
| CRM application shell and authenticated layout | React client + `CRMLayout`/dashboard layout | `apps/admin-crm/public/index.html` provides authenticated shell, navigation and dedicated CRM surfaces; M104/M105 bind platform session | PASS | Keep CRM browser auth owned by platform Auth. |
| Platform authentication/session integration | V1 host auth infrastructure + client auth hook | M73 composes real platform Auth/Node; browser requests use `@touristic/auth-browser`, same-origin credentials and CSRF for mutations | PASS | Preserve centralized Auth ownership. |
| Dashboard metrics and funnel | `Dashboard.tsx`; CRM metric procedures | Shell exposes capability summary cards, but no reconciled authoritative funnel/metric domain and browser lifecycle | GAP | Freeze metric semantics before implementing dashboard KPIs. |
| Lead list and search/filter lifecycle | `Leads.tsx` | M106 read-only browser client, M128 search/filter UI, authenticated server query and MySQL persistence | PASS | Maintain bounded server-side query semantics. |
| Lead detail and activity lifecycle | `LeadDetail.tsx` | Lead model, interactions and stage trail exist server-side; browser has edit/stage actions but no full frozen V1 detail/activity surface | PARTIAL | Add dedicated detail/activity lifecycle and equivalence proof. |
| Sales pipeline stages | frozen V1 stage selector and transitions | M70 server boundary + M109 browser stage flow; current UI exposes the reconciled stage vocabulary and audited transition path | PASS | Keep transitions server-authoritative. |
| Lead CRUD and server validation | tRPC routes + DB functions | create/update/stage are browser-observable; server boundary/repository also supports delete, but the current shell does not expose full frozen V1 CRUD lifecycle | PARTIAL | Reconcile delete/detail behavior before PASS. |
| Meetings lifecycle | `Meetings.tsx`; create/complete/no-show/cancel | M74/M75 domain, persistence and HTTP composition; M110/M120+ browser consultation, scheduling and result lifecycle | PASS | Preserve explicit auditable status transitions. |
| Proposals lifecycle | `Proposals.tsx`; proposal procedures | M76–M78 domain/persistence/transport plus M111/M121/M129 browser create/send/respond lifecycle | PASS | Keep lead linkage and acceptance transitions atomic. |
| Tokenized proposal public view | `/proposals/view/:token` | M83 public boundary/transport plus M117/M119 browser token routing and response lifecycle | PASS | Keep bounded token projection and no privileged data leakage. |
| Contracts lifecycle | `Contracts.tsx`; create/sign/cancel behavior | M79–M81 domain/persistence/transport plus M112/M122 authenticated browser create/send/cancel lifecycle | PASS | Preserve proposal linkage and valid state transitions. |
| Tokenized contract public view | `/contracts/view/:token` | M82 public sign boundary; M118/M119 browser route; M132/M133 pointer cancellation/isolation hardening | PASS | Keep signature payload bounded and public projection minimal. |
| Follow-up lifecycle | `FollowUps.tsx`; create/generate/send/respond | M84–M88 server lifecycle/scheduler; browser can consult pending items, schedule follow-ups and view generated messages, but send/respond parity is not fully exposed | PARTIAL | Close remaining observable send/respond contract or explicitly reclassify ownership. |
| Follow-up automation settings | Settings + scheduled follow-up handler | authenticated GET/PUT settings browser lifecycle plus fail-closed scheduler settings | PASS | Keep unsafe automation disabled by policy. |
| Trials lifecycle | `Trials.tsx`; convert/cancel/expire | M89–M91 domain/persistence/transport plus M114/M125 browser create/convert/cancel/expire lifecycle | PASS | Preserve explicit timestamps and transition guards. |
| Trial scheduled expiry | `scheduledHandlers.ts`; cron documentation | M92 scheduler, M93 notification processor, M94–M97 durable claim/lease/idempotency and M102/M103 runtime lifecycle | PASS | Keep claims, heartbeat and provider idempotency stable. |
| Referrals lifecycle | `Referrals.tsx`; edit/contact/lost/benefit/link lead | M98–M101 server path plus M115/M124/M127 browser registration/link/contact/conversion-loss lifecycle | PASS | Preserve lead relation and benefit semantics. |
| CRM settings | `Settings.tsx` | generic settings navigation is intentionally marked unavailable; only Follow-up-owned settings have a concrete boundary | GAP | Inventory/freeze generic CRM settings before adding UI. |
| Persistence model | Drizzle ORM + MySQL via `server/db.ts` | `@touristic/crm-server` now persists leads, meetings, proposals, contracts, follow-ups, trials, referrals, interactions and durable audit in MySQL | PASS | Historical data migration/reconciliation remains a deployment concern. |
| Object storage | `server/storage.ts` + S3 client | no reconciled CRM storage adapter in the current V2 | GAP | Confirm whether frozen V1 object storage is still required; if yes, add explicit server-only port/adapter. |
| AI-assisted CRM content | AI chat/generation behaviors in client/server | shared Assistant capability exists and Follow-up domain separates deterministic state from generated content, but no complete CRM-owned AI adapter/parity surface is frozen | PARTIAL | Reuse shared Assistant only through authorized CRM context. |
| Scheduled job protection | documented protected cron handlers | Follow-up and Trial schedulers run through server-owned hosts with durable claims/idempotency rather than public unauthenticated mutation routes | PASS | Keep jobs internal/authenticated and observable. |
| Server-side audit/authorization | protected tRPC procedures + host auth | platform Auth, CRM authorization and durable MySQL audit are composed across authenticated transports | PASS | Continue emitting structured denials and mutation evidence. |
| Automated regression coverage | `server/crm.test.ts`, auth tests | permanent domain/persistence/transport tests plus browser contract proofs cover the migrated aggregates through M133 | PASS | Aggregate critical CRM browser gates into release GO criteria. |
| Responsive/accessibility visual surface | Radix/Tailwind CRM pages | browser surfaces use semantic controls/status states and focused Chromium contracts, but no complete frozen V1 visual/accessibility equivalence matrix is consolidated | PARTIAL | Capture consolidated responsive/accessibility/visual evidence before `equivalent`. |

## M133 reconciled score

- `PASS`: 17
- `PARTIAL`: 5
- `GAP`: 3
- `N/A`: 0
- total: 25

The matrix moved materially from M72 (`0 PASS / 8 PARTIAL / 17 GAP`) to M133 (`17 PASS / 5 PARTIAL / 3 GAP`). This is why `FEATURE-0006` is now `migrating` rather than `baseline-pending`, while still remaining below `equivalent`.

## Remaining CRM closure order

1. Freeze and implement authoritative dashboard metrics/funnel.
2. Complete Lead detail/activity and remaining CRUD parity.
3. Close or explicitly reclassify Follow-up send/respond behavior.
4. Inventory and implement generic CRM settings.
5. Decide the frozen V1 object-storage requirement and add a server-only adapter if still necessary.
6. Freeze the CRM-owned AI-assisted contract instead of coupling directly to a provider.
7. Consolidate responsive/accessibility/visual equivalence evidence.
8. Run release-candidate, staging, rollback and production-readiness gates separately from migration equivalence.

This order keeps the server authoritative, avoids recreating V1 framework coupling and prevents the status registry from claiming equivalence before the remaining observable contracts are proven.
