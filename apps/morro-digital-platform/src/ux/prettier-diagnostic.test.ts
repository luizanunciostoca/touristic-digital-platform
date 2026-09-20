import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { format } from "../../../../node_modules/prettier/index.mjs";
import { describe, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const targets = [
  "apps/morro-digital-platform/public/design-system-v2.css",
  "apps/morro-digital-platform/public/ticketing.css",
  "apps/morro-digital-platform/public/ticketing.js",
  "apps/morro-digital-platform/public/tickets.html",
] as const;

describe("temporary Prettier diagnostic", () => {
  it("prints canonical formatting for UX V2 changed files", async () => {
    for (const path of targets) {
      const source = await readFile(repositoryRoot + path, "utf8");
      const formatted = await format(source, { filepath: path });
      console.log(
        `PRETTIER_DIAGNOSTIC_BEGIN:${path}:${Buffer.from(formatted).toString("base64")}:PRETTIER_DIAGNOSTIC_END`,
      );
    }
  });
});
