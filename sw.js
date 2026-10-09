const CACHE_NAME = 'fieldlog-v5';
const APP_SHELL = [
    './',
    './index.html',
    './css/style.css',
    './css/animate.css',
    './js/libs/jquery.js',
    './js/db.js',
    './js/app.js',
    './manifest.json',
    './img/favicon.ico',
    './img/icons/icon-72x72.png',
    './img/icons/icon-96x96.png',
    './img/icons/icon-128x128.png',
    './img/icons/icon-144x144.png',
    './img/icons/icon-152x152.png',
    './img/icons/icon-192x192.png',
    './img/icons/icon-384x384.png',
    './img/icons/icon-512x512.png',
    './img/icons/icon-maskable-192x192.png',
    './img/icons/icon-maskable-512x512.png'
];

// ---------- Instalación: precarga el app shell ----------
self.addEventListener('install', (e) => {
    const cache = caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL));
    e.waitUntil(cache);
    self.skipWaiting();
});

// ---------- Activación: limpia cachés viejas ----------
self.addEventListener('activate', (e) => {
    const activate = caches.keys().then((keys) => {
        return Promise.all(keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)));
    });
    e.waitUntil(activate);
    self.clients.claim();
});

// ---------- Fetch: Cache First con fallback a red (y offline a index) ----------
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;

    const respuesta = caches.match(e.request).then((cacheResp) => {
        if (cacheResp) {
            return cacheResp;
        }
        return fetch(e.request).then((netResp) => {
            if (netResp && netResp.ok) {
                const copia = netResp.clone();
                caches.open(CACHE_NAME).then((c) => c.put(e.request, copia));
            }
            return netResp;
        }).catch(() => {
            if (e.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
            return cacheResp;
        });
    });
    e.respondWith(respuesta);
});

// ---------- Background Sync: al volver la red, avisa a la app para sincronizar ----------
self.addEventListener('sync', (e) => {
    if (e.tag === 'fieldlog-sync') {
        e.waitUntil(notificarClientes({ tipo: 'sincronizar' }));
    }
});

function notifyClients(mensaje) {
    return self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => client.postMessage(mensaje));
    });
}

// ---------- Push: notificaciones desde el servidor ----------
self.addEventListener('push', (e) => {
    let datos = { title: 'FieldLog', body: 'Tienes una notificación nueva' };

    if (e.data) {
        try {
            datos = e.data.json();
        } catch (err) {
            datos.body = e.data.text();
        }
    }

    const opciones = {
        body: datos.body,
        icon: './img/icons/icon-192x192.png',
        badge: './img/icons/icon-72x72.png',
        data: { url: datos.url || './index.html' }
    };

    e.waitUntil(self.registration.showNotification(datos.title || 'FieldLog', opciones));
});

// ---------- Click en la notificación: abre la app ----------
self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = (e.notification.data && e.notification.data.url) || './index.html';

    e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
            for (const client of lista) {
                if ('focus' in client) return client.focus();
            }
            return self.clients.openWindow(url);
        })
    );
});
