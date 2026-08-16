# CRM M140 — Lead Detail / Activity Evidence

## Scope

M140 closes the frozen V1 **Lead detail and activity lifecycle** without recreating Meetings, Proposals, Contracts, Trials or Follow-ups. Those modules remain independently owned and are linked from the detail surface.

The increment is intentionally stacked on the proven M139 Settings branch until the coordinator promotes M139. It must not be merged independently before that dependency is resolved.

The repository formatter was applied to every M140 file reported by the Quality Gate before the final validation cycle. The temporary formatter workflow removed itself and is not part of the PR diff.

## Frozen V1 baseline

- repository: `luizidebook/morro-digital-crm`
- frozen SHA: `1915d0260c79f30a63b926a1123e609083587745`
- primary page: `client/src/pages/LeadDetail.tsx`
- supporting procedures: `server/routers.ts` and `server/db.ts`

The frozen page proves the following observable contract:

1. complete lead summary and edit lifecycle;
2. all 18 lead stages, including `churned` and `lost`;
3. the canonical 16-step commercial checklist;
4. checklist completion/uncompletion with a system activity trail;
5. newest-first interaction history;
6. manual interaction creation, excluding system-authored `system` and `stage_change` events;
7. `lastContactAt` updated after manual activity;
8. quick navigation into separately owned commercial modules.

The frozen V1 list/detail UI does **not** expose lead deletion. Server delete support therefore remains outside the observable M140 browser parity claim.

## V2 implementation

### Frozen presentation contract

`@touristic/crm/lead-detail-contract` freezes:

- all 18 canonical lead stages and Portuguese labels;
- all 16 checklist steps, labels and descriptions;
- manual interaction types;
- read-only labels for system/stage-change history events.

### Server boundary

`@touristic/crm/lead-detail-boundary` adds only the missing lead-detail aggregate:

- `lead.detail`;
- `lead.checklist_toggle`;
- `lead.interaction_add`.

Existing `CrmLeadServerBoundary` remains authoritative for lead edits and stage transitions.

Security properties:

- platform Auth required for reads;
- mutations deny read-only roles;
- shared origin/CSRF transport security runs before mutation boundaries;
- checklist item IDs are bound to the requested lead before update;
- manual `system` and `stage_change` event injection is rejected;
- manual content is bounded to 4,000 normalized characters;
- negative decisions are persisted through the existing CRM audit ledger pattern.

### Persistence

M140 requires **no migration**. It reuses the existing M71 schema:

- `crm_leads`;
- `crm_checklist_items`;
- `crm_interactions`;
- `crm_audit_events`.

The MySQL adapter uses prepared parameters, reads checklist state by lead, binds toggle updates to both item and lead, limits activity readback to the latest 200 events and updates `crm_leads.last_contact_at` after valid manual activity.

### HTTP contract

Authenticated endpoints added beneath the existing Leads namespace:

- `GET /api/crm/leads/:leadId/detail`
- `PATCH /api/crm/leads/:leadId/checklist/:itemId`
- `POST /api/crm/leads/:leadId/interactions`

Existing canonical endpoints remain in use for:

- `PATCH /api/crm/leads/:leadId`
- `POST /api/crm/leads/:leadId/stage`

No new top-level CRM namespace or duplicate checkout/business domain is introduced.

### Browser contract

`apps/admin-crm/public/lead-detail.html` + `lead-detail.js` provide:

- authenticated same-origin detail page;
- complete lead summary;
- 18-stage selector;
- edit form;
- checklist progress and toggles;
- manual interaction form;
- newest-first activity history;
- read-only mode for viewers;
- safe DOM rendering through `textContent`/`replaceChildren`;
- links to independently owned Meetings, Proposals, Contracts, Trials and Follow-ups.

`lead-detail-links.js` adds the dedicated **Detalhes** navigation to the existing minified list lifecycle without rewriting the legacy `shell.js` implementation.

## Permanent automated evidence

### Unit / boundary

- `packages/crm/src/lead-detail-contract.test.ts`
- `packages/crm/src/lead-detail-boundary.test.ts`

Covers stage/checklist vocabulary, auth denial, viewer denial, cross-lead checklist protection, system interaction semantics, manual event restrictions and `lastContactAt` behavior.

### Persistence / transport

- `services/crm/src/mysql-lead-detail-repository.test.ts`
- `services/crm/src/lead-detail-http-transport.test.ts`

Covers existing-schema reuse, prepared queries, bounded history, ownership-bound checklist writes, authenticated read, CSRF denial, viewer denial and valid mutation transport.

### Composition

- `apps/morro-digital-platform/src/crm-lead-detail-contract.test.ts`

Proves browser surface composition, list navigation, safe DOM use and runtime ordering of Lead Detail before the generic Leads transport.

### Real MySQL + Chromium

`.github/workflows/crm-lead-detail-browser-contract.yml` proves against the real composed runtime:

- unauthenticated detail denial;
- owner login/session;
- real MySQL lead creation and 16 checklist rows;
- bad-CSRF denial;
- viewer read + mutation denial;
- cross-lead checklist denial;
- checklist mutation/readback;
- rejection of manually forged system interaction;
- manual note + `lastContactAt` readback;
- unauthenticated browser redirect to platform login;
- full 18-stage browser vocabulary;
- checklist browser mutation;
- interaction browser mutation;
- stage mutation through the existing canonical endpoint;
- lead edit through the existing canonical endpoint;
- list → detail navigation;
- zero page errors.

## Promotion rule

The PR may be handed to the coordinator only after all applicable checks are green on the **same head SHA**:

1. draft fast Quality;
2. CRM Platform Auth Integration Contract;
3. CRM Lead Detail Browser Contract;
4. any other path-triggered permanent contracts;
5. temporary ready-for-review full Quality with full tests + build;
6. return to draft without changing the proven head.

Run IDs and the final exact head are recorded in the PR discussion after the checks finish so this evidence file itself does not invalidate the SHA it is documenting.

## Matrix effect

M140 changes only **Lead detail and activity lifecycle** from `PARTIAL` to `PASS`.

Expected canonical matrix after proof:

- `PASS`: 20
- `PARTIAL`: 4
- `GAP`: 1
- total: 25

`FEATURE-0006` remains `migrating`. M140 does not claim closure of remaining Lead CRUD semantics, Follow-up send/respond, object storage, CRM-owned AI parity or consolidated responsive/accessibility/visual equivalence.
