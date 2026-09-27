import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  PROFILE_IDS,
  validateDirectory,
  validateProfile,
} from "./profile-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const sample = readFileSync(
  resolve(directory, "security-auditor.agent.md"),
  "utf8",
);

for (const id of PROFILE_IDS) {
  test(`B3 profile ${id} uses its exact tools and disables auto-dispatch`, () => {
    const filename = `${id}.agent.md`;
    const text = readFileSync(resolve(directory, filename), "utf8");
    assert.equal(validateProfile(text, filename).id, id);
  });
}

for (const [name, replacement] of [
  ["implicit all-tools default", ""],
  ["wildcard tools", 'tools: ["*"]\n'],
  ["edit tool", 'tools: ["read", "search", "edit"]\n'],
  ["shell tool", 'tools: ["read", "search", "execute"]\n'],
  ["MCP wildcard", 'tools: ["read", "search", "github/*"]\n'],
]) {
  test(`reject ${name}`, () => {
    const text = sample.replace(/^tools:.*\r?\n/mu, replacement);
    assert.throws(() => validateProfile(text, "security-auditor.agent.md"));
  });
}

for (const [name, from, to] of [
  [
    "automatic invocation",
    "disable-model-invocation: true",
    "disable-model-invocation: false",
  ],
  [
    "duplicate property",
    "target: github-copilot",
    "target: github-copilot\ntarget: vscode",
  ],
  [
    "unknown property",
    "target: github-copilot",
    "target: github-copilot\nmcp-servers: unsafe",
  ],
  ["missing dispatch control", "disable-model-invocation: true\n", ""],
  [
    "path traversal",
    ".github/skills/morro-tenant-security/SKILL.md",
    ".github/skills/../../secret/SKILL.md",
  ],
]) {
  test(`reject ${name}`, () => {
    assert.throws(() =>
      validateProfile(sample.replace(from, to), "security-auditor.agent.md"),
    );
  });
}

test("reject object-valued tools", () => {
  const objectTools = sample.replace(
    /^tools:.*\r?\n/mu,
    'tools: {"read": false, "search": false}\n',
  );
  assert.throws(() =>
    validateProfile(objectTools, "security-auditor.agent.md"),
  );
});

test("reject block-scalar shadowing of top-level tools", () => {
  const widened = sample
    .replace(
      /^tools:.*\r?\n/mu,
      'tools: ["read", "search", "edit", "execute"]\n',
    )
    .replace(
      /^description:.*\r?\n/mu,
      'description: |\n  tools: ["read", "search"]\n',
    );
  assert.throws(() => validateProfile(widened, "security-auditor.agent.md"));
});

test("implementation profiles cannot gain delegation tools", () => {
  const filename = "platform-backend.agent.md";
  const text = readFileSync(resolve(directory, filename), "utf8");
  const widened = text.replace(
    /^tools:.*\r?\n/mu,
    'tools: ["read", "search", "edit", "execute", "agent"]\n',
  );
  assert.throws(() => validateProfile(widened, filename));
});

test("reviewers cannot lose the read-only role contract", () => {
  const widened = sample.replace("Remain read-only", "Implement directly");
  assert.throws(() => validateProfile(widened, "security-auditor.agent.md"));
});

test("directory rejects missing, extra, duplicate and linked files", () => {
  // Synthetic fixture: it tests the validator, not production skill behavior.
  const root = mkdtempSync(resolve(tmpdir(), "morro-agent-contract-"));
  const agents = resolve(root, ".github/agents");
  mkdirSync(agents, { recursive: true });
  try {
    writeFileSync(resolve(agents, "README.md"), "Fixture contract\n");
    for (const id of PROFILE_IDS) {
      const filename = `${id}.agent.md`;
      const text = readFileSync(resolve(directory, filename), "utf8");
      writeFileSync(resolve(agents, filename), text);
      for (const skill of validateProfile(text, filename).skills) {
        mkdirSync(dirname(resolve(root, skill)), { recursive: true });
        writeFileSync(resolve(root, skill), "Fixture skill\n");
      }
    }
    assert.equal(validateDirectory(root).count, 12);
    const extra = resolve(agents, "unexpected.agent.md");
    writeFileSync(extra, sample);
    assert.throws(() => validateDirectory(root));
    rmSync(extra);
    const backend = resolve(agents, "platform-backend.agent.md");
    const original = readFileSync(backend, "utf8");
    writeFileSync(
      backend,
      original.replace("Morro Platform Backend", "Morro Security Auditor"),
    );
    assert.throws(() => validateDirectory(root));
    writeFileSync(backend, original);
    const security = resolve(agents, "security-auditor.agent.md");
    rmSync(security);
    assert.throws(() => validateDirectory(root));
    symlinkSync(resolve(directory, "security-auditor.agent.md"), security);
    assert.throws(() => validateDirectory(root));
    rmSync(security);
    writeFileSync(security, sample);
    const profile = validateProfile(sample, "security-auditor.agent.md");
    const missing = resolve(root, profile.skills[0]);
    rmSync(missing);
    assert.throws(() => validateDirectory(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
