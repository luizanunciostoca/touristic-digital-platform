import { describe, expect, it, vi } from "vitest";

import { MySqlVerifiedPaymentResultFeed } from "./mysql-verified-payment-result-feed.js";

const cursor = {
  recordedAt: "2026-10-14T01:47:00.000Z",
  resultId: "fev_limit_resume_0001",
};

function setup() {
  const execute = vi.fn().mockResolvedValue([[], []]);
  const feed = new MySqlVerifiedPaymentResultFeed({ execute } as never);
  return { execute, feed };
}

describe("verified financial result feed prepared LIMIT compatibility", () => {
  for (const current of [null, cursor]) {
    describe(current ? "resume cursor" : "initial page", () => {
      it.each([1, 100, 500])(
        "binds bounded limit %i without a numeric wire parameter",
        async (limit) => {
          const { execute, feed } = setup();
          await expect(feed.listAfter(current, limit)).resolves.toEqual([]);
          const parameters = current
            ? [
                new Date(current.recordedAt),
                new Date(current.recordedAt),
                current.resultId,
                String(limit),
              ]
            : [String(limit)];
          expect(execute).toHaveBeenCalledTimes(1);
          expect(execute).toHaveBeenCalledWith(
            expect.stringMatching(
              /ORDER BY recorded_at ASC, result_id ASC\s+LIMIT \?/u,
            ),
            parameters,
          );
        },
      );
    });
  }

  it.each([
    0,
    -1,
    1.5,
    501,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    "100; DROP TABLE financial_payment_results",
  ])("rejects invalid limit %s before executing SQL", async (limit) => {
    const { execute, feed } = setup();
    await expect(feed.listAfter(null, limit as number)).rejects.toThrow(
      "FINANCIAL_PAYMENT_RESULT_FEED_LIMIT_INVALID",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("propagates database failures instead of reporting an empty successful feed", async () => {
    const { execute, feed } = setup();
    const failure = Object.assign(new Error("DATABASE_READ_FAILED"), {
      code: "ER_TABLEACCESS_DENIED_ERROR",
    });
    execute.mockRejectedValueOnce(failure);
    await expect(feed.listAfter(null, 100)).rejects.toBe(failure);
  });
});
