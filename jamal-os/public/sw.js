// Minimal service worker: makes Jamal OS installable as a PWA.
// Deliberately no caching: every page shows live local data, and a
// stale cached brief would violate the "tell the truth" rule.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
