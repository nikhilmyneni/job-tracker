// Caches only this site's own files so the app opens fast and offline. Never caches Google, AI, job-board or /api responses.
const CACHE = 'job-hunter-v29';
const SHELL = ['/', '/app', '/privacy.html', '/config.js', '/icon.svg', '/manifest.webmanifest',
  '/css/tokens.css', '/css/app.css', '/css/landing.css',
  '/vendor/fonts/bricolage.woff2', '/vendor/fonts/instrument-sans.woff2', '/vendor/fonts/jetbrains-mono.woff2',
  '/js/ai.js', '/js/app.js', '/js/core.js', '/js/demo.js', '/js/docx.js', '/js/pdf.js', '/js/pdf-fonts.js', '/js/files.js', '/js/google.js', '/js/landing.js', '/js/notify.js', '/js/onboarding.js', '/js/sources.js', '/js/ui.js', '/js/update.js', '/js/view-applications.js', '/js/view-board.js', '/js/view-matches.js', '/js/view-settings.js', '/js/view-tailor.js'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Same-origin GETs: network first (so updates show up), cache as fallback. /app/* all serve the app page.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const key = url.pathname.startsWith('/app/') ? '/app' : e.request;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
    return res;
  }).catch(() => caches.match(key, { ignoreSearch: true })));
});
// A click on a notification opens (or focuses) Job Hunter on the right screen.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/app';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => new URL(c.url).pathname.startsWith('/app'));
    return open ? open.focus().then(c => c.navigate(url)) : self.clients.openWindow(url);
  }));
});
