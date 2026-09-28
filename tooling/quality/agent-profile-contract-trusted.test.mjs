import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import {
  PROFILE_IDS,
  validateDirectory,
  validateProfile,
} from "./agent-profile-contract-trusted.mjs";

const READ_ONLY = new Set(["release-engineer", "security-auditor"]);
const PROOF_CAPABLE = new Set([
  "business-control-center-crm",
  "assistant-search-map",
  "frontend-ux-accessibility",
  "analytics-notifications-pwa",
  "test-engineer",
]);

function profileText(id) {
  const readOnly = READ_ONLY.has(id);
  const tools = readOnly
    ? '["read", "search"]'
    : '["read", "search", "edit", "execute"]';
  const authority = readOnly
    ? "2. Remain read-only: inspect source and evidence."
    : PROOF_CAPABLE.has(id)
      ? "5. Implementation agents stop at `REMOTE_PROVEN`; independent auditors stop at proof verdict and hand off to the Integrator."
      : "5. Stop the implementation lane at `REMOTE_PROVEN` and hand off to independent proof/integration.";

  return `---
name: Morro Fixture ${id}
description: Synthetic trusted validator fixture for ${id}.
target: github-copilot
tools: ${tools}
disable-model-invocation: true
user-invocable: true
---

# Role

Follow \`AGENTS.md\` and the active Fabric ChangeSet.

## Scope

- synthetic contract fixture

## Required skills

- \`.github/skills/morro-fixture-one/SKILL.md\`
- \`.github/skills/morro-fixture-two/SKILL.md\`

## Workflow

1. Recapture current main, exact head, dependency state and active claim.
${authority}

## Forbidden

- Bypass authority

## Output contract

Report exact source identity and blockers.
`;
}

for (const id of PROFILE_IDS) {
  test(`accept canonical ${id} profile`, () => {
    assert.equal(validateProfile(profileText(id), `${id}.agent.md`).id, id);
  });
}

test("reject object-valued tools", () => {
  const id = "security-auditor";
  const text = profileText(id).replace(
    /^tools:.*$/mu,
    'tools: {"read": false, "search": false}',
  );
  assert.throws(() => validateProfile(text, `${id}.agent.md`));
});

test("reject negated implementation handoff even if REMOTE_PROVEN is mentioned", () => {
  const id = "platform-backend";
  const canonical =
    "5. Stop the implementation lane at `REMOTE_PROVEN` and hand off to independent proof/integration.";
  const text = profileText(id).replace(
    canonical,
    "5. Do not treat `REMOTE_PROVEN` as a positive handoff requirement.",
  );
  assert.throws(() => validateProfile(text, `${id}.agent.md`));
});

test("reject missing read-only authority item", () => {
  const id = "security-auditor";
  const text = profileText(id).replace(
    "2. Remain read-only: inspect source and evidence.",
    "2. Inspect source and evidence.",
  );
  assert.throws(() => validateProfile(text, `${id}.agent.md`));
});

test("reject negated proof-capable authority item", () => {
  const id = "test-engineer";
  const canonical =
    "5. Implementation agents stop at `REMOTE_PROVEN`; independent auditors stop at proof verdict and hand off to the Integrator.";
  const text = profileText(id).replace(
    canonical,
    `5. Do not follow: ${canonical.slice(3)}`,
  );
  assert.throws(() => validateProfile(text, `${id}.agent.md`));
});

test("reject valid handoff moved outside Workflow", () => {
  const id = "platform-backend";
  const canonical =
    "5. Stop the implementation lane at `REMOTE_PROVEN` and hand off to independent proof/integration.";
  const text = profileText(id)
    .replace(canonical, "5. Continue through integration.")
    .replace("## Forbidden\n", `## Forbidden\n\n${canonical}\n`);
  assert.throws(() => validateProfile(text, `${id}.agent.md`));
});

test("directory rejects extra profiles and redirected skill ancestors", () => {
  const parent = mkdtempSync(resolve(tmpdir(), "morro-trusted-agent-"));
  const root = resolve(parent, "candidate");
  const agents = resolve(root, ".github/agents");

  mkdirSync(agents, { recursive: true });
  try {
    writeFileSync(resolve(agents, "README.md"), "Fixture README\n");

    for (const id of PROFILE_IDS) {
      const filename = `${id}.agent.md`;
      const text = profileText(id);
      writeFileSync(resolve(agents, filename), text);

      for (const skill of validateProfile(text, filename).skills) {
        mkdirSync(dirname(resolve(root, skill)), { recursive: true });
        writeFileSync(resolve(root, skill), "Fixture skill\n");
      }
    }

    assert.equal(validateDirectory(root).count, 12);

    const extra = resolve(agents, "unexpected.agent.md");
    writeFileSync(extra, profileText("security-auditor"));
    assert.throws(() => validateDirectory(root));
    rmSync(extra);

    const skillDirectory = resolve(root, ".github/skills/morro-fixture-one");
    const redirected = resolve(parent, "redirected-skill");
    mkdirSync(redirected, { recursive: true });
    writeFileSync(resolve(redirected, "SKILL.md"), "Redirected skill\n");
    renameSync(skillDirectory, resolve(parent, "original-skill"));
    symlinkSync(redirected, skillDirectory, "dir");

    assert.throws(() => validateDirectory(root));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
