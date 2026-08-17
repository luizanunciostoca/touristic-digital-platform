# Affiliates Threat Model — FEATURE-0010

## Scope

This threat model covers the future Affiliate server-side domain, referral evidence intake, attribution, conversion association, commission entitlement evidence and the Affiliate → Financial boundary. It explicitly excludes inventing commercial rules.

## Protected assets

- canonical affiliate identity and ownership relationship;
- referral evidence and attribution integrity;
- canonical conversion association;
- policy/version integrity;
- commission entitlement integrity;
- audit/idempotency history;
- personal data contained in or derivable from referral evidence;
- Financial authority and all Payment/ledger/allocation/payable/wallet/settlement/payout state.

## Trust boundaries

1. Browser/public input → Affiliate intake: untrusted.
2. Identity/Destination → Affiliate: authenticated public platform contracts only.
3. Ordering → Affiliate: read/event contract; Affiliate cannot mutate Ordering.
4. Financial → Affiliate: verified read/projection/event contract; Affiliate cannot mutate Financial persistence.
5. Affiliate → Financial: authenticated versioned materialization request; Financial revalidates everything authoritative.
6. Admin/operator → Affiliate: privileged action requiring explicit authorization and immutable audit.
7. Analytics/Observability: sanitized projection only, never an authority source.

## Threats and mandatory controls

### Referral spoofing and affiliate-ID tampering

Threat: an attacker edits query parameters, cookies, local storage or redirect data to claim another affiliate.

Controls:

- browser identifiers are untrusted evidence only;
- accepted evidence must pass the approved server-side trust contract;
- canonical affiliate identity is resolved server-side;
- evidence fingerprint and source contract version are durable/audited.

### Replay and duplicate stuffing

Threat: the same referral/conversion is submitted repeatedly to create duplicate attribution or entitlement.

Controls:

- durable idempotency claim before mutation;
- deterministic operation identity;
- exact replay converges;
- divergent replay fails closed;
- concurrency tests cover parallel claims.

### Attribution hijacking

Threat: later evidence replaces an earlier valid attribution without an approved precedence rule.

Controls:

- no overwrite while precedence is undecided;
- policy version is bound to every attribution decision;
- any replacement is a distinct audited transition after approval.

### Window manipulation

Threat: client clock, stale evidence or timestamp rewriting extends eligibility.

Controls:

- server clock controls receipt/evaluation time;
- source timestamps are evidence, not authority, unless the approved source contract says otherwise;
- window policy version is immutable for a decision;
- no window exists in runtime before policy approval.

### Fake conversion

Threat: click/redirect/browser callback is treated as a sale/conversion.

Controls:

- qualifying conversion references a canonical Ordering/Financial contract only;
- Affiliate cannot create or mutate the authoritative order/payment record;
- qualifying event/state remains fail-closed until approved.

### Commission formula injection

Threat: browser/admin request supplies amount, rate, currency or formula that becomes monetary authority.

Controls:

- no browser-controlled monetary fields in the Financial materialization request;
- policy snapshot is versioned and server-authoritative;
- calculation input/result is digested and audited;
- Financial independently validates materialization evidence.

### Financial authority escalation

Threat: Affiliate creates ledger entries, payable, wallet, settlement or payout state directly.

Controls:

- architecture/import boundary forbids Financial persistence/provider access;
- Affiliate → Financial is a public port only;
- Financial owns allocation/payable/settlement/payout state machines;
- `accepted` handoff is not settlement or payout.

### TOCTOU between entitlement and materialization

Threat: entitlement changes after a materialization request is prepared.

Controls:

- request binds entitlement ID, immutable revision and digest;
- Financial rejects stale/mismatched revisions;
- exact replay reads durable result before another mutation.

### Refund/cancellation race

Threat: a materialization races with refund/cancellation evidence.

Controls:

- lifecycle consequences are decision-gated and versioned;
- once approved, canonical reversal evidence participates in concurrency/integration tests;
- Financial retains independent reconciliation/reversal authority;
- rollback never deletes financial history.

### Policy downgrade or stale policy replay

Threat: an older/favorable policy version is replayed after a new version is effective.

Controls:

- effective policy version selection is server-side and auditable;
- entitlement binds immutable policy version/snapshot digest;
- divergent policy replay fails closed.

### Privilege escalation and tenant leakage

Threat: Business/tenant role or another affiliate gains Affiliate admin/read authority.

Controls:

- Affiliate is platform-level, not tenant-owned;
- tenant membership alone grants no Affiliate scope;
- self-service ownership is proven through canonical Identity;
- privileged reads/writes are explicitly authorized and audited.

### PII leakage

Threat: raw referral URLs, tokens, IP/device data or identity documents leak through logs/events/analytics.

Controls:

- minimize and digest evidence;
- copy no Identity credentials/documents into Affiliate;
- sanitize events/observability;
- configurable retention and data-subject workflows;
- privileged read audit.

### Event poisoning and schema confusion

Threat: a malformed/stale event version causes unintended mutation.

Controls:

- `PLATFORM-EVENT-ENVELOPE` is mandatory;
- explicit event owner/version/payload validation;
- unknown versions fail closed/dead-letter;
- idempotency identity includes relevant contract version.

### Denial of service and evidence flooding

Threat: public referral intake is abused to exhaust storage or compute.

Controls:

- bounded payloads;
- rate limiting at the ingress/application boundary;
- cheap validation before durable/expensive work;
- quotas/alerts are operational configuration, not commission policy;
- no synchronous payout/provider side effect on public intake.

### Insider/admin abuse

Threat: a privileged operator changes attribution/entitlement without traceability.

Controls:

- explicit privileged authorization;
- append-only audit with actor and before/after digest;
- no destructive history rewrite;
- sensitive operational actions require independent review/approval when platform governance mandates it.

## Security invariants

- fail closed on unknown identity, policy, event version, authorization or evidence trust;
- never trust client time or client monetary data;
- no cross-domain direct database writes;
- no secret or raw token in events/audit/observability;
- no Affiliate-owned payout/wallet/settlement implementation;
- no automatic retry after an uncertain Financial side effect without durable readback;
- all state-changing paths are idempotent, authorized and audited.

## Validation gate

The security test suite in `docs/qa/AFFILIATES-FEATURE-0010-TEST-PLAN.md` must cover these threats before runtime promotion. Commercial decisions may strengthen controls but may not weaken the ownership/trust boundaries above.
