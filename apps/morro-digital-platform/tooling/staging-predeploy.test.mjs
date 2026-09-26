import { describe, expect, it, vi } from "vitest";

import { runStagingPredeploy } from "./staging-predeploy.mjs";

function successfulSpawn(calls) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    const listeners = new Map();
    queueMicrotask(() => listeners.get("exit")?.(0, null));
    return {
      once(event, listener) {
        listeners.set(event, listener);
        return this;
      },
    };
  };
}

describe("staging predeploy", () => {
  it("runs payments, commercial draft backfill and invariant verification in order", async () => {
    const calls = [];
    const result = await runStagingPredeploy({
      environment: {
        RENDER_SERVICE_NAME: "morro-digital-v2-staging",
      },
      spawnImpl: successfulSpawn(calls),
    });

    expect(calls).toHaveLength(10);
    expect(calls[0]?.args).toEqual([
      "apps/morro-digital-platform/tooling/payments-migrate.mjs",
    ]);
    expect(calls[1]?.args).toEqual([
      "apps/morro-digital-platform/tooling/legacy-commercial-place-backfill.mjs",
      "--apply",
    ]);
    expect(calls[2]?.args).toEqual([
      "apps/morro-digital-platform/tooling/legacy-commercial-draft-verify.mjs",
    ]);
    expect(calls[3]?.args).toEqual([
      "apps/morro-digital-platform/tooling/legacy-commercial-media-backfill.mjs",
      "--apply",
    ]);
    expect(calls[4]?.args).toEqual([
      "apps/morro-digital-platform/tooling/legacy-commercial-media-backfill.mjs",
    ]);
    expect(calls[5]?.args).toEqual([
      "apps/morro-digital-platform/tooling/legacy-commercial-description-backfill.mjs",
      "--apply",
    ]);
    expect(calls[6]?.args).toEqual([
      "apps/morro-digital-platform/tooling/legacy-commercial-description-backfill.mjs",
      "--verify",
    ]);
    expect(calls[7]?.args).toEqual([
      "apps/morro-digital-platform/tooling/legacy-commercial-publication-readiness.mjs",
    ]);
    expect(calls[8]?.args).toEqual([
      "apps/morro-digital-platform/tooling/legacy-commercial-review-transition.mjs",
      "--apply",
    ]);
    expect(calls[9]?.args).toEqual([
      "apps/morro-digital-platform/tooling/legacy-commercial-review-transition.mjs",
      "--verify",
    ]);
    expect(result).toEqual({
      contract: "MORRO-STAGING-PREDEPLOY",
      status: "pass",
      steps: [
        "payments-migrate",
        "legacy-commercial-draft-backfill",
        "legacy-commercial-draft-verify",
        "legacy-commercial-media-backfill-apply",
        "legacy-commercial-media-backfill-verify",
        "legacy-commercial-description-backfill-apply",
        "legacy-commercial-description-backfill-verify",
        "legacy-commercial-publication-readiness-audit",
        "legacy-commercial-review-transition-apply",
        "legacy-commercial-review-transition-verify",
      ],
    });
  });

  it("fails closed outside canonical staging", async () => {
    await expect(
      runStagingPredeploy({
        environment: {
          RENDER_SERVICE_NAME: "morro-digital-v2",
        },
        spawnImpl: vi.fn(),
      }),
    ).rejects.toThrow(/STAGING_PREDEPLOY_SERVICE_DENIED/u);
  });

  it("does not start later steps when an earlier step fails", async () => {
    const calls = [];
    const spawnImpl = (command, args, options) => {
      calls.push({ command, args, options });
      const listeners = new Map();
      queueMicrotask(() => listeners.get("exit")?.(1, null));
      return {
        once(event, listener) {
          listeners.set(event, listener);
          return this;
        },
      };
    };

    await expect(
      runStagingPredeploy({
        environment: {
          RENDER_SERVICE_NAME: "morro-digital-v2-staging",
        },
        spawnImpl,
      }),
    ).rejects.toThrow(/STAGING_PREDEPLOY_STEP_FAILED/u);
    expect(calls).toHaveLength(1);
  });
});
