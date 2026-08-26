import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Mercado Pago Card Brick CSP", () => {
  it("allows only the observed official Brick component and API origins", async () => {
    const source = await readFile(
      new URL("../tooling/dev-server.mjs", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      "script-src 'self' 'unsafe-inline' https://unpkg.com https://api.mapbox.com https://sdk.mercadopago.com https://http2.mlstatic.com",
    );
    expect(source).toContain(
      "connect-src 'self' https://api.mapbox.com https://*.tiles.mapbox.com https://api.mercadopago.com https://*.mercadopago.com https://*.mercadopago.com.br https://http2.mlstatic.com https://api.mercadolibre.com",
    );
    expect(source).not.toContain("script-src *");
    expect(source).not.toContain("connect-src *");
  });
});
