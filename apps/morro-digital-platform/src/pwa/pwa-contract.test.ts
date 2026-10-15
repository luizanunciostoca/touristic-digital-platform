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
    expect(manifest.icons).toEqual([
      expect.objectContaining({
        src: "/assets/brand/morro-digital-maskable-v2-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      }),
      expect.objectContaining({
        src: "/assets/brand/morro-digital-maskable-v2-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      }),
    ]);
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

    expect(worker).toContain("static-v5");
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

describe("localized offline fallback", () => {
  it("loads a same-origin external script and keeps it available in the static cache", async () => {
    const html = await readPublicFile("offline.html");
    const worker = await readPublicFile("service-worker.js");
    expect(html).toContain('<script src="/offline.js" defer></script>');
    expect(html).not.toMatch(/<script>/u);
    const precache = worker.slice(
      worker.indexOf("const PRECACHE_URLS"),
      worker.indexOf("const NETWORK_ONLY_PATHS"),
    );
    const cacheable = worker.slice(
      worker.indexOf("const CACHEABLE_PATHS"),
      worker.indexOf("function isNetworkOnly"),
    );
    expect(precache).toContain('"/offline.js"');
    expect(cacheable).toContain('"/offline.js"');
  });
  async function boot(preference: string | null, storageDenied = false) {
    const { runInNewContext } = await import("node:vm");
    const html = await readPublicFile("offline.html");
    const nodes = new Map<
      string,
      {
        textContent: string;
        addEventListener: (name: string, listener: () => void) => void;
      }
    >();
    const listeners = new Map<
      string,
      (event?: { key: string | null }) => void
    >();
    let navigation: string | null = null;
    let stored = preference;
    const document = {
      documentElement: { lang: "pt-BR", dir: "ltr" },
      title: "",
      getElementById(id: string) {
        if (!nodes.has(id))
          nodes.set(id, {
            textContent: "",
            addEventListener(name, listener) {
              listeners.set(`${id}:${name}`, listener);
            },
          });
        return nodes.get(id);
      },
    };
    const navigator = { onLine: false };
    expect(html).toContain('src="/offline.js"');
    const script = await readPublicFile("offline.js");
    expect(script).toBeTruthy();
    runInNewContext(script, {
      document,
      navigator,
      localStorage: {
        getItem(key: string) {
          expect(key).toBe("morro-digital-language");
          if (storageDenied) throw new Error("denied");
          return stored;
        },
      },
      window: {
        addEventListener(name: string, listener: () => void) {
          listeners.set(name, listener);
        },
      },
      location: {
        assign(path: string) {
          navigation = path;
        },
      },
    });
    return {
      document,
      navigator,
      nodes,
      listeners,
      navigation: () => navigation,
      setPreference(value: string) {
        stored = value;
      },
    };
  }

  it.each([
    ["pt-BR", "pt-BR", "ltr", "Conteúdo offline"],
    ["en-US", "en-US", "ltr", "Offline content"],
    ["es-ES", "es-ES", "ltr", "Contenido sin conexión"],
    ["he-IL", "he-IL", "rtl", "תוכן ללא חיבור לרשת"],
  ])(
    "honors saved %s and announces reconnect without claiming service success",
    async (preference, lang, dir, title) => {
      const page = await boot(preference);
      expect(page.document.documentElement).toEqual({ lang, dir });
      expect(page.nodes.get("offline-title")?.textContent).toBe(title);
      const offline = page.nodes.get("offline-status")?.textContent;
      page.navigator.onLine = true;
      page.listeners.get("online")?.();
      expect(page.nodes.get("offline-status")?.textContent).not.toBe(offline);
      expect(page.navigation()).toBeNull();
      page.navigator.onLine = false;
      page.listeners.get("offline")?.();
      expect(page.nodes.get("offline-status")?.textContent).toBe(offline);
      page.listeners.get("offline-retry:click")?.();
      expect(page.navigation()).toBe("/");
    },
  );

  it.each([null, "fr-FR", "__proto__", "constructor"])(
    "keeps destination default for %s",
    async (preference) => {
      expect((await boot(preference)).document.documentElement.lang).toBe(
        "pt-BR",
      );
    },
  );

  it("tolerates unavailable storage and normalizes existing locale aliases", async () => {
    expect((await boot("he", true)).document.documentElement.lang).toBe(
      "pt-BR",
    );
    expect((await boot(" iw_IL ")).document.documentElement.dir).toBe("rtl");
  });

  it("reflects saved language changes from another tab", async () => {
    const page = await boot("en");
    page.setPreference("he");
    page.listeners.get("storage")?.({ key: "morro-digital-language" });
    expect(page.document.documentElement.dir).toBe("rtl");
  });
});
