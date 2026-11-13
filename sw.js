// Lets HowLocal open without a connection once it's on the home screen.
// It always asks the network first, so updates show up right away. The saved copy is used only
// when the network fails. Listing files are saved as they are viewed.
const CACHE = "howlocal-v1";

const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/app.js",
  "js/config.js",
  "js/categories.js",
  "js/deck.js",
  "js/geo.js",
  "js/install.js",
  "js/places.js",
  "js/store.js",
  "js/ui.js",
  "data/places/index.json",
  "assets/favicon.png",
  "assets/icon-192.png",
  "assets/apple-touch-icon.png",
  "assets/fonts/poppins-latin-500-normal.woff2",
  "assets/fonts/poppins-latin-600-normal.woff2",
  "assets/fonts/poppins-latin-800-normal.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const page = request.mode === "navigate";
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(page ? "index.html" : request, copy));
        }
        return response;
      })
      .catch(async () => {
        const saved = await caches.match(page ? "index.html" : request);
        return saved || Response.error();
      }),
  );
});
