import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const publicUrl = new URL("../../public/", import.meta.url);

async function readPublicFile(name: string): Promise<string> {
  return readFile(new URL(name, publicUrl), "utf8");
}

describe("PWA manifest", () => {
  it("declares an installable same-origin application shell", async () => {
    const manifest = JSON.parse(
      await readPublicFile("manifest.json"),
    ) as Record<string, unknown>;

    expect(manifest.name).toBe("Morro de São Paulo Digital");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toEqual([
      expect.objectContaining({
        src: "/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      }),
      expect.objectContaining({
        src: "/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      }),
    ]);
  });
});

describe("PWA offline authority boundary", () => {
  it("keeps APIs, runtime configuration and health probes network-only", async () => {
    const worker = await readPublicFile("service-worker.js");

    expect(worker).toContain('NETWORK_ONLY_PREFIXES = Object.freeze(["/api/"])');
    expect(worker).toContain('"/runtime-config.js"');
    expect(worker).toContain('"/healthz"');
    expect(worker).toContain('"/readyz"');
    expect(worker).toContain('if (request.method !== "GET") return;');
    expect(worker).not.toMatch(/PRECACHE_URLS[\s\S]*?"\/api\//u);
  });

  it("provides a root navigation fallback without hijacking other routes", async () => {
    const worker = await readPublicFile("service-worker.js");

    expect(worker).toContain('if (url.pathname === "/")');
    expect(worker).toContain("networkFirstRootNavigation(request)");
    expect(worker).toContain("caches.match(OFFLINE_URL)");
  });
});

describe("PWA browser bootstrap", () => {
  it("links the manifest and registration script from the public document", async () => {
    const index = await readPublicFile("index.html");

    expect(index).toContain('rel="manifest"');
    expect(index).toContain('href="/manifest.json"');
    expect(index).toContain('src="/pwa-register.js"');
  });

  it("exposes update and network-state lifecycle events", async () => {
    const registration = await readPublicFile("pwa-register.js");

    expect(registration).toContain("morro:pwa-update-available");
    expect(registration).toContain("morro:network-state-changed");
    expect(registration).toContain("SKIP_WAITING");
  });
});
