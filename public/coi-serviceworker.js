/*! coi-serviceworker v0.1.7 - Guido Zuidhof, licensed under MIT */
/*
 * This Service Worker intercepts all fetch responses and adds the
 * Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers
 * required for SharedArrayBuffer (needed by ONNX Runtime WASM).
 *
 * On hosts that don't allow custom HTTP headers (e.g. GitHub Pages),
 * this is the standard workaround.
 */
if (typeof window === "undefined") {
  // Service Worker context
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (e) =>
    e.waitUntil(self.clients.claim()),
  );
  self.addEventListener("fetch", (e) => {
    if (
      e.request.cache === "only-if-cached" &&
      e.request.mode !== "same-origin"
    ) {
      return;
    }
    e.respondWith(
      fetch(e.request).then((response) => {
        if (response.status === 0) return response;
        const headers = new Headers(response.headers);
        headers.set("Cross-Origin-Opener-Policy", "same-origin");
        headers.set("Cross-Origin-Embedder-Policy", "require-corp");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }),
    );
  });
} else {
  // Window context — register the service worker then reload once active
  (async () => {
    if (window.crossOriginIsolated) return; // already isolated, nothing to do

    const reg = await navigator.serviceWorker.register(
      window.document.currentScript.src,
    );

    if (reg.active && !navigator.serviceWorker.controller) {
      // SW is active but page was loaded without it — reload to apply headers
      window.location.reload();
    } else if (!reg.active) {
      // Wait for the SW to activate, then reload
      const sw = reg.installing || reg.waiting;
      sw.addEventListener("statechange", () => {
        if (sw.state === "activated") window.location.reload();
      });
    }
  })();
}
