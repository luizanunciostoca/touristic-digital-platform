import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { sha } from "./staging-node-test-fixtures.mjs";

test("production prerequisite shell rejects Node evidence before any workflow dispatch", () => {
  const root = process.cwd(),
    dir = mkdtempSync(join(tmpdir(), "node-production-guard-"));
  try {
    const workflow = readFileSync(
      join(root, ".github/workflows/production-oci-promotion.yml"),
      "utf8",
    );
    const step = workflow
      .split("      - name: Resolve and execute prerequisite proof graph\n")[1]
      .split("\n      - name:")[0];
    const script = step
      .split("        run: |\n")[1]
      .split("\n")
      .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
      .join("\n");
    const gh = join(dir, "gh"),
      log = join(dir, "calls.log");
    const executable = `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),a=process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_CALLS,JSON.stringify(a)+'\\n');
const sha=process.env.EXPECTED_SHA;
if(a[0]==='workflow')process.exit(85);
if(a[0]==='run'&&a[1]==='list'){process.stdout.write(JSON.stringify([{databaseId:42,headSha:sha}]));}
else if(a[0]==='api'&&a.some(x=>x.includes('/artifacts'))){process.stdout.write(JSON.stringify([{artifacts:[{id:9,name:'final-release-acceptance-evidence-42-1',expired:false}]}]));}
else if(a[0]==='api'){process.stdout.write(JSON.stringify({id:42,head_sha:sha,path:'.github/workflows/final-release-acceptance.yml',event:'workflow_dispatch',status:'completed',conclusion:'success',run_attempt:1}));}
else if(a[0]==='run'&&a[1]==='download'){const d=a[a.indexOf('--dir')+1];fs.writeFileSync(path.join(d,'final-release-staging-target-evidence.json'),JSON.stringify({expectedSha:sha,acceptanceRunId:'42',acceptanceRunAttempt:'1',mode:'staging-node-rebuild',productionEligible:false,pagesEligible:false}));}
else process.exit(86);
`;
    writeFileSync(gh, executable, { mode: 0o755 });
    assert.throws(
      () =>
        execFileSync("bash", ["-c", script], {
          cwd: root,
          env: {
            ...process.env,
            PATH: dir + ":" + process.env.PATH,
            FIXTURE_CALLS: log,
            EXPECTED_SHA: sha,
            GITHUB_REPOSITORY: "luizanunciostoca/touristic-digital-platform",
            GH_TOKEN: "fixture",
          },
          stdio: ["ignore", "pipe", "pipe"],
        }),
      (error) => String(error.stderr).includes("ACCEPTANCE_MODE_GATE_FAILED"),
    );
    const calls = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
    assert.ok(calls.every((a) => a[0] !== "workflow"));
    assert.ok(
      calls
        .filter((a) => a[0] === "run" && a[1] === "list")
        .every((a) => a.includes("final-release-acceptance.yml")),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("both Node terminal-verification paths use the OCI service lock, parent does not", () => {
  const workflow = readFileSync(
    ".github/workflows/staging-render-promotion.yml",
    "utf8",
  );
  const deploy = workflow.split("\n  deploy:\n")[1].split("\n  verify:\n")[0];
  const verify = workflow.split("\n  verify:\n")[1];
  for (const job of [deploy, verify]) {
    assert.match(job, /group: render-staging-srv-da4hb6c9v7es7386ttt0/);
    assert.match(job, /cancel-in-progress: false/);
    assert.match(
      job,
      /node tooling\/ci\/staging-node-exception.mjs node-verify/,
    );
  }
  assert.ok(deploy.indexOf("node-dispatch") < deploy.indexOf("node-verify"));
  assert.ok(!verify.includes("RENDER_STAGING_DEPLOY_HOOK_URL"));
  assert.ok(!verify.includes("environment:"));
  const parent = readFileSync(
    ".github/workflows/final-release-acceptance.yml",
    "utf8",
  );
  assert.ok(!parent.includes("group: render-staging-srv-da4hb6c9v7es7386ttt0"));
});

test("both actual Pages guard commands reject Node evidence before external effects", () => {
  const root = process.cwd(),
    dir = mkdtempSync(join(tmpdir(), "node-pages-guard-"));
  try {
    const workflow = readFileSync(
      ".github/workflows/pages-after-final-acceptance.yml",
      "utf8",
    );
    const commands = [
      ...workflow.matchAll(
        /run: (node tooling\/ci\/staging-node-exception\.mjs verify-oci-run[^\n]+)/g,
      ),
    ].map((x) => x[1]);
    assert.equal(commands.length, 2);
    const gh = join(dir, "gh"),
      log = join(dir, "calls.log");
    const executable = `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),a=process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_CALLS,JSON.stringify(a)+'\\n');
const sha=process.env.EXPECTED_SHA;
if(a[0]==='workflow')process.exit(85);
if(a[0]==='run'&&a[1]==='list'){process.stdout.write(JSON.stringify([{databaseId:42,headSha:sha}]));}
else if(a[0]==='api'&&a.some(x=>x.includes('/artifacts'))){process.stdout.write(JSON.stringify([{artifacts:[{id:9,name:'final-release-acceptance-evidence-42-1',expired:false}]}]));}
else if(a[0]==='api'){process.stdout.write(JSON.stringify({id:42,head_sha:sha,path:'.github/workflows/final-release-acceptance.yml',event:'workflow_dispatch',status:'completed',conclusion:'success',run_attempt:1}));}
else if(a[0]==='run'&&a[1]==='download'){const d=a[a.indexOf('--dir')+1];fs.writeFileSync(path.join(d,'final-release-staging-target-evidence.json'),JSON.stringify({expectedSha:sha,acceptanceRunId:'42',acceptanceRunAttempt:'1',mode:'staging-node-rebuild',productionEligible:false,pagesEligible:false}));}
else process.exit(86);
`;

    writeFileSync(gh, executable, { mode: 0o755 });
    for (const script of commands) {
      writeFileSync(log, "");
      assert.throws(
        () =>
          execFileSync("bash", ["-c", script], {
            cwd: root,
            env: {
              ...process.env,
              PATH: dir + ":" + process.env.PATH,
              FIXTURE_CALLS: log,
              EXPECTED_SHA: sha,
              ACCEPTED_SHA: sha,
              ACCEPTANCE_RUN_ID: "42",
              GITHUB_REPOSITORY: "luizanunciostoca/touristic-digital-platform",
              GH_TOKEN: "fixture",
            },
            stdio: ["ignore", "pipe", "pipe"],
          }),
        (error) => String(error.stderr).includes("ACCEPTANCE_MODE_GATE_FAILED"),
      );
      const calls = readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map(JSON.parse);
      assert.ok(calls.every((a) => a[0] !== "workflow"));
      assert.ok(
        calls.every(
          (a) => !a.some((v) => ["POST", "PUT", "PATCH", "DELETE"].includes(v)),
        ),
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("verification barriers are exposed under the OCI service lock before observation", () => {
  const workflow = readFileSync(
    ".github/workflows/staging-render-promotion.yml",
    "utf8",
  );
  const deploy = workflow.split("\n  deploy:\n")[1].split("\n  verify:\n")[0],
    verify = workflow.split("\n  verify:\n")[1];
  const oci = readFileSync(
    ".github/workflows/staging-oci-promotion.yml",
    "utf8",
  );
  assert.match(oci, /group: render-staging-srv-da4hb6c9v7es7386ttt0/);
  assert.match(oci, /cancel-in-progress: false/);
  for (const job of [deploy, verify]) {
    const record = job.indexOf("node-verification-barrier"),
      upload = job.indexOf("name: staging-node-verification-barrier-", record),
      observe = job.indexOf("node-verify", upload);
    assert.ok(record >= 0 && upload > record && observe > upload);
    assert.match(job.slice(record, observe), /if-no-files-found: error/);
  }
  const pages = readFileSync(
    ".github/workflows/pages-after-final-acceptance.yml",
    "utf8",
  );
  for (const job of [
    pages.split("\n  build:\n")[1].split("\n  deploy:\n")[0],
    pages.split("\n  deploy:\n")[1],
  ]) {
    const guard = job.indexOf("verify-oci-run");
    assert.ok(guard >= 0);
    const effect = job.search(
      /uses: actions\/(?:jekyll-build-pages|deploy-pages)@/,
    );
    assert.ok(effect > guard);
  }
});
