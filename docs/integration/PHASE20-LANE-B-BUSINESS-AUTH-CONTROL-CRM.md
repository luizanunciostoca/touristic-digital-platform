# Phase 20/21 — Lane B: Business + Auth/IAM + Control Center + CRM

## Frozen inputs

- Product base branch: `integration/phase19-real-product-baseline-20261001`
- Product base SHA: `37eb641eefa91f57d8d74c1dc87894c2da36f3ae`
- Lab reference only: `morro-integration-lab/main@cfefe89bf5b3d6ffbc4a83fc76842f245330a900`
- Product `main`: read-only for this lane
- Staging/production/Render: out of scope

## Integrated binding

This lane closes one technically provable security gap without inventing a new
contract: CRM now consumes the existing Auth/IAM capability vocabulary on every
owner-backed authorization decision.

- CRM read requires `crm.read`.
- CRM mutation requires `crm.manage`.
- Read-only roles continue to fail mutations as `read_only_role`.
- Authenticated identities without CRM capabilities fail as
  `capability_denied`.
- Authenticated CRM HTTP transports map that denial to
  `403 CAPABILITY_DENIED`.

Auth/IAM remains the authority for identities, sessions, revocation, roles,
capabilities and Business scopes. CRM remains owner of CRM lifecycle and data.
Control Center remains a capability-gated adapter consumer and does not become
owner of the domains it displays.

## Preserved blockers

No blocked Phase 14 contract is promoted:

| Interface | Classification | ownerApproved | versionedContractApproved |
| --- | --- | --- | --- |
| IF-BIZ-002 | CLIENT_LOCAL_NO_ENDPOINT | false | false |
| IF-BIZ-013 | BLOCKED_SEMANTIC_MISMATCH | false | false |
| IF-BIZ-015 | VERSIONED_CONTRACT_REQUIRED | false | false |
| IF-CTL-021 | NEW_CANONICAL_CAPABILITY_REQUIRED | false | false |
| IF-CTL-023 | VERSIONED_CONTRACT_REQUIRED | false | false |

Business onboarding/settings browser-local behavior is not converted into
server authority. Business team lifecycle is not aliased to platform
`users.manage`. Control Center integrations and notifications are not given
replacement APIs.

## Focused proof

The lane-specific test covers:

- anonymous, stale and cross-business Business denial;
- correct Business scope success and read-only mutation denial;
- platform-versus-Business capability separation;
- CRM read/write capability enforcement;
- server-owned revocation, origin, CSRF and Business authorization;
- Control Center adapter-only / no-direct-table boundary;
- browser code cannot create signed sessions;
- Assistant code contains no IAM authority-minting primitive.

Existing owner tests additionally cover durable Auth revocation/security state,
Business API authorization, Control Center domain-adapter delegation and CRM
boundary/transport behavior.

## Authority invariants

- Financial authority: unchanged.
- Commerce/Ticketing/Growth ownership: unchanged.
- Global proof graph: unchanged.
- Global workflows: unchanged.
- Production/staging: untouched.
- New owner approval: none.
- New versioned contract approval: none.
