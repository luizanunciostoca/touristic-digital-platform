import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveStaticContentType } from "./static-content-type.mjs";

const root = resolve(process.cwd());

describe("static content type", () => {
  it("detects WebP bytes even when the frozen V1 filename ends in .jpg", async () => {
    await expect(
      resolveStaticContentType(
        resolve(root, "images/fotos/toca_do_morcego3.jpg"),
      ),
    ).resolves.toBe("image/webp");
  });

  it("keeps actual JPEG assets as image/jpeg", async () => {
    await expect(
      resolveStaticContentType(
        resolve(root, "images/fotos/toca_do_morcego1.jpg"),
      ),
    ).resolves.toBe("image/jpeg");
  });

  it("preserves normal extension mappings", async () => {
    await expect(
      resolveStaticContentType(
        resolve(root, "apps/morro-digital-platform/public/index.html"),
      ),
    ).resolves.toBe("text/html; charset=utf-8");
  });
});
