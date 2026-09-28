import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const checker = "tooling/quality/check-render-staging-blueprint.mjs";
const fixtures = [
  checker,
  "render.staging.yaml",
  "tooling/render/reconcile-staging-mysql-domains.mjs",
  "tooling/render/mysql-staging/Dockerfile",
  "tooling/render/mysql-staging/01-init-databases.sh",
  "tooling/render/mysql-staging/backup-restore-drill.sh",
  "docs/operations/MYSQL-BACKUP-RESTORE-DRILL.md",
  "tooling/render/wait-for-staging-mysql.mjs",
  "tooling/render/with-staging-mysql-env.mjs",
  "apps/morro-digital-platform/tooling/staging-predeploy.mjs",
  "docs/deployment/RENDER-STAGING-V2.md",
  "services/financial/src/mercado-pago-provider.ts",
];

function check(t, mutate = () => {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "morro-blueprint-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const file of fixtures) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(directory, file));
  }
  const blueprintPath = path.join(directory, "render.staging.yaml");
  const original = fs.readFileSync(blueprintPath, "utf8");
  const mutated = mutate(original, directory);
  if (mutated !== undefined) {
    assert.notEqual(mutated, original, "mutation must change the fixture");
    fs.writeFileSync(blueprintPath, mutated);
  }
  return spawnSync(process.execPath, [path.join(directory, checker)], {
    cwd: directory,
    encoding: "utf8",
    timeout: 10_000,
  });
}

function rejects(result, expected) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, expected);
}

test("current Blueprint and init script satisfy the complete database contract", (t) => {
  const result = check(t);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

for (const component of ["NAME", "USER", "PASSWORD"]) {
  test(`missing Commerce ${component} is rejected`, (t) => {
    rejects(
      check(t, (source) =>
        source.replace(
          `- key: COMMERCE_DATABASE_${component}\n`,
          `- key: REMOVED_COMMERCE_DATABASE_${component}\n`,
        ),
      ),
      new RegExp(
        `Missing staging environment key: COMMERCE_DATABASE_${component}`,
      ),
    );
  });

  test(`Commerce ${component} cannot reference another domain`, (t) => {
    rejects(
      check(t, (source) =>
        source.replace(
          `envVarKey: COMMERCE_DATABASE_${component}`,
          `envVarKey: BUSINESS_DATABASE_${component}`,
        ),
      ),
      new RegExp(`STAGING_COMMERCE_DATABASE_${component} -> envVarKey:`),
    );
  });
}

test("Commerce database value must match exactly, without a foreign suffix", (t) => {
  rejects(
    check(t, (source) =>
      source.replace(
        "value: morro_commerce_staging",
        "value: morro_commerce_staging_other",
      ),
    ),
    /COMMERCE_DATABASE_NAME -> value: morro_commerce_staging/u,
  );
});

test("Commerce password binding must match exactly, without a foreign suffix", (t) => {
  rejects(
    check(t, (source) =>
      source.replace(
        "envVarKey: COMMERCE_DATABASE_PASSWORD",
        "envVarKey: COMMERCE_DATABASE_PASSWORD_OTHER",
      ),
    ),
    /STAGING_COMMERCE_DATABASE_PASSWORD -> envVarKey: COMMERCE_DATABASE_PASSWORD/u,
  );
});

test("Commerce initialization cannot be absent while the Blueprint declares it", (t) => {
  rejects(
    check(t, (_source, directory) => {
      const file = path.join(
        directory,
        "tooling/render/mysql-staging/01-init-databases.sh",
      );
      const source = fs.readFileSync(file, "utf8");
      fs.writeFileSync(
        file,
        source.replaceAll(
          "${COMMERCE_DATABASE_NAME}",
          "${OMITTED_DATABASE_NAME}",
        ),
      );
    }),
    /Missing staging contract: \$\{COMMERCE_DATABASE_NAME\}/u,
  );
});

test("Notifications remains in the domain contract alongside Commerce", (t) => {
  rejects(
    check(t, (source) =>
      source.replace(
        "- key: STAGING_NOTIFICATIONS_DATABASE_USER\n",
        "- key: OMITTED_NOTIFICATIONS_DATABASE_USER\n",
      ),
    ),
    /Missing staging environment key: STAGING_NOTIFICATIONS_DATABASE_USER/u,
  );
});
