// Service worker: guarda só a casca do app (HTML, CSS, JS, fontes, ícones).
// Dados financeiros (/api) NUNCA passam pelo cache do service worker.
const V = 'insa-shell-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png',
  '/fonts/jetbrains-mono-latin-400-normal.woff2', '/fonts/jetbrains-mono-latin-600-normal.woff2',
  '/fonts/rajdhani-latin-600-normal.woff2', '/fonts/rajdhani-latin-700-normal.woff2'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // rede primeiro, cache como reserva (atualizações chegam na hora)
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(V).then((k) => k.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html'))));
});
