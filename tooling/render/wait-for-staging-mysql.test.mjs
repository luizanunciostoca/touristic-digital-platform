import assert from "node:assert/strict";
import test from "node:test";
import {
  parseStagingMysqlHostPort,
  stagingMysqlWaitConfiguration,
  waitForStagingMysql,
} from "./wait-for-staging-mysql.mjs";

function fixture(overrides = {}) {
  return {
    RENDER_SERVICE_NAME: "morro-digital-v2-staging",
    STAGING_MYSQL_HOSTPORT: "morro-digital-v2-staging-mysql:3306",
    STAGING_MYSQL_WAIT_TIMEOUT_MS: "5000",
    STAGING_MYSQL_WAIT_INTERVAL_MS: "100",
    STAGING_MYSQL_CONNECT_TIMEOUT_MS: "500",
    ...overrides,
  };
}

test("parses the private staging MySQL host and port", () => {
  assert.deepEqual(parseStagingMysqlHostPort(fixture()), {
    host: "morro-digital-v2-staging-mysql",
    port: 3306,
  });
});

test("rejects invalid hostport and non-staging service identity", () => {
  assert.throws(
    () =>
      parseStagingMysqlHostPort(
        fixture({ STAGING_MYSQL_HOSTPORT: "https://mysql.example:3306" }),
      ),
    /STAGING_MYSQL_HOSTPORT_INVALID/u,
  );
  assert.throws(
    () =>
      stagingMysqlWaitConfiguration(
        fixture({ RENDER_SERVICE_NAME: "morro-digital-v2" }),
      ),
    /STAGING_MYSQL_WAIT_SERVICE_DENIED/u,
  );
});

test("bounds timeout configuration", () => {
  assert.throws(
    () =>
      stagingMysqlWaitConfiguration(
        fixture({ STAGING_MYSQL_WAIT_TIMEOUT_MS: "9999999" }),
      ),
    /STAGING_MYSQL_WAIT_TIMEOUT_MS_INVALID/u,
  );
  assert.throws(
    () =>
      stagingMysqlWaitConfiguration(
        fixture({ STAGING_MYSQL_WAIT_INTERVAL_MS: "10" }),
      ),
    /STAGING_MYSQL_WAIT_INTERVAL_MS_INVALID/u,
  );
});

test("passes immediately when the private MySQL endpoint is reachable", async () => {
  const calls = [];
  const result = await waitForStagingMysql(fixture(), {
    connect: async (host, port, timeoutMs) => {
      calls.push({ host, port, timeoutMs });
    },
    sleep: async () => {},
    now: () => 1000,
  });

  assert.equal(result.status, "pass");
  assert.equal(result.attempts, 1);
  assert.equal(result.elapsedMs, 0);
  assert.deepEqual(calls, [
    {
      host: "morro-digital-v2-staging-mysql",
      port: 3306,
      timeoutMs: 500,
    },
  ]);
});

test("retries transient DNS/connect failures before passing", async () => {
  let attempt = 0;
  let clock = 0;
  const result = await waitForStagingMysql(fixture(), {
    connect: async () => {
      attempt += 1;
      if (attempt < 3) {
        const error = new Error("temporary");
        error.code = attempt === 1 ? "ENOTFOUND" : "ECONNREFUSED";
        throw error;
      }
    },
    sleep: async (milliseconds) => {
      clock += milliseconds;
    },
    now: () => clock,
  });

  assert.equal(result.status, "pass");
  assert.equal(result.attempts, 3);
  assert.equal(result.elapsedMs, 200);
});

test("fails closed after the bounded wait expires", async () => {
  let clock = 0;
  await assert.rejects(
    () =>
      waitForStagingMysql(
        fixture({
          STAGING_MYSQL_WAIT_TIMEOUT_MS: "1000",
          STAGING_MYSQL_WAIT_INTERVAL_MS: "250",
        }),
        {
          connect: async () => {
            const error = new Error("temporary");
            error.code = "ENOTFOUND";
            throw error;
          },
          sleep: async (milliseconds) => {
            clock += milliseconds;
          },
          now: () => clock,
        },
      ),
    (error) => {
      assert.equal(error.message, "STAGING_MYSQL_WAIT_TIMEOUT");
      assert.equal(error.lastErrorCode, "ENOTFOUND");
      assert.equal(error.attempts, 4);
      return true;
    },
  );
});
