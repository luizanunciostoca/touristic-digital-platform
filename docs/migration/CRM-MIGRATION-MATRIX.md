# CRM Administrativo — Migration Matrix (M140 reconciliation)

## Status semantics

- `PASS` — V2 exposes the audited contract with executable evidence.
- `PARTIAL` — a material V2 path exists, but the complete frozen V1 contract or final browser/release evidence is not closed.
- `GAP` — no CRM-owned V2 equivalent exists yet.
- `N/A` — contract is intentionally owned by another feature and must be consumed, not duplicated.

## Baseline and current checkpoint

- frozen CRM V1: `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`;
- V2 target feature: `FEATURE-0006`;
- tracker item: `MIG-0008`;
- M140 dependency: proven M139 Settings branch / PR #247; M140 is intentionally stacked until coordinator promotion;
- current feature status: `migrating`, not `equivalent` and not `released`.

M73–M133 established real platform Auth/Node composition, MySQL persistence across the commercial aggregates, schedulers, public token flows and authenticated browser mutation lifecycles. M134–M136 hardened public contract signature pointer handling, M137 removed the duplicate Meetings shell lifecycle, M138 restored the frozen dashboard metric/funnel contract, and M139 restored the only mutable frozen V1 Settings contract by reusing the existing Follow-up settings boundary.

M140 closes the next ordered reconciliation item: frozen V1 `LeadDetail.tsx`. It restores the server-owned detail aggregate, all 18 lead stages, the canonical 16-step checklist, checklist mutation with activity trail, bounded newest-first interaction history, manual interaction creation with `lastContactAt` update, authenticated browser detail/edit/stage lifecycle and list-to-detail navigation. Existing Meetings, Proposals, Contracts, Trials and Follow-ups remain separate owners and are linked rather than recreated. The existing M71 MySQL schema already contains the required checklist/interactions persistence, so M140 adds no migration.

This matrix remains conservative where frozen V1 behavior is not fully reproduced or where a formal visual/release gate remains open.

| Contract | Frozen V1 evidence | V2 state at M140 | Status | Remaining decision |
| --- | --- | --- | --- | --- |
| CRM application shell and authenticated layout | React client + `CRMLayout`/dashboard layout | `apps/admin-crm/public/index.html` provides authenticated shell/navigation and dedicated CRM surfaces; M137 keeps Meetings canonical; M139 exposes Settings; M140 adds direct Leads → Lead Detail navigation without rewriting the minified shell lifecycle | PASS | Keep CRM browser auth owned by platform Auth. |
| Platform authentication/session integration | V1 host auth infrastructure + client auth hook | M73 composes real platform Auth/Node; browser requests use `@touristic/auth-browser`, same-origin credentials and CSRF for mutations; M140 uses the same boundary | PASS | Preserve centralized Auth ownership. |
| Dashboard metrics and funnel | `Dashboard.tsx`; protected `metrics.funnel`; `getFunnelMetrics()` | M138 freezes V1 metric formulas, derives persisted snapshot, exposes authenticated GET-only `/api/crm/metrics/funnel`, renders KPIs/funnel/recent activity and refreshes every 30 seconds | PASS | Keep calculations server-authoritative/read-only. |
| Lead list and search/filter lifecycle | `Leads.tsx` | M106 read-only browser client, M128 search/filter UI, authenticated server query and MySQL persistence; M140 adds a dedicated Details link per lead | PASS | Maintain bounded server-side query semantics. |
| Lead detail and activity lifecycle | `LeadDetail.tsx`; checklist/interactions procedures | M140 freezes all 18 lead stages + 16 checklist steps, adds authenticated detail aggregate, ownership-bound checklist toggle, bounded newest-first activity, manual interaction + `lastContactAt`, dedicated browser surface and real MySQL/Chromium contract | PASS | Keep related commercial modules separately owned; do not reintroduce duplicate lifecycle code. |
| Sales pipeline stages | frozen V1 stage selector and transitions | M70 server boundary + M109 browser stage flow; M140 Lead Detail uses the complete 18-stage frozen vocabulary and existing audited transition path | PASS | Keep transitions server-authoritative. |
| Lead CRUD and server validation | tRPC routes + DB functions | create/update/stage are browser-observable; M140 expands detail editing to all currently supported update fields; server boundary also supports delete, but frozen `Leads.tsx`/`LeadDetail.tsx` did not expose a delete control and optional-field clearing semantics remain intentionally conservative | PARTIAL | Decide remaining observable CRUD/clear semantics from frozen evidence before PASS; do not invent delete UI. |
| Meetings lifecycle | `Meetings.tsx`; create/complete/no-show/cancel | M74/M75 domain/persistence/HTTP; M110/M120+ browser consultation/scheduling/result; M137 removes duplicate shell implementation; M140 only links to canonical Meetings | PASS | Preserve explicit auditable transitions. |
| Proposals lifecycle | `Proposals.tsx`; proposal procedures | M76–M78 domain/persistence/transport + M111/M121/M129 browser create/send/respond; M140 only links to canonical Proposals | PASS | Keep lead linkage and acceptance transitions atomic. |
| Tokenized proposal public view | `/proposals/view/:token` | M83 public boundary/transport + M117/M119 browser token routing/response | PASS | Keep bounded public projection. |
| Contracts lifecycle | `Contracts.tsx`; create/sign/cancel | M79–M81 domain/persistence/transport + M112/M122 browser create/send/cancel; M140 only links to canonical Contracts | PASS | Preserve proposal linkage and state guards. |
| Tokenized contract public view | `/contracts/view/:token` | M82 public sign boundary; M118/M119 route; M132–M136 pointer/capture/clamping hardening | PASS | Keep signature payload bounded and public projection minimal. |
| Follow-up lifecycle | `FollowUps.tsx`; create/generate/send/respond | M84–M88 server lifecycle/scheduler; browser can consult pending items, schedule follow-ups and view generated messages, but send/respond parity is not fully exposed | PARTIAL | Close observable send/respond contract or explicitly reclassify ownership. |
| Follow-up automation settings | Settings + scheduled follow-up handler | M139 authenticated GET/PUT settings browser lifecycle + fail-closed scheduler settings | PASS | Keep unsafe automation disabled by policy. |
| Trials lifecycle | `Trials.tsx`; convert/cancel/expire | M89–M91 domain/persistence/transport + M114/M125 browser create/convert/cancel/expire; M140 only links to canonical Trials | PASS | Preserve explicit timestamps and transition guards. |
| Trial scheduled expiry | `scheduledHandlers.ts`; cron docs | M92 scheduler, M93 notification processor, M94–M97 durable claim/lease/idempotency and M102/M103 runtime lifecycle | PASS | Keep claims, heartbeat and provider idempotency stable. |
| Referrals lifecycle | `Referrals.tsx`; edit/contact/lost/benefit/link lead | M98–M101 server + M115/M124/M127 browser registration/link/contact/conversion-loss | PASS | Preserve lead relation/benefit semantics. |
| CRM settings | `Settings.tsx` | M139 freezes Settings defaults/bounds + stage presentation in `@touristic/crm/settings-contract`; dedicated surface reuses Follow-up settings for the only V1 mutation | PASS | Do not invent a second generic settings store. |
| Persistence model | Drizzle/MySQL via `server/db.ts` | `@touristic/crm-server` persists commercial aggregates, interactions and durable audit in MySQL; M140 reuses `crm_leads`, `crm_checklist_items`, `crm_interactions`, `crm_audit_events` with prepared queries and no schema change | PASS | Historical migration/reconciliation remains deployment concern. |
| Object storage | `server/storage.ts` + S3 client | no reconciled CRM storage adapter in current V2 | GAP | Confirm whether frozen V1 object storage is still required; if yes add explicit server-only port/adapter. |
| AI-assisted CRM content | AI chat/generation behaviors | shared Assistant exists and Follow-up separates deterministic state from generated content, but no complete CRM-owned AI adapter/parity surface is frozen | PARTIAL | Reuse shared Assistant only through authorized CRM context. |
| Scheduled job protection | documented protected cron handlers | Follow-up and Trial schedulers use server-owned hosts with durable claims/idempotency rather than public unauthenticated mutation routes | PASS | Keep jobs internal/authenticated/observable. |
| Server-side audit/authorization | protected tRPC procedures + host auth | platform Auth, CRM authorization, durable MySQL audit and shared origin/CSRF transport are composed across authenticated transports; M140 adds explicit negative audit for detail/checklist/activity denials | PASS | Continue structured denials and mutation evidence. |
| Automated regression coverage | `server/crm.test.ts`, auth tests | permanent domain/persistence/transport/browser composition tests cover migrated aggregates; M140 adds frozen vocabulary, negative boundary tests, prepared-query tests and real MySQL + Chromium contract | PASS | Aggregate critical CRM browser gates into release GO criteria. |
| Responsive/accessibility visual surface | Radix/Tailwind CRM pages | browser surfaces use semantic controls/status states and focused contracts; M140 adds labeled forms/checklist/history, but no complete frozen V1 visual/accessibility equivalence matrix is consolidated | PARTIAL | Capture consolidated responsive/accessibility/visual evidence before `equivalent`. |

## M140 reconciled score

- `PASS`: 20
- `PARTIAL`: 4
- `GAP`: 1
- `N/A`: 0
- total: 25

The matrix moved from M72 (`0 PASS / 8 PARTIAL / 17 GAP`) to M133 (`17 PASS / 5 PARTIAL / 3 GAP`), M138 (`18 PASS / 5 PARTIAL / 2 GAP`), M139 (`19 PASS / 5 PARTIAL / 1 GAP`) and M140 (`20 PASS / 4 PARTIAL / 1 GAP`). `FEATURE-0006` remains `migrating`; Lead Detail closure does not imply remaining CRUD semantics, Follow-up send/respond, object storage, AI or final visual/release equivalence.

## Remaining CRM closure order

1. Reconcile the remaining observable Lead CRUD/optional-field clearing behavior from frozen V1 evidence; do not invent delete UI absent from the frozen pages.
2. Close or explicitly reclassify Follow-up send/respond behavior.
3. Decide the frozen V1 object-storage requirement and add a server-only adapter only if still required.
4. Freeze the CRM-owned AI-assisted contract instead of coupling directly to a provider.
5. Consolidate responsive/accessibility/visual equivalence evidence.
6. Run release-candidate, staging, rollback and production-readiness gates separately from migration equivalence.

This order keeps the server authoritative, prevents duplicate commercial domains and avoids claiming equivalence before the remaining observable contracts are proven. M140 stops at the next ordered PARTIAL after M139; object storage and other remaining gaps are untouched.
