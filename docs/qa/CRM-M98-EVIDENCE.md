# CRM M98 — Referrals lifecycle boundary evidence

## Objective

Port the frozen V1 referral lifecycle into a framework-independent, server-authoritative CRM boundary without introducing a browser surface or persistence implementation yet.

## Frozen V1 contract

The canonical V1 baseline is `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`.

V1 referral persistence contains:

- `referrerLeadId` required;
- optional `referredLeadId`;
- referred name/phone/email;
- statuses `pending | contacted | converted | lost`;
- optional benefit description and grant timestamp;
- notes and timestamps.

V1 creation requires `referrerLeadId` and a non-empty `referredName`. The V1 generic update route can change status, benefit fields and referred-lead linkage.

## V2 boundary

M98 exposes explicit operations instead of a single generic mutation surface:

- list by optional referrer lead;
- create;
- edit referred identity/contact fields;
- mark contacted;
- mark converted;
- mark lost;
- link an existing referred lead;
- grant a benefit once.

All mutations consume platform-authenticated session identity through the existing CRM authorization policy. Viewer role remains read-only.

## Lifecycle invariants

- new referrals start as `pending`;
- `pending -> contacted` is allowed;
- `pending | contacted -> converted` is allowed;
- `pending | contacted -> lost` is allowed;
- terminal `converted` and `lost` referrals cannot transition again;
- benefit grant requires a non-empty description and is single-grant at the boundary;
- referred lead linkage requires an existing lead;
- creation requires an existing referrer lead.

## Audit and interaction behavior

Authorization denials and invalid inputs/transitions are emitted through `CrmReferralAuditPort` using the existing CRM boundary pattern.

Successful creation, lifecycle transitions and benefit grant append deterministic interactions to the referrer lead timeline.

## Deliberate boundary

M98 does not add MySQL schema/repository code, HTTP transport, browser UI or historical data migration. Those remain subsequent slices after the domain contract is green and frozen.
