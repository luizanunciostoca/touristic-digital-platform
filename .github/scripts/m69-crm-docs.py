from pathlib import Path

matrix_path = Path('docs/migration/CRM-MIGRATION-MATRIX.md')
matrix = matrix_path.read_text()
matrix = matrix.replace('# CRM Administrativo — Migration Matrix (M68 domain model)', '# CRM Administrativo — Migration Matrix (M69 authorization policy)', 1)
lines = matrix.splitlines()
found_auth = False
found_policy = False
for index, line in enumerate(lines):
    if line.startswith('| Platform authentication/session integration'):
        lines[index] = '| Platform authentication/session integration    | V1 host auth infrastructure + client auth hook       | `@touristic/crm/authorization` consumes equivalent platform Auth; no CRM server/browser consumer yet | PARTIAL | Auth dependency and CRM policy are executable; integration remains incomplete until a real CRM boundary consumes them. |'
        found_auth = True
    elif line.startswith('| Server-side audit/authorization'):
        lines[index] = '| Server-side audit/authorization                | protected tRPC procedures + host auth                | CRM policy now requires active session and denies viewer mutations; server boundary/audit absent | PARTIAL | Reuse the CRM policy in mutable/read APIs and add structured denial audit before PASS. |'
        found_policy = True
if not found_auth:
    raise SystemExit('auth row anchor missing')
if not found_policy:
    raise SystemExit('policy row anchor missing')
matrix = '\n'.join(lines) + '\n'
score_anchor = 'M68 adds the first CRM-owned executable core without claiming end-to-end parity. Pipeline vocabulary/order and persistence modeling advance from GAP to PARTIAL; browser, API, authorization and concrete persistence remain open.'
replacement = 'M69 adds a CRM-owned authorization policy over equivalent platform Auth. The score remains unchanged because no real CRM server/browser boundary consumes the policy yet: `0 PASS / 5 PARTIAL / 20 GAP / 0 N/A`.'
if score_anchor not in matrix:
    raise SystemExit('score note anchor missing')
matrix = matrix.replace(score_anchor, replacement, 1)
matrix = matrix.replace('## M68 score', '## M69 score', 1)
matrix_path.write_text(matrix)

tracker_path = Path('docs/migration/MASTER-MIGRATION-TRACKER.md')
tracker = tracker_path.read_text()
old = 'M67 froze the standalone CRM V1 at `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`. M68 starts executable migration with framework-independent domain vocabulary, record models and repository ports in `@touristic/crm`. The matrix is `0 PASS / 5 PARTIAL / 20 GAP`; `MIG-0008` is `migrating` while `FEATURE-0006` remains `baseline-pending`, not `equivalent`.'
new = 'M67 froze the standalone CRM V1 at `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`. M68 started the framework-independent domain core. M69 adds CRM-owned authorization over equivalent platform Auth: active-session reads, viewer mutation denial, owner/manager/admin mutations. The matrix remains `0 PASS / 5 PARTIAL / 20 GAP`; `MIG-0008` stays `migrating` and `FEATURE-0006` stays `baseline-pending`.'
if old not in tracker:
    raise SystemExit('tracker CRM section anchor missing')
tracker = tracker.replace(old, new, 1)
tracker_path.write_text(tracker)

Path('docs/qa/CRM-M69-EVIDENCE.md').write_text('''# CRM M69 — Authorization Policy Evidence\n\n## Scope\n\nM69 creates the CRM-owned authorization decision layer by consuming the already-equivalent platform Auth package. It does not create credentials, sessions, cookies, Business scopes or a CRM HTTP API.\n\n## Frozen V1 behavior\n\nThe frozen CRM uses `protectedProcedure` for internal CRM reads and mutations. That middleware requires an authenticated user. An `adminProcedure` exists in the host framework, but the audited CRM routers primarily use `protectedProcedure`, so M69 does not invent an admin-only rule for the whole CRM.\n\n## V2 policy\n\n`@touristic/crm/authorization` delegates identity/session semantics to `@touristic/auth` and applies CRM-specific access decisions:\n\n- missing session → `authentication_required`;\n- expired session → `session_expired`;\n- active `owner`, `manager`, `viewer`, or `admin` → CRM reads allowed;\n- active `viewer` → CRM mutation denied as `read_only_role`;\n- active `owner`, `manager`, or `admin` → CRM mutation allowed.\n\nThe CRM is an administrative/global domain, so M69 deliberately does not invent a Business tenant scope requirement.\n\n## Executable evidence\n\nTemporary integration run `31547640424` passed before documentation reconciliation:\n\n- workspace lockfile generation and frozen reinstall;\n- CRM lint;\n- CRM typecheck;\n- CRM unit tests, including M69 authorization cases;\n- CRM build;\n- repository `format:check`;\n- `architecture:check`;\n- `features:check`;\n- repository lint;\n- repository typecheck;\n- repository tests;\n- repository build.\n\n## Matrix decision\n\nThe matrix score remains `0 PASS / 5 PARTIAL / 20 GAP / 0 N/A`. Platform Auth integration and server authorization remain PARTIAL because the policy is not yet consumed by a real CRM server boundary and structured denial audit does not yet exist.\n\n## State decision\n\n`MIG-0008` remains `migrating`. `FEATURE-0006` remains `baseline-pending`, not `equivalent`.\n\n## Next milestone\n\nM70 should introduce the first server-authoritative CRM leads/pipeline boundary consuming this authorization policy, with explicit input validation and denial audit.\n''')
