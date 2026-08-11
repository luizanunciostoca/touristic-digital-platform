# CRM M67 — Baseline + Inventory Evidence

## Scope

M67 starts Wave 7 by freezing the real CRM V1 source and mapping its observable contracts before any V2 implementation is created.

## Canonical source

- legacy repository: `luizidebook/morro-digital-crm`;
- frozen commit: `1915d0260c79f30a63b926a1123e609083587745`;
- latest audited legacy commit message records nine completed CRM audit improvements across contracts, trials, lead stages, follow-ups, referrals, meetings and regression tests.

## V2 reconciliation

At M67 start:

- `FEATURE-0006` is still planned;
- `MIG-0008` is still discovered;
- `apps/admin-crm` does not exist;
- no CRM-specific package/service has been implemented in the V2 monorepo.

This is a legitimate zero-parity baseline, not missing discovery work.

## Frozen browser inventory

The V1 router exposes Dashboard, Leads, Lead Detail, Meetings, Proposals, tokenized Proposal View, Contracts, tokenized Contract View, Follow-ups, Trials, Referrals, Settings and fallback/not-found surfaces.

## Frozen backend inventory

The audited server includes tRPC routing, Drizzle/MySQL persistence, scheduled automation handlers, object storage integration, authentication/runtime host code and CRM regression tests.

## Dependency decisions

- CRM will consume `FEATURE-0008` Auth rather than recreate authentication/session primitives.
- AI behavior may consume shared platform capability, but CRM remains owner of CRM context, authorization and validation.
- Persistence, tokenized public views, scheduled jobs and storage remain server-authoritative.
- Browser UI migration must not precede the domain/API/persistence contract.

## Matrix checkpoint

Initial M67 matrix:

- PASS: 0;
- PARTIAL: 3;
- GAP: 22;
- N/A: 0;
- total: 25.

The only partials are dependency reuse: platform Auth, shared AI capability and server-side identity primitives exist but are not yet integrated into a CRM-owned boundary.

## Promotion decision

After the documentation-only baseline head passed the official Quality Gate, `FEATURE-0006` advances from `planned` to `baseline-pending` and `MIG-0008` advances from `discovered` to `snapshotted`. This records completed discovery/baseline work only; the CRM matrix remains `0 PASS / 3 PARTIAL / 22 GAP`.

## Next milestone

M68 should freeze the CRM data model and pipeline vocabulary from the Drizzle schema/database access layer, then create framework-independent CRM domain types, repository ports and authorization decisions. It must not mount the CRM browser application yet.

## Exit gate

M67 may merge only when:

1. the frozen legacy commit is explicit in baseline and evidence;
2. the initial CRM matrix is internally consistent;
3. no runtime/implementation code is changed;
4. the official Quality Gate passes on the final documentation-only head;
5. no temporary helper workflow or unresolved review thread remains.
