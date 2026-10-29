// Caches only this site's own files so the app opens fast and offline. Never caches Google or AI responses.
const CACHE = 'job-tracker-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'config.js', 'icon.svg', 'manifest.webmanifest',
  'js/app.js', 'js/core.js', 'js/ui.js', 'js/google.js', 'js/ai.js', 'js/update.js', 'js/files.js', 'js/docx.js',
  'js/dashboard.js', 'js/settings.js', 'js/onboarding.js', 'js/resume-view.js', 'js/demo.js'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Same-origin GETs: network first (so updates show up), cache as fallback.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
