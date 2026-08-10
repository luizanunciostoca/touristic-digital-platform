# Auth & Session — Migration Matrix (M46 baseline)

## Status semantics

- `PASS` — V2 already exposes the audited contract with executable evidence.
- `PARTIAL` — part of the contract exists, but the Auth-owned boundary is incomplete.
- `GAP` — no V2 Auth-owned equivalent exists yet.
- `N/A` — contract belongs to another feature.

At M46, `FEATURE-0008` remains `baseline-pending`; documentation is not implementation evidence.

| Contract | Frozen V1 evidence | V2 evidence at M46 | Status | Migration decision |
| --- | --- | --- | --- | --- |
| Login with email/password | `dashboard/login.html`; `/api/dashboard/auth/login` | no `@touristic/auth` package | GAP | Implement behind Auth-owned port/server boundary. |
| Same-origin credentialed browser requests | `credentials: "same-origin"` in login/auth client | no Auth browser port | GAP | Preserve browser-safe same-origin session consumption. |
| HttpOnly session cookie | `md_dashboard_session`; HttpOnly; SameSite=Strict; Secure in production | no Auth session implementation | GAP | Keep session material inaccessible to JS. |
| Signed bounded session | HMAC-signed payload with `iat`, `exp`, `jti` | no Auth session implementation | GAP | Freeze identity/role/business-scope session contract; implementation may improve internals. |
| Session verification and expiry | `verifySessionToken()`; invalid/expired → null | no Auth implementation | GAP | Fail closed. |
| Logout/revocation | revoked-session tracking + logout route/client | no Auth implementation | GAP | Preserve explicit revocation/logout semantics. |
| Session endpoint | `/api/dashboard/auth/session` | no Auth API | GAP | Expose browser-safe session projection only. |
| CSRF token per session | HMAC over session `jti` | no Auth implementation | GAP | Own in Auth/security boundary. |
| CSRF on unsafe methods | `X-CSRF-Token`; `INVALID_CSRF` | no Auth browser/server integration | GAP | Protect cookie-authenticated mutations. |
| CSRF refresh/retry | dashboard client reloads session and retries once | no Auth browser integration | GAP | Preserve bounded single retry. |
| Same-origin enforcement | Origin/Referer verification server-side | no Auth middleware | GAP | Reject cross-origin protected mutations. |
| Role model | owner/manager/viewer/admin | no Auth model | GAP | Freeze roles before Business consumers. |
| Viewer read-only restriction | unsafe mutation rejected for viewer | no Auth authorization policy | GAP | Keep server-side policy. |
| Business/tenant scopes | session `businessIds`; admin bypass | no Auth identity scope model | GAP | Auth exposes scopes; Business consumes them. |
| Tenant authorization | `hasBusinessAccess` / `enforceBusiness` | no V2 equivalent | GAP | Never trust client-selected tenant. |
| Safe return path | dashboard-only return target validation | no Auth bootstrap | GAP | Prevent open redirects. |
| Login rate limiting | server login limiter | no Auth server integration | GAP | Preserve or strengthen. |
| Fail-closed configuration | 503 when auth unavailable | no Auth integration | GAP | Do not silently disable protection. |
| Password hashing | V1 `scrypt` verification/hash helper | no V2 identity store | GAP | Preserve strong password handling; do not require copying V1 user storage. |
| Security audit denials | V1 `audit(...)` calls on auth/origin/mutation/tenant denial | no Auth observability contract | GAP | Provide structured audit boundary without secrets. |

## M46 score

- `PASS`: 0
- `PARTIAL`: 0
- `GAP`: 20
- `N/A`: 0
- total: 20

The zero-PASS baseline is intentional: V2 currently has no Auth-owned package/runtime. Existing equivalent features must not be misclassified as Auth evidence.

## Next implementation milestone

M47 should implement the smallest domain-neutral Auth core first: normalized identity/session projection, roles, business scopes, authorization policy and security-facing ports. Browser/server cookie mechanics belong in the following integration milestone so core policy remains testable without a framework.
