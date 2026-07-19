# 本地開發指南

## 啟動本地伺服器

### 方法 1: Python (推薦)
```bash
cd d:/Users/文件/Project/travel_gui
python -m http.server 8000
```
然後打開: http://localhost:8000

### 方法 2: Node.js (如果安裝了)
```bash
npx http-server
```

## 開發流程

1. **編輯代碼** (index.html, itinerary.html 等)
2. **本地測試** (在瀏覽器查看效果)
3. **確認完美** (手機/電腦都試過)
4. **提交代碼**
   ```bash
   git add .
   git commit -m "描述改動"
   git push
   ```
5. **GitHub Actions 自動部署** (約 1-2 分鐘)
6. **上線確認** https://clotha16622-maker.github.io/travel_gui/

## 常見問題

Q: 本地修改後網站沒更新?
A: 按 Ctrl+Shift+R 強制清除快取

Q: GitHub Pages 網址是什麼?
A: https://clotha16622-maker.github.io/travel_gui/

Q: 多久更新一次?
A: push 後自動部署，約 1-2 分鐘
