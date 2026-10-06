import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";

const bundlePath =
  "apps/morro-digital-platform/public/legacy/legacy.bundle.css";
const generatorPath =
  "apps/morro-digital-platform/tooling/build-legacy-css.mjs";

test("deterministic legacy bundle is generated without dirtying Git", async () => {
  const [ignore, ownershipText, turboText, packageText] = await Promise.all([
    readFile(".gitignore", "utf8"),
    readFile(".morro/ownership.json", "utf8"),
    readFile("turbo.json", "utf8"),
    readFile("apps/morro-digital-platform/package.json", "utf8"),
  ]);

  assert.match(
    ignore,
    /^\/apps\/morro-digital-platform\/public\/legacy\/legacy\.bundle\.css$/mu,
  );

  const ownership = JSON.parse(ownershipText);
  const ciRelease = ownership.domains.find(
    (domain) => domain.id === "ci-release",
  );
  assert.ok(ciRelease, "ci-release ownership domain is required");
  assert.ok(
    ciRelease.pathPrefixes.includes(".gitignore"),
    ".gitignore must have explicit ci-release ownership",
  );

  const turbo = JSON.parse(turboText);
  assert.ok(
    turbo.tasks?.build?.outputs?.includes("public/legacy/legacy.bundle.css"),
    "legacy bundle must remain an explicit build output",
  );

  const appPackage = JSON.parse(packageText);
  assert.match(appPackage.scripts?.build ?? "", /build-legacy-css\.mjs/u);

  let previous = null;
  try {
    previous = await readFile(bundlePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  try {
    execFileSync(process.execPath, [generatorPath], { stdio: "pipe" });
    const generated = await readFile(bundlePath, "utf8");
    assert.match(generated, /GENERATED FILE — DO NOT EDIT/u);

    const ignoredBy = execFileSync(
      "git",
      ["check-ignore", "-v", "--no-index", bundlePath],
      { encoding: "utf8" },
    ).trim();
    assert.match(ignoredBy, /^\.gitignore:/u);

    const dirty = execFileSync(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all", "--", bundlePath],
      { encoding: "utf8" },
    ).trim();
    assert.equal(dirty, "");
  } finally {
    if (previous === null) await rm(bundlePath, { force: true });
    else await writeFile(bundlePath, previous);
  }
});
