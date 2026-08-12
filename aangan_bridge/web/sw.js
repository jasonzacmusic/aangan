/* Studio Command — versioned offline shell with user-controlled updates. */
const BUILD_ID = "msqcl9k5";
const SHELL = `studio-command-shell-${BUILD_ID}`;
const RUNTIME = `studio-command-runtime-${BUILD_ID}`;
const OFFLINE_SHELL = "/__studio-command-offline-shell__";
const STABLE_ASSETS = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/nsm-white.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(STABLE_ASSETS);
      const response = await fetch(new Request("/", { cache: "reload" }));
      if (!response.ok) throw new Error("App shell unavailable");
      const html = await response.clone().text();
      await cache.put(OFFLINE_SHELL, response);
      const assetPaths = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map((match) => match[1]);
      await Promise.all(assetPaths.map(async (path) => {
        try {
          const asset = await fetch(new Request(path, { cache: "reload" }));
          if (!asset.ok) return;
          await cache.put(path, asset.clone());
          if (asset.headers.get("Content-Type")?.includes("text/css")) {
            const css = await asset.text();
            const nestedAssets = [...css.matchAll(/url\(["']?(\/assets\/[^)'"?]+)["']?\)/g)].map((match) => match[1]);
            await Promise.all([...new Set(nestedAssets)].map(async (nestedPath) => {
              const nested = await fetch(new Request(nestedPath, { cache: "reload" }));
              if (nested.ok) await cache.put(nestedPath, nested);
            }));
          }
        } catch { /* one optional asset must not block install */ }
      }));
      // Do not activate over a running recording session. The app displays a
      // refresh prompt and sends SKIP_WAITING when Jason chooses the moment.
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("studio-command-") && key !== SHELL && key !== RUNTIME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok) await (await caches.open(SHELL)).put(OFFLINE_SHELL, response.clone());
          return response;
        })
        .catch(async () => (await caches.match(OFFLINE_SHELL)) || Response.error())
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fresh = fetch(event.request)
        .then(async (response) => {
          if (response.ok) await (await caches.open(RUNTIME)).put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
