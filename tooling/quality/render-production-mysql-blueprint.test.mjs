import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const checker = "tooling/quality/check-render-production-mysql-blueprint.mjs";
const fixtures = [
  checker,
  "render.yaml",
  "tooling/render/mysql-production/Dockerfile",
  "tooling/render/mysql-production/morro-memory.cnf",
  "tooling/render/mysql-production/01-init-databases.sh",
  "tooling/render/mysql-production/readback.sh",
];

function runCheck(t, mutate = () => {}) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "morro-production-mysql-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  for (const file of fixtures) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(directory, file));
  }

  mutate(directory);

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

test("production MySQL Blueprint satisfies the infrastructure-only contract", (t) => {
  const result = runCheck(t);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

test("production MySQL must remain in Virginia", (t) => {
  rejects(
    runCheck(t, (directory) => {
      const file = path.join(directory, "render.yaml");
      fs.writeFileSync(
        file,
        fs
          .readFileSync(file, "utf8")
          .replace("region: virginia", "region: oregon"),
      );
    }),
    /region: virginia/u,
  );
});

test("business owner password cannot be omitted", (t) => {
  rejects(
    runCheck(t, (directory) => {
      const file = path.join(directory, "render.yaml");
      fs.writeFileSync(
        file,
        fs
          .readFileSync(file, "utf8")
          .replace(
            "- key: BUSINESS_DATABASE_PASSWORD",
            "- key: OMITTED_BUSINESS_DATABASE_PASSWORD",
          ),
      );
    }),
    /BUSINESS_DATABASE_PASSWORD/u,
  );
});

test("shared morro_app ownership is forbidden", (t) => {
  rejects(
    runCheck(t, (directory) => {
      const file = path.join(
        directory,
        "tooling/render/mysql-production/01-init-databases.sh",
      );
      fs.appendFileSync(file, "\n# morro_app\n");
    }),
    /shared broad production database user/u,
  );
});

test("phase 1 cannot cut the application over", (t) => {
  rejects(
    runCheck(t, (directory) => {
      const file = path.join(directory, "render.yaml");
      fs.appendFileSync(file, "\n# PRODUCTION_MYSQL_HOSTPORT\n");
    }),
    /premature production cutover wiring/u,
  );
});

test("commented MySQL pin cannot satisfy the production image contract", (t) => {
  rejects(
    runCheck(t, (directory) => {
      const file = path.join(
        directory,
        "tooling/render/mysql-production/Dockerfile",
      );
      const source = fs.readFileSync(file, "utf8");
      fs.writeFileSync(
        file,
        source.replace(
          "FROM mysql:8.4@sha256:0744ee5ef89ce6ccfa13de3e579fe6b9e27f93dd70da9c06d2c908b1b193fb8d",
          "# FROM mysql:8.4@sha256:0744ee5ef89ce6ccfa13de3e579fe6b9e27f93dd70da9c06d2c908b1b193fb8d\nFROM mysql:8.3",
        ),
      );
    }),
    /pinned MySQL 8\.4 image/u,
  );
});

test("production initializer must escape SQL identifier backticks", (t) => {
  rejects(
    runCheck(t, (directory) => {
      const file = path.join(
        directory,
        "tooling/render/mysql-production/01-init-databases.sh",
      );
      const source = fs.readFileSync(file, "utf8");
      fs.writeFileSync(
        file,
        source.replaceAll("\\`$database\\`", "`$database`"),
      );
    }),
    /escaped SQL database identifier/u,
  );
});

test("production readback must cover all thirteen canonical domains", (t) => {
  rejects(
    runCheck(t, (directory) => {
      const file = path.join(
        directory,
        "tooling/render/mysql-production/readback.sh",
      );
      const source = fs.readFileSync(file, "utf8");
      fs.writeFileSync(
        file,
        source.replace(
          "AUTH AUDIT DESTINATIONS CONTENT BUSINESS ORDERING FINANCIAL TICKETING NOTIFICATIONS AFFILIATES ANALYTICS CRM COMMERCE",
          "AUTH AUDIT DESTINATIONS CONTENT ORDERING FINANCIAL TICKETING NOTIFICATIONS AFFILIATES ANALYTICS CRM COMMERCE",
        ),
      );
    }),
    /MORRO-PRODUCTION-MYSQL-READBACK|DOMAINS/u,
  );
});

test("production readback cannot use root authority", (t) => {
  rejects(
    runCheck(t, (directory) => {
      const file = path.join(
        directory,
        "tooling/render/mysql-production/readback.sh",
      );
      fs.appendFileSync(file, "\n# MYSQL_ROOT_PASSWORD\n");
    }),
    /readback must use domain owners only/u,
  );
});

test("production readback must verify the full 156-denial matrix", (t) => {
  rejects(
    runCheck(t, (directory) => {
      const file = path.join(
        directory,
        "tooling/render/mysql-production/readback.sh",
      );
      const source = fs.readFileSync(file, "utf8");
      fs.writeFileSync(
        file,
        source.replace(
          '[ "$denied_count" -eq 156 ]',
          '[ "$denied_count" -eq 13 ]',
        ),
      );
    }),
    /156/u,
  );
});

test("production readback must prove the exact Render git commit", (t) => {
  rejects(
    runCheck(t, (directory) => {
      const file = path.join(
        directory,
        "tooling/render/mysql-production/readback.sh",
      );
      const source = fs.readFileSync(file, "utf8");
      fs.writeFileSync(
        file,
        source.replaceAll("RENDER_GIT_COMMIT", "OMITTED_RENDER_GIT_COMMIT"),
      );
    }),
    /RENDER_GIT_COMMIT/u,
  );
});
