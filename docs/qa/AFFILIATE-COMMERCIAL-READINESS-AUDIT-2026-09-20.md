# Affiliate Commercial Readiness Audit — 2026-09-20

## Scope

This audit distinguishes the already certified server-side `FEATURE-0010` equivalence from a commercially usable Affiliate product.

Canonical repository: `luizanunciostoca/touristic-digital-platform`

Audit baseline: `main@05f7df04eaee94de9bf894f75f6842ba6f0c3731`

Implementation branch: `feat/affiliate-commercial-portal-20260920`

No production activation, real-money execution or destructive data migration is authorized by this work.

## Executive result

The Affiliate domain is mature and server-authoritative, but the commercial product is not yet 100% end-to-end.

The branch created by this audit closes the first browser/runtime layer:

- the Affiliates server package becomes consumable by the platform runtime;
- Affiliates is composed into the canonical Node server behind an explicit opt-in runtime gate;
- authenticated affiliates receive a read-only commercial projection;
- eligible affiliates can issue signed first-party referral links;
- marketplace entry captures signed referral evidence;
- the browser cannot choose Affiliate monetary values, policy, timestamps or affiliate identity;
- persistent visitor attribution identity is server-controlled and HttpOnly;
- the portal explicitly preserves Financial as the only payout/wallet/settlement authority.

## End-to-end checklist

| Flow | Baseline | This branch | Remaining gate |
| --- | --- | --- | --- |
| Affiliate identity/account domain | PASS | preserved | none |
| Program membership | PASS backend | visible in portal | self-service enrollment/admin UX |
| Identity/contact verification | PASS backend model | visible in portal | operator/Identity integration UX |
| Suspension/fraud block | PASS backend | enforced for referral issuance/capture | admin operational surface |
| Terms acceptance | PASS backend | enforced | enrollment UX |
| Referral link policy | PASS contract | signed server-issued link added | staging activation |
| Referral click capture | GAP runtime | implemented | browser/staging E2E |
| Attribution precedence/window | PASS | reused unchanged | none |
| Attribution → Order lock | PASS backend capability | not composed | checkout bridge |
| Payment-confirmed conversion | PASS backend capability | not composed | verified Ordering/Financial adapters |
| Commission formula 3000 bps | PASS | read-only projection | none |
| Commission maturity/lifecycle | PASS backend capability | not scheduled in runtime | lifecycle worker |
| Refund/cancellation consequences | PASS backend capability | not event-composed | verified adjustment adapter |
| Affiliate → Financial materialization | PASS backend contract | readback shown | live dispatcher/readback composition |
| Affiliate balance/extract | backend evidence exists | commercial statement added | Financial wallet/payable projection |
| Affiliate-initiated payout | N/A / prohibited | still prohibited | must remain Financial-owned |
| Affiliate portal | future | implemented | browser E2E/accessibility acceptance |
| Admin affiliate portal | missing | not added | required operational UI |
| Notifications | missing commercial composition | not added | notification events/templates |
| Reporting/export | limited | portal recent activity | admin/export reporting |
| Production activation | NO-GO | unchanged | global production gates + explicit GO |

## Security and privacy properties added

### Signed referral authority

Referral links contain a compact HMAC-SHA256 token issued only by the server. The token binds:

- affiliate;
- program;
- destination;
- issuance time;
- expiration;
- nonce.

The lifetime is capped at the canonical 30-day attribution window.

### Browser is transport only

The browser cannot provide:

- commission percentage;
- eligible revenue;
- payout instruction;
- currency authority;
- affiliate ID authority;
- attribution ID;
- server timestamps;
- policy version.

### Visitor attribution identity

The marketplace does not use device fingerprinting and does not persist a visitor identity in JavaScript storage. The runtime creates the attribution subject server-side and stores the first-party subject reference in an HttpOnly, SameSite=Lax cookie.

The signed referral token may be held temporarily in session storage only after it has been removed from the URL; it remains untrusted transport evidence.

## Runtime activation contract

The new commercial runtime is opt-in:

`AFFILIATES_RUNTIME_ENABLED=false`

When enabled it requires:

- `AFFILIATES_DATABASE_URL`;
- `AFFILIATE_REFERRAL_SECRET` with at least 32 characters;
- `AFFILIATE_PUBLIC_ORIGIN` in production;
- optional `AFFILIATE_REFERRAL_TTL_SECONDS`, capped at 30 days.

Disabled runtime is non-critical readiness. Enabled runtime fails closed and becomes a critical readiness dependency.

## Remaining P0 implementation sequence

1. Compose checkout attribution lock using the server-owned attribution subject.
2. Compose verified Ordering + Financial evidence into automatic conversion association.
3. Add lifecycle worker for entitlement maturity and verified refund/cancellation consequences.
4. Compose durable Affiliate → Financial materialization dispatcher/readback.
5. Add Financial-owned payable/settlement read projection to the Affiliate Portal.
6. Add enrollment/admin Affiliate surfaces with audited verification, approval, suspension and financial-onboarding controls.
7. Add notification and reporting projections.
8. Add exact-head browser contract covering login → link → capture → order → payment TEST → commission → materialization readback.
9. Enable only in isolated staging and execute MySQL/browser concurrency acceptance.
10. Production remains gated by the repository-wide release decision and explicit financial authorization.

## Definition of 100% commercial readiness

The Affiliate system may be called commercially complete only when all P0 gates above have executable exact-head evidence and staging acceptance, while production payout remains subject to the global Production Release Readiness ledger and explicit real-money authorization.
