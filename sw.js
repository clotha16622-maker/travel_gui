// Service worker for the travel_gui static site.
// 部署在 GitHub Pages 的子路徑（.../travel_gui/），所以整份檔案只用「相對於
// sw.js 所在位置」的相對路徑，不能用 '/xxx' 這種絕對路徑，否則子路徑部署會
// 抓錯位置。scope 也交給註冊那一端用相對路徑 './' 指定。

const CACHE_VERSION = 'v1';
const APP_CACHE = `travel-gui-app-${CACHE_VERSION}`;
const IMG_CACHE = `travel-gui-img-${CACHE_VERSION}`;
const IMG_CACHE_MAX_ENTRIES = 60; // 跨網域圖片（例如維基百科縮圖）快取上限，避免無限長大

// 開發時用相對於 sw.js 的路徑推導出整個網站的根目錄，這樣不管部署在
// 網站根目錄還是 GitHub Pages 的 /travel_gui/ 子路徑都能正確運作
const ROOT = new URL('./', self.location).pathname;

const APP_SHELL = [
  '', // ROOT 本身（等同 index.html，多數伺服器會這樣導向）
  'index.html',
  'itinerary.html',
  'manage.html',
  'kansai.html',
  'kansai-events.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'data/manifest.json',
  'data/nl_germany/attractions.json',
  'data/nl_germany/hotels.json',
  'data/nl_germany/itinerary.json',
  'data/nl_germany/museum_card_details.json',
  'data/nl_germany/packing-list.json',
  'data/nl_germany/random-notes.json',
  'data/nl_germany/recommendations.json',
  'data/nl_germany/transportation.json',
  'data/kansai/itinerary.json'
].map(p => ROOT + p);

// 地圖分頁需要的 Leaflet（跨網域 CDN），一併預先快取，離線時至少載入不會報錯
const VENDOR_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    // 逐一 add，單一資源失敗（例如暫時連不上 CDN）不應該讓整個安裝失敗
    await Promise.all(APP_SHELL.map(async (url) => {
      try { await cache.add(url); } catch (e) { /* 忽略單一資源失敗 */ }
    }));
    await Promise.all(VENDOR_ASSETS.map(async (url) => {
      try { await cache.add(new Request(url, { mode: 'cors' })); } catch (e) { /* 忽略 */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('travel-gui-') && key !== APP_CACHE && key !== IMG_CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

// 跨網域圖片快取加上簡單的數量上限（近似 LRU：超過上限就把最早存進去的丟掉）
async function trimImageCache() {
  const cache = await caches.open(IMG_CACHE);
  const keys = await cache.keys();
  if (keys.length <= IMG_CACHE_MAX_ENTRIES) return;
  const toDelete = keys.slice(0, keys.length - IMG_CACHE_MAX_ENTRIES);
  await Promise.all(toDelete.map((req) => cache.delete(req)));
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await networkPromise) || Response.error();
}

async function cacheFirstImage(request) {
  const cache = await caches.open(IMG_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
      await trimImageCache();
    }
    return response;
  } catch (e) {
    return cached || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    // 同網域的一切（頁面、行程 JSON、之後可能新增的資料檔）都用
    // stale-while-revalidate：先給快取（若有）讓畫面秒開/離線可用，
    // 同時背景抓新版更新快取，下一次載入就會是新版，不必強制重新整理
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 跨網域圖片（目前主要是維基百科縮圖，用於「吃喝玩樂手冊」城市封面圖）：
  // cache-first 並限制快取筆數上限
  if (request.destination === 'image') {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  // 跨網域但非圖片（例如 Leaflet 的 CSS/JS、地圖圖磚）：地圖圖磚數量龐大且
  // 本來就需要即時網路，不特別快取；Leaflet 本體已經在 install 階段預先快取過，
  // 這裡用 stale-while-revalidate 讓它也能離線使用、有更新時background更新
  if (VENDOR_ASSETS.includes(request.url) || request.url.startsWith('https://unpkg.com/leaflet')) {
    event.respondWith(staleWhileRevalidate(request));
  }
  // 其他跨網域請求（例如地圖圖磚）不攔截，交給瀏覽器照常處理
});
