import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const helper = join(
  dirname(fileURLToPath(import.meta.url)),
  "crm-lead-detail-mysql.sh",
);
// Docker doubles prove process control only, never MySQL acceptance.
function run(mode, action = "start") {
  const dir = mkdtempSync(join(tmpdir(), "crm-mysql-helper-"));
  const read = (name) =>
    existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : "";
  try {
    writeFileSync(
      join(dir, "docker"),
      `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const a = process.argv.slice(2), mode = process.env.MODE, dir = process.env.FIXTURE;
const log = (name, value) => fs.appendFileSync(path.join(dir, name), value+'\\n');
log('calls', JSON.stringify(a));
const key = path.join(dir, 'count-'+a[0]);
const count = fs.existsSync(key) ? Number(fs.readFileSync(key,'utf8'))+1 : 1;
fs.writeFileSync(key, String(count));
const health = a[0] === 'inspect' && a[2] === '{{.State.Health.Status}}';
const hang = (mode === 'pull-timeout' && a[0] === 'pull') ||
 (mode === 'run-timeout' && a[0] === 'run') ||
 (mode === 'inspect-timeout' && health) ||
 (mode === 'sql-timeout-once' && a[0] === 'exec' && count === 1) ||
 (mode === 'sql-timeout-always' && a[0] === 'exec') ||
 (mode.includes('listing-timeout') && a[0] === 'ps') ||
 (mode.includes('rm-timeout') && a[0] === 'rm') ||
 (mode === 'diagnostic-timeout' && a[0] === 'logs');
if (hang) {
 log('pids', String(process.pid));
 process.on('SIGTERM', () => log('terms', String(process.pid)));
 setInterval(()=>{}, 1000); // Intentionally survives TERM: must receive KILL.
} else if ((mode === 'pull-fail' || mode.startsWith('trap-')) && a[0] === 'pull') process.exit(7);
else if (mode.includes('listing-error') && a[0] === 'ps') process.exit(9);
else if (mode === 'cleanup-fail' && a[0] === 'rm') process.exit(8);
else if (a[0] === 'ps') console.log(mode === 'absent' ? '' : 'test-container');
else if (health) console.log(mode === 'unhealthy' ? 'unhealthy' : mode === 'starting' && count === 1 ? 'starting' : 'healthy');
else if (a[0] === 'exec' && mode === 'sql-transient' && count === 1) process.exit(6);
else if (a[0] === 'exec') console.log(mode === 'wrong-sql' ? 'other_db:1' : 'morro_crm:1');
else if (a[0] === 'logs') console.log('diagnostic crm-pass redacted');
`,
      { mode: 0o755 },
    );
    // Outer readiness 4s > inner probe .4s + KILL grace .2s.
    // Record actual GNU timeout status to distinguish inner from outer expiry.
    writeFileSync(
      join(dir, "timeout"),
      `#!/usr/bin/env bash
[[ "$1" == "--kill-after=2s" ]] || { printf '%s\\n' 'EXPECTED_KILL_AFTER_2S' >&2; exit 2; }
shift
budget="$1"
shift
case "$budget" in 90s) seconds=4s ;; *) seconds=0.4s ;; esac
/usr/bin/timeout --kill-after=0.2s "$seconds" "$@"
rc=$?
printf '%s|%s|%s\\n' "$budget" "$rc" "$*" >> "$FIXTURE/timeouts"
exit "$rc"
`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(dir, "sleep"),
      "#!/usr/bin/env bash\nexec /bin/sleep 0.05\n",
      { mode: 0o755 },
    );
    const started = performance.now();
    const result = spawnSync("bash", [helper, action], {
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        MODE: mode,
        FIXTURE: dir,
        GITHUB_RUN_ID: "123",
        GITHUB_RUN_ATTEMPT: "1",
      },
      encoding: "utf8",
      timeout: 12000,
    });

    const pids = read("pids").trim().split("\n").filter(Boolean).map(Number);
    const terms = read("terms").trim().split("\n").filter(Boolean).map(Number);
    // A zombie is already dead, waiting for the container host's reaper.
    const livePids = () =>
      pids.filter((pid) => {
        try {
          return !/\) Z /.test(readFileSync(`/proc/${pid}/stat`, "utf8"));
        } catch (error) {
          if (error.code === "ENOENT") return false;
          throw error;
        }
      });
    // Outer timeout may finish before an inner timeout's KILL grace expires.
    // Allow .2s grace plus .6s scheduler margin; never silently ignore a survivor.
    const drainDeadline = performance.now() + 800;
    let live = livePids();
    while (live.length && performance.now() < drainDeadline) {
      spawnSync("/bin/sleep", ["0.02"]);
      live = livePids();
    }
    const elapsed = performance.now() - started;
    assert.deepEqual(live, [], "No surviving fixture process");
    assert.equal(result.error, undefined);
    assert.doesNotMatch(result.stdout + result.stderr, /crm-pass/);
    return {
      ...result,
      elapsed,
      pids,
      terms,
      calls: read("calls").trim().split("\n").filter(Boolean).map(JSON.parse),
      timeouts: read("timeouts"),
      output: result.stdout + result.stderr,
    };
  } finally {
    // Test hygiene even if an assertion fails; does not turn failure into PASS.
    for (const pid of read("pids")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(Number)) {
      try {
        const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
        if (!/\) Z /.test(stat)) process.kill(pid, "SIGKILL");
      } catch (error) {
        if (!["ENOENT", "ESRCH"].includes(error.code)) throw error;
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }
}
function killed(r, budget, command) {
  assert.ok(r.pids.length > 0);
  assert.ok(
    r.terms.some((pid) => r.pids.includes(pid)),
    "TERM was received and resisted",
  );
  assert.ok(r.timeouts.includes(`${budget}|137|${command}`), r.timeouts);
  assert.ok(r.elapsed >= 550 && r.elapsed < 3500, `elapsed=${r.elapsed}`);
}
test("success requires health and SQL; image, port, database and password handling preserved", () => {
  const r = run("ok");
  assert.equal(r.status, 0);
  assert.match(r.output, /MYSQL_SQL_READY/);
  const args = r.calls.find((a) => a[0] === "run");
  for (const value of [
    "--pull=never",
    "mysql:8.4",
    "127.0.0.1:3306:3306",
    "MYSQL_DATABASE=morro_crm",
  ])
    assert.ok(args.includes(value));
  assert.ok(
    r.calls.some(
      (a) => a[0] === "exec" && a.join(" ").includes("--database=morro_crm"),
    ),
  );
  assert.ok(!r.calls.some((a) => a[0] === "rm"));
  assert.ok(!args.some((a) => a.includes("crm-pass")));
});
test("pull error preserves status and stage, diagnoses and cleans", () => {
  const r = run("pull-fail");
  assert.equal(r.status, 7);
  assert.match(r.output, /MYSQL_START_FAILED stage=pull exit=7/);
  assert.ok(r.calls.some((a) => a[0] === "logs"));
  assert.ok(r.calls.some((a) => a[0] === "rm" && a.includes("--volumes")));
});
for (const [mode, budget, command, stage] of [
  ["pull-timeout", "120s", "docker pull", "pull"],
  ["run-timeout", "30s", "docker run", "create-start"],
  ["inspect-timeout", "5s", "docker inspect", "readiness"],
]) {
  test(`${mode}: individual limit KILLs TERM-resistant process and cleans`, () => {
    const r = run(mode);
    assert.equal(r.status, 137);
    killed(r, budget, command);
    assert.ok(r.output.includes(`MYSQL_START_FAILED stage=${stage} exit=137`));
    assert.ok(r.calls.some((a) => a[0] === "rm"));
    if (mode === "inspect-timeout")
      assert.match(r.output, /MYSQL_HEALTH_PROBE_FAILED exit=137/);
  });
}
test("SQL individual timeout KILLs probe, then retries successfully before outer deadline", () => {
  const r = run("sql-timeout-once");
  assert.equal(r.status, 0);
  killed(r, "5s", "docker exec");
  assert.match(r.output, /MYSQL_SQL_PROBE_FAILED exit=137/);
  assert.match(r.timeouts, /90s\|0\|bash/);
  assert.equal(r.calls.filter((a) => a[0] === "exec").length, 2);
});
for (const mode of ["sql-timeout-always", "wrong-sql"]) {
  test(`${mode}: outer readiness expires, never reports ready, cleans`, () => {
    const r = run(mode);
    assert.equal(r.status, 124);
    assert.match(r.output, /MYSQL_START_FAILED stage=readiness exit=124/);
    assert.match(r.timeouts, /90s\|124\|bash/);
    assert.doesNotMatch(r.output, /MYSQL_START_READY/);
    assert.ok(r.elapsed >= 3900 && r.elapsed < 7000);
    assert.ok(r.calls.some((a) => a[0] === "rm"));
  });
}
for (const mode of ["starting", "sql-transient"]) {
  test(`${mode} transitions to verified SQL readiness`, () => {
    const r = run(mode);
    assert.equal(r.status, 0);
    assert.match(r.output, /MYSQL_START_READY/);
    assert.equal(
      r.calls.filter((a) => a[0] === (mode === "starting" ? "inspect" : "exec"))
        .length,
      2,
    );
  });
}
test("unhealthy fails immediately", () => {
  const r = run("unhealthy");
  assert.equal(r.status, 1);
  assert.match(r.output, /MYSQL_HEALTH_UNHEALTHY/);
});
test("absent cleanup is idempotent", () => {
  const r = run("absent", "cleanup");
  assert.equal(r.status, 0);
  assert.ok(!r.calls.some((a) => a[0] === "rm"));
});
for (const [mode, status] of [
  ["listing-error", 9],
  ["listing-timeout", 137],
  ["rm-timeout", 137],
  ["cleanup-fail", 8],
]) {
  test(`${mode} cleanup propagates exact failure`, () => {
    const r = run(mode, "cleanup");
    assert.equal(r.status, status);
    if (mode.endsWith("timeout"))
      killed(
        r,
        mode === "rm-timeout" ? "10s" : "5s",
        mode === "rm-timeout" ? "docker rm" : "docker ps",
      );
    if (mode.startsWith("listing"))
      assert.ok(!r.calls.some((a) => a[0] === "rm"));
  });
}
for (const mode of [
  "trap-listing-error",
  "trap-listing-timeout",
  "trap-rm-timeout",
]) {
  test(`${mode}: cleanup failure remains visible in OR-list context`, () => {
    const r = run(mode);
    assert.equal(r.status, 7);
    assert.match(r.output, /MYSQL_CLEANUP_FAILED/);
    if (mode.endsWith("timeout"))
      killed(
        r,
        mode === "trap-rm-timeout" ? "10s" : "5s",
        mode === "trap-rm-timeout" ? "docker rm" : "docker ps",
      );
    if (mode.includes("listing"))
      assert.ok(!r.calls.some((a) => a[0] === "rm"));
  });
}
test("diagnostics KILL resistant log command within its own limit", () => {
  const r = run("diagnostic-timeout", "diagnostics");
  assert.equal(r.status, 0);
  killed(r, "5s", "docker logs");
});
