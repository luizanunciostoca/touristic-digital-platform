from pathlib import Path
import json

registry_path = Path('docs/features/registry.json')
registry = json.loads(registry_path.read_text())
feature = next((item for item in registry['features'] if item['id'] == 'FEATURE-0006'), None)
if not feature or feature.get('status') != 'planned':
    raise SystemExit('FEATURE-0006 expected planned')
feature['status'] = 'baseline-pending'
registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n')

tracker_path = Path('docs/migration/MASTER-MIGRATION-TRACKER.md')
tracker = tracker_path.read_text()
old_row = '| MIG-0008 | CRM V1 | CRM | FEATURE-0006 | `apps/admin-crm` | 7 | discovered | pendente | pendente | pendente | alto |'
new_row = '| MIG-0008 | `luizidebook/morro-digital-crm@1915d026` | CRM | FEATURE-0006 | `apps/admin-crm` + CRM domain/services to be defined | 7 | snapshotted | baseline visual inventory frozen; browser parity not implemented | 25 contracts inventoried: 0 PASS / 3 PARTIAL / 22 GAP | `CRM-V1-BASELINE.md`; `CRM-MIGRATION-MATRIX.md`; `CRM-M67-EVIDENCE.md`; PR #130 Quality | alto |'
if old_row not in tracker:
    raise SystemExit('MIG-0008 tracker row anchor missing')
tracker = tracker.replace(old_row, new_row, 1)
anchor = '## Business equivalente — MIG-0007'
if anchor not in tracker:
    raise SystemExit('tracker section anchor missing')
section = '''## CRM baseline congelada — MIG-0008\n\nM67 freezes the standalone CRM V1 at `luizidebook/morro-digital-crm@1915d0260c79f30a63b926a1123e609083587745` and inventories 25 migration contracts. No CRM-owned V2 implementation exists yet: `0 PASS / 3 PARTIAL / 22 GAP`. `MIG-0008` is `snapshotted` and `FEATURE-0006` is `baseline-pending`, not `equivalent`.\n\n'''
tracker = tracker.replace(anchor, section + anchor, 1)
tracker_path.write_text(tracker)

evidence_path = Path('docs/qa/CRM-M67-EVIDENCE.md')
evidence = evidence_path.read_text()
anchor = '## Next milestone\n'
if anchor not in evidence:
    raise SystemExit('CRM evidence next milestone anchor missing')
promotion = '''## Promotion decision\n\nAfter the documentation-only baseline head passed the official Quality Gate, `FEATURE-0006` advances from `planned` to `baseline-pending` and `MIG-0008` advances from `discovered` to `snapshotted`. This records completed discovery/baseline work only; the CRM matrix remains `0 PASS / 3 PARTIAL / 22 GAP`.\n\n'''
evidence = evidence.replace(anchor, promotion + anchor, 1)
evidence_path.write_text(evidence)
