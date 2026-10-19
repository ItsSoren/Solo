"use strict";
const CACHE = "solo-shell-10-5";
const SHELL = ["./", "./index.html", "./nova.css?v=10.0.0", "./planner.css?v=10.0.2", "./editor.js?v=10.0.0", "./planner-core.js?v=10.0.0", "./nova-app.js?v=10.0.1", "./planner.js?v=10.0.1", "./nova-debug.js?v=1.0.1", "./nova-ux.js?v=9.3.2", "./cloud-loader.js?v=10.0.0", "./assets/solo-mark-opal.png", "./assets/bootstrap-icons.css", "./assets/fonts/bootstrap-icons.woff2", "./manifest.webmanifest"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
// An update waits for existing tabs to close, so a form never reloads mid-edit.
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("solo-shell-") && key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (!["", "index.html", "nova.css", "planner.css", "editor.js", "planner-core.js", "nova-app.js", "planner.js", "nova-debug.js", "nova-ux.js", "cloud-loader.js", "manifest.webmanifest", "assets/solo-mark-opal.png", "assets/bootstrap-icons.css", "assets/fonts/bootstrap-icons.woff2"].includes(path)) return;
  event.respondWith(fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); } return response; }).catch(async () => (await caches.match(event.request)) || (event.request.mode === "navigate" ? caches.match("./index.html") : Response.error())));
});
self.addEventListener("notificationclick", event => { event.notification.close(); event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => { const existing = windows.find(client => client.url.startsWith(self.registration.scope)); return existing ? existing.focus() : self.clients.openWindow(self.registration.scope); })); });
