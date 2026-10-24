# Serpentine — Zuma 風格遊戲雛形

以 **Vite + 原生 JavaScript** 打造的 Zuma（祖瑪）風格遊戲原型，使用 **Phaser 3.90** 渲染。第三階段已完成核心玩法：軌道球串、滑鼠瞄準、射擊、球串插入與推擠、同色三消。

## 第一階段：場景與球串

- **800 × 600 遊戲畫布**，深色叢林綠背景（`#1a3320`）。
- **S 型 Spline 軌道**：以 `Phaser.Curves.Spline` 建立，橫貫整個畫面；軌道本體以深色凹槽繪製，中央疊加虛線作為視覺 Debug 線。
- **10 顆球串**：以固定 43 px 弧長間距排列，沿同一條 Spline 以每秒 48 px 穩定前進。
- **中央砲台**：畫面正中央（400, 300）的三角形發射台，每一幀都朝向滑鼠游標旋轉。
- **氛圍細節**：徑向叢林光暈、葉片剪影、漂浮光點、軌道起點脈衝與發光砲台底座。

## 第二階段：射擊與碰撞

- **點擊射擊**：在畫布上按滑鼠左鍵，砲台會朝「點擊瞬間」的游標方向發射一顆彩色球。
- **等速直線飛行**：子彈以每秒 520 px 的固定速度前進，發射方向在點擊時鎖定，不受之後滑鼠移動影響。
- **碰撞偵測**：在 `update()` 中逐幀檢查子彈與軌道球串的圓形碰撞，命中時輸出 `Hit!`。

## 第三階段：插入、推擠與三消

- **待發射球狀態**：場景保存 `currentBulletColor` 與 `nextBulletColor`。砲口有一顆由 `currentBulletColor` 驅動的指示球，會跟著砲台旋轉；發射後立即用 `nextBulletColor` 遞補並更新指示球。
- **插入方向判定**：碰撞時使用「撞擊點相對目標球的角度」與該處軌道切線比較，決定插入目標球陣列索引的前方或後方。
- **PathFollower 球串**：每顆軌道球都是 `Phaser.GameObjects.PathFollower`，以 `marble.t` 手動控制它在 Spline 上的弧長位置。子彈本身也是 PathFollower，命中後直接綁定 `t` 並加入 `marbles` 陣列。
- **直徑推擠**：`deltaT = BALL_DIAMETER / trackLength`。插入點後方的所有球，其 `t` 會精確減去一個 `deltaT`，再用 `getPointAt(t)` 更新座標。
- **防止重疊**：推擠後執行間距校正；若尾端被推出 t < 0，整串會往前平移不足的距離，使所有 `t` 保持在 0–1 且任兩球中心距至少為一顆球的直徑。
- **時序控制**：先完成推擠與座標更新，才觸發同色掃描。三消達到 3 顆以上時先一次性 `splice` 移除陣列元素，再播放放大淡出動畫，動畫結束後 `destroy()` 精靈。
- **遊戲回饋**：插入漣漪、消除爆裂粒子、剩餘球數 HUD。
- **可立即測試**：球串最前方預先放了兩顆同色（金色）球，`currentBulletColor` 初始也是金色，將第一發插在兩顆金球旁即可立刻觸發三消。

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
│       └── GameScene.js      # 軌道、球串、射擊、插入推擠與三消
├── vite.config.js
└── package.json
```

## 實作備註

- 球串陣列由隊首排到隊尾，`t` 由大到小。`getPointAt()` 採弧長映射，因此固定 `Δt` 即等於固定像素間距。
- 初始球串維持 43 px 的視覺間距；插入推擠則採嚴格的一顆球直徑（36 px）作為 `deltaT`，因此插入處會形成剛好相切的球距。
- 插入時先完成方向判定與推擠，再將 PathFollower `splice` 進陣列；座標同步完成後才進行同色掃描。
- 三消掃描使用 `while` 先找出完整連續區段，確認長度後只做一次 `splice`；不會在走訪陣列的同時刪除元素。
- 被消除的球會立即退出碰撞與更新陣列，精靈則在縮放淡出動畫的 `onComplete` 中銷毀。
- 滑鼠位置使用 Phaser 的 `activePointer.worldX / worldY`，可正確對應 FIT 縮放後的畫布座標。
- 子彈與球的碰撞採兩圓半徑相加的平方距離比較，避免每幀開根號。
- 目前消除後留下的球串間距不會自動閉合；後續可再加入補位、連鎖掉落與失敗條件。
