# Serpentine — Zuma 風格遊戲雛形

以 **Vite + 原生 JavaScript** 打造的 Zuma（祖瑪）風格遊戲原型，使用 **Phaser 3.90** 渲染。已完成軌道球串、滑鼠瞄準、射擊、插入推擠、同色三消，以及磁吸連鎖、全域減速與爆炸回饋。

## 第一階段：場景與球串

- **800 × 600 遊戲畫布**，深色叢林綠背景（`#1a3320`）。
- **S 型 Spline 軌道**：以 `Phaser.Curves.Spline` 建立，橫貫整個畫面；軌道本體以深色凹槽繪製，中央疊加虛線作為視覺 Debug 線。
- **10 顆球串**：以球體直徑 `deltaT` 緊密排列，沿同一條 Spline 穩定前進。
- **中央砲台**：畫面正中央（400, 300）的三角形發射台，每一幀都朝向滑鼠游標旋轉。
- **氛圍細節**：徑向叢林光暈、葉片剪影、漂浮光點、軌道起點脈衝與發光砲台底座。

## 第二階段：射擊與碰撞

- **點擊射擊**：在畫布上按滑鼠左鍵，砲台會朝「點擊瞬間」的游標方向發射一顆彩色球。
- **等速直線飛行**：子彈以每秒 520 px 的固定速度前進，發射方向在點擊時鎖定，不受之後滑鼠移動影響。
- **碰撞偵測**：在 `update()` 中逐幀檢查子彈與軌道球串的圓形碰撞，命中時輸出 `Hit!`。

## 第三階段：插入、推擠與三消

- **五色高對比調色盤**：`MARBLE_COLORS` 僅保留紅 `#FF3366`、藍 `#33CCFF`、黃 `#FFCC00`、綠 `#33FF55`、紫 `#B84DFF` 五色；`INITIAL_CHAIN_COLORS` 的索引全部落在 0–4。
- **待發射球狀態**：場景保存 `currentBulletColor` 與 `nextBulletColor`。砲台正中央 `(0, 0)` 有一顆 `scale 0.75` 的核心寶石，由 `currentBulletColor` 驅動並跟著砲台旋轉；發射後立即用 `nextBulletColor` 遞補並更新寶石顏色。
- **插入方向判定**：碰撞時使用「撞擊點相對目標球的角度」與該處軌道切線比較，決定插入目標球陣列索引的前方或後方。
- **PathFollower 球串**：每顆軌道球都是 `Phaser.GameObjects.PathFollower`，以 `marble.t` 手動控制它在 Spline 上的弧長位置。子彈本身也是 PathFollower，命中後直接綁定 `t` 並加入 `marbles` 陣列。
- **空隙吸收推擠 (Cascade Push)**：`deltaT = BALL_DIAMETER / trackLength`。先將新球 `splice` 進陣列，再從插入索引往尾端逐對檢查 `gap = t[i] - t[i+1]`；只有 `gap < deltaT` 才把後方球推開 `deltaT - gap`。一旦遇到 `gap >= deltaT`，代表既有空隙已吸收推力，立即 `break`，更後方的球完全不受影響。
- **同色磁吸與異色煞車**：出現 `gap > deltaT + 0.002` 時，若後車與前車同色，啟動 `CATCH_UP_SPEED = CHAIN_SPEED * 1.8` 的磁吸追趕；若異色，該球與其後方所有球立即停止，直到間隙重新閉合。
- **連鎖消除 (Combo)**：磁吸接觸的瞬間會呼叫 `resolveMatches()`，若接合處形成 3 顆以上同色球，立即引發二次消除。
- **剛性鏈條 (Rigid Chain)**：一旦 `gap <= deltaT + 0.002`，後車不再使用自己的速度，而是直接硬綁定為 `marble.t = ahead.t - deltaT`，維持精確且平均的一顆球直徑間距。
- **全域減速**：成功消除時 `slowdownTimer = 1.5`，接下來 1.5 秒內火車頭速度降為一般值的 30%，營造消除後的短暫慢動作。
- **爆炸回饋**：消除時會產生白色閃光圓圈、20 顆高散射粒子，並給消除區後方的第一顆球 `pushOffset = deltaT * 1.5` 的彈性衝擊。
- **鏈尾完成狀態**：`chainComplete` 仍會在龍頭抵達 `t = 1` 時鎖定，龍頭不再越界；後方車廂可繼續完成收尾閉合。
- **平滑推擠動畫**：每個被推開的球會加上 `pushOffset += shiftAmount`，在畫面上先留在原位；`updateChainPositions()` 每幀以 `Phaser.Math.Linear(pushOffset, 0, 0.15)` 遞減，位置以 `getPointAt(t + pushOffset)` 計算。
- **防止重疊**：推擠後執行間距校正；若尾端被推出 t < 0，整串會往前平移不足的距離，使所有 `t` 保持在 0–1 且任兩球中心距至少為一顆球的直徑。
- **時序控制**：先完成推擠與座標更新，才觸發同色掃描。三消達到 3 顆以上時先一次性 `splice` 移除陣列元素，再播放放大淡出動畫，動畫結束後 `destroy()` 精靈。
- **遊戲回饋**：插入漣漪、消除爆裂粒子、剩餘球數 HUD。
- **可立即測試**：球串最前方預先放了兩顆同色（紅色）球，`currentBulletColor` 初始也是紅色，將第一發插在兩顆紅球旁即可立刻觸發三消。

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
- 初始球串直接以 `deltaT`（36 px）間距建立，讓鏈條一開始就是剛性狀態，不會因為異色煞車規則在開局自行拆散。
- 插入順序是「先 splice 新球 → 空隙吸收 cascade → 更新座標 → 同色掃描」。三消留下的空格會成為下一次推擠的緩衝區；若缺口兩端同色，後方會磁吸追趕並可能觸發連鎖消除。
- `updateChainMovement()` 會逐顆計算與前車的距離與顏色；同色且有空隙才以 1.8 倍速磁吸，異色會煞停整段後方球串。追趕中的球以 `Math.min()` 鎖在 `前車.t - deltaT`，緊貼後硬綁定，避免重疊與間距漂移。
- 磁吸接近狀態由 `marble.magnetApproaching` 標記，只有真正由磁吸產生的接合才會觸發連鎖消除，避免車頭每幀前進造成的假接觸。
- 推擠 cascade 中每一對被處理的球，在 `behind.t -= deltaT - gap` 後，其間距都會恰好等於 `deltaT`；最近的剛性鏈條邏輯也會在下一幀再次鎖定這個不變量。
- 調色盤只有 5 色，子彈與下一顆顏色的循環也使用同一組 0–4 索引，不會存取不存在的紋理。
- 物理位置 `t` 與視覺位移 `pushOffset` 分離：`t` 決定最終排列與碰撞，`pushOffset` 只影響畫面上的平滑推擠，不會回饋到匹配邏輯。
- 三消掃描使用 `while` 先找出完整連續區段，確認長度後只做一次 `splice`；不會在走訪陣列的同時刪除元素。
- 被消除的球會立即退出碰撞與更新陣列，精靈則在縮放淡出動畫的 `onComplete` 中銷毀。
- 滑鼠位置使用 Phaser 的 `activePointer.worldX / worldY`，可正確對應 FIT 縮放後的畫布座標。
- 子彈與球的碰撞採兩圓半徑相加的平方距離比較，避免每幀開根號。
- 消除後的空隙只有在缺口兩端同色時才會被磁吸閉合；異色缺口會保持煞停，形成玩法上的顏色路線壓力。後續可再加入關卡、失敗條件與音效。
