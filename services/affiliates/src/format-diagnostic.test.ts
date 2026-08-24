import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "../..");
const targets = [
  "services/affiliates/src/affiliate-application-service.ts",
  "services/affiliates/src/mysql-attribution-integration.test.ts",
] as const;

describe("temporary canonical prettier diagnostic", () => {
  it("prints the exact formatter delta", () => {
    execFileSync("pnpm", ["exec", "prettier", "--write", ...targets], {
      cwd: repoRoot,
      stdio: "pipe",
    });
    const diff = execFileSync("git", ["diff", "--", ...targets], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(diff, diff).toBe("");
  });
});
