# CRM M99 — Referrals MySQL persistence evidence

## Objective

Persist the M98 server-authoritative Referrals lifecycle in MySQL without introducing HTTP or browser composition yet.

## Schema

M99 adds `crm_referrals` with the frozen V1 fields and status vocabulary:

- required `referrer_lead_id`;
- optional `referred_lead_id`;
- referred name, phone and email;
- `pending | contacted | converted | lost` status;
- optional benefit description and grant timestamp;
- notes and millisecond timestamps.

The referrer relation cascades on lead deletion. The optional referred-lead relation uses `ON DELETE SET NULL` so deleting the converted/referred lead does not erase the historical referral record.

`applyCrmM99Schema()` composes the prior M95 schema chain and then applies `CREATE TABLE IF NOT EXISTS crm_referrals`, so fresh and already-upgraded databases converge idempotently.

## Repository

`MySqlCrmReferralRepository` implements the M98 boundary repository with prepared SQL for:

- list, optionally filtered by referrer lead;
- find by id;
- lead existence checks;
- create with generated-id readback;
- dynamic prepared updates for identity/contact, lifecycle status, referred-lead linkage and benefit fields;
- deterministic system interactions on the referrer lead timeline.

Rows map snake_case persistence fields back to the existing `CrmReferral` contract without leaking MySQL types into the domain package.

## Audit

`MySqlCrmReferralAuditPort` writes M98 authorization/validation denials into the existing `crm_audit_events` table. The shared audit table has one `lead_id` resource column, so M99 stores the durable `referrerLeadId` there. `referralId` remains available in the boundary event but is not added to the shared audit schema in this slice.

## Regression coverage

Focused tests prove:

1. frozen status vocabulary and both lead foreign keys;
2. prepared referrer filtering and row mapping;
3. prepared insert with generated-id readback;
4. prepared dynamic lifecycle/link/benefit updates;
5. prepared timeline interaction persistence;
6. prepared audit persistence using the referrer lead.

## Deliberate boundary

M99 does not add Referrals HTTP transport, application route composition or browser UI. Those remain subsequent slices after the persistence layer is green and frozen.
