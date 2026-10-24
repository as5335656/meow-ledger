const CACHE_NAME = 'meow-ledger-cache-v3';
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// React / Babel / Recharts 等「引擎」：現在大多放在自己的 vendor/ 資料夾裡自己託管
// （只剩 Tailwind 還是吃 CDN），體積大但幾乎不會變。開 App 時主動預先存起來，
// 之後不管網路好不好都能馬上用快取，不用再等它們載完才看得到畫面。
const VENDOR_FILES = [
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
  './vendor/babel.min.js',
  './vendor/prop-types.min.js',
  './vendor/react-is.production.min.js',
  './vendor/recharts.js',
  './vendor/phosphor/bold/style.css',
  './vendor/phosphor/bold/Phosphor-Bold.woff2',
  './vendor/phosphor/fill/style.css',
  './vendor/phosphor/fill/Phosphor-Fill.woff2'
];
const VENDOR_HOSTS = ['cdn.tailwindcss.com'];
const isVendorRequest = (url) => {
  try {
    const u = new URL(url, self.location.href);
    return VENDOR_HOSTS.includes(u.hostname) || u.pathname.includes('/vendor/');
  } catch {
    return false;
  }
};

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        [...APP_SHELL, ...VENDOR_FILES].map((url) =>
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
