/**
 * BizManager Service Worker
 *
 * Caching strategy:
 * - STATIC assets (/_next/static/, /icons/, fonts): Cache-first
 * - Navigation requests: Network-first with offline fallback to /offline
 * - API routes (/api/*): Network-only — never cache authenticated responses
 * - All other requests: Network-first
 *
 * Business data lives in IndexedDB via Dexie — NOT in the service worker cache.
 * The service worker only caches the application shell (HTML, JS, CSS, images).
 *
 * Security: authenticated API responses are explicitly excluded from caching
 * to prevent one user's data from being served to another on shared devices.
 */

const CACHE_NAME = "bizmanager-v1";
const OFFLINE_URL = "/offline";

// Static assets to pre-cache on install.
const PRECACHE_URLS = [
  "/",
  "/offline",
  "/icons/icon.svg",
];

// ─── Install ─────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Pre-cache shell resources. Failures are non-fatal.
      await Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => null)),
      );
      // Activate immediately without waiting for existing clients to close.
      await self.skipWaiting();
    })(),
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Delete old cache versions.
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      // Take control of all open clients.
      await self.clients.claim();
    })(),
  );
});

// ─── Fetch ───────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests.
  if (request.method !== "GET") return;

  // Skip cross-origin requests.
  if (url.origin !== self.location.origin) return;

  // NEVER cache API routes — authenticated responses must not be cached.
  if (url.pathname.startsWith("/api/")) return;

  // Static Next.js assets: cache-first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|ico|woff2|woff)$/)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML navigation requests: network-first with offline fallback.
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Everything else: network-first.
  event.respondWith(networkFirst(request));
});

// ─── Strategies ──────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response("Offline", { status: 503 });
  }
}

async function networkFirstWithFallback(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Return the offline page.
    const offlinePage = await caches.match(OFFLINE_URL);
    return offlinePage ?? new Response("You are offline", { status: 503 });
  }
}
