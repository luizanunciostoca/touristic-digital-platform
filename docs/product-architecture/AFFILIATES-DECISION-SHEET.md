# Affiliates Decision Sheet — FEATURE-0010

## Purpose

This sheet contains exactly the product decisions still required before Affiliate runtime implementation. No value is assumed by the repository until explicitly approved and versioned.

## 1. affiliate identity

Decide what an affiliate identity represents and its relationship to canonical Identity, including whether one Identity may control one or multiple affiliate identities and what platform/destination scope applies.

## 2. eligibility

Decide the conditions that make an affiliate eligible to receive attribution and commission entitlement, including when eligibility is evaluated.

## 3. suspension

Decide what suspension means, who/what can suspend an affiliate, and the effect on new evidence, existing attribution, conversions and existing entitlements.

## 4. referral evidence

Decide which referral evidence sources are accepted, how each source is authenticated/validated, which data is authoritative versus merely untrusted input, and the replay identity for each source.

## 5. attribution subject

Decide what entity receives attribution, such as the approved canonical customer/acquisition subject type, and how that subject is identified server-side.

## 6. attribution precedence

Decide how competing valid attribution evidence is resolved, including replacement/coexistence rules and precedence between sources.

## 7. attribution window

Decide the duration, start clock, expiry behavior and any renewal/reset semantics for attribution.

## 8. qualifying conversion

Decide the exact canonical event/state that qualifies as a conversion and whether Financial proof is required in addition to Ordering evidence.

## 9. commission base

Decide the authoritative monetary or commercial base from which commission is calculated and which amounts are excluded or included.

## 10. fixed vs percentage

Decide whether the policy is fixed amount, percentage, another explicitly defined model, or a versioned combination of approved models.

## 11. rate

Decide the actual rate/value for each approved commission model and whether any scoped variations exist.

## 12. rounding

Decide the rounding rule, precision boundary and where rounding is applied in the calculation sequence.

## 13. caps

Decide whether minimums, maximums, per-conversion caps, period caps or no caps apply, and at what scope.

## 14. currency

Decide the currency rule for entitlement calculation and how differing order/payment/destination currencies are handled, if differing currencies are allowed.

## 15. effective dates/versioning

Decide how commission policies are versioned, when a version becomes effective, which timestamp selects the applicable version and how historical entitlements retain their original policy snapshot.

## 16. pending/earned/reversed/cancelled/disputed lifecycle

Decide the allowed lifecycle states, transition graph, transition triggers and terminal/recoverable semantics for pending, earned, reversed, cancelled and disputed entitlements.

## 17. refund/cancellation consequences

Decide how full/partial refunds, order cancellation and other canonical reversal evidence affect attribution and commission entitlement, including already-materialized cases.

## 18. Financial materialization timing

Decide at which approved entitlement/conversion state Affiliate may request Financial materialization and what must happen when Financial rejects, delays or later reverses the monetary consequence.

## 19. retention/LGPD

Decide the retention duration and deletion/anonymization requirements for referral evidence, attribution records and Affiliate-specific personal data, including any justified legal/compliance hold.

## Approval gate

Implementation remains blocked until every section above has an explicit approved value, owner and policy version. Missing decisions fail closed; no default is inferred from roadmap text, UI, browser behavior or existing Financial primitives.