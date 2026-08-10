# Wave 6 M46 — Baseline Evidence

## Audited sources

V2 base:

- `luizidebook/touristic-digital-platform@1dc0eef83b4e6f9b0c968ee3f31ef736171aa43c`

Frozen V1:

- `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`

Primary V1 evidence inspected for M46:

- `server/dashboard-auth.js`;
- `dashboard/auth-client.js`;
- `dashboard/login.html`;
- `js/business/*` and `js/business/profile/*` inventory;
- `js/onboarding/business-onboarding.js`;
- `js/onboarding/{engine,conversation,session,tours}/*` inventory;
- `js/onboarding/runtime/*` inventory, including discovery, location, profile, recommendation, partner-workspace, commercial-conversion, checkout and live-runtime adapters.

## Proven dependency

The Business dashboard is not an authentication authority. Its browser client delegates session and mutation protection to a security contract:

- session is loaded from `/api/dashboard/auth/session`;
- protected requests are same-origin credentialed requests;
- unsafe methods receive `X-CSRF-Token`;
- `401` redirects to login;
- `INVALID_CSRF` reloads session state and retries once;
- logout is an authenticated unsafe mutation.

The matching server implementation owns session verification, CSRF, same-origin enforcement, role restrictions and business/tenant authorization.

Therefore the safe migration dependency is `FEATURE-0008 → FEATURE-0005`, not the reverse.

## Security evidence frozen

The V1 server demonstrates the following security invariants that V2 must preserve or strengthen:

- server-held secret requirement;
- password verification using a memory-hard primitive (`scrypt` in V1);
- signed sessions with expiry and unique session identifiers;
- HttpOnly / SameSite=Strict session cookie, Secure in production;
- session revocation;
- browser-safe CSRF projection rather than browser-readable session material;
- Origin/Referer same-origin checks;
- timing-safe comparisons for signatures/CSRF;
- read-only viewer mutation denial;
- admin or explicit business-ID authorization;
- safe dashboard return paths;
- login rate limiting;
- fail-closed unavailable-auth behavior;
- structured audit calls on denied security decisions.

M46 intentionally does not freeze `DASHBOARD_USERS_JSON` as the target production identity store. It is a V1 implementation detail; the target must preserve the observable contract and security invariants without transporting secrets into browser code.

## Matrix result

Auth matrix:

- PASS: 0
- PARTIAL: 0
- GAP: 20
- N/A: 0

Business matrix:

- PASS: 0
- PARTIAL: 3
- GAP: 16
- N/A: 1

The Business partial rows are only dependency reuse: equivalent Search, Assistant and geospatial capabilities exist, but Business-owned adapters do not.

## Promotion decision

No Registry promotion occurs in M46:

- `FEATURE-0008` remains `baseline-pending`;
- `FEATURE-0005` remains `baseline-pending`.

## Next milestone

M47 should create the Auth-owned core first, with executable unit contracts for identity/session projections, roles, business scopes and authorization decisions. Cookie transport, login endpoints and CSRF browser integration should remain a subsequent integration milestone so core policy is framework-independent and testable.

## Exit gate

M46 may merge only when:

1. the four permanent documentation files are the only intended diff;
2. no implementation/runtime code changes are present;
3. the official Quality Gate is green on the final head;
4. no temporary helper workflow remains;
5. no unresolved review thread remains.
