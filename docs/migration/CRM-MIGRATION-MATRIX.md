# CRM Administrativo — Migration Matrix (M141 equivalence closure)

## Status semantics

- `PASS` — V2 exposes the audited frozen contract with executable evidence.
- `PARTIAL` — a material V2 path exists, but the complete frozen contract or required evidence remains open.
- `GAP` — no CRM-owned V2 equivalent exists yet.
- `N/A` — the frozen baseline does not require a CRM-owned implementation for current equivalence, or ownership intentionally belongs elsewhere.

## Baseline and final checkpoint

- frozen CRM V1: `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`;
- V2 target feature: `FEATURE-0006`;
- tracker item: `MIG-0008`;
- M139 prerequisite: already merged before M140 reconciliation;
- M140: PR #260, Lead Detail / Activity restoration;
- M141: PR #266, residual equivalence closure stacked on #260;
- target migration status after M141 gates: `equivalent`, **not** `released`.

M73–M139 established platform Auth composition, MySQL persistence, audited commercial aggregates, schedulers, public token flows, authenticated browser lifecycles, dashboard/funnel metrics and the only mutable frozen Settings contract. M140 restores the frozen Lead Detail/Activity contract while preserving the exact 16-stage operational selector and all 18 recognized readback labels. M141 closes the remaining observable parity items without creating a parallel CRM domain, payment flow, ticketing flow, Assistant implementation or Marketplace redesign.

M140 and M141 require no database migration. M141 preserves the V1 browser command for clearing optional fields (`""`) while translating empty optional persistence to SQL `NULL`, including the `DECIMAL` monthly value. Follow-up lifecycle uses the existing server-authoritative transitions. Object storage is explicitly reclassified `N/A` because the frozen V1 helper has no observable CRM consumer. AI-assisted CRM content is expressed as a CRM-owned authorized context boundary calling an injected shared capability port (`crm.content.generate`), with no provider/API-key authority in CRM.

| Contract | Frozen V1 evidence | V2 state after M141 | Status | Final invariant |
| --- | --- | --- | --- | --- |
| CRM application shell and authenticated layout | React CRM layout | Authenticated `apps/admin-crm` shell + dedicated canonical surfaces | PASS | Platform Auth remains owner |
| Platform authentication/session integration | V1 protected procedures/client session | `@touristic/auth-browser`, same-origin session, CSRF/origin/RBAC negative paths | PASS | No CRM-local auth |
| Dashboard metrics and funnel | `Dashboard.tsx`, `metrics.funnel` | Server-authoritative MySQL snapshot, authenticated GET-only metrics/funnel | PASS | Read-only server calculation |
| Lead list and search/filter lifecycle | `Leads.tsx` | Authenticated list, bounded search/filter, MySQL persistence, Details navigation | PASS | Bounded server query semantics |
| Lead detail and activity lifecycle | `LeadDetail.tsx` | M140 aggregate, exact frozen stages/checklist, interactions, edit/stage, real MySQL + Chromium | PASS | Related modules stay separately owned |
| Sales pipeline stages | frozen V1 selector/transitions | Exact 16 selectable stages + terminal readback labels, audited transitions | PASS | Server-authoritative transitions |
| Lead CRUD and server validation | tRPC routes + frozen forms | Create/update/stage browser-observable; M141 proves optional-field clearing end-to-end; no delete UI invented because frozen pages expose none | PASS | `companyName` required; optional `""` means clear and persists as `NULL` |
| Meetings lifecycle | `Meetings.tsx` | Existing canonical Meetings lifecycle linked from CRM | PASS | Explicit auditable transitions |
| Proposals lifecycle | `Proposals.tsx` | Existing create/send/respond lifecycle | PASS | Preserve lead linkage/atomic state |
| Tokenized proposal public view | `/proposals/view/:token` | Bounded tokenized public projection | PASS | Minimal public projection |
| Contracts lifecycle | `Contracts.tsx` | Existing create/send/cancel lifecycle | PASS | Preserve proposal linkage/state guards |
| Tokenized contract public view | `/contracts/view/:token` | Public signing flow with bounded signature payload | PASS | Bounded public projection |
| Follow-up lifecycle | `FollowUps.tsx`; create/generate/send/respond | M141 exposes existing `pending → sent → responded` server transitions in browser; invalid transition 409 and viewer write 403 proven | PASS | No client-owned state authority |
| Follow-up automation settings | Settings + scheduler | Existing authenticated GET/PUT settings + fail-closed scheduler | PASS | Unsafe automation remains policy-controlled |
| Trials lifecycle | `Trials.tsx` | Existing create/convert/cancel/expire lifecycle | PASS | Explicit timestamps/guards |
| Trial scheduled expiry | protected scheduled handlers | Durable claim/lease/heartbeat/idempotency | PASS | Internal/authenticated jobs |
| Referrals lifecycle | `Referrals.tsx` | Existing registration/link/contact/conversion-loss lifecycle | PASS | Preserve relation/benefit semantics |
| CRM settings | `Settings.tsx` | M139 reuses Follow-up settings for the only frozen mutable settings contract | PASS | No second generic settings store |
| Persistence model | Drizzle/MySQL | Existing MySQL schema + prepared queries; M141 adds persistence translation for optional clear, no schema change | PASS | Durable server authority |
| Object storage | generic `server/storage.ts` helper | Frozen baseline search found no CRM surface/router/domain consumer requiring object storage for observable equivalence | N/A | Do not create an unused adapter |
| AI-assisted CRM content | CRM generation behaviors | `CrmAiContentBoundary` owns authorized lead/recent-interaction context and calls only injected `CrmSharedAssistantContentPort` capability `crm.content.generate` | PASS | No direct provider/API key/fetch or duplicate Assistant |
| Scheduled job protection | protected cron handlers | Server-owned Follow-up/Trial hosts with durable claims/idempotency | PASS | No public unauthenticated scheduler mutation |
| Server-side audit/authorization | protected procedures + host auth | Platform Auth, CRM authorization, durable audit, CSRF/origin and structured denials | PASS | Mutations fail closed |
| Automated regression coverage | CRM/auth tests | Permanent package/server tests plus Platform Auth, Lead Detail Browser and final CRM Equivalence Browser gates | PASS | Exact-head gates required for promotion |
| Responsive/accessibility visual surface | Radix/Tailwind frozen CRM surfaces | M141 Chromium evidence at 390×844, 768×1024 and 1280×900; semantic labels/statuses, keyboard focus, no root overflow, canonical CRM styling and hidden-state correctness | PASS | Visual evidence remains part of release gate |

## M141 canonical score

```text
PASS     24
PARTIAL   0
GAP       0
N/A       1
TOTAL    25
```

The canonical progression is:

```text
M72   0 PASS / 8 PARTIAL / 17 GAP
M133 17 PASS / 5 PARTIAL / 3 GAP
M138 18 PASS / 5 PARTIAL / 2 GAP
M139 19 PASS / 5 PARTIAL / 1 GAP
M140 20 PASS / 4 PARTIAL / 1 GAP
M141 24 PASS / 0 PARTIAL / 0 GAP / 1 N/A
```

## M141 closure evidence

The permanent `CRM Equivalence Browser Contract` runs against real MySQL 8.4 and the authenticated Morro Digital runtime. It proves:

- Platform Auth login and same-origin authenticated browser execution;
- invalid Follow-up `pending → responded` transition fails `409 INVALID_TRANSITION`;
- Viewer Follow-up mutation fails `403 READ_ONLY_ROLE`;
- Lead optional fields begin populated, are cleared by the browser and read back durably as cleared values;
- required company name remains intact;
- Follow-up lifecycle reaches `pending → sent → responded`, with both browser mutations returning HTTP 200 and durable MySQL readback `responded`;
- mobile `390×844`, tablet `768×1024`, desktop `1280×900`;
- keyboard focus lands on visible interactive controls;
- semantic headings, labels and live status regions are present;
- no browser `pageerror` or non-benign failed request in the successful evidence run;
- screenshots are uploaded by the permanent workflow for visual inspection.

See `docs/qa/CRM-M141-EQUIVALENCE-EVIDENCE.md` for the promotion record.

## Equivalence versus release

`FEATURE-0006` may be `equivalent` when this matrix, Feature Registry, tracker and exact-head gates agree. `Equivalent` does **not** mean `released`.

Release remains a separate coordinator-controlled operation:

1. promote/merge #260 before #266;
2. deploy to staging using the normal platform process;
3. rerun permanent Quality/Auth/CRM browser gates and staging smoke checks;
4. observe platform health/readiness and CRM auth/MySQL behavior;
5. promote production only under the coordinator's release process.

Rollback is intentionally simple because M140/M141 add no schema migration: revert #266 first, then #260 if necessary, and redeploy the previous known-good application artifact. No down-migration or parallel persistence path is required.
