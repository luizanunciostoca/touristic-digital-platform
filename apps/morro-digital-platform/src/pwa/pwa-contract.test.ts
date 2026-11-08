import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
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

describe("PWA cache write failure boundary", () => {
  const strategies = [
    { strategy: "network-first asset", path: "/assets/test.css", mode: "cors" },
    {
      strategy: "stale-while-revalidate image",
      path: "/assets/test.png",
      mode: "cors",
    },
    { strategy: "root navigation", path: "/", mode: "navigate" },
  ];

  async function fetchThroughWorker(
    path: string,
    mode: string,
    cached: boolean,
    network: "ok" | "offline" | "error" | "opaque" = "ok",
    cacheOpenDenied = false,
    cacheReadFailures: readonly string[] = [],
  ) {
    const handlers = new Map<string, (event: unknown) => void>();
    let writes = 0;
    let fetches = 0;
    let opens = 0;
    let cacheMatches = 0;
    let globalMatches = 0;
    const readKeys: unknown[] = [];
    const globalReadKeys: string[] = [];
    const writeKeys: unknown[] = [];
    const live =
      network === "opaque"
        ? Response.error()
        : new Response("live network", {
            status: network === "error" ? 503 : 200,
            headers: { "x-pwa-test": "live-marker" },
          });
    Object.defineProperty(live, "type", {
      value: network === "opaque" ? "opaque" : "basic",
    });
    const cache = {
      put: async (key: unknown) => {
        writeKeys.push(key);
        writes += 1;
        throw new Error("FIXTURE_QUOTA_EXCEEDED");
      },
      match: async (key: unknown) => {
        readKeys.push(key);
        cacheMatches += 1;
        if (cacheReadFailures.includes("cache"))
          throw new Error("FIXTURE_CACHE_MATCH_DENIED");
        return cached ? new Response("cached fallback") : undefined;
      },
    };
    runInNewContext(await readPublicFile("service-worker.js"), {
      URL,
      Request,
      Response,
      self: {
        location: { origin: "https://morro.example" },
        addEventListener: (name: string, handler: (event: unknown) => void) =>
          handlers.set(name, handler),
      },
      caches: {
        open: async () => {
          opens += 1;
          if (cacheOpenDenied) throw new Error("FIXTURE_CACHE_OPEN_DENIED");
          return cache;
        },
        match: async (key: string) => {
          globalReadKeys.push(key);
          globalMatches += 1;
          if (cacheReadFailures.includes(key))
            throw new Error("FIXTURE_GLOBAL_MATCH_DENIED");
          return cached ? new Response("cached fallback") : undefined;
        },
      },
      fetch: async () => {
        fetches += 1;
        if (network === "offline") throw new Error("FIXTURE_OFFLINE");
        return live;
      },
    });
    let response: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    const request = {
      method: "GET",
      url: "https://morro.example" + path,
      mode,
    };
    handlers.get("fetch")!({
      request,
      respondWith: (value: Promise<Response>) => {
        response = value;
      },
      waitUntil: (value: Promise<unknown>) => pending.push(value),
    });
    const result = response ? await response : undefined;
    await Promise.all(pending);
    return {
      result,
      live,
      writes,
      fetches,
      opens,
      cacheMatches,
      globalMatches,
      request,
      readKeys,
      globalReadKeys,
      writeKeys,
    };
  }

  it.each(
    strategies.flatMap((strategy) =>
      [false, true].map((cached) => ({ ...strategy, cached })),
    ),
  )(
    "retains a successful network response after cache.put fails: $strategy cached=$cached",
    async ({ path, mode, cached, strategy }) => {
      const result = await fetchThroughWorker(path, mode, cached);
      expect(result.result?.status).toBe(200);
      expect(await result.result!.text()).toBe(
        strategy === "stale-while-revalidate image" && cached
          ? "cached fallback"
          : "live network",
      );
      expect(result.fetches).toBe(1);
      expect(result.writes).toBe(1);
    },
  );

  it.each(
    strategies.flatMap((strategy) =>
      [false, true].map((cached) => ({ ...strategy, cached })),
    ),
  )(
    "preserves the offline fallback after network failure: $strategy cached=$cached",
    async ({ path, mode, cached }) => {
      const result = await fetchThroughWorker(path, mode, cached, "offline");
      expect(result.result?.status).toBe(cached ? 200 : 0);
      expect(await result.result!.text()).toBe(cached ? "cached fallback" : "");
      expect(result.writes).toBe(0);
    },
  );

  it.each(
    strategies.flatMap((strategy) =>
      (["error", "opaque"] as const).map((network) => ({
        ...strategy,
        network,
      })),
    ),
  )(
    "does not cache or reinterpret $network network responses: $strategy",
    async ({ path, mode, network }) => {
      const result = await fetchThroughWorker(path, mode, false, network);
      expect(result.result).toBe(result.live);
      expect(result.result?.status).toBe(network === "error" ? 503 : 0);
      expect(result.writes).toBe(0);
    },
  );

  it.each(["/api/payments", "/runtime-config.js", "/healthz", "/readyz"])(
    "does not intercept network-only %s even if cache is unavailable for writes",
    async (path) => {
      const result = await fetchThroughWorker(path, "cors", true);
      expect(result.result).toBeUndefined();
      expect(result.fetches).toBe(0);
      expect(result.writes).toBe(0);
    },
  );

  it.each(
    strategies.flatMap((strategy) =>
      (["ok", "error", "opaque", "offline"] as const).map((network) => ({
        ...strategy,
        network,
      })),
    ),
  )(
    "keeps cache.open optional for $strategy with $network network",
    async ({ path, mode, strategy, network }) => {
      const result = await fetchThroughWorker(path, mode, true, network, true);
      expect(result.fetches).toBe(1);
      expect(result.writes).toBe(0);
      expect(result.cacheMatches).toBe(0);
      if (network !== "offline") {
        expect(result.result).toBe(result.live);
        expect(result.result?.status).toBe(
          network === "error" ? 503 : network === "opaque" ? 0 : 200,
        );
        expect(result.globalMatches).toBe(0);
      } else if (strategy === "root navigation") {
        expect(result.result?.status).toBe(200);
        expect(await result.result!.text()).toBe("cached fallback");
        expect(result.opens).toBe(0);
        expect(result.globalMatches).toBe(1);
      } else {
        expect(result.result?.status).toBe(0);
        expect(result.opens).toBe(1);
        expect(result.globalMatches).toBe(0);
      }
    },
  );

  it.each(
    strategies.flatMap((strategy) =>
      (["ok", "error", "opaque", "offline"] as const).map((network) => ({
        ...strategy,
        network,
      })),
    ),
  )(
    "treats rejected cache reads as misses for $strategy with $network network",
    async ({ path, mode, strategy, network }) => {
      const result = await fetchThroughWorker(
        path,
        mode,
        true,
        network,
        false,
        ["cache", "/", "/offline.html"],
      );
      expect(result.fetches).toBe(1);
      if (network === "offline") {
        expect(result.result?.status).toBe(0);
        expect(result.result?.type).toBe("error");
        expect(result.writes).toBe(0);
      } else {
        expect(result.result).toBe(result.live);
        expect(result.result?.status).toBe(
          network === "error" ? 503 : network === "opaque" ? 0 : 200,
        );
        if (network !== "opaque")
          expect(result.result?.headers.get("x-pwa-test")).toBe("live-marker");
        expect(result.writes).toBe(network === "ok" ? 1 : 0);
        if (network === "ok")
          expect(result.writeKeys).toEqual([
            strategy === "root navigation" ? "/" : result.request,
          ]);
      }
      if (strategy === "root navigation") {
        expect(result.readKeys).toEqual([]);
        expect(result.globalReadKeys).toEqual(
          network === "offline" ? ["/", "/offline.html"] : [],
        );
      } else {
        expect(result.globalReadKeys).toEqual([]);
        expect(result.readKeys).toEqual(
          strategy === "stale-while-revalidate image" || network === "offline"
            ? [result.request]
            : [],
        );
      }
    },
  );

  it.each([
    { failures: ["/"], expectedStatus: 200, keys: ["/", "/offline.html"] },
    {
      failures: ["/", "/offline.html"],
      expectedStatus: 0,
      keys: ["/", "/offline.html"],
    },
    { failures: ["/offline.html"], expectedStatus: 200, keys: ["/"] },
  ])(
    "keeps root offline lookup order after rejection: $failures",
    async ({ failures, expectedStatus, keys }) => {
      const result = await fetchThroughWorker(
        "/",
        "navigate",
        true,
        "offline",
        false,
        failures,
      );
      expect(result.result?.status).toBe(expectedStatus);
      expect(result.globalReadKeys).toEqual(keys);
      expect(result.readKeys).toEqual([]);
      expect(result.writes).toBe(0);
      if (expectedStatus === 200)
        expect(await result.result!.text()).toBe("cached fallback");
    },
  );

  it.each(["/api/payments", "/runtime-config.js", "/healthz", "/readyz"])(
    "keeps %s network-only when cache reads reject",
    async (path) => {
      const result = await fetchThroughWorker(path, "cors", true, "ok", false, [
        "cache",
        "/",
        "/offline.html",
      ]);
      expect(result.result).toBeUndefined();
      expect(result.fetches).toBe(0);
      expect(result.opens).toBe(0);
      expect(result.readKeys).toEqual([]);
      expect(result.globalReadKeys).toEqual([]);
      expect(result.writes).toBe(0);
    },
  );
});

describe("PWA offline authority boundary", () => {
  it("installs full feature styles before first intent and retains them offline after cache update", async () => {
    const origin = "https://morro.example";
    const feature =
      "/apps/morro-digital-platform/public/dist/entry-css/features.css";
    const handlers = new Map<string, (event: unknown) => void>();
    const stores = new Map<string, Map<string, Response>>([
      ["morro-digital-static-v5", new Map([[feature, new Response("old")]])],
    ]);
    const requests: string[] = [];
    const key = (request: string | Request): string =>
      new URL(typeof request === "string" ? request : request.url, origin)
        .pathname;
    let offline = false;
    let claimed = false;
    class LocalRequest extends Request {
      constructor(url: string, init?: RequestInit) {
        super(new URL(url, origin), init);
      }
    }
    runInNewContext(await readPublicFile("service-worker.js"), {
      URL,
      Request: LocalRequest,
      Response,
      self: {
        location: { origin },
        addEventListener: (name: string, handler: (event: unknown) => void) =>
          handlers.set(name, handler),
        clients: {
          claim: async () => {
            claimed = true;
          },
        },
      },
      fetch: async (request: Request) => {
        requests.push(key(request));
        if (offline) throw new Error("FIXTURE_OFFLINE");
        const response = new Response("fixture:" + key(request));
        Object.defineProperty(response, "type", { value: "basic" });
        return response;
      },
      caches: {
        open: async (name: string) => {
          if (!stores.has(name)) stores.set(name, new Map());
          const store = stores.get(name)!;
          return {
            put: async (request: string | Request, response: Response) => {
              store.set(key(request), response.clone());
            },
            match: async (request: string | Request) =>
              store.get(key(request))?.clone(),
          };
        },
        keys: async () => [...stores.keys()],
        delete: async (name: string) => stores.delete(name),
      },
    });
    for (const phase of ["install", "activate"]) {
      const pending: Promise<unknown>[] = [];
      handlers.get(phase)!({
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      });
      await Promise.all(pending);
    }
    expect(requests).toContain(feature);
    expect(stores.has("morro-digital-static-v5")).toBe(false);
    expect(claimed).toBe(true);
    offline = true;
    let response: Promise<Response> | undefined;
    handlers.get("fetch")!({
      request: new LocalRequest(feature),
      respondWith: (value: Promise<Response>) => {
        response = value;
      },
    });
    expect(response).toBeDefined();
    expect(await (await response!).text()).toBe("fixture:" + feature);
    response = undefined;
    handlers.get("fetch")!({
      request: new LocalRequest("/api/payments"),
      respondWith: (value: Promise<Response>) => {
        response = value;
      },
    });
    expect(response).toBeUndefined();
  });
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

    expect(worker).toContain("static-v6");
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
      '"/apps/morro-digital-platform/public/dist/entry-css/home.css"',
    );
    expect(worker).toContain(
      '"/apps/morro-digital-platform/public/dist/entry-css/features.css"',
    );
    expect(worker).not.toContain('"/pwa-icon-192.png"');
    expect(worker).not.toContain('"/pwa-icon-512.png"');
  });

  it("provides a root navigation fallback without hijacking other routes", async () => {
    const worker = await readPublicFile("service-worker.js");

    expect(worker).toContain('if (url.pathname === "/")');
    expect(worker).toContain("networkFirstRootNavigation(request)");
    expect(worker).toMatch(
      /(?:caches\.match\(OFFLINE_URL\)|matchRuntimeCache\(caches, OFFLINE_URL\))/u,
    );
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
