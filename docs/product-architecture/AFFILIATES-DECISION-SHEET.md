# Affiliates Decision Sheet — FEATURE-0010

## Approval record

- Status: **APPROVED**
- Policy version: **AFFILIATE-POLICY-V1**
- Product owner: **Morro Digital Product**
- Approved on: **2026-08-17**
- Runtime activation: this policy becomes commercially effective only when FEATURE-0010 is enabled in production. No attribution or entitlement is created before that activation.
- Change rule: published policy versions are immutable. Any future commercial change requires a new version and must not rewrite historical attribution or entitlement evidence.

The 19 decisions below are the canonical product-policy source for FEATURE-0010. Runtime must fail closed whenever required evidence, policy version, authorization or Financial/Ordering authority cannot be proven.

## 1. affiliate identity

An affiliate is represented by a global `AffiliateAccount` linked to canonical Identity. A natural person has one economic affiliate identity per beneficiary by default. Organizations/agencies may have their own affiliate account with delegated administrators. The same account may participate in multiple destinations/programs through `AffiliateProgramMembership`; destination participation does not create a new economic identity. Business/seller roles remain separate and grant no Affiliate authority.

## 2. eligibility

Two independent eligibility levels apply:

- `ACTIVE_FOR_ATTRIBUTION`: canonical Identity verified, contact verified, current program terms accepted, membership approved, and no suspension/fraud block.
- `ELIGIBLE_FOR_FINANCIAL_MATERIALIZATION`: all attribution requirements plus the beneficiary/KYC/tax/onboarding requirements required by Financial.

An affiliate may generate eligible attribution before Financial onboarding is complete, but no monetary materialization may be requested for an ineligible beneficiary.

## 3. suspension

Suspension immediately blocks new attribution and new Financial materialization. Historical evidence and attribution are never deleted. Conversion evidence observed during suspension may be retained, but related entitlement must remain frozen under review/dispute and cannot become `earned` while the blocking condition remains. Existing earned/materialized rights are not automatically confiscated; reversal requires canonical fraud, refund, cancellation or another versioned and auditable cause.

## 4. referral evidence

V1 accepts only:

1. platform-issued affiliate link/deep link;
2. platform-issued QR code;
3. affiliate code explicitly entered by the customer;
4. authenticated, versioned server-to-server referral contracts when enabled.

Query parameters, cookies, local storage and browser state are transport/untrusted evidence only. The server validates the affiliate/program, records a normalized evidence record, and stores a deterministic fingerprint/digest. Device fingerprinting and IP-based attribution are prohibited.

## 5. attribution subject

Attribution belongs to a server-owned, pseudonymous `AcquisitionSubjectId`. Guest users receive an opaque first-party subject that may later be linked, with audit evidence, to canonical Identity and/or the canonical Order. Attribution never belongs to a browser/device identifier as authority.

## 6. attribution precedence

Use **last valid affiliate intent with source precedence** before Order attribution lock:

1. explicit affiliate code entered by the customer at checkout;
2. authenticated/versioned server-to-server referral evidence;
3. validated platform link or QR evidence.

For evidence at the same precedence level, the most recent valid server-observed evidence wins. Direct/organic traffic does not erase an existing valid Affiliate attribution. Once the Order reaches `pending_payment`, that Order's affiliate attribution is locked and later referral input cannot replace it.

## 7. attribution window

The V1 attribution window is **30 calendar days**, measured exclusively by server time from accepted evidence. New valid Affiliate evidence may establish/replace attribution according to precedence while the Order is still unlocked. An attribution expires after 30 days without a newer accepted attribution. The duration is policy-versioned, never hard-coded as an unversioned browser rule.

## 8. qualifying conversion

A V1 conversion requires both:

- a canonical Order whose authoritative Ordering state is `payment_confirmed`; and
- verified Financial evidence that the payment/conversion is confirmed and exposes the authoritative eligible revenue basis.

Click, redirect, checkout start, `OrderPlaced` alone, browser callbacks and provider URLs do not qualify. Each canonical Order may produce at most one Affiliate conversion. Automatic subscription renewals are **not commissionable in V1**; only the initial qualifying acquisition is eligible.

## 9. commission base

Commission is based on **Financial-authoritative net eligible platform revenue** for the qualifying transaction, not gross GMV and not amounts economically belonging to the seller. The eligible basis excludes seller pass-through amounts, refunds, amounts that never became platform revenue and other exclusions determined by Financial's canonical revenue model. Affiliate must never derive this basis from a browser-visible price.

## 10. fixed vs percentage

V1 implements **percentage commission only**. The contract may be extensible to future versioned models, but no fixed or hybrid model is enabled by AFFILIATE-POLICY-V1.

## 11. rate

The V1 commission rate is **30% of Financial-authoritative net eligible platform revenue**, represented as **3000 basis points**. Floating-point percentage arithmetic is prohibited. Any future destination/program/tier variation requires a new explicit policy version or an explicitly versioned scoped policy; no silent override is allowed.

## 12. rounding

All monetary computation uses integer minor units. Percentage calculation uses integer/rational arithmetic and **half-up rounding to the currency's minor unit at the final commission result**. Historical entitlement/reversal uses the original policy snapshot and amount evidence; it is never recalculated under a newer policy.

## 13. caps

AFFILIATE-POLICY-V1 has **no commercial commission cap or minimum**. Risk limits, anomaly thresholds and manual-review thresholds are operational controls and must not silently change the contractual commission formula. Future caps require an explicit versioned policy.

## 14. currency

An entitlement uses the **same currency as the Financial eligible-revenue basis** that produced it. Affiliate performs no FX and does not aggregate unlike currencies as equivalent value. Currency conversion, beneficiary settlement currency and payout FX remain exclusively Financial/provider responsibilities.

## 15. effective dates/versioning

Every Affiliate policy is immutable after publication and carries `policyVersion`, `effectiveFrom` and optional `effectiveUntil`. The policy snapshot is frozen when authoritative attribution is established. A later commercial-policy release does not rewrite that attribution or any entitlement derived from it. New attribution created under a later effective policy uses that later version. AFFILIATE-POLICY-V1 is approved now and becomes runtime-effective only at FEATURE-0010 production activation.

## 16. pending/earned/reversed/cancelled/disputed lifecycle

Canonical commercial states are:

- `pending`: qualifying conversion exists but commission has not matured;
- `earned`: commercial right has matured and may be offered to Financial for materialization;
- `cancelled`: pending right ceased to qualify before becoming earned;
- `reversed`: an earned right was fully or partially reversed by valid later evidence;
- `disputed`: materialization is frozen while authoritative review/evidence is unresolved.

Allowed lifecycle families are `pending -> earned`, `pending -> cancelled`, `pending -> disputed -> pending|earned|cancelled`, and `earned -> disputed -> earned|reversed`. `cancelled` and fully `reversed` outcomes are terminal; exceptional corrections require a new audited revision/adjustment rather than history mutation.

V1 maturity requires at least **7 calendar days after verified payment** and, when a canonical service/performance date exists, not before that service/performance has occurred. Server time is authoritative.

## 17. refund/cancellation consequences

Before `earned`:

- full canonical refund/cancellation causes `cancelled`;
- partial refund recomputes entitlement from the new Financial-authoritative net eligible basis under the original policy snapshot.

After `earned`/materialization:

- full refund produces a full audited reversal;
- partial refund produces a proportional audited reversal based on authoritative Financial evidence and the original entitlement/policy snapshot;
- chargeback/payment dispute places the right in `disputed` until resolved.

Original evidence is preserved. Affiliate never deletes Financial history and never creates a wallet/debt/payout mechanism. Any later offset or monetary recovery is Financial-owned.

## 18. Financial materialization timing

Affiliate may request Financial materialization **only when an entitlement is `earned` and the beneficiary is `ELIGIBLE_FOR_FINANCIAL_MATERIALIZATION`**. Materialization is asynchronous, authenticated, idempotent and versioned. Its operational states are separate from the commercial lifecycle: `not_requested`, `pending`, `accepted`, `rejected`.

`accepted` means only that Financial accepted the materialization request; it does not mean paid, settled or transferred. Retryable rejection requires readback before retry. Permanent rejection opens operational review. Affiliate must never create or mutate Payment, ledger, payable, wallet, settlement, transfer or payout state directly.

## 19. retention/LGPD

Default V1 engineering retention policy:

- raw referral evidence, only when storage is required: maximum **90 days**, followed by deletion/anonymization while retaining only necessary audit digests;
- pseudonymized attribution/conversion metadata: **24 months after the last relevant activity**;
- Affiliate entitlement/audit/commercial evidence required for reconciliation or defense of rights: default internal policy of **5 years after final settlement/closure**, configurable by jurisdiction and subject to applicable legal/fiscal requirements and lawful holds.

Identity remains owner of canonical PII; Affiliate stores references/minimized data rather than duplicating identity records. Valid data-subject requests trigger deletion/anonymization where legally permitted. Financial maintains its own legally required monetary/accounting records independently. No raw secrets, tokens, identity documents or unnecessary personal data may be written to Affiliate events, analytics, logs or observability.

## Approval gate

**SATISFIED for AFFILIATE-POLICY-V1.** All 19 product decisions now have an explicit approved value, owner and policy version. This approval unblocks implementation, but does **not** promote FEATURE-0010 to equivalent/release-ready. Runtime must still pass architecture, security, privacy, idempotency, persistence, integration, test and release gates before any state promotion.
