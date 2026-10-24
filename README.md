# Serpentine — Zuma 風格遊戲雛形

以 **Vite + 原生 JavaScript** 打造的 Zuma（祖瑪）風格遊戲原型，使用 **Phaser 3.90** 渲染。此版本為第一階段：建立場景、S 型軌道、球串與滑鼠瞄準的中央砲台。

## 第一階段內容

- **800 × 600 遊戲畫布**，深色叢林綠背景（`#1a3320`）。
- **S 型 Spline 軌道**：以 `Phaser.Curves.Spline` 建立，橫貫整個畫面；軌道本體以深色凹槽繪製，中央疊加虛線作為視覺 Debug 線。
- **10 顆球串**：以固定 43 px 弧長間距排列，沿同一條 Spline 以每秒 48 px 穩定前進。
- **中央砲台**：畫面正中央（400, 300）的三角形發射台，每一幀都朝向滑鼠游標旋轉。
- **氛圍細節**：徑向叢林光暈、葉片剪影、漂浮光點、軌道起點脈衝與發光砲台底座。

## 開發指令

```bash
pnpm install
pnpm dev       # 本機開發伺服器，預設 http://localhost:5173
pnpm build     # 輸出 production build 至 dist/
pnpm preview   # 預覽 production build
```

## 專案結構

```text
zuma_web_game/
├── index.html
├── public/
│   └── favicon.svg
├── src/
│   ├── main.js               # Phaser Game 設定與啟動
│   ├── style.css             # 頁面與遊戲外框樣式
│   └── scenes/
│       └── GameScene.js      # 軌道、球串、砲台與場景視覺
├── vite.config.js
└── package.json
```

## 實作備註

- 球串位置不是用 `t` 等分，而是以**弧長**計算：每顆球距離隊首 `BALL_SPACING` 的固定距離，再透過 `getPointAt()` 映射回 Spline，因此轉彎處仍能維持固定間距。
- 隊首初始位於 `9 × 43 px` 處，讓 10 顆球在載入後立即完整可見，整串再一起沿軌道移動。
- 滑鼠位置使用 Phaser 的 `activePointer.worldX / worldY`，可正確對應 FIT 縮放後的畫布座標。

## 後續階段（尚未實作）

- 發射球與碰撞、插入球串。
- 三顆以上同色消除與連鎖計分。
- 球串抵達終點的失敗條件、關卡與音效。
