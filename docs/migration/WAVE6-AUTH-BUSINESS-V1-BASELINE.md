# Wave 6 — Auth & Business V1 Baseline (M46)

## Scope

M46 freezes the V1 contracts and dependency order for Wave 6 before any implementation of `FEATURE-0008 — Autenticação e Sessão` or `FEATURE-0005 — Business Portal`.

This milestone is documentation/evidence only. It must not promote either feature from `baseline-pending`.

Frozen sources:

- V2 base: `luizidebook/touristic-digital-platform@1dc0eef83b4e6f9b0c968ee3f31ef736171aa43c`;
- V1: `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`.

## Dependency decision

Wave 6 implementation order is:

1. Auth/session security boundary;
2. authenticated Business API/client port;
3. Business dashboard surface;
4. Business onboarding flow;
5. commercial/payment integrations only after their owning feature boundaries exist.

The reason is observable in the frozen V1 dashboard. `dashboard/auth-client.js` treats `/api/dashboard` and `/api/offers` as protected same-origin resources, loads `/api/dashboard/auth/session`, stores only the CSRF token in `sessionStorage`, injects `X-CSRF-Token` on unsafe methods, redirects on `401`, and refreshes/retries once on `INVALID_CSRF`.

The server contract in `server/dashboard-auth.js` owns the corresponding security responsibilities: authenticated session cookies, session verification/expiry, CSRF derivation and timing-safe validation, same-origin enforcement, role and tenant/business authorization, logout/revocation, safe return paths and login rate limiting.

Business therefore consumes Auth; Business must not own credentials, cookie signing, session lifecycle or CSRF generation.

## V1 Auth/session contract

### Authentication

The frozen dashboard login surface submits email/password to `/api/dashboard/auth/login` with `credentials: "same-origin"` and redirects only through a dashboard-scoped safe return path.

V1 server-side evidence includes:

- password hashing/verification using `scrypt`;
- minimum normalized password length of 10 characters for generated hashes;
- configured users with roles `owner`, `manager`, `viewer`, or `admin`;
- business IDs attached to non-admin users;
- login rate limiting;
- server-side configuration failure closed rather than open.

M46 records observable/security behavior, not an instruction to copy the V1 storage/configuration mechanism verbatim. A future V2 implementation may use a stronger identity store while preserving the external contract.

### Session

The dashboard session is represented by an HttpOnly cookie named `md_dashboard_session` in V1. The cookie is scoped to `/`, uses `SameSite=Strict`, receives `Secure` in production and has a bounded max age.

The signed session payload contains identity, role, allowed business IDs, issue/expiry timestamps and a unique session identifier. Invalid signatures, expiry, revocation or missing current user resolve to no session.

The browser never needs to persist the signed session token in local/session storage.

### CSRF and same-origin protection

Unsafe mutations require:

- a valid authenticated session;
- same-origin validation;
- a CSRF token derived from the session identifier;
- `X-CSRF-Token` supplied by the browser client;
- read-only `viewer` users rejected for mutations.

The client refreshes session/CSRF state once after `INVALID_CSRF`, while `401` returns the user to the login surface.

### Authorization and tenant isolation

Business access is a server-side authorization concern. A request is allowed only when the session is admin or the requested normalized business ID appears in the authenticated user's allowed business IDs.

Invalid IDs fail with a validation error; tenant mismatch fails with access denied. Business code must never infer authorization from UI state alone.

## V1 Business contract inventory

The frozen V1 contains multiple Business surfaces that must be separated by ownership rather than copied as one monolith:

- `js/business/*` — business-domain/browser behavior;
- `js/business/profile/*` — business profile concerns;
- `dashboard/*` — authenticated management UI and API consumers;
- `js/onboarding/business-onboarding.js` — onboarding orchestration;
- `js/onboarding/engine/*`, `conversation/*`, `session/*`, `tours/*` — onboarding workflow internals;
- `js/onboarding/runtime/*` — adapters for discovery, location, profile sandbox, recommendations, commercial conversion, checkout and partner workspace;
- `server/dashboard-auth.js` — Auth-owned security boundary, not Business ownership.

## Cross-feature ownership boundaries

### Search / discovery

`business-discovery-adapter.js` is a Business/onboarding consumer of discovery behavior. Search primitives now belong to equivalent `FEATURE-0002`; Business must consume the Search boundary rather than reproduce Assistant or catalog matching internals.

### Geospatial / location

Business onboarding may resolve or capture business locations, but canonical map/search geospatial primitives remain owned by the already-equivalent geospatial/search features.

### Assistant

Conversational onboarding can use Assistant presentation/orchestration, but Business state and persistence must not become Assistant-owned.

### Payments

`business-checkout-client.js` and commercial-conversion adapters prove a future integration seam. Payment/subscription execution belongs to `FEATURE-0009`; M46 does not pull payment ownership into Business.

## Security decisions for V2

The migration must preserve or strengthen the V1 security properties:

- no session secret or credential in browser code;
- HttpOnly server-managed session or an equivalently strong server boundary;
- production transport only over HTTPS/Secure cookies;
- same-origin/CSRF protection for cookie-authenticated mutations;
- server-side role and business/tenant authorization on every protected resource;
- no trust in client-provided business ownership;
- bounded session lifetime and revocation/logout semantics;
- login rate limiting and fail-closed configuration;
- safe redirect/return-path validation;
- audit events for authentication and authorization denials;
- no direct copy of environment-backed demo/config credentials into a production identity model.

## Implementation order after M46

### M47 — Auth core

Create the domain-neutral Auth/session package and executable contracts first. Freeze session identity, roles, business scopes, authorization decisions and CSRF/same-origin ports without coupling to Business UI.

### M48 — Auth server/browser integration

Integrate login/session/logout and browser-safe session consumption. Validate 401, expired/revoked sessions, CSRF refresh, same-origin failure and safe redirects.

### M49+ — Business core and consumers

Only after Auth is stable, create Business domain models/API ports, then dashboard and onboarding consumers. Business receives authenticated identity/scopes from Auth; it does not implement session security itself.

## Non-goals

- Do not migrate checkout/payment execution in Wave 6 baseline.
- Do not expose session secrets or signed tokens to browser storage.
- Do not copy V1 environment-backed user configuration as the final production identity database merely for parity.
- Do not merge Auth and Business into one package.
- Do not promote `FEATURE-0005` or `FEATURE-0008` from documentation alone.

## M46 exit criteria

M46 closes when:

1. Auth and Business V1 contracts are classified by ownership;
2. Auth and Business formal matrices are committed;
3. Auth-before-Business implementation order is explicit;
4. security invariants and cross-feature boundaries are explicit;
5. the PR diff contains documentation/evidence only;
6. the official Quality Gate is green on the final head.
