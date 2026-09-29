# 行程資料結構（data schema）

`itinerary.html` 是一個共用引擎，任何行程的長相（版面配色）由 `theme`
決定，內容結構（要吃哪些欄位）由 `schema` 決定。兩者都寫在
`data/manifest.json` 裡每個行程的條目上：

```json
{
  "filename": "kansai/itinerary.json",
  "countries": "日本（神戶・大阪）",
  "theme": "winter-night",
  "schema": "daycard"
}
```

- `theme`：`"leather"`（預設，NL/德國那種暖色皮革筆記本風格）或
  `"winter-night"`（kansai 那種深藍金聖誕夜風格）。純粹改變 CSS
  外觀，透過 `itinerary.html` 裡的 CSS 變數（`--page-bg`、
  `--accent-grad`、`--dc-*` 系列等，見 `<style>` 開頭的
  `:root` / `html[data-theme="winter-night"]` 區塊）套用，元件本身
  （day-card、flight-card、hotel-box、tabs…）都是共用的。
- `schema`：決定 `itinerary.html` 要讀取行程 JSON 裡的哪一組欄位、
  以及要不要去抓 `attractions.json` / `hotels.json` /
  `museum_card_details.json` / `transportation.json` /
  `packing-list.json` / `recommendations.json` / `random-notes.json`
  這一整套輔助資料。
  - `"legacy"`（預設，未指定時的行為，NL/德國沿用）：行程 JSON 用
    `itinerary` 陣列，每個元素是以中文欄位名為 key 的物件（`時間`、
    `地點 / 移動`、`精選景點...`、`行程細項`、`備註 / 在地指南`、
    `💡 博物館卡...`、`避暑用餐與行程推薦`），對應「簡要概覽 / 每日
    詳情 / 時間表 / 行程軌跡 / 吃喝玩樂手冊 / 大眾交通 / 打包清單 /
    隨興小筆」分頁。會載入上述整套輔助資料檔。
  - `"daycard"`（kansai 開始使用）：行程 JSON 用 `days` 陣列（見下），
    不會去抓那一整套輔助資料檔。

## daycard schema（`data/kansai/itinerary.json` 為範例）

沿用 `title` / `startDate` / `endDate` / `route`（跟 legacy schema 共用，
用於首頁卡片與行程頁最上方的票根資訊），另外新增：

```jsonc
{
  "theme": "winter-night",
  "footerNote": "❆ Kobe × Osaka Christmas Trip 2026 ❆", // 選填，顯示在卡片列表最下面
  "days": [
    {
      "day": "DAY 1",              // 顯示在卡片左上角的圓角徽章
      "date": "12/25（五）",
      "weekday": "神戶港灣浪漫一日遊", // 這天的副標題
      "blocks": [                   // 依順序渲染，混合以下兩種：
        {
          "type": "flight",
          "direction": "depart",    // "depart" -> 🛫，"return" -> 🛬
          "airline": "STARLUX 星宇航空",
          "flightNo": "JX1834",
          "from": { "code": "TPE", "time": "08:20", "name": "桃園國際機場" },
          "to":   { "code": "UKB", "time": "11:45", "name": "神戶機場" },
          "note": "..."              // 選填，航班卡下方的小字說明
        },
        {
          "type": "slot",
          "tag": "白天",             // 時段標籤（白天/上午/下午/晚上/全天/建議…自由文字）
          "html": "...可含 <b> 等安全的內嵌 HTML..."
        }
      ],
      "hotel": "神戶美利堅公園東方酒店（Kobe Meriken Park Oriental Hotel）" // 選填，永遠顯示在卡片最下面
    }
  ],
  "reminders": {                     // 選填，顯示在所有日期卡片之後
    "title": "🎁 預訂與準備提醒",
    "items": ["<b>USJ門票＋Express Pass</b>：...", "..."],
    "footnote": "※以上時間未特別註明皆為日本時間（比台灣快1小時）"
  },
  "events": {                        // 選填；有內容才會顯示「🎄 確定活動」分頁
    "subtitle": "2026/12/25 — 2026/12/28 神戶・大阪",
    "warning": { "title": "⚠️ ...", "html": "..." }, // 選填的警示卡
    "items": [
      {
        "day": "DAY 1 · 12/25",
        "title": "神戶メリケンクリスマス（Kobe Meriken Christmas）",
        "status": "confirmed",       // "confirmed" | "check"，決定徽章顏色
        "statusLabel": "✓ 確定舉辦",
        "rows": [
          { "label": "期間：", "html": "12月16日（三）～12月25日（五）" },
          { "html": "沒有 label 的整行文字也可以" }
        ],
        "source": { "label": "神戶市官方網站", "url": "https://...", "note": "選填，連結後面的補充文字" },
        "venue": "神戶美利堅公園 Meriken Park 神戶" // 選填，有填才會在標題旁加「導航」連結（見下方「一鍵導航」）
      }
    ],
    "footnote": "❆ 資料查詢日：2026-09-19，活動內容以官方最新公告為準 ❆"
  }
}
```

## 分頁的顯示/隱藏規則

`itinerary.html` 的 `applyTabVisibility()` 會在渲染完成後，依實際載入
到的資料決定要顯示哪些分頁按鈕（沒有資料的分頁按鈕直接隱藏，不會顯示
空白畫面）：

- 簡要概覽：`itinerary` 或 `days` 陣列有內容就顯示（永遠是主要分頁）
- 每日詳情／時間表／行程軌跡：只有 legacy schema 且 `itinerary` 非空才顯示
- 吃喝玩樂手冊：legacy schema 且實際有算出城市卡片才顯示
- 大眾交通／打包清單／隨興小筆：對應的輔助資料檔存在且非空才顯示
- 確定活動：`events.items` 非空才顯示

## 今天模式（stage 2）

`itinerary.html` 會在渲染完成後，把 `itinerary`（legacy）或 `days`
（daycard）正規化成同一份 `normalizedDays` 陣列（每項有 `dateISO` /
`dayNumber` / `title` / `hotelRaw` / `hotelName` / `items` / `flight`），
今天模式、日期 chip 的捲動定位／scroll-spy、"今天" 徽章都只讀這份資料，
不必個別處理兩種 schema。日期字串（例如「7/30 (四)」「12/25（五）」）
沒有年份，靠行程的 `startDate`/`endDate` 推回實際西元年份。

用網址參數 `?today=YYYY-MM-DD` 可以覆寫「今天」方便測試，例如
`itinerary.html?id=kansai/itinerary&today=2026-12-26`。

## 一鍵導航

`mapsLink(name, city)` / `navLinkHtml(name, city)` 組出 Google Maps 搜尋
連結（`https://www.google.com/maps/search/?api=1&query=...`）。只加在
「資料裡本來就有明確名稱」的地方：飯店（`hotels.json` 的 `name`/`city`，
或 daycard 行程每天的 `hotel` 字串）、`attractions.json` 的景點
（`name`/`city`）、`recommendations.json` 每筆用固定格式
「店名 (地址) - 說明」開頭、能明確切出店名的小吃/餐廳/紀念品、以及
events 項目裡選填的 `venue` 欄位。不會從自由描述文字裡憑空猜地點。

**不是可搜尋地點的情況一律不加連結**，有兩層判斷：

1. `NAV_LINK_STOPLIST`（`itinerary.html` 裡的常數）：文字包含「朋友家」
   「朋友住處」「機上」就不給連結（借宿朋友家沒有正式地址，在飛機上過夜
   不是實體地點）。之後遇到類似情況，把關鍵字加進這個陣列即可。
2. `hotels.json` 的 `type` 欄位：`type: "private"`（借宿朋友家）在
   `renderHotelCard()` 跟今天面板都會直接跳過導航連結，這是比關鍵字比對
   更明確的資料層判斷依據。
3. `extractRecommendationName()` 額外排除「候選店名裡本身就包含頓號/
   連字號」的情況（例如「海灘紀念品小物 - 說明文字（附註）」這種先講
   一段描述、後面才出現附註用括號的寫法），避免把整句描述誤判成店名。

新增行程或新增推薦資料時，如果又出現「不是真的可搜尋地點但格式看起來
像」的情況，優先在資料裡補一個明確的判斷欄位（像 `hotels.json` 的
`type`），其次才是把關鍵字加進 `NAV_LINK_STOPLIST`。

## 舊網址

`kansai.html`、`kansai-events.html` 保留為極簡的轉址頁，分別導到
`itinerary.html?id=kansai/itinerary` 與
`itinerary.html?id=kansai/itinerary&tab=events`（`?tab=` 參數會在頁面
載入完成後自動切換到對應分頁，見 `itinerary.html` 的
`DOMContentLoaded` 處理）。
