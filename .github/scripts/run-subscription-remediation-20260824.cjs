const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const opsRoot = path.resolve(__dirname, '..', '..');
const sourcePath = path.join(opsRoot, '.github/scripts/subscription-remediation-20260824.cjs');
let source = fs.readFileSync(sourcePath, 'utf8');

source = source.replace(
  'if (count !== 1) throw new Error(`${file}: expected exactly one match, got ${count}`);',
  'if (count < 1) throw new Error(`${file}: expected at least one match, got ${count}`);',
);

const unsafeSnapshotPatch = `replaceOnce(
  'packages/financial/src/subscription-provider.ts',
  '  const payerEmail = text(input.payerEmail, 200).toLowerCase();',
  '  const payerEmail = text(input.payerEmail, 200).toLowerCase();\\n  const startAt = input.startAt === undefined ? "" : canonicalTimestamp(input.startAt);',
);`;
const scopedSnapshotPatch = `replaceOnce(
  'packages/financial/src/subscription-provider.ts',
  '  const amount = createMoney(input.amount?.minorUnits, input.amount?.currency);\\n  const payerEmail = text(input.payerEmail, 200).toLowerCase();\\n  const status =',
  '  const amount = createMoney(input.amount?.minorUnits, input.amount?.currency);\\n  const payerEmail = text(input.payerEmail, 200).toLowerCase();\\n  const startAt = input.startAt === undefined ? "" : canonicalTimestamp(input.startAt);\\n  const status =',
);`;
if (!source.includes(unsafeSnapshotPatch)) throw new Error('SNAPSHOT_PATCH_MARKER_MISSING');
source = source.replace(unsafeSnapshotPatch, scopedSnapshotPatch);

source = source.replace(
  'readonly currentPeriod: Readonly<{ number: 1; startAt: string; endAt: string }>;',
  'readonly currentPeriod: Readonly<{ number: number; startAt: string; endAt: string }>;',
);
source = source.replace(
  '    data.currentPeriod?.number !== 1 ||',
  '    !Number.isSafeInteger(data.currentPeriod?.number) || Number(data.currentPeriod?.number) < 1 ||',
);

const targetRoot = path.resolve(process.argv[2] || '.');
const temp = path.join(targetRoot, '.git', 'subscription-remediation.generated.cjs');
fs.writeFileSync(temp, source);
const result = spawnSync(process.execPath, [temp, targetRoot], {
  cwd: targetRoot,
  stdio: 'inherit',
});
fs.unlinkSync(temp);
if (result.status !== 0) process.exit(result.status ?? 1);
