/**
 * BizManager service worker — v3
 *
 * SECURITY: this worker must never store private business data.
 * Earlier versions cached every successful HTML navigation and GET, which put
 * authenticated pages (dashboard, sales, accounts) and RSC payloads into
 * CacheStorage where they survived sign-out and could be read by the next
 * person on a shared device.
 *
 * Policy now:
 *   - Static, public, content-hashed assets (/_next/static, icons, fonts): cache-first.
 *   - Navigations: network only. If the network fails, serve the generic
 *     /offline page (public, contains no business data).
 *   - Everything else (API calls, RSC payloads, HTML, anything with cookies):
 *     NOT intercepted — it goes straight to the network.
 *
 * Offline selling does not depend on cached pages: the POS keeps its catalogue
 * and queued sales in IndexedDB (cleared on sign-out; see dexie.ts).
 */
const VERSION = "v3";
const STATIC_CACHE = `bm-static-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { credentials: "omit" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // Delete EVERY cache from older versions — they may hold private pages.
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isPublicStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:woff2?|ttf|otf)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached ?? new Response("You are offline.", { status: 503 });
      }),
    );
    return;
  }

  if (isPublicStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
  }
  // All other requests are deliberately not handled.
});

// The app asks us to drop everything on sign-out.
self.addEventListener("message", (event) => {
  if (event.data === "CLEAR_CACHES") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});
