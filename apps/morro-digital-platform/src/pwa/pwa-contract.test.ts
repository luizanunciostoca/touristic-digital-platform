import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const publicUrl = new URL("../../public/", import.meta.url);
const serverUrl = new URL("../../tooling/dev-server.mjs", import.meta.url);

async function readPublicFile(name: string): Promise<string> {
  return readFile(new URL(name, publicUrl), "utf8");
}

async function readPublicBytes(name: string): Promise<Buffer> {
  return readFile(new URL(name, publicUrl));
}

function pngSize(buffer: Buffer): [number, number] {
  expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

describe("PWA manifest", () => {
  it("declares an installable same-origin application shell", async () => {
    const manifest = JSON.parse(
      await readPublicFile("manifest.json"),
    ) as Record<string, unknown>;

    expect(manifest.name).toBe("Morro Digital — Morro de São Paulo");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/assets/brand/morro-digital-symbol-v2.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/assets/brand/morro-digital-maskable-v2-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "maskable",
        }),
        expect.objectContaining({
          src: "/assets/brand/morro-digital-maskable-v2-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        }),
        expect.objectContaining({
          src: "/assets/brand/morro-digital-micro-v2.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "monochrome",
        }),
      ]),
    );
  });

  it("ships governed Brand V2 PNGs at declared install sizes", async () => {
    expect(
      pngSize(await readPublicBytes("assets/brand/morro-digital-touch-v2.png")),
    ).toEqual([180, 180]);
    expect(
      pngSize(
        await readPublicBytes("assets/brand/morro-digital-maskable-v2-192.png"),
      ),
    ).toEqual([192, 192]);
    expect(
      pngSize(
        await readPublicBytes("assets/brand/morro-digital-maskable-v2-512.png"),
      ),
    ).toEqual([512, 512]);

    const maskableSource = await readPublicFile(
      "assets/brand/morro-digital-maskable-v2.svg",
    );
    expect(maskableSource).toContain("translate(24 24) scale(0.8)");
    expect(maskableSource).toContain('fill="#F7FAFC"');
  });
});

describe("PWA offline authority boundary", () => {
  it("keeps APIs, runtime configuration and health probes network-only", async () => {
    const worker = await readPublicFile("service-worker.js");

    expect(worker).toContain(
      'NETWORK_ONLY_PREFIXES = Object.freeze(["/api/"])',
    );
    expect(worker).toContain('"/runtime-config.js"');
    expect(worker).toContain('"/healthz"');
    expect(worker).toContain('"/readyz"');
    expect(worker).toContain('if (request.method !== "GET") return;');

    const precache = worker.slice(
      worker.indexOf("const PRECACHE_URLS"),
      worker.indexOf("const NETWORK_ONLY_PATHS"),
    );
    expect(precache).not.toContain("/api/");
  });

  it("uses a versioned cache and network-first runtime assets", async () => {
    const worker = await readPublicFile("service-worker.js");

    expect(worker).toContain("static-v4");
    expect(worker).toContain("function isRuntimeAsset(pathname)");
    expect(worker).toContain("networkFirstStatic(request)");
    expect(worker).toContain("isRuntimeAsset(url.pathname)");
    expect(worker).toContain("staleWhileRevalidate(request, event)");
    expect(worker).toContain("name !== STATIC_CACHE");
    expect(worker).toContain('"/assets/brand/morro-digital-symbol-v2.svg"');
    expect(worker).toContain('"/assets/brand/morro-digital-micro-v2.svg"');
    expect(worker).toContain('"/assets/"');
    expect(worker).toContain(
      '"/assets/brand/morro-digital-maskable-v2-192.png"',
    );
    expect(worker).toContain(
      '"/assets/brand/morro-digital-maskable-v2-512.png"',
    );
    expect(worker).toContain(
      '"/apps/morro-digital-platform/public/brand-v2.css"',
    );
    expect(worker).not.toContain('"/pwa-icon-192.png"');
    expect(worker).not.toContain('"/pwa-icon-512.png"');
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
    expect(index).toContain(
      'rel="apple-touch-icon" sizes="180x180" href="/assets/brand/morro-digital-touch-v2.png"',
    );
    expect(index).toContain('src="/pwa-register.js"');
  });

  it("exposes update and network-state lifecycle events", async () => {
    const registration = await readPublicFile("pwa-register.js");

    expect(registration).toContain("morro:pwa-update-available");
    expect(registration).toContain("morro:network-state-changed");
    expect(registration).toContain("SKIP_WAITING");
  });
});

describe("PWA HTTP update contract", () => {
  it("forces service worker update checks to revalidate", async () => {
    const server = await readFile(serverUrl, "utf8");

    expect(server).toContain('requestUrl.pathname === "/service-worker.js"');
    expect(server).toContain('response.setHeader("Cache-Control", "no-cache")');
    expect(server).toContain("\"worker-src 'self' blob:\"");
  });
});
