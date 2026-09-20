const CACHE_PREFIX = "morro-digital";
const STATIC_CACHE = `${CACHE_PREFIX}-static-v1`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = Object.freeze([
  OFFLINE_URL,
  "/manifest.json",
  "/pwa-register.js",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/apps/morro-digital-platform/public/styles.css",
  "/apps/morro-digital-platform/public/commerce.css",
  "/apps/morro-digital-platform/public/assistant-photo-carousel.css",
  "/apps/morro-digital-platform/public/legacy/checkpoint.css",
  "/apps/morro-digital-platform/public/legacy/index-inline.css",
  "/apps/morro-digital-platform/public/explore-locations.css",
  "/apps/morro-digital-platform/public/navigation-map.css",
  "/apps/morro-digital-platform/public/v1-tour-assistant-visibility.css",
  "/apps/morro-digital-platform/public/v1-weather-runtime-parity.css",
  "/apps/morro-digital-platform/public/premium-ux-v2.css",
  "/apps/morro-digital-platform/public/design-system-v2.css",
  "/apps/morro-digital-platform/public/privacy-preferences.css",
]);

const NETWORK_ONLY_PATHS = Object.freeze([
  "/runtime-config.js",
  "/healthz",
  "/readyz",
]);

const NETWORK_ONLY_PREFIXES = Object.freeze(["/api/"]);

const CACHEABLE_PREFIXES = Object.freeze([
  "/apps/morro-digital-platform/public/",
  "/apps/morro-digital-platform/dist/",
  "/packages/assistant/dist/",
  "/packages/core/dist/",
  "/packages/geospatial/dist/",
  "/packages/navigation/dist/",
  "/packages/search/dist/",
]);

const CACHEABLE_PATHS = new Set([
  "/manifest.json",
  "/offline.html",
  "/pwa-register.js",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
]);

function isNetworkOnly(pathname) {
  return (
    NETWORK_ONLY_PATHS.includes(pathname) ||
    NETWORK_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function isCacheableStatic(pathname) {
  return (
    CACHEABLE_PATHS.has(pathname) ||
    CACHEABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

async function cachePrecacheEntry(cache, url) {
  try {
    const response = await fetch(new Request(url, { cache: "reload" }));
    if (response.ok && response.type === "basic") {
      await cache.put(url, response);
    }
  } catch {
    // Installation remains available even when an optional shell asset is
    // temporarily unreachable. Runtime fetches can fill it later.
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    event.waitUntil(network.then(() => undefined));
    return cached;
  }

  return (await network) ?? Response.error();
}

async function networkFirstRootNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put("/", response.clone());
    }
    return response;
  } catch {
    return (
      (await caches.match("/")) ??
      (await caches.match(OFFLINE_URL)) ??
      Response.error()
    );
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(
        PRECACHE_URLS.map((url) => cachePrecacheEntry(cache, url)),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              name.startsWith(`${CACHE_PREFIX}-`) && name !== STATIC_CACHE,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isNetworkOnly(url.pathname)) return;

  if (request.mode === "navigate") {
    if (url.pathname === "/") {
      event.respondWith(networkFirstRootNavigation(request));
    }
    return;
  }

  if (isCacheableStatic(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
