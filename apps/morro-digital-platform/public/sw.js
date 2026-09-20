const CACHE_PREFIX = "morro-digital-shell";
const CACHE_VERSION = "v1";
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;

const APP_SHELL = Object.freeze([
  "/",
  "/manifest.webmanifest",
  "/icons/morro-digital-192.png",
  "/icons/morro-digital-512.png",
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
  "/apps/morro-digital-platform/public/assistant-input-v1-parity.js",
  "/apps/morro-digital-platform/public/pwa-runtime.js",
  "/apps/morro-digital-platform/dist/browser-entry.js",
]);

const SAFE_STATIC_PREFIXES = Object.freeze([
  "/apps/morro-digital-platform/public/",
  "/apps/morro-digital-platform/dist/",
  "/packages/assistant/dist/",
  "/packages/core/dist/",
  "/packages/geospatial/dist/",
  "/packages/navigation/dist/",
  "/packages/search/dist/",
  "/images/",
  "/icons/",
]);

const NEVER_CACHE_PREFIXES = Object.freeze([
  "/api/",
  "/proposals/",
  "/contracts/",
  "/dashboard/",
]);

function isCacheableRequest(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return false;
  }

  if (
    url.pathname === "/runtime-config.js" ||
    NEVER_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    return false;
  }

  return (
    url.pathname === "/" ||
    url.pathname === "/manifest.webmanifest" ||
    SAFE_STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;

    if (request.mode === "navigate") {
      const shell = await cache.match("/");
      if (shell) return shell;
    }

    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!isCacheableRequest(event.request, url)) return;
  event.respondWith(networkFirst(event.request));
});
