# CRM M68 — Domain Model Evidence

## Scope

M68 introduces the first CRM-owned executable V2 core while deliberately keeping persistence adapters, server commands and browser UI out of scope.

## Frozen source

- CRM V1: `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`
- schema source: `drizzle/schema.ts`
- UI vocabulary source: `client/src/lib/crm.ts`

## Permanent implementation

`@touristic/crm` now preserves:

- all 18 persisted lead stages;
- the distinct 16 active funnel stages;
- terminal `churned` / `lost` classification;
- the separate 16-step operational checklist;
- lead, meeting, proposal, contract, interaction, follow-up, trial and referral record models;
- status vocabularies for commercial and engagement records;
- framework-independent repository ports;
- fail-closed CRM ID and lead-stage guards.

No Drizzle, MySQL, React, tRPC, storage SDK or Auth implementation is imported by the CRM domain package.

## Executable evidence

Temporary M68 integration run `31546643166` passed before documentation reconciliation:

- workspace lockfile generation and frozen reinstall;
- CRM lint;
- CRM typecheck;
- CRM tests: 5/5 PASS;
- CRM build;
- repository `format:check`;
- `architecture:check`;
- `features:check`;
- repository lint;
- repository typecheck;
- repository tests;
- repository build.

## Matrix decision

The pipeline-vocabulary and persistence-model rows move from GAP to PARTIAL. No row is promoted to PASS because no CRM API/persistent adapter/browser consumer exists yet. The matrix becomes `0 PASS / 5 PARTIAL / 20 GAP / 0 N/A`.

## Tracker decision

`MIG-0008` advances from `snapshotted` to `migrating`. `FEATURE-0006` remains `baseline-pending`; equivalence is not claimed.

## Next milestone

M69 should freeze and port CRM authorization policy over equivalent platform Auth before introducing mutable CRM APIs.
