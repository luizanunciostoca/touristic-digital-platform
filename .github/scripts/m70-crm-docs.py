from pathlib import Path

matrix_path = Path('docs/migration/CRM-MIGRATION-MATRIX.md')
matrix = matrix_path.read_text()
matrix = matrix.replace('# CRM Administrativo — Migration Matrix (M69 authorization policy)', '# CRM Administrativo — Migration Matrix (M70 leads boundary)', 1)

lines = matrix.splitlines()
found_list = found_crud = found_audit = found_tests = found_pipeline = False
for index, line in enumerate(lines):
    if line.startswith('| Lead list and search/filter lifecycle'):
        lines[index] = '| Lead list and search/filter lifecycle          | `Leads.tsx`                                          | `CrmLeadServerBoundary.list()` validates bounded stage/status/search/limit/offset queries | PARTIAL | Server query contract is executable; persistence adapter and browser consumer remain pending. |'
        found_list = True
    elif line.startswith('| Lead CRUD and server validation'):
        lines[index] = '| Lead CRUD and server validation                | tRPC routes + DB functions                           | `CrmLeadServerBoundary` provides get/create/update/updateStage/delete with explicit validation and auth | PARTIAL | Server-authoritative command boundary exists; transport and concrete persistence remain pending. |'
        found_crud = True
    elif line.startswith('| 16-stage sales pipeline'):
        lines[index] = '| 16-stage sales pipeline                        | full stage selector in frozen LeadDetail             | vocabulary plus validated `updateStage` command and stage-change interaction trail are executable | PARTIAL | Pipeline command semantics advanced; persistent adapter/browser lifecycle remain pending. |'
        found_pipeline = True
    elif line.startswith('| Server-side audit/authorization'):
        lines[index] = '| Server-side audit/authorization                | protected tRPC procedures + host auth                | leads boundary consumes CRM policy and emits structured denial/not-found/invalid-input audit events through a port | PARTIAL | Authorization/audit decisions are executable; concrete server transport and durable audit sink remain pending. |'
        found_audit = True
    elif line.startswith('| Automated regression coverage'):
        lines[index] = '| Automated regression coverage                  | `server/crm.test.ts`, auth tests                     | permanent CRM domain/auth/leads-boundary unit suites now run in package and repository Quality | PARTIAL | Core/server contracts are covered; persistence, transport and browser regression suites remain pending. |'
        found_tests = True

if not all((found_list, found_crud, found_pipeline, found_audit, found_tests)):
    raise SystemExit('one or more M70 matrix anchors missing')

matrix = '\n'.join(lines) + '\n'
matrix = matrix.replace('## M69 score', '## M70 score', 1)
old_score = '''- `PASS`: 0
- `PARTIAL`: 5
- `GAP`: 20
- `N/A`: 0
- total: 25

M69 adds a CRM-owned authorization policy over equivalent platform Auth. The score remains unchanged because no real CRM server/browser boundary consumes the policy yet: `0 PASS / 5 PARTIAL / 20 GAP / 0 N/A`.'''
new_score = '''- `PASS`: 0
- `PARTIAL`: 8
- `GAP`: 17
- `N/A`: 0
- total: 25

M70 adds the first server-authoritative CRM leads/pipeline boundary. Lead list/search, Lead CRUD/server validation and automated regression coverage move from GAP to PARTIAL only. No row reaches PASS because transport, concrete persistence and browser consumers remain open. The score is `0 PASS / 8 PARTIAL / 17 GAP / 0 N/A`.'''
if old_score not in matrix:
    raise SystemExit('M70 score anchor missing')
matrix = matrix.replace(old_score, new_score, 1)
matrix_path.write_text(matrix)

tracker_path = Path('docs/migration/MASTER-MIGRATION-TRACKER.md')
tracker = tracker_path.read_text()
old = 'M67 froze the standalone CRM V1 at `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`. M68 started the framework-independent domain core. M69 adds CRM-owned authorization over equivalent platform Auth: active-session reads, viewer mutation denial, owner/manager/admin mutations. The matrix remains `0 PASS / 5 PARTIAL / 20 GAP`; `MIG-0008` stays `migrating` and `FEATURE-0006` stays `baseline-pending`.'
new = 'M67 froze the standalone CRM V1 at `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`. M68 started the framework-independent domain core and M69 added CRM-owned authorization. M70 adds a server-authoritative leads/pipeline boundary with bounded validation, policy enforcement, denial audit events and a corrected create lifecycle that never writes `leadId: 0`. The matrix is `0 PASS / 8 PARTIAL / 17 GAP`; `MIG-0008` remains `migrating` and `FEATURE-0006` remains `baseline-pending`.'
if old not in tracker:
    raise SystemExit('tracker CRM section anchor missing')
tracker = tracker.replace(old, new, 1)
tracker_path.write_text(tracker)

Path('docs/qa/CRM-M70-EVIDENCE.md').write_text('''# CRM M70 — Leads/Pipeline Server Boundary Evidence

## Scope

M70 introduces the first server-authoritative CRM command/query boundary. It consumes the M69 CRM authorization policy and remains persistence/transport agnostic.

## Frozen V1 behavior

The frozen CRM exposes protected lead operations for list, get, create, update, stage update and delete. Lead listing supports stage/status/search filtering. Stage mutation updates `lastContactAt` and appends a `stage_change` interaction.

The V1 create flow also contains a defect: it writes a system interaction with `leadId: 0` before rediscovering the inserted lead.

## Permanent V2 implementation

`@touristic/crm/leads-boundary` now provides:

- authenticated bounded lead list/search queries;
- get/create/update/updateStage/delete commands;
- explicit CRM ID, stage, status, email, money and text validation;
- maximum list limit of 200 and non-negative offsets;
- M69 authorization policy enforcement before mutations;
- structured denial, invalid-input and not-found audit events through `CrmLeadAuditPort`;
- stage-change interaction preservation;
- create lifecycle that requires the repository to return the created lead before checklist/interaction writes.

The last point intentionally fixes the frozen V1 `leadId: 0` behavior. Checklist and interaction writes can only receive the real returned lead ID.

## Executable evidence

Temporary validation run `31548898112` passed before documentation reconciliation:

- lockfile generation and frozen reinstall;
- M70 validation fixes and canonical Prettier formatting;
- CRM lint;
- CRM typecheck;
- CRM tests including M70 boundary scenarios;
- CRM build;
- repository `format:check`;
- `architecture:check`;
- `features:check`;
- repository lint;
- repository typecheck;
- repository tests;
- repository build.

Permanent M70 tests prove fail-closed unauthenticated reads, bounded queries, viewer mutation denial, no `leadId: 0` create write, valid stage-change interaction and invalid-stage rejection/audit.

## Matrix decision

Three rows advance from GAP to PARTIAL: Lead list/search, Lead CRUD/server validation and automated regression coverage. Existing pipeline and server authorization rows remain PARTIAL with stronger evidence. Matrix: `0 PASS / 8 PARTIAL / 17 GAP / 0 N/A`.

No PASS is claimed because no concrete persistence adapter, transport boundary or browser consumer exists yet.

## State decision

`MIG-0008` remains `migrating`. `FEATURE-0006` remains `baseline-pending`, not `equivalent`.

## Next milestone

M71 should implement the first concrete CRM persistence adapter behind the M70 repository port, preserving server-only credentials and the frozen schema constraints before an HTTP/browser surface is introduced.
''')
