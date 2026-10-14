const CACHE_NAME = 'meow-ledger-cache-v2';
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// 這些是外部 CDN 載入的 React / Babel / 圖表等「引擎」，體積大但幾乎不會變。
// 用快取優先策略：抓過一次後，之後開 App 不必再等網路把這幾 MB 重新載一次。
const VENDOR_HOSTS = ['unpkg.com', 'cdn.tailwindcss.com'];
const isVendorRequest = (url) => {
  try {
    return VENDOR_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn('快取失敗，略過:', url, err))
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // 外部引擎（React/Babel/Tailwind/Recharts...）：快取優先，有快取就馬上給，
  // 背景再偷偷更新快取；網路很慢或不穩時也不會卡住白畫面。
  if (isVendorRequest(event.request.url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // 自己的檔案（index.html 等）：優先抱新版，只有離線/網路失敗才退回快取版本
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
