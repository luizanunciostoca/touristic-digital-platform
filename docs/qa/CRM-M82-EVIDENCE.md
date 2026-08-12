# CRM M82 — Contracts public token view/sign

## Scope

M82 restores the V1 public contract capability-token flow without mounting the CRM browser UI.

## Frozen V1 behavior reconciled

The frozen CRM V1 at `1915d0260c79f30a63b926a1123e609083587745` exposes a public contract view by share token and a public signing mutation. The browser allows signing only while the contract is `sent`; signing records a signature, signer name and IP, advances the lead to `contract_signed` and appends a public contract interaction.

## V2 public contract contract

- `GET /api/crm/public/contracts/:token` resolves a capability token without an authenticated session;
- `POST /api/crm/public/contracts/:token/sign` accepts signature data and signer name;
- client-supplied `signerIp` is ignored; the Node host derives the IP from `x-forwarded-for` or the socket;
- malformed and unknown tokens fail closed;
- signing is allowed only from `sent`;
- the persistence update is atomic with `WHERE status = 'sent'`, preventing concurrent double-sign transitions;
- successful signing persists signer evidence, advances the lead to `contract_signed` and appends a public interaction;
- public responses expose only title, content, monthly value, status, sent/signed timestamps and signer name;
- internal IDs, proposal/lead linkage, share token, signature image data and signer IP are not returned by the public transport.

## Security boundary

The public token is a capability and does not reuse the authenticated CRM cookie/session/CSRF boundary. Mutation authority is restricted by possession of a valid high-entropy share token plus the server-side `sent` lifecycle guard. No IP value supplied in the request body is trusted.

## Deliberately deferred

- browser `ContractView` parity and signature canvas;
- public configuration/WhatsApp presentation;
- AI-assisted contract generation;
- historical V1 data migration.

## Promotion rule

Keep the PR draft until Quality and CRM Platform Auth Integration Contract are green on the same final helper-free head, the diff contains only permanent M82 files, and no review thread remains unresolved.
