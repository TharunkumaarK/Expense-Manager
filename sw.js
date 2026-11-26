// BUILD_ID and BUILD_ASSETS are generated from the deployment's public files.
const cachePrefix = `expense-manager:static:${self.registration.scope}:`;
const cacheName = cachePrefix + BUILD_ID;
const assets = new Set(BUILD_ASSETS.map(path => new URL(path, self.registration.scope).href));
const legacyCaches = new Set([
    'em-v2', 'em-v21', 'em-v40', 'em-v50', 'em-v60', 'em-v68', 'em-v69',
    'em-v71', 'em-v72', 'em-v73', 'em-v76', 'em-v77', 'em-v78', 'em-v79',
    'em-v80', 'em-v81', 'em-v82', 'em-v83', 'em-v85', 'em-v87', 'em-v94',
    'em-v97', 'em-v99', 'em-v103', 'em-v112', 'em-v121', 'em-v122', 'em-v123'
]);

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(cacheName);
        const requests = [...assets].map(url => new Request(url, {
            credentials: 'omit',
            redirect: 'error'
        }));
        try {
            await cache.addAll(requests);
        } catch (error) {
            await caches.delete(cacheName);
            throw error;
        }
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const scopeIsRoot = new URL(self.registration.scope).pathname === '/';
        const names = await caches.keys();
        await Promise.all(names
            .filter(name => (name.startsWith(cachePrefix) && name !== cacheName) ||
                (scopeIsRoot && legacyCaches.has(name)))
            .map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET' || request.mode === 'navigate' || !assets.has(request.url)) return;
    // Only install-time, anonymous responses for immutable build assets enter this cache.
    event.respondWith((async () => {
        const cache = await caches.open(cacheName);
        return (await cache.match(request.url)) || fetch(request);
    })());
});
