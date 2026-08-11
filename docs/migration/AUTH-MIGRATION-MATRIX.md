# Auth & Session — Migration Matrix (M66 reconciliation)

## Status semantics

- `PASS` — V2 exposes the audited contract with executable evidence.
- `PARTIAL` — the Auth-owned primitive exists, but the final consuming surface/resource enforcement is not yet integrated.
- `GAP` — no V2 Auth-owned equivalent exists yet.
- `N/A` — contract belongs to another feature.

`FEATURE-0008` is `equivalent` after M66. The Auth server/browser boundary, canonical login surface and Business-owned protected-resource enforcement are all covered by permanent executable evidence.

| Contract                                  | Frozen V1 evidence                                                      | V2 evidence at M48                                                                                   | Status | Migration decision                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| Login with email/password                 | `dashboard/login.html`; `/api/dashboard/auth/login`                     | canonical `/dashboard/login.html` + `DashboardAuthClient.login()` + real Chromium login lifecycle    | PASS   | V1 login behavior is preserved on the Auth-owned browser/server boundary.                         |
| Same-origin credentialed browser requests | `credentials: "same-origin"` in login/auth client                       | `@touristic/auth-browser` session + protected request client                                         | PASS   | Browser consumer preserves same-origin credentials.                                               |
| HttpOnly session cookie                   | `md_dashboard_session`; HttpOnly; SameSite=Strict; Secure in production | `serializeSessionCookie()` + HTTP contract                                                           | PASS   | Session material remains inaccessible to browser JS.                                              |
| Signed bounded session                    | HMAC-signed payload with `iat`, `exp`, `jti`                            | HMAC session token with normalized identity, `iat`, `exp`, `jti`                                     | PASS   | Server owns signing; browser receives only safe projection.                                       |
| Session verification and expiry           | `verifySessionToken()`; invalid/expired → null                          | signature verification + normalized expiry + revocation check                                        | PASS   | Fail closed for malformed, invalid, expired or revoked sessions.                                  |
| Logout/revocation                         | revoked-session tracking + logout route/client                          | revocation store + logout API + cleared cookie + browser client                                      | PASS   | Explicit revocation/logout semantics preserved.                                                   |
| Session endpoint                          | `/api/dashboard/auth/session`                                           | real GET `/api/dashboard/auth/session`                                                               | PASS   | Endpoint exposes only browser-safe session projection + CSRF.                                     |
| CSRF token per session                    | HMAC over session `jti`                                                 | `csrfTokenForSession()` keyed by session ID                                                          | PASS   | Token remains separate from signed session material.                                              |
| CSRF on unsafe methods                    | `X-CSRF-Token`; `INVALID_CSRF`                                          | Auth logout and real Business protected mutations enforce CSRF through `authorizeBusinessRequest()`  | PASS   | Unsafe Business mutations reuse the Auth-owned CSRF boundary.                                     |
| CSRF refresh/retry                        | dashboard client reloads session and retries once                       | bounded single retry after `INVALID_CSRF` in `@touristic/auth-browser`                               | PASS   | Retry remains exactly once and refreshes browser-safe session state.                              |
| Same-origin enforcement                   | Origin/Referer verification server-side                                 | login/logout plus real Business mutations delegate to `isSameOriginAllowed()` through Auth           | PASS   | Same-origin policy is enforced on Auth and Business mutation boundaries.                          |
| Role model                                | owner/manager/viewer/admin                                              | `authRoles` + `AuthRole` + executable tests                                                          | PASS   | Core role vocabulary frozen.                                                                      |
| Viewer read-only restriction              | unsafe mutation rejected for viewer                                     | pure mutation policy + server logout mutation enforcement                                            | PASS   | Business mutations must delegate to the same Auth policy.                                         |
| Business/tenant scopes                    | session `businessIds`; admin bypass                                     | normalized immutable scopes + admin bypass                                                           | PASS   | Business receives scopes from Auth rather than client-selected ownership.                         |
| Tenant authorization                      | `hasBusinessAccess` / `enforceBusiness`                                 | `authorizeBusinessAccess()` + `hasBusinessScope()`                                                   | PASS   | Final Business resources must call this server-side policy.                                       |
| Safe return path                          | dashboard-only return target validation                                 | `safeDashboardReturnPath()`                                                                          | PASS   | Open redirects outside `/dashboard/` are rejected.                                                |
| Login rate limiting                       | server login limiter                                                    | bounded in-memory login limiter on Auth API                                                          | PASS   | Preserve or replace with stronger distributed limiter at deployment scale.                        |
| Fail-closed configuration                 | 503 when auth unavailable                                               | missing/invalid secret/users/origin returns `DASHBOARD_AUTH_NOT_CONFIGURED`                          | PASS   | Protection is never silently disabled.                                                            |
| Password hashing                          | V1 `scrypt` verification/hash helper                                    | server-only scrypt hash/verify with timing-safe comparison                                           | PASS   | Identity storage remains server-side; production store may evolve without changing this contract. |
| Security audit denials                    | V1 `audit(...)` calls on auth/origin/mutation/tenant denial             | Auth emits structured denials for session, origin, CSRF, role, invalid business ID and tenant access | PASS   | Business resource denials are audited by the shared Auth authorization boundary.                  |

## M66 score

- `PASS`: 20
- `PARTIAL`: 0
- `GAP`: 0
- `N/A`: 0
- total: 20

M66 closes the four consumer-dependent rows left intentionally partial by M48. The canonical login surface is now executable, and M50/M51 plus the current Auth runtime prove CSRF, same-origin and structured security-audit enforcement on real Business resources.

## Executable evidence

The permanent `Auth Integration Contract` validates the real server/browser boundary, including package tests/build plus real HTTP login, session and logout behavior. The official Quality Gate validates formatting, architecture, Feature Registry, lint, typecheck, full tests and build.

## Promotion decision

`FEATURE-0008` is promoted to `equivalent`, not `released`. Deployment identity-store hardening or distributed rate limiting may evolve operationally without reopening V1 parity unless they change the observable Auth contract.
