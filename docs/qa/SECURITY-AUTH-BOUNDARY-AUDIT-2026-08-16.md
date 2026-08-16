# Security / Auth / RBAC / Tenant Isolation — Boundary Audit

Date: 2026-08-16

Initial audited baseline: `main@17479a909b942c3eb211c110ca78e0986864bea4`
Reconciled baseline before CI: `main@790398a2c66ac97969bfd86d2efe84887827e548`

## Scope

This review is limited to authentication, sessions, authorization, RBAC, ownership/tenant isolation, server/browser trust boundaries, secret exposure, input boundaries, CSRF/XSS/SSRF-relevant runtime surfaces, security headers, endpoint protection, rate limiting and auditability.

It does not redesign Business, CRM, Ordering, Payments, Financial or Assistant product behavior.

## Trust boundaries

### Browser → HTTP API

The browser is untrusted. Authentication authority remains server-side:

- the session is HMAC-signed and stored in an `HttpOnly`, `SameSite=Strict` cookie;
- production cookies are `Secure`;
- unsafe authenticated requests require same-origin validation plus a session-bound CSRF token;
- browser-provided business IDs are selectors only: server-side authorization decides whether the authenticated principal may access the selected tenant;
- `viewer` is read-only and must not mutate a protected Business resource;
- invalid, expired or revoked sessions fail closed;
- authentication failures and authorization denials are emitted through the security audit boundary.

### HTTP runtime → repository files

The HTTP process must not treat the repository checkout as a public document root. Public static access is now allowlisted to the browser/runtime artifacts that have real consumers:

- `apps/morro-digital-platform/public/**`;
- `apps/morro-digital-platform/dist/**`;
- `apps/admin-crm/public/**`;
- `dashboard/**`;
- `images/**`;
- `packages/<package>/dist/**` only.

Files such as `.env`, `.env.example`, repository manifests, server source, docs and service source are outside the public trust boundary and return 404.

### HTTP runtime → providers

Provider credentials remain server-only. Browser runtime configuration exposes only the explicit `VITE_*` allowlist. Weather providers use code-owned fixed endpoints rather than a caller-supplied URL. Payments and Assistant retain their own existing fail-closed provider/security contracts; this audit does not change their business behavior.

## Findings closed in this branch

### HIGH — repository-wide static file disclosure

Previous behavior resolved any requested path against the repository root and served it whenever it was a file. A deployed checkout containing `.env` or other server-only material could therefore expose it over HTTP.

Resolution: static serving is allowlist-based. Encoded traversal that resolves back to a non-public repository path is also denied.

### HIGH — invalid configured role silently became `owner`

`DASHBOARD_USERS_JSON` previously defaulted an unknown or missing role to `owner`. A malformed operator configuration could therefore create privilege rather than fail closed.

Resolution: every configured user must now provide an explicit role from the canonical role vocabulary. Missing or unknown roles make Auth configuration invalid.

### MEDIUM — unknown API path surfaced as internal server error

An unmatched `/api/*` route previously fell through static file resolution and then became HTTP 500 in the generic catch path.

Resolution: unmatched API paths now return an explicit cache-disabled JSON 404.

### DEFENSE IN DEPTH — response headers

The central runtime already emitted CSP, `X-Content-Type-Options`, `Referrer-Policy` and `Cross-Origin-Opener-Policy`. This branch also emits:

- `X-Frame-Options: DENY`;
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`.

The existing CSP `frame-ancestors 'none'` remains authoritative for modern browsers.

## Mandatory negative executable coverage

The permanent Auth Integration Contract now proves these cases against the real Node HTTP runtime:

| Negative case | Expected result |
| --- | --- |
| access without authentication | `401 AUTH_REQUIRED` |
| cross-tenant Business access | `403 BUSINESS_ACCESS_DENIED` |
| viewer privilege escalation via mutation | `403 READ_ONLY_ROLE` |
| authorized tenant, missing resource | `404 BUSINESS_PROFILE_NOT_FOUND` |
| malformed login JSON | `400 INVALID_REQUEST` |
| replay of pre-logout session cookie | `401 AUTH_REQUIRED` after revocation |
| cross-origin login attempt | `403 ORIGIN_DENIED` |
| invalid CSRF on unsafe request | `403 INVALID_CSRF` |
| private repository path over HTTP | `404` |
| encoded traversal to private repository path | `404` |
| unknown `/api/*` route | `404 NOT_FOUND` |

The contract also retains successful login/session/logout, cookie flags, public static assets and package `dist` loading.

## Residual risks / coordinator actions

1. **`main` branch protection is currently disabled.** This is a repository-governance control, not an application-code change. The coordinator should enable protection/rulesets with the canonical promotion checks after CI check names are finalized.
2. **CSP still permits `'unsafe-inline'` for scripts/styles** because of current legacy browser surfaces. Removing it safely requires migrating inline consumers to external assets/nonces/hashes and proving browser contracts; it is intentionally not hidden by this PR.
3. **Login rate limiting and explicit logout revocations are process-local.** The current Auth migration matrix already treats distributed rate limiting as deployment-scale hardening. Multi-replica production must use a shared durable limiter/revocation authority before claiming equivalent cross-replica behavior.
4. **`admin` has global tenant bypass by canonical contract.** Keep this role rare, operator-controlled and audited. Do not infer admin from malformed configuration; this branch enforces that rule.
5. **Viewer logout is currently treated as a mutation and rejected by the existing V1-compatible read-only rule.** This audit does not change the observable parity contract; security/product owners should decide separately whether self-logout must be exempted from read-only authorization.
6. The static allowlist assumes repository-controlled directories do not contain hostile symlinks. Deployment packaging and code review remain part of that trust boundary.

## Promotion requirements

Promotion requires evidence on one immutable PR head:

- formatting;
- architecture/contracts;
- Feature Registry;
- lint;
- typecheck;
- full unit/integration tests;
- full build;
- Auth Integration Contract with the negative cases above.

No merge should occur from this security workstream. The coordinator owns fixed-head promotion and post-merge validation of `main`.
