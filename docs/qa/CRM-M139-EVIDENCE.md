# CRM M139 — Settings V1 Contract Evidence

## Scope

M139 closes only the first `GAP` that remained in the canonical CRM migration matrix after M138: **CRM settings**. It does not implement, reclassify or otherwise advance the next GAP, **Object storage**.

Branch base used for the implementation:

- repository: `luizidebook/touristic-digital-platform`;
- base: `main@17479a909b942c3eb211c110ca78e0986864bea4`;
- frozen CRM V1 authority: `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`.

## V1 inventory result

The frozen V1 `client/src/pages/Settings.tsx` contains exactly three observable sections:

1. **Follow-up Automático** — the only mutable Settings contract. It reads `followUps.settings` and writes `followUps.saveSetting` with `name`, `intervalDays`, `maxAttempts` and `isActive`.
2. **Sobre o Sistema** — read-only presentation.
3. **Etapas do Funil de Vendas** — read-only presentation derived from `STAGE_ORDER` and `STAGE_LABELS`.

The frozen V1 `server/routers.ts` confirms there is no separate authenticated generic Settings router. The only Settings mutation used by the page is the Follow-up setting mutation. A separate public `config.public` route only exposes `contactWhatsApp` and is not the authority for `Settings.tsx`.

Therefore M139 does **not** introduce a second settings table, generic settings repository, scheduler or mutation boundary.

## Implemented contract

### Frozen presentation vocabulary

`packages/crm/src/settings-contract.ts` freezes the V1 Settings presentation contract without changing persisted CRM stage identifiers:

- all V1 stage labels;
- the 16-stage active funnel order from the existing `crmActiveFunnelStages` authority;
- V1 Settings baseline version `1.1.0` as a historical baseline marker, not a V2 runtime version claim;
- Follow-up defaults: `Padrão`, 3 days, 5 attempts, active;
- V1 browser bounds: interval 1–30 days and attempts 1–20.

The subpath is exported as `@touristic/crm/settings-contract`.

### Authenticated browser surface

`apps/admin-crm/public/settings.html` and `settings.js` provide the dedicated Settings surface and keep it behind `@touristic/auth-browser` / `createDashboardAuthClient`.

The browser:

- resolves the existing platform session before revealing the Settings surface;
- redirects unauthenticated access to the dashboard login flow;
- uses `secureFetch`, so protected CRM writes retain same-origin credentials and CSRF handling;
- reads and writes `/api/crm/follow-ups/settings`, reusing the existing `CrmFollowUpServerBoundary` and MySQL repository/audit path;
- preserves an existing `messageTemplate` while the frozen V1 Settings form edits only the fields that were actually visible in V1;
- renders system/funnel information with DOM `textContent`/`replaceChildren`, never `innerHTML`;
- does not reproduce stale V1 descriptive strings such as “Follow-up com IA ativo” or “WhatsApp, LLM (IA)” as current runtime guarantees.

`apps/admin-crm/public/index.html` now links `Configurações` to the dedicated surface instead of advertising a nonexistent future generic settings boundary.

## Preserved invariants

M139 changes no CRM persistence schema and no scheduler/runtime ownership. Existing guarantees remain owned by their established contracts:

- **Auth / session / CSRF** — unchanged platform Auth ownership;
- **tenant/business scope and ownership** — no new identity or ownership mechanism is introduced;
- **MySQL** — Follow-up settings continue through `MySqlCrmFollowUpRepository`;
- **audit** — denied/invalid Follow-up settings operations continue through `MySqlCrmFollowUpAuditPort` and the existing CRM audit ledger;
- **idempotency / stale-claim recovery / trial notification guarantees** — no scheduler, claim, lease or notification code is changed;
- **browser contracts** — the existing CRM shell, dashboard and dedicated module contracts remain in place, with the former Settings-unavailable assertion replaced by the M139 Settings contract.

## Executable evidence

Permanent tests added/updated by M139:

- `packages/crm/src/settings-contract.test.ts`
  - freezes V1 defaults and bounds;
  - freezes the 16 Settings funnel stages in canonical order;
  - proves terminal stages remain labels but are not added to the V1 Settings funnel.
- `apps/morro-digital-platform/src/crm-admin-shell-contract.test.ts`
  - proves the shell exposes the dedicated Settings route;
  - proves the V1 Settings sections and browser bounds exist;
  - proves Settings uses the canonical dashboard Auth client and the existing Follow-up settings endpoint;
  - proves preservation of the existing message template;
  - proves safe DOM rendering and canonical CRM package vocabulary;
  - prevents reintroduction of the stale “generic boundary unavailable” claim.

Because `packages/crm/**` is part of the `CRM Platform Auth Integration Contract` workflow path filter, this PR is eligible for the real cookie/session/origin/CSRF/MySQL contract on its own head. Full promotion additionally requires the complete Quality Gate on that exact head before the PR is considered ready for coordinator review.

## Matrix effect

Only the prior `CRM settings` row changes from `GAP` to `PASS` on this branch:

- PASS: 19;
- PARTIAL: 5;
- GAP: 1;
- total: 25.

The remaining Object storage GAP is intentionally unchanged and no implementation for it is included in M139.
