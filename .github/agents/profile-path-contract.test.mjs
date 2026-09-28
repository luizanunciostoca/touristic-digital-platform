import assert from "node:assert/strict";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROFILE_IDS,
  validateDirectory,
  validateProfile,
} from "./profile-contract.mjs";

const source = dirname(fileURLToPath(import.meta.url));

function fixture(run) {
  // These disposable fixtures test path handling, not production Skill content.
  const parent = mkdtempSync(resolve(tmpdir(), "morro-profile-path-"));
  const root = resolve(parent, "repo");
  const agents = resolve(root, ".github/agents");
  mkdirSync(agents, { recursive: true });
  try {
    writeFileSync(resolve(agents, "README.md"), "Fixture README\n");
    for (const id of PROFILE_IDS) {
      const filename = `${id}.agent.md`;
      const text = readFileSync(resolve(source, filename), "utf8");
      writeFileSync(resolve(agents, filename), text);
      for (const skill of validateProfile(text, filename).skills) {
        mkdirSync(dirname(resolve(root, skill)), { recursive: true });
        writeFileSync(resolve(root, skill), "Fixture skill\n");
      }
    }
    assert.equal(validateDirectory(root).count, 12);
    run(root, parent);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

test("regular checkout fixture satisfies the path contract", () => {
  fixture((root) => assert.equal(validateDirectory(root).count, 12));
});

for (const relativePath of [
  ".github",
  ".github/agents",
  ".github/skills",
  ".github/skills/morro-tenant-security",
  ".github/skills/morro-tenant-security/SKILL.md",
  ".github/agents/README.md",
]) {
  for (const inside of [true, false]) {
    const boundary = inside ? "within" : "outside";
    test(`reject ${relativePath} linked ${boundary} the checkout`, () => {
      fixture((root, parent) => {
        const link = resolve(root, relativePath);
        const isDirectory = lstatSync(link).isDirectory();
        const target = resolve(inside ? root : parent, "redirected");
        renameSync(link, target);
        symlinkSync(target, link, isDirectory ? "dir" : "file");
        assert.equal(lstatSync(link).isSymbolicLink(), true);
        if (isDirectory) {
          // Reproduce the original false green: the final Skill file is regular
          // even though an ancestor redirected its location.
          const skill = resolve(
            root,
            ".github/skills/morro-tenant-security/SKILL.md",
          );
          assert.equal(lstatSync(skill).isFile(), true);
        }
        assert.throws(() => validateDirectory(root));
      });
    });
  }
}
