import type { Pool } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";

import { applyNotificationsSchema } from "./index.js";
import { notificationsSchemaStatements } from "./schema.js";

describe("applyNotificationsSchema", () => {
  it("executes each schema statement separately without enabling multi-statements", async () => {
    const query = vi.fn().mockResolvedValue([[], []]);
    const pool = { query } as unknown as Pool;

    await applyNotificationsSchema(pool);

    expect(query).toHaveBeenCalledTimes(notificationsSchemaStatements.length);
    for (const [index, statement] of notificationsSchemaStatements.entries()) {
      expect(query).toHaveBeenNthCalledWith(index + 1, statement);
      expect(statement).not.toMatch(/;\s*CREATE TABLE/u);
    }
  });
});
