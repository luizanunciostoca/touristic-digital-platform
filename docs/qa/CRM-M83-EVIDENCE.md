# CRM M83 — Proposals public token view/respond

## Scope

M83 restores the frozen V1 public proposal capability-token flow without mounting the CRM browser UI.

## Frozen V1 behavior reconciled

The canonical CRM V1 at `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745` exposes public `getByToken` and `respondByToken` procedures. Viewing a proposal transitions `sent → viewed`; a public response accepts or rejects a non-final, non-expired proposal; acceptance advances the lead to `contract_sent`; and an optional respondent name is recorded in the public proposal interaction.

## V2 public proposal contract

- `GET /api/crm/public/proposals/:token` resolves a bounded capability token without an authenticated CRM session;
- a `sent` proposal is marked `viewed` server-side when first opened;
- `POST /api/crm/public/proposals/:token/respond` accepts `accepted` plus an optional bounded `respondentName`;
- responses are allowed only while the proposal is `sent` or `viewed`;
- already accepted/rejected, draft and expired proposals fail closed;
- the MySQL response mutation is atomic and requires `status IN ('sent','viewed')` plus a non-expired `valid_until` at update time, preventing concurrent double response;
- acceptance advances the lead to `contract_sent`;
- the public interaction uses stable actor subject `public-proposal-token`;
- public responses omit internal proposal/lead IDs, share token and creator identity.

## Security boundary

The share token is a capability. The public route intentionally does not reuse authenticated CRM cookie/session/CSRF authorization, while all authority remains server-side through token validation, lifecycle guards, expiry validation and atomic MySQL predicates. Internal authenticated proposal routes remain unchanged.

## Deliberately deferred

- browser `/proposals/view/:token` visual parity;
- CRM admin proposal browser surface;
- historical V1 data migration;
- unrelated follow-up/trial/referral work.

## Promotion rule

Keep the PR draft until Quality and CRM Platform Auth Integration Contract are green on the same final helper-free head, the diff contains only permanent M83 files, and no review thread remains unresolved.
