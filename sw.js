// Service worker for the travel_gui static site.
// 部署在 GitHub Pages 的子路徑（.../travel_gui/），所以整份檔案只用「相對於
// sw.js 所在位置」的相對路徑，不能用 '/xxx' 這種絕對路徑，否則子路徑部署會
// 抓錯位置。scope 也交給註冊那一端用相對路徑 './' 指定。

const CACHE_VERSION = 'v3';
const APP_CACHE = `travel-gui-app-${CACHE_VERSION}`;
const IMG_CACHE = `travel-gui-img-${CACHE_VERSION}`;
const IMG_CACHE_MAX_ENTRIES = 60; // 跨網域圖片（例如維基百科縮圖）快取上限，避免無限長大

// 開發時用相對於 sw.js 的路徑推導出整個網站的根目錄，這樣不管部署在
// 網站根目錄還是 GitHub Pages 的 /travel_gui/ 子路徑都能正確運作
const ROOT = new URL('./', self.location).pathname;

// 網站本身固定的頁面／殼層資源，跟「有幾個行程」無關，可以寫死
const APP_SHELL = [
  '', // ROOT 本身（等同 index.html，多數伺服器會這樣導向）
  'index.html',
  'itinerary.html',
  'manage.html',
  'kansai.html',
  'kansai-events.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png'
].map(p => ROOT + p);

// legacy schema 的行程可能有的輔助資料檔案名稱（見 data/SCHEMA_EXTENSIONS.md）。
// daycard schema 的行程（例如 kansai）沒有這些檔案，逐一嘗試快取、抓不到就跳過，
// 不影響其他檔案，見下面 cacheOne()。
const KNOWN_AUX_FILES = [
  'attractions.json',
  'hotels.json',
  'museum_card_details.json',
  'packing-list.json',
  'random-notes.json',
  'recommendations.json',
  'transportation.json'
];

// 地圖分頁需要的 Leaflet（跨網域 CDN），一併預先快取，離線時至少載入不會報錯
const VENDOR_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// 抓單一資源並放進快取；抓不到／抓失敗就默默跳過，不丟出例外，讓呼叫端可以
// 用 Promise.all 平行處理一大批網址時，其中任何一個失敗都不會拖垮其他的
// （這點很重要：cache.addAll() 是「全部成功才算成功」，少一個選填的輔助檔案
// 就會讓整批安裝失敗；這裡逐一 cache.put() 就沒有這個問題）。
async function cacheOne(cache, url, init) {
  try {
    const response = await fetch(url, init);
    if (response && response.ok) {
      await cache.put(url, response.clone());
      return response;
    }
  } catch (e) { /* 忽略單一資源失敗 */ }
  return null;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);

    await Promise.all(APP_SHELL.map((url) => cacheOne(cache, url)));
    await Promise.all(VENDOR_ASSETS.map((url) => cacheOne(cache, url, { mode: 'cors' })));

    // 每個行程實際有哪些資料檔，從 data/manifest.json 動態算出來，而不是寫死
    // 在這個檔案裡——之後在 manifest.json 裡新增第三個行程，離線快取會自動
    // 涵蓋到，不必記得回來改 sw.js。manifest.json 本身也快取，讓「知道有哪些
    // 行程」這件事本身也能離線運作。
    const manifestUrl = ROOT + 'data/manifest.json';
    const manifestRes = await cacheOne(cache, manifestUrl, { cache: 'no-store' });
    if (manifestRes) {
      try {
        const manifest = await manifestRes.clone().json();
        const items = manifest.itineraries || [];
        const jobs = [];
        items.forEach((item) => {
          if (!item || !item.filename) return;
          const folder = item.filename.split('/')[0];
          // 行程本身的主要資料檔（例如 nl_germany/itinerary.json、kansai/itinerary.json）
          jobs.push(cacheOne(cache, ROOT + 'data/' + item.filename));
          // legacy schema 可能有的輔助資料檔；daycard schema 抓不到很正常，
          // cacheOne() 會靜默跳過，不影響其他檔案或整個安裝流程
          KNOWN_AUX_FILES.forEach((aux) => {
            jobs.push(cacheOne(cache, ROOT + `data/${folder}/${aux}`));
          });
        });
        await Promise.all(jobs);
      } catch (e) { /* manifest.json 格式有問題就跳過，不影響其餘快取 */ }
    }

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
  // 背景重新驗證一定要繞過瀏覽器自己的 HTTP cache（用 no-store），不然像
  // python -m http.server 這種沒有送 Cache-Control 的靜態伺服器，瀏覽器可能
  // 用它自己的記憶體/磁碟快取把這次 fetch 直接擋掉，結果「背景更新」抓到的
  // 還是舊內容，SW 快取永遠不會真的更新。這裡明確蓋掉 cache 選項確保一定
  // 打到網路拿最新版本。
  const networkPromise = fetch(request, { cache: 'no-store' })
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
