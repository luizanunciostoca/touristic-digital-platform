from pathlib import Path

matrix_path = Path('docs/migration/CRM-MIGRATION-MATRIX.md')
matrix = matrix_path.read_text()
matrix = matrix.replace('# CRM Administrativo — Migration Matrix (M70 leads boundary)', '# CRM Administrativo — Migration Matrix (M71 MySQL persistence)', 1)
lines = matrix.splitlines()
found = {'list': False, 'crud': False, 'persistence': False, 'tests': False}
for i, line in enumerate(lines):
    if line.startswith('| Lead list and search/filter lifecycle'):
        lines[i] = '| Lead list and search/filter lifecycle          | `Leads.tsx`                                          | M70 bounded query contract plus `MySqlCrmLeadRepository.list()` with prepared filters/pagination                    | PARTIAL | Query + concrete persistence are executable; transport and browser consumer remain pending.                           |'
        found['list'] = True
    elif line.startswith('| Lead CRUD and server validation'):
        lines[i] = '| Lead CRUD and server validation                | tRPC routes + DB functions                           | M70 commands now have a concrete MySQL repository for get/create/update/updateStage/delete                          | PARTIAL | Server commands + persistence exist; transport/browser lifecycle and historical data migration remain pending.        |'
        found['crud'] = True
    elif line.startswith('| Persistence model'):
        lines[i] = '| Persistence model                              | Drizzle ORM + MySQL via `server/db.ts`               | `services/crm` provides server-only MySQL schema + repository for leads/checklist/interactions                      | PARTIAL | Concrete persistence exists for the M70 slice; remaining CRM tables and historical migration are still pending.       |'
        found['persistence'] = True
    elif line.startswith('| Automated regression coverage'):
        lines[i] = '| Automated regression coverage                  | `server/crm.test.ts`, auth tests                     | domain/auth/leads suites plus deterministic MySQL repository/schema contract tests run in Quality                  | PARTIAL | Core + first persistence slice are covered; transport, browser and remaining CRM modules still need regression suites. |'
        found['tests'] = True
if not all(found.values()):
    raise SystemExit(f'missing M71 matrix anchors: {found}')
matrix = '\n'.join(lines) + '\n'
matrix = matrix.replace('## M70 score', '## M71 score', 1)
old = 'M70 adds the first server-authoritative CRM leads/pipeline boundary. Lead list/search, Lead CRUD/server validation and automated regression coverage move from GAP to PARTIAL only. No row reaches PASS because transport, concrete persistence and browser consumers remain open. The score is `0 PASS / 8 PARTIAL / 17 GAP / 0 N/A`.'
new = 'M71 adds concrete server-only MySQL persistence for the M70 leads/checklist/interactions slice. The score remains `0 PASS / 8 PARTIAL / 17 GAP / 0 N/A`: persistence is now executable, but no row reaches PASS until transport/browser parity and the remaining CRM schema/data migration are completed.'
if old not in matrix:
    raise SystemExit('M71 score anchor missing')
matrix_path.write_text(matrix.replace(old, new, 1))

tracker_path = Path('docs/migration/MASTER-MIGRATION-TRACKER.md')
tracker = tracker_path.read_text()
old_row = '| MIG-0008 | `luizidebook/morro-digital-crm@1915d026` | CRM | FEATURE-0006 | `@touristic/crm` + future `apps/admin-crm`/services | 7 | migrating | baseline visual inventory frozen; browser parity not implemented | 25 contracts: 0 PASS / 5 PARTIAL / 20 GAP; domain vocabulary + repository ports executable | `CRM-V1-BASELINE.md`; `CRM-MIGRATION-MATRIX.md`; M67–M68 evidence | alto |'
new_row = '| MIG-0008 | `luizidebook/morro-digital-crm@1915d026` | CRM | FEATURE-0006 | `@touristic/crm` + `@touristic/crm-server` + future `apps/admin-crm` | 7 | migrating | baseline visual inventory frozen; browser parity not implemented | 25 contracts: 0 PASS / 8 PARTIAL / 17 GAP; domain, auth, leads boundary and first MySQL persistence slice executable | `CRM-V1-BASELINE.md`; `CRM-MIGRATION-MATRIX.md`; M67–M71 evidence | alto |'
if old_row not in tracker:
    raise SystemExit('MIG-0008 row anchor missing')
tracker = tracker.replace(old_row, new_row, 1)
old_para = 'M67 froze the standalone CRM V1 at `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`. M68 started the framework-independent domain core and M69 added CRM-owned authorization. M70 adds a server-authoritative leads/pipeline boundary with bounded validation, policy enforcement, denial audit events and a corrected create lifecycle that never writes `leadId: 0`. The matrix is `0 PASS / 8 PARTIAL / 17 GAP`; `MIG-0008` remains `migrating` and `FEATURE-0006` remains `baseline-pending`.'
new_para = 'M67 froze the standalone CRM V1 at `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`. M68 started the framework-independent domain core, M69 added CRM-owned authorization and M70 added the server-authoritative leads/pipeline boundary. M71 introduces `@touristic/crm-server` with server-only MySQL persistence for leads, checklist and interactions, prepared statements, relational constraints and stable `assignedToSubject` identity. The matrix remains `0 PASS / 8 PARTIAL / 17 GAP`; `MIG-0008` remains `migrating` and `FEATURE-0006` remains `baseline-pending`.'
if old_para not in tracker:
    raise SystemExit('CRM tracker paragraph anchor missing')
tracker_path.write_text(tracker.replace(old_para, new_para, 1))

Path('docs/qa/CRM-M71-EVIDENCE.md').write_text('''# CRM M71 — MySQL Persistence Evidence

## Scope

M71 adds the first concrete server-only CRM persistence adapter behind the M70 leads boundary. It covers only leads, checklist items and interactions; other CRM entities remain outside this milestone.

## Architecture

- `@touristic/crm` remains framework/database agnostic.
- `@touristic/crm-server` lives under `services/crm` and owns `mysql2` plus `CRM_DATABASE_URL`.
- credentials are never exposed through browser/domain packages.
- `MySqlCrmLeadRepository` implements the M70 repository port.
- all dynamic values use prepared placeholders.

## Schema decisions

The M71 schema freezes leads, checklist and interactions with InnoDB foreign keys/cascade behavior and a unique `(lead_id, step)` checklist constraint.

The frozen V1 used numeric `assignedToId` identities from its previous host. V2 Auth uses stable subjects, so M71 deliberately persists `assigned_to_subject` and interaction `actor_subject` instead of fabricating incompatible numeric user IDs. This is a migration correction, not a parity omission.

Historical V1 data migration remains separate and is not claimed by M71.

## Executable evidence

Temporary validation run `31550026217` completed successfully before helper cleanup:

- lockfile generation and frozen reinstall;
- Prettier on M71 artifacts;
- `@touristic/crm-server` lint;
- `@touristic/crm-server` typecheck;
- deterministic repository/schema tests;
- `@touristic/crm-server` build;
- repository `pnpm check` (format, architecture, registry, lint, typecheck, tests and build);
- permanent integration commit `6d4116dfb1a7fd2bc341339472667ed198bda500`.

Tests prove prepared filtering/pagination, generated-ID readback, idempotent 16-step checklist initialization, parameterized interaction metadata and the stable-subject relational schema.

## Matrix decision

The score remains `0 PASS / 8 PARTIAL / 17 GAP / 0 N/A`.

Persistence is materially stronger but remains PARTIAL because M71 covers only the M70 lead slice. Transport/browser lifecycle, remaining CRM tables and historical data migration are still open.

## State decision

`MIG-0008` remains `migrating`. `FEATURE-0006` remains `baseline-pending`.

## Next milestone

M72 should add an authenticated CRM transport boundary for the M70 commands over the M71 repository, including structured HTTP/API validation and durable audit integration, before browser UI work begins.
''')
