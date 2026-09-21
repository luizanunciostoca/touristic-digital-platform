import type { Pool } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";

import { MySqlCheckoutAccessRepository } from "./mysql-checkout-access-repository.js";

function row(orderId: string, paymentId: string, destinationId: string) {
  return {
    order_id: orderId,
    payment_id: paymentId,
    request_fingerprint: Buffer.alloc(32, 1),
    token_hash: Buffer.alloc(32, 2),
    requester_kind: "authenticated",
    actor_subject: "admin:user",
    destination_id: destinationId,
    tenant_id: null,
    correlation_id: "corr_admin_0001",
    created_at: "2026-09-21T12:00:00.000Z",
    expires_at: "2026-09-21T13:00:00.000Z",
  };
}

describe("MySqlCheckoutAccessRepository admin destination read", () => {
  it("pages by exact canonical destination ownership", async () => {
    const execute = vi.fn(async (sql: string, parameters?: unknown[]) => {
      void sql;
      void parameters;
      return [
        [
          row("ord_admin_0001", "pay_admin_0001", "morro-de-sao-paulo"),
          row("ord_admin_0002", "pay_admin_0002", "morro-de-sao-paulo"),
        ],
        [],
      ];
    });
    const repository = new MySqlCheckoutAccessRepository({
      execute,
    } as unknown as Pool);

    const page = await repository.listByDestinationId("morro-de-sao-paulo", {
      limit: 1,
    });

    expect(page.records).toHaveLength(1);
    expect(page.records[0]).toMatchObject({
      orderId: "ord_admin_0001",
      paymentId: "pay_admin_0001",
      destinationId: "morro-de-sao-paulo",
    });
    expect(page.nextCursor).toBe("ord_admin_0001");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]).toContain("WHERE destination_id = ?");
    expect(execute.mock.calls[0]?.[0]).toContain("ORDER BY order_id");
    expect(execute.mock.calls[0]?.[1]).toEqual(["morro-de-sao-paulo", 2]);
  });

  it("uses a bounded cursor and rejects labels instead of inferring a destination", async () => {
    const execute = vi.fn(async (sql: string, parameters?: unknown[]) => {
      void sql;
      void parameters;
      return [[], []];
    });
    const repository = new MySqlCheckoutAccessRepository({
      execute,
    } as unknown as Pool);

    await repository.listByDestinationId("itacare", {
      afterOrderId: "ord_admin_0002",
      limit: 250,
    });
    expect(execute.mock.calls[0]?.[1]).toEqual([
      "itacare",
      "ord_admin_0002",
      251,
    ]);

    await expect(
      repository.listByDestinationId("Morro de São Paulo"),
    ).rejects.toThrow("ORDERING_INVALID_DESTINATION_ID");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects unbounded page sizes", async () => {
    const execute = vi.fn(async () => [[], []]);
    const repository = new MySqlCheckoutAccessRepository({
      execute,
    } as unknown as Pool);

    await expect(
      repository.listByDestinationId("morro-de-sao-paulo", { limit: 501 }),
    ).rejects.toThrow("ORDERING_ADMIN_PAGE_LIMIT_INVALID");
    expect(execute).not.toHaveBeenCalled();
  });
});
