# Auth & Session — Migration Matrix (M47 core)

## Status semantics

- `PASS` — V2 exposes the audited contract with executable evidence.
- `PARTIAL` — part of the contract exists, but the Auth-owned boundary is incomplete.
- `GAP` — no V2 Auth-owned equivalent exists yet.
- `N/A` — contract belongs to another feature.

`FEATURE-0008` remains `baseline-pending` after M47. The domain core is executable, but browser/server session transport, login, CSRF, revocation and other security integrations are still incomplete.

| Contract                                  | Frozen V1 evidence                                                      | V2 evidence at M47                                               | Status  | Migration decision                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| Login with email/password                 | `dashboard/login.html`; `/api/dashboard/auth/login`                     | no login/server implementation                                   | GAP     | Implement behind Auth-owned server boundary.                                                |
| Same-origin credentialed browser requests | `credentials: "same-origin"` in login/auth client                       | no Auth browser port                                             | GAP     | Preserve browser-safe same-origin session consumption.                                      |
| HttpOnly session cookie                   | `md_dashboard_session`; HttpOnly; SameSite=Strict; Secure in production | no cookie transport                                              | GAP     | Keep session material inaccessible to JS.                                                   |
| Signed bounded session                    | HMAC-signed payload with `iat`, `exp`, `jti`                            | immutable identity projection includes issued/expires/session ID | PARTIAL | M47 freezes payload semantics; signing/verification remains server integration.             |
| Session verification and expiry           | `verifySessionToken()`; invalid/expired → null                          | `isAuthSessionActive()` + normalized bounded session window      | PARTIAL | Expiry semantics exist; signature/revocation verification remains.                          |
| Logout/revocation                         | revoked-session tracking + logout route/client                          | no revocation integration                                        | GAP     | Preserve explicit revocation/logout semantics.                                              |
| Session endpoint                          | `/api/dashboard/auth/session`                                           | no Auth API                                                      | GAP     | Expose browser-safe session projection only.                                                |
| CSRF token per session                    | HMAC over session `jti`                                                 | no CSRF implementation                                           | GAP     | Own in Auth/security boundary.                                                              |
| CSRF on unsafe methods                    | `X-CSRF-Token`; `INVALID_CSRF`                                          | no Auth browser/server integration                               | GAP     | Protect cookie-authenticated mutations.                                                     |
| CSRF refresh/retry                        | dashboard client reloads session and retries once                       | no Auth browser integration                                      | GAP     | Preserve bounded single retry.                                                              |
| Same-origin enforcement                   | Origin/Referer verification server-side                                 | no Auth middleware                                               | GAP     | Reject cross-origin protected mutations.                                                    |
| Role model                                | owner/manager/viewer/admin                                              | `authRoles` + `AuthRole` + executable tests                      | PASS    | Core role vocabulary frozen.                                                               |
| Viewer read-only restriction              | unsafe mutation rejected for viewer                                     | `isReadOnlyAuthRole()` + mutation authorization tests            | PASS    | Keep the same policy at server integration boundary.                                        |
| Business/tenant scopes                    | session `businessIds`; admin bypass                                     | normalized immutable scopes + admin bypass tests                 | PASS    | Business consumers must receive scopes from Auth.                                           |
| Tenant authorization                      | `hasBusinessAccess` / `enforceBusiness`                                 | `hasBusinessScope()` + `authorizeBusinessAccess()`               | PASS    | Server adapters must delegate protected tenant decisions to this policy.                    |
| Safe return path                          | dashboard-only return target validation                                 | no Auth bootstrap                                                | GAP     | Prevent open redirects.                                                                     |
| Login rate limiting                       | server login limiter                                                    | no Auth server integration                                       | GAP     | Preserve or strengthen.                                                                     |
| Fail-closed configuration                 | 503 when auth unavailable                                               | pure policy fails closed for absent/expired/invalid scope        | GAP     | Runtime configuration failure still needs explicit server evidence.                         |
| Password hashing                          | V1 `scrypt` verification/hash helper                                    | no V2 identity store                                             | GAP     | Preserve strong password handling; do not require copying V1 user storage.                  |
| Security audit denials                    | V1 `audit(...)` calls on auth/origin/mutation/tenant denial             | no Auth observability port yet                                   | GAP     | Add structured audit boundary without secrets in integration milestone.                     |

## M47 score

- `PASS`: 4
- `PARTIAL`: 2
- `GAP`: 14
- `N/A`: 0
- total: 20

M47 deliberately promotes only domain-core contracts. It does not treat a normalized session projection as proof of signed-cookie transport, authentication, CSRF, revocation or server configuration.

## Next implementation milestone

M48 should implement Auth server/browser integration around this core: login/session/logout, signed bounded session transport, HttpOnly cookie semantics, revocation, same-origin enforcement, CSRF projection/validation and browser-safe session consumption. Password storage and rate limiting must stay server-side and fail closed.
