# CRM M69 — Authorization Policy Evidence

## Scope

M69 creates the CRM-owned authorization decision layer by consuming the already-equivalent platform Auth package. It does not create credentials, sessions, cookies, Business scopes or a CRM HTTP API.

## Frozen V1 behavior

The frozen CRM uses `protectedProcedure` for internal CRM reads and mutations. That middleware requires an authenticated user. An `adminProcedure` exists in the host framework, but the audited CRM routers primarily use `protectedProcedure`, so M69 does not invent an admin-only rule for the whole CRM.

## V2 policy

`@touristic/crm/authorization` delegates identity/session semantics to `@touristic/auth` and applies CRM-specific access decisions:

- missing session → `authentication_required`;
- expired session → `session_expired`;
- active `owner`, `manager`, `viewer`, or `admin` → CRM reads allowed;
- active `viewer` → CRM mutation denied as `read_only_role`;
- active `owner`, `manager`, or `admin` → CRM mutation allowed.

The CRM is an administrative/global domain, so M69 deliberately does not invent a Business tenant scope requirement.

## Executable evidence

Temporary integration run `31547640424` passed before documentation reconciliation:

- workspace lockfile generation and frozen reinstall;
- CRM lint;
- CRM typecheck;
- CRM unit tests, including M69 authorization cases;
- CRM build;
- repository `format:check`;
- `architecture:check`;
- `features:check`;
- repository lint;
- repository typecheck;
- repository tests;
- repository build.

## Matrix decision

The matrix score remains `0 PASS / 5 PARTIAL / 20 GAP / 0 N/A`. Platform Auth integration and server authorization remain PARTIAL because the policy is not yet consumed by a real CRM server boundary and structured denial audit does not yet exist.

## State decision

`MIG-0008` remains `migrating`. `FEATURE-0006` remains `baseline-pending`, not `equivalent`.

## Next milestone

M70 should introduce the first server-authoritative CRM leads/pipeline boundary consuming this authorization policy, with explicit input validation and denial audit.
