// Service worker mínimo: permite "Instalar app" en Android y Chrome. No guarda caché.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
