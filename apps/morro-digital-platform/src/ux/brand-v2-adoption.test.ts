import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function read(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

describe("Brand V2 product adoption", () => {
  it("publishes the canonical governed vectors without runtime drift", async () => {
    const [
      canonicalMorroSymbol,
      canonicalMorroMicro,
      canonicalTdpSymbol,
      canonicalTdpMicro,
      runtimeMorroSymbol,
      runtimeMorroMicro,
      runtimeTdpSymbol,
      runtimeTdpMicro,
      legacyMorroMark,
    ] = await Promise.all([
      read(
        "../../../../packages/design-system/src/brand/v2/assets/morro-symbol.svg",
      ),
      read(
        "../../../../packages/design-system/src/brand/v2/assets/morro-micro.svg",
      ),
      read(
        "../../../../packages/design-system/src/brand/v2/assets/tdp-symbol.svg",
      ),
      read(
        "../../../../packages/design-system/src/brand/v2/assets/tdp-micro.svg",
      ),
      read("../../public/assets/brand/morro-digital-symbol-v2.svg"),
      read("../../public/assets/brand/morro-digital-micro-v2.svg"),
      read("../../public/assets/brand/tdp-symbol-v2.svg"),
      read("../../public/assets/brand/tdp-micro-v2.svg"),
      read("../../public/assets/morro-digital-mark.svg"),
    ]);

    expect(runtimeMorroSymbol.trim()).toBe(canonicalMorroSymbol.trim());
    expect(runtimeMorroMicro.trim()).toBe(canonicalMorroMicro.trim());
    expect(runtimeTdpSymbol.trim()).toBe(canonicalTdpSymbol.trim());
    expect(runtimeTdpMicro.trim()).toBe(canonicalTdpMicro.trim());
    expect(legacyMorroMark.trim()).toBe(canonicalMorroMicro.trim());
  });

  it("adopts Morro Digital V2 in public metadata and PWA identity", async () => {
    const [html, manifestSource, css, touristShell] = await Promise.all([
      read("../../public/index.html"),
      read("../../public/manifest.json"),
      read("../../public/brand-v2.css"),
      read("../../public/tourist-shell-v2.css"),
    ]);
    const manifest = JSON.parse(manifestSource) as {
      name: string;
      short_name: string;
      theme_color: string;
      background_color: string;
      icons: Array<{ src: string; type: string }>;
    };

    expect(html).toContain("<title>Morro Digital — Morro de São Paulo</title>");
    expect(html).toContain('content="#0867b2"');
    expect(html).toContain("/assets/brand/morro-digital-micro-v2.svg");
    expect(html).toContain("/apps/morro-digital-platform/public/brand-v2.css");
    expect(html).not.toContain("/pwa-icon-192.png");

    expect(manifest.name).toBe("Morro Digital — Morro de São Paulo");
    expect(manifest.short_name).toBe("Morro Digital");
    expect(manifest.theme_color).toBe("#0867b2");
    expect(manifest.background_color).toBe("#f7fafc");
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      "/assets/brand/morro-digital-maskable-v2-192.png",
      "/assets/brand/morro-digital-maskable-v2-512.png",
    ]);
    expect(
      manifest.icons
        .filter((icon) => icon.type === "image/png")
        .map((icon) => icon.src),
    ).toEqual([
      "/assets/brand/morro-digital-maskable-v2-192.png",
      "/assets/brand/morro-digital-maskable-v2-512.png",
    ]);

    expect(css).toContain("--brand-platform-coral: #fa7951");
    expect(css).toContain("--brand-destination-morro-cobalt: #0867b2");
    expect(css).toContain('url("/assets/brand/morro-digital-symbol-v2.svg")');
    expect(touristShell).toContain(
      'body[data-md-mode="discover"] .md-home-title-block',
    );
    expect(touristShell).toContain("clip-path: inset(50%)");
    expect(touristShell).toContain("opacity: 0");
  });

  it("renders the governed Morro mark instead of a literal placeholder", async () => {
    const shell = await read("../layouts/app-shell.ts");

    expect(shell).toContain('src="/assets/brand/morro-digital-symbol-v2.svg"');
    expect(shell).not.toContain(
      '<span class="md-home-brand-mark" aria-hidden="true">M</span>',
    );
  });

  it("covers commerce and partner surfaces with the destination identity", async () => {
    const [tickets, booking, affiliate, dashboard, onboarding] =
      await Promise.all([
        read("../../public/tickets.html"),
        read("../../public/tour-booking.html"),
        read("../../public/affiliate-portal.html"),
        read("../../public/business-dashboard.html"),
        read("../../public/business-onboarding.html"),
      ]);

    for (const surface of [
      tickets,
      booking,
      affiliate,
      dashboard,
      onboarding,
    ]) {
      expect(surface).toContain(
        "/apps/morro-digital-platform/public/brand-v2.css",
      );
    }

    expect(affiliate).toContain("/assets/brand/morro-digital-symbol-v2.svg");
    expect(affiliate).toContain("<strong>Morro Digital</strong>");
    expect(dashboard).toContain("/assets/brand/morro-digital-symbol-v2.svg");
    expect(dashboard).toContain('<span class="eyebrow">Morro Digital</span>');
    expect(onboarding).toContain(
      "<title>Morro Digital — Morro Pro Onboarding</title>",
    );
  });

  it("uses destination branding in CRM and master branding in Control Center", async () => {
    const [crm, controlCenter, controlCenterCss] = await Promise.all([
      read("../../../admin-crm/public/index.html"),
      read("../../../control-center/public/index.html"),
      read("../../../control-center/public/control-center-shell-v1.css"),
    ]);

    expect(crm).toContain(
      "/apps/morro-digital-platform/public/assets/brand/morro-digital-symbol-v2.svg",
    );
    expect(controlCenter).toContain(
      "<title>Touristic Digital Platform — Control Center</title>",
    );
    expect(controlCenter).toContain(
      "/apps/morro-digital-platform/public/assets/brand/tdp-symbol-v2.svg",
    );
    expect(controlCenter).toContain(
      '<span class="brand-wordmark__name">Touristic Digital Platform</span>',
    );
    expect(controlCenterCss).toContain("--md-text: #07152f");
    expect(controlCenterCss).toContain("--md-primary: #056fb5");
  });

  it("keeps product adoption separate from production publication", async () => {
    const changeset = JSON.parse(
      await read("../../../../.morro/changesets/MD-BRAND-ADOPTION-001.json"),
    ) as { state: string; stopAt: string };

    expect([
      "IMPLEMENTING",
      "LOCAL_PROVEN",
      "REMOTE_PROVEN",
      "COMPOSITION_PROVEN",
      "POLICY_SATISFIED",
      "MERGE_READY",
    ]).toContain(changeset.state);
    expect(changeset.stopAt).toBe("REMOTE_PROVEN");
  });
});
