# CRM M138 — Authoritative Dashboard Metrics and Funnel

## Objective

Close the first remaining CRM migration GAP after M137 by restoring the frozen V1 dashboard metrics/funnel as an authenticated, server-authoritative, read-only V2 contract.

M138 does not advance Lead detail, generic Settings, object storage, AI-assisted CRM content or release readiness.

## Revalidated base

- repository: `luizidebook/touristic-digital-platform`;
- branch base: `main@5e659459b2a3c81939cdca056a5b98ed2f4f120d`;
- current PR base after branch creation: `main@9a37cbe4d16004ea3d709aef4238477fcc80145d`, advanced only by Assistant PR #230 with no changed-file overlap with M138;
- previous CRM milestone: M137, merged by PR #227;
- frozen CRM V1: `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`.

No other CRM PR was open when the M138 branch was created.

## Frozen V1 metric semantics

The audited V1 `metrics.funnel` contract computes:

- `total`: every persisted Lead;
- `active`: Leads whose status is `active`;
- `converted`: Leads whose current stage is `active_client`;
- `lost`: Leads whose status is `lost` **or** whose current stage is `lost`, counting each Lead once;
- `conversionRate`: rounded `converted / total * 100`, or zero for an empty CRM;
- `totalRevenue`: sum of `monthlyValue` only for `active_client` Leads, presented as estimated monthly recurring revenue;
- `stageGroups`: current Lead count by stage;
- `stageConversion`: current-stage count divided by the previous canonical funnel-stage count, with the first stage divided by total Leads;
- five most recently created Leads;
- ten most recently created interactions.

The main V1 funnel visualization uses these eight stages:

1. `new_lead`;
2. `first_contact`;
3. `meeting_scheduled`;
4. `proposal_sent`;
5. `trial`;
6. `contract_signed`;
7. `payment_done`;
8. `active_client`.

The V1 browser refreshed the metric query every 30 seconds.

## M138 implementation

### Domain boundary

`@touristic/crm/metrics-boundary` introduces a read-only dashboard contract that:

- reuses the canonical CRM authorization policy;
- allows authenticated read roles, including `viewer`;
- rejects missing/expired sessions before repository access;
- records denied reads through the existing durable CRM audit model;
- exposes no mutation operation.

### MySQL authority

`MySqlCrmMetricsRepository` derives all dashboard values from `crm_leads` and `crm_interactions`.

The adapter:

- acquires one dedicated MySQL connection for the complete dashboard read;
- starts a `REPEATABLE READ` / `READ ONLY` transaction before the first metric query so aggregate totals, stage groups, recent Leads and recent interactions belong to one consistent database snapshot;
- commits and releases the connection only after all four reads complete successfully;
- rolls back and releases the connection if any snapshot query fails;
- computes aggregate metrics server-side;
- preserves `DECIMAL` revenue as an exact two-decimal string rather than introducing browser/floating-point authority;
- initializes every known Lead stage to zero before applying persisted groups;
- rejects unknown persisted stage or interaction vocabulary;
- requires grouped stage counts to reconcile exactly with total Leads;
- validates counts, identifiers and timestamps before returning a snapshot;
- orders recent Leads and interactions deterministically by timestamp then ID.

No schema migration is needed because M71 already persists every field required by the frozen metric contract.

### HTTP/runtime

The existing CRM runtime now composes:

`GET /api/crm/metrics/funnel`

through:

`platform Auth -> CrmMetricsServerBoundary -> MySqlCrmMetricsRepository -> CrmMetricsHttpTransport`

The endpoint is GET-only, returns `Cache-Control: no-store` through the shared CRM host, and is included in the existing CRM database fail-closed behavior.

### Browser

The authenticated CRM Dashboard now renders:

- Total de Leads + active count;
- Clientes Ativos + conversion rate;
- Receita Mensal / estimated MRR;
- Leads Perdidos;
- the eight-stage frozen funnel;
- five recent Leads;
- ten recent interactions.

The browser never derives authoritative totals from the Lead list. It consumes only the metric snapshot and renders server data through `textContent`/DOM nodes, never `innerHTML`. The dashboard refresh interval remains 30 seconds.

## Preserved safety guarantees

M138 does not modify:

- Lead mutation lifecycle or ownership;
- Meetings, Proposals, Contracts, Follow-ups, Trials or Referrals state machines;
- Auth/session/Origin/CSRF rules;
- public capability-token projections;
- Trial notification ownership, owner-only release/finalization, stale-claim recovery, lease heartbeat, stable provider idempotency key or provider-deduplication capability enforcement;
- database schema;
- any payment/financial authority.

## Permanent executable evidence

- `packages/crm/src/metrics-boundary.test.ts`
  - unauthenticated fail-closed behavior;
  - expired-session denial;
  - viewer-safe authenticated reads;
  - repository is not touched after auth denial.
- `services/crm/src/mysql-metrics-repository.test.ts`
  - frozen V1 aggregate semantics;
  - exact MRR normalization;
  - zero-filled stage groups;
  - canonical stage conversion;
  - deterministic recent Lead/interaction projections;
  - one `REPEATABLE READ` / `READ ONLY` transaction for the complete snapshot;
  - commit + release after a successful snapshot;
  - rollback + release when any snapshot query fails;
  - fail-closed aggregate/group reconciliation;
  - rejection of unknown persisted stage vocabulary.
- `services/crm/src/metrics-http-transport.test.ts`
  - authenticated GET contract;
  - unauthenticated 401 mapping;
  - GET-only surface;
  - prepared durable audit persistence.
- `apps/morro-digital-platform/src/crm-admin-shell-contract.test.ts`
  - frozen dashboard vocabulary and DOM targets;
  - authenticated metric URL;
  - exact eight-stage chart subset;
  - 30-second refresh contract;
  - safe text rendering;
  - runtime composition through the MySQL metrics adapter.

## Migration impact

When the final M138 head is green, `Dashboard metrics and funnel` moves from `GAP` to `PASS`.

The CRM migration score becomes:

```text
PASS      18
PARTIAL    5
GAP        2
N/A        0
TOTAL     25
```

`FEATURE-0006` / `MIG-0008` remain `migrating`, not `equivalent` and not `released`.

## Promotion rule

Keep the PR in draft until the exact final head passes the complete workspace Quality Gate and every path-triggered CRM/Auth contract. Revalidate `main`, branch divergence, changed files and review threads immediately before promotion/merge, then require the post-merge Quality Gate on `main` to remain green.
