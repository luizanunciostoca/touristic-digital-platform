from pathlib import Path

matrix_path = Path('docs/migration/CRM-MIGRATION-MATRIX.md')
matrix = matrix_path.read_text()
matrix = matrix.replace('# CRM Administrativo — Migration Matrix (M67 baseline)', '# CRM Administrativo — Migration Matrix (M68 domain model)', 1)
replacements = {
'| 16-stage sales pipeline                        | full stage selector in frozen LeadDetail             | absent                                                              | GAP     | Freeze stage vocabulary/order and transition rules before implementation.       |': '| 16-stage sales pipeline                        | full stage selector in frozen LeadDetail             | `@touristic/crm` freezes 18 persisted stages, 16 active funnel stages and terminal classification | PARTIAL | Vocabulary/order are executable; server-authoritative transition commands remain pending. |',
'| Persistence model                              | Drizzle ORM + MySQL via `server/db.ts`               | no CRM persistence target                                           | GAP     | Freeze schema/constraints, then define repository ports and migration strategy. |': '| Persistence model                              | Drizzle ORM + MySQL via `server/db.ts`               | framework-independent CRM record models and repository ports now exist in `@touristic/crm` | PARTIAL | Schema vocabulary/ports are frozen; persistent adapter and migration remain pending. |',
}
for old, new in replacements.items():
    if old not in matrix:
        raise SystemExit('matrix anchor missing')
    matrix = matrix.replace(old, new, 1)
score_start = matrix.index('## M67 score')
order_start = matrix.index('## Migration order derived from dependency graph')
score = '''## M68 score\n\n- `PASS`: 0\n- `PARTIAL`: 5\n- `GAP`: 20\n- `N/A`: 0\n- total: 25\n\nM68 adds the first CRM-owned executable core without claiming end-to-end parity. Pipeline vocabulary/order and persistence modeling advance from GAP to PARTIAL; browser, API, authorization and concrete persistence remain open.\n\n'''
matrix = matrix[:score_start] + score + matrix[order_start:]
matrix_path.write_text(matrix)

tracker_path = Path('docs/migration/MASTER-MIGRATION-TRACKER.md')
tracker = tracker_path.read_text()
old_row = '| MIG-0008 | `luizidebook/morro-digital-crm@1915d026` | CRM | FEATURE-0006 | `apps/admin-crm` + CRM domain/services to be defined | 7 | snapshotted | baseline visual inventory frozen; browser parity not implemented | 25 contracts inventoried: 0 PASS / 3 PARTIAL / 22 GAP | `CRM-V1-BASELINE.md`; `CRM-MIGRATION-MATRIX.md`; `CRM-M67-EVIDENCE.md`; PR #130 Quality | alto |'
new_row = '| MIG-0008 | `luizidebook/morro-digital-crm@1915d026` | CRM | FEATURE-0006 | `@touristic/crm` + future `apps/admin-crm`/services | 7 | migrating | baseline visual inventory frozen; browser parity not implemented | 25 contracts: 0 PASS / 5 PARTIAL / 20 GAP; domain vocabulary + repository ports executable | `CRM-V1-BASELINE.md`; `CRM-MIGRATION-MATRIX.md`; M67–M68 evidence | alto |'
if old_row not in tracker:
    raise SystemExit('tracker row anchor missing')
tracker = tracker.replace(old_row, new_row, 1)
old_section = 'M67 freezes the standalone CRM V1 at `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745` and inventories 25 migration contracts. No CRM-owned V2 implementation exists yet: `0 PASS / 3 PARTIAL / 22 GAP`. `MIG-0008` is `snapshotted` and `FEATURE-0006` is `baseline-pending`, not `equivalent`.'
new_section = 'M67 froze the standalone CRM V1 at `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`. M68 starts executable migration with framework-independent domain vocabulary, record models and repository ports in `@touristic/crm`. The matrix is `0 PASS / 5 PARTIAL / 20 GAP`; `MIG-0008` is `migrating` while `FEATURE-0006` remains `baseline-pending`, not `equivalent`.'
if old_section not in tracker:
    raise SystemExit('tracker section anchor missing')
tracker = tracker.replace(old_section, new_section, 1)
tracker_path.write_text(tracker)

Path('docs/qa/CRM-M68-EVIDENCE.md').write_text('''# CRM M68 — Domain Model Evidence\n\n## Scope\n\nM68 introduces the first CRM-owned executable V2 core while deliberately keeping persistence adapters, server commands and browser UI out of scope.\n\n## Frozen source\n\n- CRM V1: `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745`\n- schema source: `drizzle/schema.ts`\n- UI vocabulary source: `client/src/lib/crm.ts`\n\n## Permanent implementation\n\n`@touristic/crm` now preserves:\n\n- all 18 persisted lead stages;\n- the distinct 16 active funnel stages;\n- terminal `churned` / `lost` classification;\n- the separate 16-step operational checklist;\n- lead, meeting, proposal, contract, interaction, follow-up, trial and referral record models;\n- status vocabularies for commercial and engagement records;\n- framework-independent repository ports;\n- fail-closed CRM ID and lead-stage guards.\n\nNo Drizzle, MySQL, React, tRPC, storage SDK or Auth implementation is imported by the CRM domain package.\n\n## Executable evidence\n\nTemporary M68 integration run `31546643166` passed before documentation reconciliation:\n\n- workspace lockfile generation and frozen reinstall;\n- CRM lint;\n- CRM typecheck;\n- CRM tests: 5/5 PASS;\n- CRM build;\n- repository `format:check`;\n- `architecture:check`;\n- `features:check`;\n- repository lint;\n- repository typecheck;\n- repository tests;\n- repository build.\n\n## Matrix decision\n\nThe pipeline-vocabulary and persistence-model rows move from GAP to PARTIAL. No row is promoted to PASS because no CRM API/persistent adapter/browser consumer exists yet. The matrix becomes `0 PASS / 5 PARTIAL / 20 GAP / 0 N/A`.\n\n## Tracker decision\n\n`MIG-0008` advances from `snapshotted` to `migrating`. `FEATURE-0006` remains `baseline-pending`; equivalence is not claimed.\n\n## Next milestone\n\nM69 should freeze and port CRM authorization policy over equivalent platform Auth before introducing mutable CRM APIs.\n''')
