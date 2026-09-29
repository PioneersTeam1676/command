/* Command service worker: app shell + recent pages offline, web push, background sync for queued taps.
 * Plain JS (served from /sw.js). Bump CACHE when this file's caching rules change. */
const CACHE = "command-v1";
const OFFLINE_URL = "/offline";
// Pages worth having offline (recent calendar and status data). Never API responses.
const CACHEABLE_PAGES = [/^\/$/, /^\/calendar(\/[0-9a-f-]{36})?$/, /^\/me\/hours$/, /^\/parent(\/calendar)?$/];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function cacheablePage(url) {
  return CACHEABLE_PAGES.some((re) => re.test(url.pathname));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return; // never cache API or the worker

  // Hashed build assets and icons never change: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Page navigations: network first, fall back to the last copy, then the offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected && res.type === "basic" && cacheablePage(url)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(OFFLINE_URL)) || Response.error()),
    );
  }
});

// ---- Web push
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "Command", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Command", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target).catch(() => undefined);
          return;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// ---- Background sync for taps queued offline (same IndexedDB the page writes to)
function openQueue() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("command-offline", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("taps", { keyPath: "actionId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const idb = (db, mode, fn) =>
  new Promise((resolve, reject) => {
    const store = db.transaction("taps", mode).objectStore("taps");
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function flushQueue() {
  const db = await openQueue();
  const taps = (await idb(db, "readonly", (s) => s.getAll())).sort((a, b) => a.clientTime.localeCompare(b.clientTime));
  let synced = 0;
  for (const tap of taps) {
    const res = await fetch("/api/clock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionId: tap.actionId, action: tap.action, kind: tap.kind, eventId: tap.eventId, clientTime: tap.clientTime, queued: true }),
    }); // a thrown network error makes the sync event fail and the browser retries later
    if (res.status === 401) throw new Error("signed out");
    const json = await res.json();
    await idb(db, "readwrite", (s) => s.delete(tap.actionId));
    if (json.ok) synced++;
  }
  if (synced > 0) {
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((c) => c.postMessage({ type: "synced", count: synced }));
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "command-sync") event.waitUntil(flushQueue());
});

// ---- Sign-out: drop cached pages so the next person on a shared device can't see them.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear-caches") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"]))));
  }
});
