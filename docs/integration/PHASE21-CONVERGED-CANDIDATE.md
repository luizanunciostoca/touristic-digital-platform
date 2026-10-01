# Phase 21 — Converged Integration Candidate

## Identity

- Control Plane base main: `544855fb9853a312902dd10149d97f5382fc769f`
- Phase 19 product baseline/provenance: `37eb641eefa91f57d8d74c1dc87894c2da36f3ae`
- Branch: `integration/phase21-converged-candidate-20261001`
- ChangeSet: `MD-PHASE21-CONVERGED`
- Risk: CRITICAL
- Production mutation: forbidden in this ChangeSet

## Lane A resolution

No independent Phase 20 Lane A PR exists in live GitHub. Lane A is resolved as the frozen Phase 19 foundation, not as missing executable work:

`LANE_A = ABSORBED_BY_PHASE19_BASELINE @ 37eb641eefa91f57d8d74c1dc87894c2da36f3ae`

No synthetic worker or fabricated PR is introduced.

## Frozen lane inputs

| Lane | PR | Exact head | Files |
| --- | ---: | --- | ---: |
| F | #578 | `1a1ef9682c0125feed2f0fe25162eedba455e1d2` | 15 |
| B | #575 | `cf8ce0bafda8881b7e262e2b185d9f68c4cc533f` | 14 |
| C | #577 | `d177585087e1fb0d98097cf0e2e7be01909a6bd6` | 7 |
| D | #576 | `063ec8c0f8d5cbdbe5a8ec0cf1ae9bedd9d2661f` | 4 |
| E | #574 | `7522f050d58fdeee84c344052b68d3c0c82b1b70` | 3 |

Direct path overlap across B–F: **0**.

Composition order is **F → B → C → D → E**. The order records semantic adoption; blob content remains exactly the certified lane content.

## Shared integration adoption

`apps/morro-digital-platform/src/browser-entry.ts` from Lane F is explicitly adopted by the Control Tower. It prevents Morro legacy markers outside the Morro destination and injects destination-scoped canonical Place reads into Assistant and Explore. It creates no Financial, Commerce, Ticketing or browser authority.

## Authority invariants

- Auth owns identity/session/capability truth.
- Business owns Business state; CRM owns CRM lifecycle.
- Financial remains the only money truth.
- Commerce/Ticketing do not mint monetary outcome.
- Affiliates do not mint payment truth.
- Growth remains advisory/non-monetary.
- Assistant/browser cannot mint server, financial or referral authority.
- destination and tenant isolation fail closed.
- client-local IF-PUB-011/012 remain endpoint-free.
- runtime provider reads remain same-origin where specified.

## Shared security patch

The Trivy remediation is inherited from Control Plane main `544855fb9853a312902dd10149d97f5382fc769f`. Lane C/D do not own or duplicate that global patch.

## Acceptance target

The candidate may advance only after exact-head Quality, Security, trusted proof, Fabric, integrated domain tests, cross-domain authority negatives and explicit browser-critical evidence pass on the same candidate identity.
