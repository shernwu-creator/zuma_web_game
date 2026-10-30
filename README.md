# 祖瑪：叢林探險 — Zuma 風格遊戲雛形

以 **Vite + 原生 JavaScript** 打造的 Zuma（祖瑪）風格遊戲原型，使用 **Phaser 3.90** 渲染。已具備首頁／遊戲／結束狀態機、逐關遞增的動態球串（`30 + 關卡 × 10` 顆）、瞄準射擊、插入推擠、同色三消、磁吸連鎖、計分、加分星星、核爆特殊球與跨關卡累計分數的關卡系統。

## 第一階段：場景與球串

- **800 × 600 遊戲畫布**，深色叢林綠背景（`#1a3320`）。
- **S 型 Spline 軌道**：以 `Phaser.Curves.Spline` 建立，橫貫整個畫面；軌道本體以深色凹槽繪製，中央疊加虛線作為視覺 Debug 線。
- **動態球串**：球體以直徑 `deltaT` 緊密排列，沿同一條 Spline 前進；每關生成顆數為 `30 + 關卡 × 10`（第 1 關 40 顆、第 2 關 50 顆…）。
- **中央砲台**：畫面正中央（400, 300）的重型旋轉砲台，每一幀都朝向滑鼠游標旋轉。
- **氛圍細節**：徑向叢林光暈、葉片剪影、漂浮光點、軌道起點脈衝與發光砲台底座。

## 第二階段：射擊與碰撞

- **點擊射擊**：在畫布上按滑鼠左鍵，砲台會朝「點擊瞬間」的游標方向發射一顆彩色球。
- **等速直線飛行**：子彈以每秒 520 px 的固定速度前進，發射方向在點擊時鎖定，不受之後滑鼠移動影響。
- **碰撞偵測**：在 `update()` 中逐幀檢查子彈與軌道球串的圓形碰撞，命中時輸出 `Hit!`。

## 第三階段：插入、推擠與三消

- **五色高對比調色盤**：`MARBLE_COLORS` 僅保留紅 `#FF3366`、藍 `#33CCFF`、黃 `#FFCC00`、綠 `#33FF55`、紫 `#B84DFF` 五色；生成球與待發射球的顏色索引全部落在 0–4。
- **待發射球狀態**：場景保存 `currentBulletColor` 與 `nextBulletColor`。砲台正中央 `(0, 0)` 有一顆 `scale 0.75` 的核心寶石，由 `currentBulletColor` 驅動並跟著砲台旋轉；發射後立即用 `nextBulletColor` 遞補並更新寶石顏色。
- **插入方向判定**：碰撞時使用「撞擊點相對目標球的角度」與該處軌道切線比較，決定插入目標球陣列索引的前方或後方。
- **PathFollower 球串**：每顆軌道球都是 `Phaser.GameObjects.PathFollower`，以 `marble.t` 手動控制它在 Spline 上的弧長位置。子彈本身也是 PathFollower，命中後直接綁定 `t` 並加入 `marbles` 陣列。
- **空隙吸收推擠 (Cascade Push)**：`deltaT = BALL_DIAMETER / trackLength`。先將新球 `splice` 進陣列，再從插入索引往車頭（索引 0、`t` 遞增方向）逐對檢查 `gap = t[i-1] - t[i]`；只有 `gap < deltaT` 才把前方球往前推 `deltaT - gap`。一旦遇到 `gap >= deltaT`，代表既有空隙已吸收推力，立即 `break`，缺口另一側的球完全不受影響。
- **動態區段與車尾推進 (Tail Pushing)**：每幀依 `gap > deltaT + 0.002` 將球串切成多個 segments。所有區段預設速度為 0；最靠近起點的尾段（最後一段）無條件獲得 `standardTravelT` 的推進力。從尾段往前檢查，若後段車頭與前段車尾同色，改成「前段倒退」：`front.speed = -catchUpTravelT`（關卡速度 × 4.5 的負值）。
- **追尾剛性鎖與連鎖 (Combo)**：一般區段由前方車尾的 `frontTail.t - deltaT` 夾住推進；磁吸區段則反過來以尾部為前緣，把整段重新吊在 `rearHead.t + deltaT` 上（`current[i].t = current[i+1].t + deltaT`），因此是「前方區段倒退吸進後方車頭」。吸附成立（含 0.002 的分段容忍帶）時記錄 `comboMarble`，最後以 `findMatchRun()` 確認連續同色至少 3 顆才觸發 `resolveMatches()`。不足 3 顆只會扣合，不會爆破。
- **缺口封閉複查 (Seam Check)**：Step 1 切段時會把每個缺口（`seam`，前方車尾與後方車頭這一對）記錄下來；移動結束後 `resolveSeamMatches()` 再以**移動後的座標**複查一次：只要缺口兩端已經相貼（`gap <= deltaT + 0.002`）且同色，就用 `findTouchingMatchRun()`（遇到 `gap` 就停，不跨洞數同色球）確認「實際相連」長度 ≥ 3 才觸發連鎖消除，且同一幀的多個缺口各自獨立判定。磁吸判定用的是移動前的車頭座標，若接觸是由**後方車頭自己的夾具推進**（`frontTail.t - deltaT`）完成，舊版不會記錄 `comboMarble`，下一幀 Step 1 就把兩段併成同一段，同色 3 顆從此再也不會被檢查——這正是「3 顆以上同色貼在一起卻不爆」的成因。因為 `seam` 只存在於真實缺口，開局或既有的緊貼球（例如隨機生成就相鄰的同色球）不會被誤爆。
- **剛性鏈條 (Rigid Chain)**：一旦 `gap <= deltaT + 0.002`，後車不再使用自己的速度，而是直接硬綁定為 `marble.t = ahead.t - deltaT`，維持精確且平均的一顆球直徑間距。
- **全域減速**：成功消除時 `slowdownTimer = 1.5`，接下來 1.5 秒內車尾推進速度降為一般值的 30%，營造消除後的短暫慢動作。
- **爆炸回饋**：消除時會產生白色閃光圓圈、20 顆高散射粒子，並讓消除區後方的第一顆球同時獲得 `pushOffset = deltaT * 1.5` 與 `t -= deltaT * 1.5` 的真正物理倒退，形成新的斷層。
- **鏈尾完成狀態**：`chainComplete` 仍會在龍頭抵達 `t = 1` 時鎖定，龍頭不再越界；後方車廂可繼續完成收尾閉合。
- **平滑推擠動畫**：每個被往前推的球會加上 `pushOffset -= shiftAmount`（負值），在畫面上先留在原位；`updateChainPositions()` 每幀以 `Phaser.Math.Linear(pushOffset, 0, 0.15)` 遞減，位置以 `getPointAt(t + pushOffset)` 計算，因此推擠看起來是滑動而不是瞬移。
- **防止重疊**：若尾端因彈性倒退被推到 `t < 0`，只會把「與起點相連的那一段」往前平移不足的距離，第一個既有空隙就會吸收位移；所有 `t` 保持在 0–1，被夾住的球會同步補上 `pushOffset`，畫面不會跳動。
- **時序控制**：先完成推擠與座標更新，才觸發同色掃描。三消達到 3 顆以上時先一次性 `splice` 移除陣列元素，再播放放大淡出動畫，動畫結束後 `destroy()` 精靈。
- **遊戲回饋**：插入漣漪、消除爆裂粒子、剩餘球數 HUD。
- **開局空軌**：每次進入關卡時球串為空，第一顆球會在點擊開始（`PLAYING`）後從軌道起點動態生成，之後依尾端間距持續補球。

## 第四階段：遊戲化體驗升級

- **重型砲台美術**：改以 Graphics 繪製金屬砲管、旋轉彈匣、後座裝甲、瞄準導軌與發光砲口，中央核心寶石仍用來顯示 `currentBulletColor`。
- **分數與最高分**：新增 `score`、`highScore` 與 `localStorage` 持久化（key：`zumaHighScore`）。HUD 右上角顯示 6 位數分數與最高分紀錄。
- **計分公式**：3 顆基礎 30 分，每多 1 顆加 20 分（4 顆 50、5 顆 70）。磁吸 Combo 造成的消除，該次得分再乘 1.5 並四捨五入。
- **加分星星**：場景空白處隨機生成 3 顆閃爍星星，一般星星 100 分。其中一顆位於上層軌道之外，必須穿過球串縫隙才能命中，成功時顯示「穿越射擊！」並獲得 300 分。
- **炸彈球（Bomb Marble）**：每顆生成球有 10% 機率成為炸彈球。球體有黑色核心與放射性三葉標誌；子彈直接擊中時不進入三消，而是摧毀含炸彈前後各 2 顆、共最多 5 顆球，獲得 300 分並觸發 `cameras.main.shake(200, 0.01)`。爆炸半徑以「實體間距」計算：`getBombBlastRange()` 從炸彈往車頭／車尾逐顆檢查，只要遇到間距超過一顆球直徑（`deltaT`）的既有缺口就立刻停止，因此爆破不會越過空洞去波及／推移遠距離的球。
- **狙擊球（Sniper Marble）**：固定約 5% 機率生成的雷射球，擊中後進入 6 秒的狙擊模式（`SNIPER_BUFF_DURATION`）：砲台會畫出指向最近球的紅色瞄準雷射，子彈以 10000 px/s 瞬發並改用掃掠碰撞（`findSweptMarbleHit()`）避免穿模。原有 3 秒已延長一倍，讓增益實際可用。
- **特效**：消除 burst 已升級為 20 顆散射粒子＋白色閃光；額外加入浮動分數文字與相機震動。

## 第五階段：遊戲進程

- **狀態機**：`gameState` 包含 `MENU`、`PLAYING`、`GAMEOVER`。載入時顯示首頁，隱藏砲台與遊戲 HUD；點擊畫面進入 `PLAYING`。
- **首頁**：中央顯示巨大「祖瑪：叢林探險」標題、最高分與閃爍的「點擊開始遊戲」。
- **動態球串**：遊戲開始時軌道為空，每關生成 `getTotalMarbles()`（`30 + currentLevel × 10`）顆球。每當軌道尾端 `t > deltaT`，就在 `t = Clamp(tail.t - deltaT, 0, deltaT)` 生成新球，讓新球緊貼洞口內的尾球（10% 炸彈）。
- **Game Over**：最前段球（`marbles[0]`）抵達 `t = 1` 時立即切換 `GAMEOVER`、停止移動與射擊，顯示「遊戲結束」、最終分數、「球串已抵達終點」與閃爍的「重玩本關」。
- **Victory**：本關全部球生成且 `marbles.length === 0` 時顯示「關卡完成！」，額外獎勵 500 分，並顯示「過關獎勵」結算與「進入下一關」按鈕。
- **加分卡補充**：`bonusTimer` 每 8 秒檢查一次；場上星星少於 3 顆時，在合法空白位置補充 1 顆。
- **失敗重來**：失敗後點擊「重玩本關」會呼叫 `restartStage()` → `startGame(currentWorld, currentStage)`，直接重玩剛剛失敗的同一個 World/Stage（不會退回第 1 關）；舊球串、子彈與星星一併清除，該局分數歸零，已解鎖進度與最高分仍保留。

## 第六階段：關卡系統

- **關卡狀態**：新增 `currentLevel`（起始 1）、`getTotalMarbles()`、`getChainSpeed()` 與 HUD 用的 `levelText`；`startLevel()` 負責重建當前關卡，`startGame()` 從第 1 關重新開始，`startNextLevel()` 只會在勝利後推進關卡。
- **每關球數**：`30 + currentLevel × 10`（L1 = 40、L2 = 50、L3 = 60…）。生成上限、勝利判定與 HUD 進度全部改用 `getTotalMarbles()`，不再寫死 40。
- **每關速度**：`40 + currentLevel × 5` px/s（L1 = 45、L2 = 50、L3 = 55…）；同色磁吸速度為關卡速度 × 4.5。
- **車尾永遠推進**：最靠近起點的尾段每幀都無條件獲得標準推進力，不再受「本關球是否全部生成」或 `tailPushActive` 限制；即使中段被打斷，後段仍會持續收尾，最終龍頭可自然抵達 `t = 1` 觸發 Game Over。
- **過關流程**：勝利面板按「進入下一關」→ `currentLevel += 1`、分數累計保留，重建新關卡的球串／子彈／星星與計時器後直接開局；失敗則由 `restartStage()` 重玩同一個 World/Stage、分數歸零。
- **HUD 顯示**：左上角顯示「祖瑪：叢林探險」與「第 N 關 / 共 X 顆球」，右上角顯示「目前分數」、「最高分」、「移動滑鼠瞄準，點擊發射」與「軌道上 X 顆 · 已生成 Y/N」，數值全部即時更新。

## 第七階段：30 關獨立地圖

- **單一來源**：所有地圖幾何都集中在 `src/scenes/trackLayouts.js`（純數學、不依賴 Phaser），`GameScene` 只保留 `buildLandscapeTrack()`、`buildPortraitTrack()`、`buildDualInnerTrack()` 三個場景方法與 `buildLevelTracks()` 的組裝邏輯；`viewport.js` 的 800×600 設計尺寸也由該模組共用。
- **橫式 8 母體 × 4 安全變換**：`LANDSCAPE_LAYOUT_POOL` 由 5 組既有蛇行母體加上 3 組新母體組成——六瓣星形繞行（星形波紋是「固定振幅的徑向加減」而不是按半徑等比縮放，兩圈才會保持平行；垂直空間只夠 1.25 圈 × 46 px 車道，因此收在砲台旁 118 px）、四角折返迷宮（兩圈圓角矩形走廊，走遍四個角落，內圈收在砲台上下方 118 px）、沙漏波浪圈（中段向砲台兩側收束的腰身加上四瓣正弦波）。`(D - 1) % 8` 選母體、`floor((D - 1) / 8)` 選變換，30 關剛好用到 32 種組合中的 30 種。
- **安全變換**：`keep`、`mirrorX`（`x' = 800 - x`，把左上 HUD 對調成右上計分板、右下返回膠囊對調成左下音樂膠囊）、`inset`（以砲台為中心的 0.94 等比內縮，讓路線再遠離 HUD／膠囊 6%）、`mirrorX+inset`。**刻意不使用垂直鏡像與 180° 旋轉**：既有蛇行貼著底邊（y 520–580）行進，垂直翻轉會把 46–100 px 的軌道直接翻進上方 HUD，實測車道間距會塌成 18 px。
- **直式 4 母體 × 8 參數循環**：`PORTRAIT_MOTHERS` 為螺旋、波浪花瓣螺旋、直式蛇行繞砲台、沙漏腰身圈；每個母體再依 `cycle = floor((D - 1) / 4)` 變化入場角（上／下／左上／右上）、`dir = D % 2 === 0 ? 1 : -1`、圈數（1.35–2.05 圈）、超橢圓方度（0.58 圓角方形 → 1.0 橢圓）、花瓣數（3–6 瓣）與振幅（7–11 px）、水平鏡像、蛇行折數與腰身深度，因此 30 關互不重複。
- **安全框與淨空**：直式棋盤使用 `PORTRAIT_SAFE = { side: 26, top: 126, bottom: 104 }`（上方保留兩列 HUD、下方保留返回／音樂膠囊），尾端與中央砲台至少保持 `PORTRAIT_LAUNCHER_CLEARANCE = 68 px`；蛇行的收尾改用 `PORTRAIT_BYPASS_RADIUS = 116 px` 環繞砲台一週（> 110 px 安全區），永遠不會橫切自己的水平跑道。相鄰圈距至少 `BALL_DIAMETER + 10`（並在窄螢幕上退讓以保住 68 px 砲台淨空）。
- **螺旋的圈距不變性**：花瓣數為整數時，`sin(angle × lobes)` 在每一圈的同一角度完全相同，因此波紋不會吃掉圈距；星形母體同時保持固定的星形深度也是同一個理由。
- **World 3 內圈**：`dualInnerTrackPoints()` 讓 3 組既有內圈搭配 4 種變換與依 `stage` 產生的波浪，第 3 世界的 10 關因此有 10 種內外軌配對；內圈另外以 116 px 投影保證不會與外圈共用車道。
- **重繪正確性**：`buildLevelTracks()` 會把 `difficulty` 寫進 `layoutSpecs`（`{ portrait: true, difficulty }` 與 `{ points, difficulty }`），視窗縮放時 `rebuildTrackForView()` 可依同一份規格重建「同一關」的路線；直式路線以即時棋盤尺寸重新產生，橫式則只重新映射 800×600 設計座標。
- **可驗證性**：`trackLayouts.js` 是純函式，可直接用 Node 驗證；專案交付前已對 30 條橫式、30 條直式（420×747、390×844、420×1500、360×800 四種棋盤）與 10 條內圈跑過「邊界、HUD／膠囊淨空、砲台淨空、尾端 68 px、車道自交距離、30 關不重複」等檢查，全數通過。

## 第八階段：畫質、可讀性與安裝（PWA）

- **2× 超取樣渲染**：`viewport.js` 新增 `computeRenderScale()`，棋盤仍以 CSS 像素計算，但 canvas 以 `renderScale` 倍裝置像素建立（`main.js` 用 `setGameSize(width × scale, height × scale)`），再由主攝影機 `setZoom(scale)` + `centerOn(vw / 2, vh / 2)` 縮回棋盤大小。因此軌道線、1px 邊框、膠囊與所有文字都是「真的畫在更多像素上」，而不是讓瀏覽器把 1:1 的點陣圖放大到 hi-dpi 螢幕（那正是畫面看起來像低解析度影像的原因）。
  - 目標倍率為 **2×**（一般 1× 螢幕也吃得到超取樣），`devicePixelRatio` 更高的手機可到 3×，但一律受 `MAX_RENDER_PIXELS`（約 8.3M 裝置像素）預算限制，4K 大小的棋盤才退回 1×，避免用幀率換銳利度。
  - `GameScene#applyViewport()` 會把 `gameSize` **除以** `renderScale` 再得到 `vw / vh`，因此所有既有排版、碰撞與命中判定仍以原本的 CSS 像素為單位，行為完全不變；倍率透過 `game.registry`（`RENDER_SCALE_KEY`）從 `main.js` 傳給場景。
- **文字解析度**：Phaser 的 `Text` 會把字形畫進自己的 canvas，因此 `applyTextResolution()` 會包裝 `add.text` / `make.text`，讓每個文字（HUD、首頁、結算面板、浮動加分）都以 `renderScale` 烘焙字形，小字不再因放大而模糊。
- **球與星星材質同步 2× 烘焙**：`createMarbleTextures()` 與 `createBonusTexture()` 以 `graphics.setScale(bakeScale)` + 加大畫布的方式烘焙（繪圖座標完全不變），顯示時再以 `1 / bakeScale` 縮回原尺寸（`getMarbleDisplayScale()` / `getBonusDisplayScale()` 直接由材質實際像素寬度推算），球面漸層與高光因此是真的原生解析度；爆裂／消除動畫的放大值也改成相對倍率，不會因材質放大而彈得太大。
- **小字全面放大**：HUD 與面板的 11–13px 小字調到 13–15px（`目前分數`、`最高分`、操作提示、關卡列、首頁世界／關卡標籤、音樂與返回膠囊等），`createFloatingText()` 預設字級 18px，並同步調整右側 HUD 的垂直間距避免重疊。
- **特殊球 +20%**：`SPECIAL_MARBLE_SCALE = 1.2`，特殊球（炸彈／時間倒流／時間暫停／狙擊）會以 1.2 倍顯示，**且命中半徑同步放大**（`getMarbleRadius()`）；`findMarbleHit()`、`findSweptMarbleHit()` 與狙擊雷射 `findSniperRayTarget()` 都改用單顆球的半徑，所以特殊球真的更容易被擊中。一般球的半徑與鏈距（`deltaT`）完全不變。
- **PWA 可安裝化**：`public/manifest.webmanifest`（`standalone`、`orientation: any`、192／512／maskable 圖示）、`public/icons/*.png`（由 `zlib` 直接產生的 PNG，無額外相依）、`public/sw.js`（shell 預快取 + 導覽 network-first + 雜湊資源 cache-first，影音與 Range 請求不攔截）與 `main.js` 的 production-only 註冊。`index.html` 以 `%BASE_URL%` 指向 manifest 與 apple-touch-icon，因此在 GitHub Pages 的子路徑下也能安裝；先前的版本沒有任何 manifest／service worker，Android Chrome 只會提供「加到主畫面」的普通連結。
- **專屬 App ID（可與其他 PWA 並存安裝）**：manifest 的 `id` 明確設為 `/zuma_web_game/`。`id` 是瀏覽器辨識「這個 App 是誰」的唯一鍵——同一部裝置上即使裝了多個 PWA（例如同一個 GitHub Pages 帳號底下的 `shernwu-creator.github.io/<各專案>/`），只要 `id` 不同就會被視為不同 App，主畫面／桌面可以同時存在、名稱與圖示各自獨立，也不會互相覆蓋或跳出「已安裝」而擋掉第二次安裝。
  - `id` 解析後與 `start_url` 完全相同（`https://<帳號>.github.io/zuma_web_game/`），所以既有安裝者不會因為這次改動多出第二個圖示；但也因為 `id` 一旦安裝就等於身分，**之後不可再改**，否則會被當成另一個新 App。
  - 其他會在同一個 origin 上撞名的資源也都已各自命名：service worker 範圍 `./`、快取名稱 `zuma-v1-shell` / `zuma-v1-runtime`、`localStorage` 全部以 `zuma*` 開頭（`zumaHighScore`、`zumaMaxWorld`、`zumaMaxStage`、`zumaMaxLevel`、`zumaJungleMusicMuted`），App 名稱（`祖瑪：叢林探險` / `祖瑪探險`）與圖示也與其他專案不同。
  - iOS 的「加入主畫面」是以 `start_url` 當身分，同樣因為路徑不同而不會與其他專案衝突。

## 介面語言與字型

- 全部遊戲介面採**繁體中文（台灣用語）**：首頁、HUD、過關／失敗面板、浮動文字、`index.html` 頁面標題／說明列與 canvas 無障礙標籤皆已在地化。
- 所有 Phaser 文字樣式統一使用安全的中文無襯線字型堆疊：`"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif`；不再使用 Georgia 等英文襯線字型。
- 動態數值（目前分數、最高分、關卡進度、剩餘球數）由遊戲邏輯即時更新，翻譯只替換固定文案。
- 首頁大標題「祖瑪：叢林探險」以 54px 呈現；HUD 小字為 13–14px、面板小字 14–15px、按鈕 22–24px，並以 `renderScale` 等級的字形解析度烘焙，確保在 800 × 600 畫布與手機直式棋盤上都清楚可讀；已用無頭瀏覽器截圖確認無缺字（tofu）也沒有重疊。

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
├── index.html                # 頁面外框、manifest / apple-touch-icon 連結
├── public/
│   ├── favicon.svg
│   ├── manifest.webmanifest  # PWA manifest（id /zuma_web_game/、standalone、192/512/maskable 圖示）
│   ├── sw.js                 # PWA service worker（shell 預快取、離線開啟）
│   ├── icons/                # PWA 圖示（192 / 512 / maskable 512 / apple-touch 180）
│   └── *.mp3, *.mp4          # 背景音樂與過關短片
├── src/
│   ├── main.js               # Phaser Game 設定、renderScale 倍率、service worker 註冊
│   ├── style.css             # 頁面與遊戲外框樣式
│   └── scenes/
│       ├── GameScene.js      # 球串、射擊、插入推擠、三消與關卡流程
│       ├── trackLayouts.js   # 30 關橫式／直式／世界三內圈的地圖幾何（純函式）
│       └── viewport.js       # 依視窗比例計算棋盤尺寸與渲染倍率
├── vite.config.js
└── package.json
```

## 實作備註

- 球串陣列由隊首排到隊尾，`t` 由大到小。`getPointAt()` 採弧長映射，因此固定 `Δt` 即等於固定像素間距。
- 剛性間距的目標是相鄰球中心相距 36 px（`deltaT = BALL_DIAMETER / trackLength`），由推擠與扣合邏輯維持；每次進入關卡時球串為空，球會從起點陸續生成。
- 插入順序是「先 splice 新球 → 往車頭方向推擠並由空隙吸收 → 更新座標 → 同色掃描」。三消留下的空格會成為下一次推擠的緩衝區，推擠絕不跨越既有空隙；若缺口兩端同色，缺口**前方**的區段會倒退磁吸並可能觸發連鎖消除。
- `updateChainMovement()` 不再依賴單一火車頭，而是每幀動態切段。中間爆破後，前方區段靜止；尾段（最靠近起點的最後一段）不受生成進度限制，永遠以關卡速度推進。缺口兩端同色時改由**前方區段倒退**（`front.speed = -catchUpTravelT`，關卡速度 × 4.5 的負值）吸進後方車頭，鎖在 `rearHead.t + deltaT` 後與後段合併再一起前進。
- 每個區段內只有移動端擁有速度：一般區段由車頭帶動，其餘車廂以 `前車.t - deltaT` 硬性排列；磁吸區段則以**尾部**為前緣，其餘車廂改以 `current[i].t = current[i+1].t + deltaT` 重新吊回車頭方向。只有真正在移動的那一顆會標記 `marble.magnetApproaching`，吸附成立時再以完整同色區塊長度決定是否連鎖消除。
- 爆炸造成的 `pushbackMarble.t` 真正減少 `1.5 * deltaT`，因此不只是視覺抖動，而會在陣列中製造真實物理斷層，讓下一幀重新判斷異色煞車或同色磁吸。三消踢回同樣只在「後方第一顆球仍與消除區相貼（間距 ≤ `deltaT`）」時才會發生，中間隔著空洞就不會被拉回。
- 炸彈的爆炸範圍由 `getBombBlastRange()` 以實體間距決定（見第四階段）：往車頭與車尾各最多走 `BOMB_BLAST_NEIGHBOURS` 顆，遇到 `gap > deltaT` 就 `break`，因此既有缺口會完全吸收衝擊波；爆炸後存活球的 `t` 完全不被改寫，遠距離的球不會被推擠或拉動。
- 推擠 cascade 中每一對被處理的球，在 `ahead.t += deltaT - gap`（往車頭方向）後，其間距都會恰好等於 `deltaT`；最近的剛性鏈條邏輯也會在下一幀再次鎖定這個不變量。遇到 `gap >= deltaT` 的空隙立即 `break`，因此隔著空隙的獨立球段絕不會被推動。
- 調色盤只有 5 色，子彈與下一顆顏色的循環也使用同一組 0–4 索引，不會存取不存在的紋理。
- 物理位置 `t` 與視覺位移 `pushOffset` 分離：`t` 決定最終排列與碰撞，`pushOffset` 只影響畫面上的平滑推擠，不會回饋到匹配邏輯。
- 三消掃描使用 `while` 先找出完整連續區段，確認長度後只做一次 `splice`；不會在走訪陣列的同時刪除元素。
- 被消除的球會立即退出碰撞與更新陣列，精靈則在縮放淡出動畫的 `onComplete` 中銷毀。
- `zumaHighScore` 以數字字串存在 `localStorage`；每次加分若超過紀錄就立即寫入，重新載入頁面後仍會顯示。
- 加分星星使用 `distanceToTrack()` 保證不壓在軌道上，並以 `shotPathCrossesTrack()` 判斷是否需要穿過球串縫隙；若子彈未撞到任何球而命中該星星，即判定為穿越射擊（Gap Shot）。
- 炸彈球使用獨立材質 `zs-marble-bomb-*`，一般三消仍以 `colorIndex` 判斷顏色，不受外觀影響。
- 首頁與結束畫面使用 `DEPTH.overlay = 200` 的全畫面 overlay；點擊事件會依 `gameState` 分流成開始遊戲、發射子彈、失敗重玩本關（`restartStage()`）或勝利後進入下一關。
- 動態生成會先檢查尾端球是否已離開起點超過 `deltaT`，新球生成於 `t = Clamp(tail.t - deltaT, 0, deltaT)`（緊貼洞口內的尾球，不再固定 `t = 0` 造成空隙與隨後被夾回的跳動），並在 `spawnedMarblesCount === this.getTotalMarbles()` 後停止生成；但車尾推進不會因此停止。
- `startGame()`（首頁開始或失敗重來）會重置分數；首頁開始走 `startGame()` 的 World/Stage 選擇流程，失敗重來則由 `restartStage()` 帶入 `currentWorld` / `currentStage`，因此重玩的是同一個關卡而不是第 1 關。`startLevel()` 只重建當前關卡、保留累計分數，供 `startNextLevel()` 呼叫。
- HUD 關卡列由 `updateLevelHud()` 依 `getTotalMarbles()` 產生，球數列由 `updateMarbleCount()` 產生，兩者皆會在有新球生成、消除或換關時更新。
- 滑鼠位置使用 Phaser 的 `activePointer.worldX / worldY`，可正確對應 FIT 縮放後的畫布座標。
- 子彈與球的碰撞採兩圓半徑相加的平方距離比較，避免每幀開根號。
- 中間爆破後，前方區段會靜止等待；尾段以正常速度持續推進，缺口兩端同色時改由前方區段倒退磁吸。兩段扣合後會自動合併成單一區段並恢復正常推進。
- 勝利畫面會播放舞台動畫：直向棋盤使用 720×1280 直向短片，橫向棋盤使用 16:9 短片。`fitVictoryVideo()` 以 `Math.min` 做 contain 適配，換算結果直接套用 `setScale()`；Phaser 在真實影格取代佔位材質時只保留縮放（`setDisplaySize` 會把佔位圖尺寸一起鎖進去），因此縮放能安全跨過材質替換，不會裁切或變形。
- `victorySlot` 是結束畫面容器（`uiScale` 縮放）的子物件，但影片與遮罩都以世界座標排版；`layoutOverlays()` 會反向抵銷父層 transform（`setScale(1 / uiScale)` 與對應位移），讓影片、`victoryVeil` 與實際棋盤 1:1 對齊；`destroyVictoryVideo()` 會一併清除影片、材質鍵與 `victoryVeil`。
- 地圖幾何全部是 `trackLayouts.js` 裡的純函式（不碰 Phaser、不讀場景狀態），因此 30＋30 條路線可以用 Node 直接驗證；`GameScene` 只傳入即時棋盤（`portraitTrackFrame(this.vw, this.vh, BALL_DIAMETER)`）並消費回傳的點列。
- `sanitizeDesignPoints()` 是橫式路線的安全網：先把點夾回棋盤，再把誤入 HUD／膠囊矩形的點推到「仍在棋盤內且不在矩形內」的最近邊界（外側邊界對貼齊棋盤邊緣的 HUD 沒有意義，只會又被夾回去），最後以 104 px（5 組手繪蛇行，保留原本貼近砲台的收尾）或 118 px（3 組產生型母體）的投影保護砲台。
- 直式蛇行的每條水平跑道都留在入場半場，收尾會以 `PORTRAIT_BYPASS_RADIUS` 環繞砲台；環繞方向由「繞行點與跑道的最小淨空」兩個候選自動二選一，避免收尾直接橫切自己的跑道（早期版本實測淨空只剩 1.9 px）。
- `renderScale` 是「canvas 裝置像素 ÷ CSS 棋盤像素」，由 `main.js` 決定並寫進 `game.registry`；`GameScene` 只讀不猜（讀不到就當 1×），所以任何未經過 `main.js` 的啟動方式（測試腳本）仍會得到與舊版完全相同的 1:1 行為。
- 材質烘焙倍率一律從**材質實際寬度**回推（`getMarbleTextureScale()`、`getBonusDisplayScale()`），而不是直接拿 `renderScale`：材質管理器在整個 session 共用，若中途換到不同 DPI 的螢幕導致倍率改變，舊材質仍會以正確尺寸顯示（只是維持原本的銳利度），不會出現球忽然變大或變小的問題。
- 特殊球雖然顯示與命中半徑都放大 1.2 倍，但**不影響任何規則**：`deltaT` 間距、三消長度、磁吸、爆炸範圍與生成機率全部沿用原值，只是視覺上會與左右鄰球稍微重疊（那正是「比較好打」的來源）。
- service worker 只在 production build 註冊（`import.meta.env.PROD`）：`vite dev` 期間若也註冊，會把未打包的模組快取住，造成改程式碼卻看到舊畫面的問題。`sw.js` 也不攔截 `.mp4` 與帶 `Range` 的請求，過關短片的 seeking 才不會被快取破壞。
- manifest 的 `id` 是「應用程式身分」而不是路徑宣告：瀏覽器（Chromium 系）在安裝時以 `new URL(id, manifestUrl)` 當成唯一鍵，只要同一個 origin 上的兩個專案解析出不同的 `id` URL，就會是兩個獨立 App。這裡刻意寫成絕對路徑 `/zuma_web_game/` 而不是相對的 `./`：相對寫法會隨 manifest 被搬到哪個資料夾而改變身分，絕對路徑則固定對應到本專案的部署目錄（也仍在 `scope: "./"` 之內），同時與先前的解析結果相同，既有安裝不會被複製成第二個圖示。

- 直式圈距是「回推」出來的：`laneStep` 由 `radiusX`、圈數、波浪振幅與 68 px 砲台淨空一起算出並夾在 `BALL_DIAMETER + 11 … + 22`，因此窄螢幕會自動縮小圈距，優先保住砲台淨空與尾端可射擊距離。
