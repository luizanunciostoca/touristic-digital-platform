import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const appPublic = new URL("../public/", import.meta.url);

describe("Brand Family V2 runtime application", () => {
  it("pins the Morro V2 PWA identity and maskable icon contract", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("manifest.json", appPublic), "utf8"),
    ) as {
      name: string;
      background_color: string;
      theme_color: string;
      icons: Array<{ src: string; purpose: string }>;
    };

    expect(manifest.name).toBe("Morro Digital — Morro de São Paulo");
    expect(manifest.background_color).toBe("#F7FAFC");
    expect(manifest.theme_color).toBe("#0867B2");
    expect(manifest.icons).toEqual([
      {
        src: "/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/pwa-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ]);
  });

  it.each([
    [
      "pwa-icon-192.png",
      "a2391713e3b6467d1795e4e26522aeb2df2edb4031dee39609c432900469311e",
    ],
    [
      "pwa-icon-512.png",
      "5044eb44376894f0a5593dc4cc5ed542149b5f8cbd75847e1c0ec2f372d123df",
    ],
    [
      "pwa-maskable-192.png",
      "4727dbe9505cdfcaf3c9ad33f25d4c9100525a22ffd5d28598c707e3f209ae9f",
    ],
    [
      "pwa-maskable-512.png",
      "8845a7f5b3ad3a3dc8bd1a5b05dc1af402388860f20277bbccfb819742a97d1d",
    ],
    [
      "apple-touch-icon.png",
      "da1140a69b2b9bc46616537947a0ef7372e9902c661b2ff046735e3311e03927",
    ],
  ] as const)("pins %s to the governed V2 bytes", async (path, expected) => {
    expect(sha256(await readFile(new URL(path, appPublic)))).toBe(
      expected,
    );
  });

  it("uses the V2 micro mark in the traveler shell and offline cache", async () => {
    const mark = await readFile(
      new URL("assets/morro-digital-mark.svg", appPublic),
      "utf8",
    );
    const canonicalMicro = await readFile(
      new URL(
        "../../../packages/design-system/src/brand/v2/assets/morro-micro.svg",
        import.meta.url,
      ),
      "utf8",
    );
    const serviceWorker = await readFile(
      new URL("service-worker.js", appPublic),
      "utf8",
    );

    expect(mark.trim()).toBe(canonicalMicro.trim());
    expect(serviceWorker).toContain("morro-digital-static-v3");
    expect(serviceWorker).toContain("/pwa-maskable-512.png");
    expect(serviceWorker).toContain("/brand/morro-digital-symbol.svg");
  });

  it("applies destination and platform brands to representative product surfaces", async () => {
    const traveler = await readFile(new URL("index.html", appPublic), "utf8");
    const business = await readFile(
      new URL("business-dashboard.html", appPublic),
      "utf8",
    );
    const affiliate = await readFile(
      new URL("affiliate-portal.html", appPublic),
      "utf8",
    );
    const login = await readFile(
      new URL("../../../dashboard/login.html", import.meta.url),
      "utf8",
    );
    const crm = await readFile(
      new URL("../../admin-crm/public/index.html", import.meta.url),
      "utf8",
    );
    const controlCenter = await readFile(
      new URL("../../control-center/public/index.html", import.meta.url),
      "utf8",
    );

    for (const html of [traveler, business, affiliate, login, crm]) {
      expect(html).toContain("brand/brand-v2.css");
      expect(html).toContain("morro-digital-symbol.svg");
    }

    expect(traveler).toContain("Morro Digital — Morro de São Paulo");
    expect(login).not.toContain('class="logo" aria-hidden="true">M</div>');
    expect(controlCenter).toContain(
      "Touristic Digital Platform — Control Center",
    );
    expect(controlCenter).toContain("brand/tdp-symbol.svg");
    expect(controlCenter).not.toContain(
      'aria-label="Morro Digital Control Center"',
    );
  });

  it("scopes the new Morro palette to the destination theme", async () => {
    const css = await readFile(
      new URL("design-system-v2.css", appPublic),
      "utf8",
    );
    const match = css.match(
      /\[data-destination-theme="morro"\]\s*\{(?<body>[\s\S]*?)\n\s*\}/u,
    );

    expect(match?.groups?.body).toContain("--md-color-brand-primary: #0867b2");
    expect(match?.groups?.body).toContain("--md-color-accent: #ea3c89");
    expect(match?.groups?.body).toContain("--md-focus-ring-color: #19b6d8");
  });
});
