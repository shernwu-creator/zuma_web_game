import Phaser from 'phaser';

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 600;
const CENTER_X = VIEW_WIDTH / 2;
const CENTER_Y = VIEW_HEIGHT / 2;

// Traditional Chinese (Taiwan) sans-serif stack for every Phaser text style.
const UI_FONT =
  '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';

const BALL_RADIUS = 18;
const BALL_DIAMETER = BALL_RADIUS * 2;
const MIN_MATCH = 3;
const MATCH_FADE_DURATION = 260;
const SHOOTER_BALL_SCALE = 0.75;
const INITIAL_CURRENT_COLOR = 0;
const INITIAL_NEXT_COLOR = 1;

// Level progression:
//   total marbles = 30 + level * 10   (L1 = 40, L2 = 50, ...)
//   chain speed   = 40 + level * 5    (L1 = 45, L2 = 50, ...)
const LEVEL_BASE_MARBLES = 30;
const LEVEL_MARBLES_STEP = 10;
const LEVEL_BASE_SPEED = 40; // pixels per second
const LEVEL_SPEED_STEP = 5;
const CATCH_UP_MULTIPLIER = 4.5;
const SHOT_SPEED = 520; // pixels per second
const SHOT_RADIUS = BALL_RADIUS;
const SHOT_SPAWN_OFFSET = 56;
const SHOT_CULL_MARGIN = 48;
const MAX_FRAME_DELTA = 50;
const BOMB_CHANCE = 0.1;
const BOMB_BLAST_NEIGHBOURS = 2;
const BOMB_SCORE = 300;
const BONUS_COUNT = 3;
const BONUS_RADIUS = 16;
const BONUS_SCORE = 100;
const GAP_SHOT_SCORE = 300;
const TRACK_CLEARANCE = 44;
const BONUS_SPAWN_INTERVAL = 8;
const WIN_BONUS = 500;

// A wide, winding S that crosses the whole board. The middle pass sits below
// the launch pad, leaving the center of the screen clear for the cannon.
const PATH_POINTS = [
  [46, 128],
  [190, 72],
  [410, 66],
  [646, 116],
  [758, 214],
  [712, 318],
  [544, 372],
  [352, 364],
  [198, 396],
  [134, 480],
  [200, 552],
  [396, 574],
  [614, 554],
  [760, 482],
];

const MARBLE_COLORS = [
  '#FF3366',
  '#33CCFF',
  '#FFCC00',
  '#33FF55',
  '#B84DFF',
];

const DEPTH = {
  backdrop: -40,
  foliage: -20,
  vignette: -10,
  motes: -5,
  track: 2,
  trackDebug: 3,
  bonus: 4,
  balls: 5,
  shots: 6,
  launcherGlow: 7,
  launcherBase: 8,
  launcher: 9,
  effects: 12,
  textFx: 15,
  hud: 30,
  overlay: 200,
};

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    this.trackLength = 0;
    this.chainHeadDistance = 0;
    this.initialGapT = 0;
    this.deltaT = 0;
    this.chainComplete = false;
    this.pointerSeen = false;
    this.marbles = [];
    this.shots = [];
    this.currentBulletColor = INITIAL_CURRENT_COLOR;
    this.nextBulletColor = INITIAL_NEXT_COLOR;
    this.shooterIndicator = null;
    this.slowdownTimer = 0;
    this.score = 0;
    this.highScore = 0;

    try {
      this.highScore = Number(localStorage.getItem('zumaHighScore')) || 0;
    } catch {
      this.highScore = 0;
    }

    this.bonusItems = [];
    this.scoreText = null;
    this.highScoreText = null;
    this.levelText = null;
    this.gameState = 'MENU';
    this.currentLevel = 1;
    this.spawnedMarblesCount = 0;
    this.bonusTimer = 0;
    this.levelWon = false;
    this.menuOverlay = null;
    this.gameOverOverlay = null;
    this.menuButton = null;
    this.restartButton = null;
    this.hudObjects = [];
    this.launcherHalo = null;
    this.launcherBase = null;
  }

  create() {
    this.slowdownTimer = 0;
    this.score = 0;
    this.currentLevel = 1;
    this.spawnedMarblesCount = 0;
    this.bonusTimer = 0;
    this.levelWon = false;
    this.gameState = 'MENU';
    this.bonusItems = [];
    this.createBackdrop();

    this.track = new Phaser.Curves.Spline(
      PATH_POINTS.map(([x, y]) => new Phaser.Math.Vector2(x, y)),
    );
    this.trackLength = this.track.getLength();
    this.trackSamples = this.track.getSpacedPoints(240);

    this.createTrack();
    this.createMarbles();
    this.createLauncher();
    this.createAmbientMotes();
    this.createHud();

    this.hudObjects = this.children.list.filter(
      (object) => object.depth === DEPTH.hud,
    );
    this.setHudVisible(false);
    this.setLauncherVisible(false);
    this.createMenu();

    this.input.on('pointermove', () => {
      this.pointerSeen = true;
    });

    this.input.on('pointerdown', this.handlePointerDown, this);

    this.game.canvas.setAttribute(
      'aria-label',
      '祖瑪：叢林探險——將發射的彈珠插入 S 形球串，連成三顆以上同色即可消除。',
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.handlePointerDown, this);
      this.shots = [];
    });
  }

  update(_time, delta) {
    if (this.gameState !== 'PLAYING') {
      return;
    }

    const step = Math.min(delta, MAX_FRAME_DELTA) / 1000;

    this.updateChainMovement(step);

    if (this.gameState !== 'PLAYING') {
      return;
    }

    this.updateChainPositions();
    this.updateShots(step);
    this.updateSpawner();
    this.updateBonusSpawner(step);
    this.aimAtPointer();
    this.checkWinCondition();
  }

  setHudVisible(visible) {
    for (const object of this.hudObjects) {
      object.setVisible(visible);
    }
  }

  setLauncherVisible(visible) {
    if (this.launcherHalo) {
      this.launcherHalo.setVisible(visible);
    }

    if (this.launcherBase) {
      this.launcherBase.setVisible(visible);
    }

    if (this.cannon) {
      this.cannon.setVisible(visible);
    }
  }

  destroyOverlays() {
    if (this.menuButton) {
      this.tweens.killTweensOf(this.menuButton);
    }

    if (this.restartButton) {
      this.tweens.killTweensOf(this.restartButton);
    }

    if (this.menuOverlay) {
      this.menuOverlay.destroy();
      this.menuOverlay = null;
    }

    if (this.gameOverOverlay) {
      this.gameOverOverlay.destroy();
      this.gameOverOverlay = null;
    }

    this.menuButton = null;
    this.restartButton = null;
  }

  clearRoundObjects() {
    for (const marble of this.marbles) {
      this.tweens.killTweensOf(marble);
      marble.destroy();
    }
    this.marbles = [];

    for (const shot of this.shots) {
      this.tweens.killTweensOf(shot.sprite);
      shot.sprite.destroy();
    }
    this.shots = [];

    for (const item of this.bonusItems) {
      item.each((child) => this.tweens.killTweensOf(child));
      this.tweens.killTweensOf(item);
      item.destroy();
    }
    this.bonusItems = [];

    this.updateMarbleCount();
  }

  getTotalMarbles() {
    return LEVEL_BASE_MARBLES + this.currentLevel * LEVEL_MARBLES_STEP;
  }

  getChainSpeed() {
    return LEVEL_BASE_SPEED + this.currentLevel * LEVEL_SPEED_STEP;
  }

  // Fresh run from the start menu or after a loss: back to level 1, score 0.
  startGame() {
    this.currentLevel = 1;
    this.score = 0;
    this.startLevel();
  }

  // Begin (or continue into) the current level. Score and currentLevel are
  // intentionally NOT reset here so clearing a level preserves the run score.
  startLevel() {
    this.destroyOverlays();
    this.clearRoundObjects();

    this.gameState = 'PLAYING';
    this.spawnedMarblesCount = 0;
    this.bonusTimer = 0;
    this.slowdownTimer = 0;
    this.chainComplete = false;
    this.chainHeadDistance = 0;
    this.levelWon = false;
    this.currentBulletColor = INITIAL_CURRENT_COLOR;
    this.nextBulletColor = INITIAL_NEXT_COLOR;
    this.updateShooterIndicator();
    this.updateScoreHud();
    this.updateLevelHud();
    this.updateMarbleCount();
    this.setHudVisible(true);
    this.setLauncherVisible(true);
    this.createBonusItems();
    this.trySpawnMarble();
    this.pointerSeen = true;
    this.aimAtPointer();
    this.cameras.main.resetFX();
  }

  // Called by the win overlay ("NEXT LEVEL"): advance the level while keeping
  // the cumulative score, then rebuild the board for the new level total/speed.
  startNextLevel() {
    if (this.gameState !== 'GAMEOVER' || !this.levelWon) {
      return;
    }

    this.currentLevel += 1;
    this.startLevel();
  }

  endGame(isWin) {
    if (this.gameState !== 'PLAYING') {
      return;
    }

    this.gameState = 'GAMEOVER';
    this.levelWon = isWin;
    this.slowdownTimer = 0;

    if (isWin) {
      this.addScore(WIN_BONUS);
    }

    this.setHudVisible(false);
    this.setLauncherVisible(false);
    this.showGameOverOverlay(isWin);
  }

  checkWinCondition() {
    if (this.gameState !== 'PLAYING') {
      return;
    }

    if (
      this.spawnedMarblesCount >= this.getTotalMarbles() &&
      this.marbles.length === 0
    ) {
      this.endGame(true);
    }
  }

  updateBonusSpawner(step) {
    if (this.gameState !== 'PLAYING') {
      return;
    }

    this.bonusTimer += step;

    if (this.bonusTimer < BONUS_SPAWN_INTERVAL) {
      return;
    }

    this.bonusTimer = Math.max(0, this.bonusTimer - BONUS_SPAWN_INTERVAL);

    if (this.bonusItems.length < BONUS_COUNT) {
      this.spawnRandomBonusItem();
    }
  }

  spawnRandomBonusItem() {
    const anchors = Phaser.Utils.Array.Shuffle([
      { x: 240, y: 220 },
      { x: 560, y: 220 },
      { x: 200, y: 300 },
      { x: 600, y: 300 },
      { x: 240, y: 260 },
      { x: 560, y: 260 },
    ]);

    for (const anchor of anchors) {
      const x = Phaser.Math.Clamp(
        anchor.x + Phaser.Math.Between(-15, 15),
        70,
        VIEW_WIDTH - 70,
      );
      const y = Phaser.Math.Clamp(
        anchor.y + Phaser.Math.Between(-15, 15),
        80,
        VIEW_HEIGHT - 70,
      );

      if (
        this.isBonusPositionClear(x, y, this.bonusItems, 48) &&
        !this.shotPathCrossesTrack(x, y)
      ) {
        this.spawnBonusItem(x, y);
        return true;
      }
    }

    return false;
  }

  createMenu() {
    this.destroyOverlays();
    this.setHudVisible(false);
    this.setLauncherVisible(false);

    const overlay = this.add
      .container(0, 0)
      .setDepth(DEPTH.overlay);

    const backdrop = this.add.rectangle(
      CENTER_X,
      CENTER_Y,
      VIEW_WIDTH,
      VIEW_HEIGHT,
      0x041009,
      0.8,
    );

    const kicker = this.add
      .text(CENTER_X, 126, '叢林探險', {
        fontFamily: UI_FONT,
        fontSize: '13px',
        color: '#c6d5ad',
      })
      .setOrigin(0.5)
      .setAlpha(0.72);

    const title = this.add
      .text(CENTER_X, 190, '祖瑪：叢林探險', {
        fontFamily: UI_FONT,
        fontSize: '54px',
        color: '#f7e9c2',
      })
      .setOrigin(0.5)
      .setShadow(0, 5, '#000000', 16, false, true);

    const rule = this.add.rectangle(
      CENTER_X,
      242,
      260,
      1,
      0xd7c17d,
      0.4,
    );

    const highScore = this.add
      .text(
        CENTER_X,
        278,
        `最高分  ${this.formatScore(this.highScore)}`,
        {
          fontFamily: UI_FONT,
          fontSize: '13px',
          color: '#d9c68c',
        },
      )
      .setOrigin(0.5)
      .setAlpha(0.8);

    const hint = this.add
      .text(CENTER_X, 326, '同色三消 · 引爆炸彈 · 收集星星', {
        fontFamily: UI_FONT,
        fontSize: '13px',
        color: '#a9bd96',
      })
      .setOrigin(0.5)
      .setAlpha(0.52);

    const startButton = this.add
      .text(CENTER_X, 392, '點擊開始遊戲', {
        fontFamily: UI_FONT,
        fontSize: '22px',
        color: '#ffe39a',
      })
      .setOrigin(0.5)
      .setShadow(0, 2, '#000000', 8, false, true);

    overlay.add([
      backdrop,
      kicker,
      title,
      rule,
      highScore,
      hint,
      startButton,
    ]);

    this.menuOverlay = overlay;
    this.menuButton = startButton;

    this.tweens.add({
      targets: startButton,
      alpha: { from: 1, to: 0.24 },
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  showGameOverOverlay(isWin) {
    this.destroyOverlays();

    const overlay = this.add
      .container(0, 0)
      .setDepth(DEPTH.overlay);

    const backdrop = this.add.rectangle(
      CENTER_X,
      CENTER_Y,
      VIEW_WIDTH,
      VIEW_HEIGHT,
      0x041009,
      0.84,
    );

    const title = this.add
      .text(
        CENTER_X,
        172,
        isWin ? '關卡完成！' : '遊戲結束',
        {
          fontFamily: UI_FONT,
          fontSize: '46px',
          color: isWin ? '#ffe39a' : '#ff7777',
        },
      )
      .setOrigin(0.5)
      .setShadow(0, 4, '#000000', 14, false, true);

    const bonusLine = isWin
      ? this.add
          .text(CENTER_X, 228, `過關獎勵  +${WIN_BONUS}`, {
            fontFamily: UI_FONT,
            fontSize: '13px',
            color: '#d9ee9f',
          })
          .setOrigin(0.5)
          .setAlpha(0.78)
      : this.add
          .text(CENTER_X, 228, '球串已抵達終點', {
            fontFamily: UI_FONT,
            fontSize: '13px',
            color: '#d3b2a2',
          })
          .setOrigin(0.5)
          .setAlpha(0.68);

    const finalLabel = this.add
      .text(CENTER_X, 278, '最終分數', {
        fontFamily: UI_FONT,
        fontSize: '12px',
        color: '#c4d3b0',
      })
      .setOrigin(0.5)
      .setAlpha(0.65);

    const finalScore = this.add
      .text(CENTER_X, 306, this.formatScore(this.score), {
        fontFamily: UI_FONT,
        fontSize: '32px',
        color: '#ffe39a',
      })
      .setOrigin(0.5)
      .setShadow(0, 2, '#000000', 8, false, true);

    const highLine = this.add
      .text(
        CENTER_X,
        348,
        `最高分  ${this.formatScore(this.highScore)}`,
        {
          fontFamily: UI_FONT,
          fontSize: '12px',
          color: '#b8c7a4',
        },
      )
      .setOrigin(0.5)
      .setAlpha(0.6);

    const restartButton = this.add
      .text(CENTER_X, 420, isWin ? '進入下一關' : '點擊重新開始', {
        fontFamily: UI_FONT,
        fontSize: '20px',
        color: '#ffe39a',
      })
      .setOrigin(0.5)
      .setShadow(0, 2, '#000000', 8, false, true);

    overlay.add([
      backdrop,
      title,
      bonusLine,
      finalLabel,
      finalScore,
      highLine,
      restartButton,
    ]);

    this.gameOverOverlay = overlay;
    this.restartButton = restartButton;

    this.tweens.add({
      targets: restartButton,
      alpha: { from: 1, to: 0.24 },
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /* ------------------------------------------------------------------ */
  /* Backdrop                                                            */
  /* ------------------------------------------------------------------ */

  createBackdrop() {
    if (!this.textures.exists('zs-backdrop')) {
      const canvas = document.createElement('canvas');
      canvas.width = VIEW_WIDTH;
      canvas.height = VIEW_HEIGHT;

      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#1a3320';
      ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

      const canopyGlow = ctx.createRadialGradient(
        CENTER_X + 24,
        250,
        30,
        CENTER_X,
        300,
        500,
      );
      canopyGlow.addColorStop(0, 'rgba(91, 137, 88, 0.30)');
      canopyGlow.addColorStop(0.42, 'rgba(49, 89, 54, 0.18)');
      canopyGlow.addColorStop(0.72, 'rgba(22, 48, 29, 0.08)');
      canopyGlow.addColorStop(1, 'rgba(5, 17, 9, 0)');
      ctx.fillStyle = canopyGlow;
      ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

      // Soft shafts of light falling through the canopy.
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(194, 216, 146, 0.028)';
      ctx.beginPath();
      ctx.moveTo(130, -40);
      ctx.lineTo(244, -40);
      ctx.lineTo(420, 640);
      ctx.lineTo(248, 640);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(222, 232, 181, 0.022)';
      ctx.beginPath();
      ctx.moveTo(560, -40);
      ctx.lineTo(660, -40);
      ctx.lineTo(790, 640);
      ctx.lineTo(618, 640);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // A restrained layer of organic specks in the undergrowth.
      const rng = new Phaser.Math.RandomDataGenerator(['serpentine-backdrop']);
      for (let i = 0; i < 220; i += 1) {
        const x = rng.between(0, VIEW_WIDTH);
        const y = rng.between(0, VIEW_HEIGHT);
        const radius = rng.realInRange(0.35, 1.5);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(190, 215, 154, ${rng.realInRange(0.015, 0.055)})`;
        ctx.fill();
      }

      this.textures.addCanvas('zs-backdrop', canvas);
    }

    this.add.image(0, 0, 'zs-backdrop').setOrigin(0).setDepth(DEPTH.backdrop);

    if (!this.textures.exists('zs-vignette')) {
      const canvas = document.createElement('canvas');
      canvas.width = VIEW_WIDTH;
      canvas.height = VIEW_HEIGHT;

      const ctx = canvas.getContext('2d');
      const vignette = ctx.createRadialGradient(
        CENTER_X,
        CENTER_Y - 20,
        190,
        CENTER_X,
        CENTER_Y,
        510,
      );
      vignette.addColorStop(0, 'rgba(2, 10, 5, 0)');
      vignette.addColorStop(0.62, 'rgba(2, 10, 5, 0.12)');
      vignette.addColorStop(1, 'rgba(1, 7, 3, 0.62)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

      this.textures.addCanvas('zs-vignette', canvas);
    }

    this.add.image(0, 0, 'zs-vignette').setOrigin(0).setDepth(DEPTH.vignette);
    this.createFoliage();
  }

  createFoliage() {
    if (!this.textures.exists('zs-leaf')) {
      const leaf = this.make.graphics({ x: 0, y: 0, add: false });
      leaf.fillStyle(0x0b1f12, 1);
      leaf.beginPath();
      leaf.moveTo(2, 36);
      leaf.lineTo(46, 7);
      leaf.lineTo(108, 4);
      leaf.lineTo(154, 36);
      leaf.lineTo(108, 66);
      leaf.lineTo(46, 64);
      leaf.closePath();
      leaf.fillPath();

      leaf.lineStyle(1, 0x6f8e5f, 0.2);
      leaf.beginPath();
      leaf.moveTo(8, 36);
      leaf.lineTo(148, 36);
      leaf.strokePath();

      leaf.generateTexture('zs-leaf', 158, 72);
      leaf.destroy();
    }

    const placements = [
      { x: -34, y: 22, angle: 36, scale: 1.5, alpha: 0.62 },
      { x: 805, y: 16, angle: 146, scale: 1.15, alpha: 0.4 },
      { x: 820, y: 588, angle: 208, scale: 1.85, alpha: 0.5 },
      { x: -24, y: 570, angle: -42, scale: 1.45, alpha: 0.44 },
      { x: 596, y: 620, angle: 176, scale: 1.0, alpha: 0.34 },
      { x: 164, y: -24, angle: 8, scale: 0.9, alpha: 0.3 },
    ];

    placements.forEach(({ x, y, angle, scale, alpha }) => {
      this.add
        .image(x, y, 'zs-leaf')
        .setOrigin(0, 0.5)
        .setAngle(angle)
        .setScale(scale)
        .setAlpha(alpha)
        .setDepth(DEPTH.foliage);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Track                                                               */
  /* ------------------------------------------------------------------ */

  createTrack() {
    const samples = this.track.getSpacedPoints(280);
    const shadowSamples = samples.map(
      (point) => new Phaser.Math.Vector2(point.x + 5, point.y + 8),
    );

    const track = this.add.graphics().setDepth(DEPTH.track);

    track.lineStyle(28, 0x000000, 0.26);
    track.strokePoints(shadowSamples, false, false);

    track.lineStyle(22, 0x09190e, 0.95);
    track.strokePoints(samples, false, false);

    track.lineStyle(14, 0x2b4b31, 1);
    track.strokePoints(samples, false, false);

    track.lineStyle(1, 0xa4bb87, 0.2);
    track.strokePoints(samples, false, false);

    // The dashed line is the visual debug overlay asked for in phase 01.
    // It follows the exact same arc-length curve used by the marbles.
    const debugLine = this.add.graphics().setDepth(DEPTH.trackDebug);
    debugLine.lineStyle(1.5, 0xe7efc4, 0.52);

    const dashLength = 10;
    const dashGap = 12;
    for (let distance = 0; distance < this.trackLength; distance += dashLength + dashGap) {
      const from = this.track.getPointAt(distance / this.trackLength);
      const to = this.track.getPointAt(
        Math.min(distance + dashLength, this.trackLength) / this.trackLength,
      );
      debugLine.lineBetween(from.x, from.y, to.x, to.y);
    }

    const start = this.track.getPointAt(0);

    const startGlow = this.add
      .circle(start.x, start.y, 19, 0xe8cf82, 0.08)
      .setDepth(DEPTH.trackDebug);
    const startRing = this.add
      .circle(start.x, start.y, 10)
      .setStrokeStyle(1.5, 0xe8cf82, 0.52)
      .setDepth(DEPTH.trackDebug);

    this.tweens.add({
      targets: startRing,
      scale: 2.4,
      alpha: 0,
      duration: 2400,
      ease: 'Sine.easeOut',
      repeat: -1,
    });

    this.tweens.add({
      targets: startGlow,
      alpha: { from: 0.08, to: 0.015 },
      duration: 1500,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Marble chain                                                        */
  /* ------------------------------------------------------------------ */

  createMarbles() {
    this.createMarbleTextures();

    this.deltaT = BALL_DIAMETER / this.trackLength;
    this.initialGapT = this.deltaT;
    this.chainComplete = false;
    this.chainHeadDistance = 0;
    this.spawnedMarblesCount = 0;
    this.marbles = [];
  }

  trySpawnMarble() {
    if (this.gameState !== 'PLAYING') {
      return false;
    }

    if (this.spawnedMarblesCount >= this.getTotalMarbles()) {
      return false;
    }

    if (
      this.marbles.length > 0 &&
      this.marbles[this.marbles.length - 1].t <= this.deltaT
    ) {
      return false;
    }

    const colorIndex = Phaser.Math.Between(0, MARBLE_COLORS.length - 1);
    const marble = this.createPathMarble(colorIndex, 0);

    marble.isBomb = Phaser.Math.FloatBetween(0, 1) < BOMB_CHANCE;

    if (marble.isBomb) {
      marble.setTexture(`zs-marble-bomb-${colorIndex}`);
    }

    this.marbles.push(marble);
    this.spawnedMarblesCount += 1;
    this.chainComplete = false;
    this.updateChainPositions();
    this.updateMarbleCount();

    return true;
  }

  updateSpawner() {
    this.trySpawnMarble();
  }

  createPathMarble(colorIndex, t, x = 0, y = 0) {
    const marble = this.add
      .follower(this.track, x, y, `zs-marble-${colorIndex}`)
      .setDepth(DEPTH.balls)
      .setData('type', 'marble')
      .setData('colorIndex', colorIndex);

    marble.colorIndex = colorIndex;
    marble.t = Phaser.Math.Clamp(t, 0, 1);
    marble.pushOffset = 0;
    marble.magnetApproaching = false;
    marble.isBomb = false;

    return marble;
  }

  normalizePushedChain() {
    if (this.marbles.length === 0) {
      return;
    }

    // If pushing a marble past the entrance would put it below t = 0, slide
    // the whole chain forward by the deficit. The spacing relative to the
    // insertion point is preserved, but the tail never overlaps at the start.
    let minT = Infinity;
    let maxT = -Infinity;

    for (const marble of this.marbles) {
      minT = Math.min(minT, marble.t);
      maxT = Math.max(maxT, marble.t);
    }

    if (minT < 0) {
      const forwardShift = -minT;
      for (const marble of this.marbles) {
        marble.t += forwardShift;
      }
      maxT += forwardShift;
    }

    if (maxT > 1) {
      const backwardShift = 1 - maxT;
      for (const marble of this.marbles) {
        marble.t += backwardShift;
      }
    }

    // Safety net: no pair may be closer than one physical diameter, even
    // after boundary shifts or floating-point drift.
    for (let index = 1; index < this.marbles.length; index += 1) {
      const maxTrailingT = this.marbles[index - 1].t - this.deltaT;

      if (this.marbles[index].t > maxTrailingT) {
        this.marbles[index].t = Math.max(0, maxTrailingT);
      }
    }

    for (const marble of this.marbles) {
      marble.t = Phaser.Math.Clamp(marble.t, 0, 1);
    }
  }

  createMarbleTextures() {
    if (
      this.textures.exists('zs-marble-0') &&
      this.textures.exists('zs-marble-bomb-0')
    ) {
      return;
    }

    const size = BALL_RADIUS * 2 + 18;
    const center = size / 2;
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    MARBLE_COLORS.forEach((hex, index) => {
      const color = Phaser.Display.Color.HexStringToColor(hex).color;

      graphics.clear();

      // Soft ground shadow baked into the sprite.
      graphics.fillStyle(0x000000, 0.3);
      graphics.fillCircle(center + 2.5, center + 4.5, BALL_RADIUS + 1);

      // Dark rim keeps the marbles readable over the track.
      graphics.fillStyle(0x07130b, 1);
      graphics.fillCircle(center, center, BALL_RADIUS + 2.5);

      graphics.fillStyle(color, 1);
      graphics.fillCircle(center, center, BALL_RADIUS);

      graphics.fillStyle(0x000000, 0.13);
      graphics.fillCircle(center + 4, center + 5, BALL_RADIUS - 3.5);

      graphics.fillStyle(0xffffff, 0.16);
      graphics.fillCircle(center - 6, center - 7, 7.5);

      graphics.fillStyle(0xffffff, 0.56);
      graphics.fillCircle(center - 7, center - 8, 3.5);

      graphics.lineStyle(1.2, 0xffffff, 0.3);
      graphics.strokeCircle(center, center, BALL_RADIUS - 2.6);

      graphics.generateTexture(`zs-marble-${index}`, size, size);

      // Bomb variant: a dark core with a radioactive trefoil.
      graphics.fillStyle(0x050b06, 0.96);
      graphics.fillCircle(center, center, 11.5);
      graphics.lineStyle(1.5, 0xd7ff69, 0.85);
      graphics.strokeCircle(center, center, 11.5);
      graphics.fillStyle(0xd7ff69, 0.95);

      for (let blade = 0; blade < 3; blade += 1) {
        const angle = -Math.PI / 2 + (blade * Math.PI * 2) / 3;

        graphics.beginPath();
        graphics.moveTo(
          center + Math.cos(angle) * 3,
          center + Math.sin(angle) * 3,
        );
        graphics.lineTo(
          center + Math.cos(angle - 0.42) * 9.3,
          center + Math.sin(angle - 0.42) * 9.3,
        );
        graphics.lineTo(
          center + Math.cos(angle + 0.42) * 9.3,
          center + Math.sin(angle + 0.42) * 9.3,
        );
        graphics.closePath();
        graphics.fillPath();
      }

      graphics.fillStyle(0x071108, 1);
      graphics.fillCircle(center, center, 2.8);
      graphics.fillStyle(0xffffff, 0.8);
      graphics.fillCircle(center - 2, center - 2, 1.2);

      graphics.generateTexture(`zs-marble-bomb-${index}`, size, size);
    });

    graphics.destroy();
  }

  updateChainMovement(step) {
    const isSlowed = this.slowdownTimer > 0;

    if (isSlowed) {
      this.slowdownTimer = Math.max(0, this.slowdownTimer - step);
    }

    if (this.marbles.length === 0) {
      this.chainHeadDistance = 0;
      this.chainComplete =
        this.spawnedMarblesCount >= this.getTotalMarbles();
      return;
    }

    const chainSpeed = this.getChainSpeed();
    const standardTravelT =
      (chainSpeed * (isSlowed ? 0.3 : 1) * step) / this.trackLength;
    const catchUpTravelT =
      (chainSpeed * CATCH_UP_MULTIPLIER * step) / this.trackLength;

    // Step 1: split the array wherever a real physical gap exists.
    const segments = [];
    let segment = [this.marbles[0]];

    for (let index = 1; index < this.marbles.length; index += 1) {
      const ahead = this.marbles[index - 1];
      const marble = this.marbles[index];

      if (ahead.t - marble.t > this.deltaT + 0.002) {
        segments.push(segment);
        segment = [marble];
      } else {
        segment.push(marble);
      }
    }
    segments.push(segment);

    // Step 2: only the rearmost segment (the one still feeding in from the
    // start of the track) is pushed by the entrance. Earlier detached segments
    // are stationary unless same-colour magnetism moves them toward the
    // segment in front.
    for (const current of segments) {
      current.speed = 0;
      current.isMagnetic = false;
    }

    // The rear segment must advance unconditionally. Previously this was gated
    // by spawnedMarblesCount/tailPushActive, so once the last marble spawned
    // the chain froze forever. Removing that gate lets a broken chain keep
    // closing its gaps and lets the head reach t = 1 for a natural Game Over.
    const rearMost = segments[segments.length - 1];
    rearMost.speed = standardTravelT;

    for (let index = segments.length - 1; index >= 1; index -= 1) {
      const rear = segments[index];
      const front = segments[index - 1];
      const rearHead = rear[0];
      const frontTail = front[front.length - 1];

      if (rearHead.colorIndex === frontTail.colorIndex) {
        rear.speed = catchUpTravelT;
        rear.isMagnetic = true;
      }
    }

    // Step 3: apply movement from front to rear, rigidly clamping each rear
    // segment against the tail of the segment ahead of it.
    let comboMarble = null;

    for (let index = 0; index < segments.length; index += 1) {
      const current = segments[index];
      const head = current[0];
      let nextT = head.t + current.speed;

      if (index > 0) {
        const frontRearMarble = segments[index - 1];
        const frontTail = frontRearMarble[frontRearMarble.length - 1];
        const maxT = frontTail.t - this.deltaT;
        const newGap = frontTail.t - nextT;

        // The +0.002 grouping tolerance would merge these two segments on
        // the next frame. Treat entering that band as contact now, snap to
        // the rigid spacing, and allow the magnetic combo check to fire.
        if (nextT >= maxT || newGap <= this.deltaT + 0.002) {
          nextT = maxT;

          if (
            current.isMagnetic &&
            head.colorIndex === frontTail.colorIndex &&
            !comboMarble
          ) {
            comboMarble = head;
          }
        }
      }

      head.t = Math.max(0, Math.min(nextT, 1));
      head.magnetApproaching = current.isMagnetic;

      for (let cart = 1; cart < current.length; cart += 1) {
        current[cart].t = Math.max(
          0,
          current[cart - 1].t - this.deltaT,
        );
        current[cart].magnetApproaching = false;
      }
    }

    // Step 4: a magnetic collision only detonates when the connected run is
    // genuinely three or more marbles long.
    if (comboMarble) {
      const run = this.findMatchRun(comboMarble);

      if (run && run.length >= MIN_MATCH) {
        this.resolveMatches(comboMarble, true);
        this.slowdownTimer = 1.5;
      }
    }

    const currentFront = this.marbles[0];
    this.chainHeadDistance = currentFront
      ? currentFront.t * this.trackLength
      : 0;
    this.chainComplete = currentFront ? currentFront.t >= 1 : false;

    if (
      this.gameState === 'PLAYING' &&
      currentFront &&
      currentFront.t >= 1
    ) {
      this.endGame(false);
    }
  }

  updateChainPositions() {
    for (const marble of this.marbles) {
      marble.t = Phaser.Math.Clamp(marble.t, 0, 1);
      marble.pushOffset = Phaser.Math.Linear(marble.pushOffset ?? 0, 0, 0.15);

      // Physical progress (t) is authoritative; pushOffset only delays the
      // visual slide so the insertion reads as a physical shove.
      const visualT = Phaser.Math.Clamp(
        marble.t + marble.pushOffset,
        0,
        1,
      );
      const position = this.track.getPointAt(visualT);
      marble.setPosition(position.x, position.y);
    }
  }

  getTrackPoint(distance) {
    const t = this.trackLength > 0 ? Phaser.Math.Clamp(distance / this.trackLength, 0, 1) : 0;
    return this.track.getPointAt(t);
  }

  /* ------------------------------------------------------------------ */
  /* Central launcher                                                    */
  /* ------------------------------------------------------------------ */

  createLauncher() {
    const halo = (this.launcherHalo = this.add
      .graphics()
      .setDepth(DEPTH.launcherGlow));
    halo.fillStyle(0xe7cd7c, 0.035);
    halo.fillCircle(CENTER_X, CENTER_Y, 76);
    halo.fillStyle(0xe7cd7c, 0.045);
    halo.fillCircle(CENTER_X, CENTER_Y, 61);
    halo.lineStyle(1, 0xd5bd75, 0.16);
    halo.strokeCircle(CENTER_X, CENTER_Y, 70);

    const base = (this.launcherBase = this.add
      .graphics()
      .setDepth(DEPTH.launcherBase));

    base.fillStyle(0x000000, 0.32);
    base.fillCircle(CENTER_X + 2, CENTER_Y + 9, 53);

    base.fillStyle(0x07150d, 1);
    base.fillCircle(CENTER_X, CENTER_Y, 50);

    base.lineStyle(2, 0xb99d58, 0.36);
    base.strokeCircle(CENTER_X, CENTER_Y, 50);

    base.fillStyle(0x1c3823, 1);
    base.fillCircle(CENTER_X, CENTER_Y, 42);

    base.lineStyle(1, 0xdbe6bd, 0.1);
    base.strokeCircle(CENTER_X, CENTER_Y, 35);

    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      const x = CENTER_X + Math.cos(angle) * 45.5;
      const y = CENTER_Y + Math.sin(angle) * 45.5;
      base.fillStyle(0xd8bf78, i % 3 === 0 ? 0.5 : 0.25);
      base.fillCircle(x, y, i % 3 === 0 ? 2.1 : 1.4);
    }

    base.lineStyle(1, 0xf0dea1, 0.16);
    base.beginPath();
    base.arc(CENTER_X, CENTER_Y, 57, -Math.PI * 0.75, -Math.PI * 0.08);
    base.strokePath();

    this.cannon = this.add
      .container(CENTER_X, CENTER_Y)
      .setDepth(DEPTH.launcher)
      .setRotation(-Math.PI / 2);

    const turret = this.add.graphics();

    // Rear armour / counterweight.
    turret.fillStyle(0x000000, 0.35);
    turret.fillRoundedRect(-47, -17, 36, 34, 9);
    turret.fillStyle(0x17261e, 1);
    turret.fillRoundedRect(-44, -15, 34, 30, 8);
    turret.lineStyle(1.5, 0x8fa695, 0.28);
    turret.strokeRoundedRect(-44, -15, 34, 30, 8);
    turret.fillStyle(0xb7c9b5, 0.18);
    turret.fillRoundedRect(-40, -11, 24, 4, 2);

    // Heavy tapered barrel.
    turret.fillStyle(0x000000, 0.4);
    turret.fillPoints(
      [
        { x: 20, y: -10 },
        { x: 84, y: -7 },
        { x: 84, y: 13 },
        { x: 20, y: 15 },
      ],
      true,
    );
    turret.fillStyle(0x101b15, 1);
    turret.fillPoints(
      [
        { x: 14, y: -14 },
        { x: 78, y: -10 },
        { x: 78, y: 10 },
        { x: 14, y: 14 },
      ],
      true,
    );
    turret.fillStyle(0x3b4e44, 1);
    turret.fillPoints(
      [
        { x: 17, y: -10 },
        { x: 74, y: -7 },
        { x: 74, y: 5 },
        { x: 17, y: 8 },
      ],
      true,
    );
    turret.fillStyle(0x778c7f, 0.6);
    turret.fillPoints(
      [
        { x: 17, y: -10 },
        { x: 74, y: -7 },
        { x: 74, y: -3 },
        { x: 17, y: -2 },
      ],
      true,
    );
    turret.fillStyle(0x0d1712, 0.9);
    turret.fillPoints(
      [
        { x: 17, y: 4 },
        { x: 74, y: 2 },
        { x: 74, y: 5 },
        { x: 17, y: 8 },
      ],
      true,
    );

    // Barrel bands and luminous coils.
    for (const bandX of [34, 50, 64]) {
      turret.lineStyle(1.5, 0x0a130e, 0.9);
      turret.lineBetween(bandX, -10, bandX, 10);
      turret.lineStyle(1, 0xe1c989, 0.22);
      turret.lineBetween(bandX + 2, -9, bandX + 2, 8);
    }

    turret.lineStyle(2, 0xe5cd86, 0.28);
    turret.lineBetween(56, -10, 56, 10);
    turret.lineStyle(1, 0xffffff, 0.12);
    turret.lineBetween(58, -9, 58, 9);

    // Muzzle and hot bore.
    turret.fillStyle(0x07100b, 1);
    turret.fillCircle(78, 0, 13);
    turret.lineStyle(2, 0xd8c07a, 0.55);
    turret.strokeCircle(78, 0, 13);
    turret.fillStyle(0x15271d, 1);
    turret.fillCircle(78, 0, 7);
    turret.fillStyle(0x9fffc6, 0.65);
    turret.fillCircle(78, 0, 3.2);
    turret.fillStyle(0xffffff, 0.5);
    turret.fillCircle(77, -1, 1.2);

    // Main rotary magazine / core housing.
    turret.fillStyle(0x030a06, 1);
    turret.fillCircle(0, 0, 35);
    turret.lineStyle(2, 0x93a991, 0.28);
    turret.strokeCircle(0, 0, 35);
    turret.fillStyle(0x26382e, 1);
    turret.fillCircle(0, 0, 31);
    turret.fillStyle(0x18261e, 1);
    turret.fillCircle(0, 0, 24.5);
    turret.lineStyle(1.5, 0xdfc87f, 0.3);
    turret.strokeCircle(0, 0, 25);

    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const x = Math.cos(angle) * 30;
      const y = Math.sin(angle) * 30;

      turret.fillStyle(0xd8c17a, i % 2 === 0 ? 0.55 : 0.24);
      turret.fillCircle(x, y, i % 2 === 0 ? 2.1 : 1.4);

      turret.lineStyle(1, 0x8ea394, 0.18);
      turret.lineBetween(
        Math.cos(angle) * 26,
        Math.sin(angle) * 26,
        Math.cos(angle) * 33,
        Math.sin(angle) * 33,
      );
    }

    // Loaded-bullet socket: the colored core gem is added on top of this.
    turret.fillStyle(0x050c07, 1);
    turret.fillCircle(0, 0, 21);
    turret.lineStyle(1.5, 0xf1db95, 0.42);
    turret.strokeCircle(0, 0, 21);
    turret.fillStyle(0xffffff, 0.08);
    turret.fillCircle(-5, -6, 9);

    // Top sight and small idling indicator light.
    turret.fillStyle(0x273a30, 1);
    turret.fillRoundedRect(-26, -32, 23, 9, 3);
    turret.lineStyle(1, 0x94a994, 0.25);
    turret.strokeRoundedRect(-26, -32, 23, 9, 3);
    turret.fillStyle(0xf3db91, 0.8);
    turret.fillCircle(-8, -27.5, 2);

    // Subtle laser guide.
    turret.lineStyle(1, 0xf7e7ab, 0.18);
    turret.lineBetween(94, 0, 132, 0);
    turret.fillStyle(0xf7e7ab, 0.3);
    turret.fillCircle(132, 0, 2);

    // The loaded marble sits in the central magazine core and rotates with
    // the cannon as a single display object.
    this.shooterIndicator = this.add
      .image(0, 0, `zs-marble-${this.currentBulletColor}`)
      .setScale(SHOOTER_BALL_SCALE)
      .setName('shooter-indicator')
      .setData('type', 'shooter-indicator')
      .setData('colorIndex', this.currentBulletColor);

    this.cannon.add([turret, this.shooterIndicator]);
  }

  updateShooterIndicator() {
    if (!this.shooterIndicator) {
      return;
    }

    this.shooterIndicator
      .setTexture(`zs-marble-${this.currentBulletColor}`)
      .setData('colorIndex', this.currentBulletColor);
  }

  aimAtPointer() {
    if (!this.cannon || !this.pointerSeen) {
      return;
    }

    const pointer = this.input.activePointer;
    const angle = Phaser.Math.Angle.Between(
      this.cannon.x,
      this.cannon.y,
      pointer.worldX,
      pointer.worldY,
    );

    this.cannon.setRotation(angle);
  }

  /* ------------------------------------------------------------------ */
  /* Shooting and collision                                              */
  /* ------------------------------------------------------------------ */

  handlePointerDown(pointer) {
    if (!pointer || pointer.button !== 0) {
      return;
    }

    if (this.gameState === 'MENU') {
      this.startGame();
      return;
    }

    if (this.gameState === 'GAMEOVER') {
      if (this.levelWon) {
        this.startNextLevel();
      } else {
        // A lost run restarts completely: level 1, score 0.
        this.startGame();
      }
      return;
    }

    this.pointerSeen = true;
    this.shootAt(pointer.worldX, pointer.worldY);
  }

  shootAt(targetX, targetY) {
    if (!this.cannon) {
      return;
    }

    const distanceToTarget = Phaser.Math.Distance.Between(
      CENTER_X,
      CENTER_Y,
      targetX,
      targetY,
    );

    // A click directly on the pivot has no direction; reuse the current aim.
    const angle =
      distanceToTarget < 1
        ? this.cannon.rotation
        : Phaser.Math.Angle.Between(CENTER_X, CENTER_Y, targetX, targetY);

    const muzzleX = CENTER_X + Math.cos(angle) * SHOT_SPAWN_OFFSET;
    const muzzleY = CENTER_Y + Math.sin(angle) * SHOT_SPAWN_OFFSET;
    const colorIndex = this.currentBulletColor;

    // Consume the loaded marble and immediately promote the queued colour.
    this.currentBulletColor = this.nextBulletColor;
    this.nextBulletColor = (this.nextBulletColor + 1) % MARBLE_COLORS.length;
    this.updateShooterIndicator();
    this.cannon.setRotation(angle);

    // Projectiles are PathFollowers too. While in flight they are moved
    // manually in a straight line; on impact the very same object is rebound
    // to the chain by assigning it a t value.
    const sprite = this.add
      .follower(this.track, muzzleX, muzzleY, `zs-marble-${colorIndex}`)
      .setDepth(DEPTH.shots)
      .setData('type', 'projectile')
      .setData('colorIndex', colorIndex);
    sprite.pushOffset = 0;
    sprite.magnetApproaching = false;
    sprite.isBomb = false;

    this.shots.push({
      sprite,
      vx: Math.cos(angle) * SHOT_SPEED,
      vy: Math.sin(angle) * SHOT_SPEED,
      radius: SHOT_RADIUS,
      colorIndex,
    });

    this.createMuzzleFlash(muzzleX, muzzleY);
  }

  updateShots(step) {
    for (let index = this.shots.length - 1; index >= 0; index -= 1) {
      const shot = this.shots[index];

      // Straight-line, constant-speed travel. The direction was captured at
      // the moment of the click and never changes afterwards.
      shot.sprite.x += shot.vx * step;
      shot.sprite.y += shot.vy * step;

      const marble = this.findMarbleHit(shot);
      if (marble) {
        this.resolveHit(shot, marble);
        continue;
      }

      const bonus = this.findBonusHit(shot);
      if (bonus) {
        this.collectBonus(bonus, shot);
        continue;
      }

      const { x, y } = shot.sprite;
      if (
        x < -SHOT_CULL_MARGIN ||
        x > VIEW_WIDTH + SHOT_CULL_MARGIN ||
        y < -SHOT_CULL_MARGIN ||
        y > VIEW_HEIGHT + SHOT_CULL_MARGIN
      ) {
        shot.sprite.destroy();
        this.shots.splice(index, 1);
      }
    }
  }

  findMarbleHit(shot) {
    const hitDistanceSq = (SHOT_RADIUS + BALL_RADIUS) ** 2;

    for (const marble of this.marbles) {
      if (!marble.active) {
        continue;
      }

      const dx = marble.x - shot.sprite.x;
      const dy = marble.y - shot.sprite.y;

      if (dx * dx + dy * dy <= hitDistanceSq) {
        return marble;
      }
    }

    return null;
  }

  resolveHit(shot, hitMarble) {
    const hitIndex = this.marbles.indexOf(hitMarble);

    // Defensive guard: the chain can change between the collision check and
    // this handler if several projectiles collide during the same frame.
    if (hitIndex === -1) {
      const orphanIndex = this.shots.indexOf(shot);
      if (orphanIndex !== -1) {
        this.shots.splice(orphanIndex, 1);
      }
      shot.sprite.destroy();
      return;
    }

    if (hitMarble.isBomb) {
      this.resolveBombHit(shot, hitMarble, hitIndex);
      return;
    }

    const shotIndex = this.shots.indexOf(shot);
    if (shotIndex !== -1) {
      this.shots.splice(shotIndex, 1);
    }

    const shotX = shot.sprite.x;
    const shotY = shot.sprite.y;
    const hitX = hitMarble.x;
    const hitY = hitMarble.y;
    const hitT = hitMarble.t;

    // The distance check already happened in findMarbleHit(). Here the angle
    // between the impact point and the path tangent decides which side of the
    // struck marble owns the new slot.
    const tangent = this.track.getTangentAt(hitT);
    const tangentAngle = Math.atan2(tangent.y, tangent.x);
    const impactAngle = Math.atan2(shotY - hitY, shotX - hitX);
    const angleFromTangent = Phaser.Math.Angle.Wrap(
      impactAngle - tangentAngle,
    );
    const approachedFromFront = Math.abs(angleFromTangent) <= Math.PI / 2;

    // Do not push the tail past t = 0. A rear insertion at the entrance is
    // mirrored to the front side so it can always open a legal slot.
    const isTail = hitIndex === this.marbles.length - 1;
    const wouldFallOffStart =
      !approachedFromFront && isTail && hitT < this.deltaT;
    const insertInFront = approachedFromFront || wouldFallOffStart;
    const insertIndex = insertInFront ? hitIndex : hitIndex + 1;

    // The projectile is already a PathFollower. Rebind the exact same object
    // to the chain now that its t value can be assigned.
    const insertedMarble = shot.sprite;
    insertedMarble
      .setDepth(DEPTH.balls)
      .setData('type', 'marble')
      .setData('colorIndex', shot.colorIndex);
    insertedMarble.colorIndex = shot.colorIndex;
    insertedMarble.t = insertInFront ? hitT : hitT - this.deltaT;
    insertedMarble.pushOffset = 0;
    insertedMarble.magnetApproaching = false;
    insertedMarble.isBomb = false;

    // Insert first, then propagate the pressure forwards through the chain.
    // A sufficiently large pre-existing gap absorbs the force completely.
    this.marbles.splice(insertIndex, 0, insertedMarble);

    for (
      let index = insertIndex;
      index < this.marbles.length - 1;
      index += 1
    ) {
      const current = this.marbles[index];
      const behind = this.marbles[index + 1];
      const gap = current.t - behind.t;

      if (gap >= this.deltaT) {
        // The gap is large enough to absorb the push. The rest of the chain
        // must not move at all.
        break;
      }

      const shiftAmount = this.deltaT - gap;
      behind.t -= shiftAmount;
      behind.pushOffset += shiftAmount;
    }

    // Commit all pushed t values to screen coordinates BEFORE scanning for
    // matches. This keeps the visual chain and the matching logic in sync.
    this.normalizePushedChain();
    this.updateChainPositions();
    this.chainHeadDistance = this.marbles[0].t * this.trackLength;
    this.updateMarbleCount();

    this.createInsertPulse(hitX, hitY, shot.colorIndex);
    console.log('Hit!');

    this.resolveMatches(insertedMarble);
  }

  resolveBombHit(shot, bombMarble, bombIndex) {
    const shotIndex = this.shots.indexOf(shot);
    if (shotIndex !== -1) {
      this.shots.splice(shotIndex, 1);
    }
    shot.sprite.destroy();

    const bombX = bombMarble.x;
    const bombY = bombMarble.y;
    const colorIndex = bombMarble.colorIndex;
    const start = Math.max(0, bombIndex - BOMB_BLAST_NEIGHBOURS);
    const end = Math.min(
      this.marbles.length - 1,
      bombIndex + BOMB_BLAST_NEIGHBOURS,
    );

    const destroyed = this.marbles.splice(start, end - start + 1);
    destroyed.forEach((marble, index) => {
      marble.magnetApproaching = false;

      this.tweens.add({
        targets: marble,
        scale: 1.8,
        alpha: 0,
        angle: marble.angle + 60,
        duration: 320,
        delay: index * 22,
        ease: 'Back.easeIn',
        onComplete: () => marble.destroy(),
      });
    });

    this.updateMarbleCount();

    const front = this.marbles[0];
    this.chainHeadDistance = front ? front.t * this.trackLength : 0;
    this.chainComplete = front ? front.t >= 1 : false;

    this.addScore(BOMB_SCORE);
    this.slowdownTimer = 1.5;
    this.createMatchBurst(bombX, bombY, colorIndex);
    this.createFloatingText(
      bombX,
      bombY,
      `炸彈！+${BOMB_SCORE}`,
      '#fff1b9',
      20,
    );
    this.cameras.main.shake(200, 0.01);
  }

  findMatchRun(marble) {
    const insertedIndex = this.marbles.indexOf(marble);

    if (insertedIndex === -1) {
      return null;
    }

    const colorIndex = marble.colorIndex;
    let start = insertedIndex;
    let end = insertedIndex;

    while (
      start > 0 &&
      this.marbles[start - 1].colorIndex === colorIndex
    ) {
      start -= 1;
    }

    while (
      end < this.marbles.length - 1 &&
      this.marbles[end + 1].colorIndex === colorIndex
    ) {
      end += 1;
    }

    return {
      start,
      end,
      length: end - start + 1,
    };
  }

  resolveMatches(insertedMarble, isCombo = false) {
    const run = this.findMatchRun(insertedMarble);

    if (!run || run.length < MIN_MATCH) {
      return 0;
    }

    const { start, end } = run;
    const matchLength = run.length;
    const colorIndex = insertedMarble.colorIndex;

    const basePoints = 30 + Math.max(0, matchLength - 3) * 20;
    const earnedPoints = isCombo
      ? Math.round(basePoints * 1.5)
      : basePoints;
    this.addScore(earnedPoints);

    // The marble directly after the removed run receives an elastic kickback.
    const pushbackMarble = this.marbles[end + 1] ?? null;
    const matched = this.marbles.splice(start, matchLength);
    let centerX = 0;
    let centerY = 0;
    for (const marble of matched) {
      centerX += marble.x;
      centerY += marble.y;
    }
    centerX /= matched.length;
    centerY /= matched.length;

    this.slowdownTimer = 1.5;

    if (pushbackMarble) {
      pushbackMarble.pushOffset = this.deltaT * 1.5;
      pushbackMarble.t = Math.max(
        0,
        pushbackMarble.t - this.deltaT * 1.5,
      );
      pushbackMarble.magnetApproaching = false;
    }

    this.updateMarbleCount();

    // Remove from the collision array immediately, then let the visuals
    // pop/fade away safely before destroying the sprites.
    matched.forEach((marble, index) => {
      this.tweens.add({
        targets: marble,
        scale: 1.45,
        alpha: 0,
        angle: marble.angle + 24,
        duration: MATCH_FADE_DURATION,
        delay: index * 28,
        ease: 'Back.easeIn',
        onComplete: () => marble.destroy(),
      });
    });

    this.createMatchBurst(centerX, centerY, colorIndex);
    return matchLength;
  }

  addScore(points) {
    if (!Number.isFinite(points) || points <= 0) {
      return;
    }

    this.score += Math.round(points);

    if (this.score > this.highScore) {
      this.highScore = this.score;

      try {
        localStorage.setItem('zumaHighScore', String(this.highScore));
      } catch {
        // Storage can be unavailable in private or embedded contexts.
      }
    }

    this.updateScoreHud();
  }

  formatScore(value) {
    return String(Math.max(0, Math.floor(value))).padStart(6, '0');
  }

  updateScoreHud() {
    if (this.scoreText) {
      this.scoreText.setText(this.formatScore(this.score));
    }

    if (this.highScoreText) {
      this.highScoreText.setText(`最高分 ${this.formatScore(this.highScore)}`);
    }
  }

  createMuzzleFlash(x, y) {
    const flash = this.add
      .circle(x, y, 10, 0xffeaa8, 0.55)
      .setDepth(DEPTH.effects)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: flash,
      scale: 2.2,
      alpha: 0,
      duration: 170,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  createInsertPulse(x, y, colorIndex) {
    const color = Phaser.Display.Color.HexStringToColor(
      MARBLE_COLORS[colorIndex % MARBLE_COLORS.length],
    ).color;

    const ring = this.add
      .circle(x, y, 24, color, 0.08)
      .setStrokeStyle(2, color, 0.58)
      .setDepth(DEPTH.effects);

    this.tweens.add({
      targets: ring,
      scale: 1.8,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  createMatchBurst(x, y, colorIndex) {
    const color = Phaser.Display.Color.HexStringToColor(
      MARBLE_COLORS[colorIndex % MARBLE_COLORS.length],
    ).color;

    // White impact flash pulse.
    const whiteFlash = this.add
      .circle(x, y, 16, 0xffffff, 0.95)
      .setDepth(DEPTH.effects)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: whiteFlash,
      scale: 4.2,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => whiteFlash.destroy(),
    });

    const ring = this.add
      .circle(x, y, 24, color, 0.16)
      .setStrokeStyle(2, color, 0.85)
      .setDepth(DEPTH.effects);

    this.tweens.add({
      targets: ring,
      scale: 3,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    for (let i = 0; i < 20; i += 1) {
      const angle =
        (i / 20) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.28, 0.28);
      const spread = Phaser.Math.FloatBetween(42, 96);
      const spark = this.add
        .circle(x, y, Phaser.Math.FloatBetween(2, 4.2), color, 0.92)
        .setDepth(DEPTH.effects)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * spread,
        y: y + Math.sin(angle) * spread,
        scale: 0.15,
        alpha: 0,
        duration: Phaser.Math.Between(340, 560),
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Bonus items                                                         */
  /* ------------------------------------------------------------------ */

  createBonusItems() {
    this.createBonusTexture();
    this.bonusItems = [];

    const positions = [];
    const anchors = Phaser.Utils.Array.Shuffle([
      { x: 240, y: 220 },
      { x: 560, y: 220 },
      { x: 200, y: 300 },
      { x: 600, y: 300 },
      { x: 240, y: 260 },
      { x: 560, y: 260 },
    ]);

    // Two regular 100-point pickups must be directly reachable; otherwise
    // every star would accidentally become a 300-point gap shot.
    for (const anchor of anchors) {
      if (positions.length >= BONUS_COUNT - 1) {
        break;
      }

      const x = Phaser.Math.Clamp(
        anchor.x + Phaser.Math.Between(-10, 10),
        70,
        VIEW_WIDTH - 70,
      );
      const y = Phaser.Math.Clamp(
        anchor.y + Phaser.Math.Between(-10, 10),
        80,
        VIEW_HEIGHT - 70,
      );

      if (
        this.isBonusPositionClear(x, y, positions, 48) &&
        !this.shotPathCrossesTrack(x, y)
      ) {
        positions.push({ x, y, clearance: 48 });
      }
    }

    // One star sits above the top track: reaching it requires firing through
    // a gap in the chain, so it is worth the 300-point Gap Shot bonus.
    let gapX = Phaser.Math.Between(480, 600);
    let gapY = Phaser.Math.Between(24, 34);

    if (
      this.distanceToTrack(gapX, gapY) < TRACK_CLEARANCE ||
      !this.isBonusPositionClear(
        gapX,
        gapY,
        positions,
        TRACK_CLEARANCE,
      ) ||
      !this.shotPathCrossesTrack(gapX, gapY)
    ) {
      gapX = 540;
      gapY = 28;
    }

    positions.push({
      x: gapX,
      y: gapY,
      clearance: TRACK_CLEARANCE,
    });

    for (const position of positions) {
      this.spawnBonusItem(position.x, position.y);
    }
  }

  createBonusTexture() {
    if (this.textures.exists('zs-bonus-star')) {
      return;
    }

    const size = 44;
    const center = size / 2;
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    graphics.fillStyle(0x000000, 0.35);
    graphics.fillCircle(center + 1, center + 3, 18);

    const points = [];
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? 16 : 7;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      points.push(
        new Phaser.Math.Vector2(
          center + Math.cos(angle) * radius,
          center + Math.sin(angle) * radius,
        ),
      );
    }

    graphics.fillStyle(0x3a2508, 1);
    graphics.beginPath();
    graphics.moveTo(center, center - 19);
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const next = points[(i + 1) % points.length];
      graphics.lineTo(point.x, point.y);
      graphics.lineTo(next.x, next.y);
    }
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(0xffd15c, 1);
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.closePath();
    graphics.fillPath();

    graphics.lineStyle(1.5, 0xfff3c0, 0.9);
    graphics.strokePath();
    graphics.fillStyle(0xffffff, 0.75);
    graphics.fillCircle(center - 3, center - 4, 2.2);

    graphics.generateTexture('zs-bonus-star', size, size);
    graphics.destroy();
  }

  isBonusPositionClear(x, y, positions, clearance) {
    if (Phaser.Math.Distance.Between(CENTER_X, CENTER_Y, x, y) < 115) {
      return false;
    }

    if (this.distanceToTrack(x, y) < clearance) {
      return false;
    }

    return positions.every(
      (position) =>
        Phaser.Math.Distance.Between(x, y, position.x, position.y) > 85,
    );
  }

  distanceToTrack(x, y) {
    let nearest = Infinity;

    for (const point of this.trackSamples) {
      const distance = Phaser.Math.Distance.Between(x, y, point.x, point.y);
      if (distance < nearest) {
        nearest = distance;
      }
    }

    return nearest;
  }

  shotPathCrossesTrack(targetX, targetY) {
    const steps = 60;

    for (let step = 6; step <= steps - 4; step += 1) {
      const ratio = step / steps;
      const x = CENTER_X + (targetX - CENTER_X) * ratio;
      const y = CENTER_Y + (targetY - CENTER_Y) * ratio;

      if (this.distanceToTrack(x, y) < 14) {
        return true;
      }
    }

    return false;
  }

  spawnBonusItem(x, y) {
    const glow = this.add
      .circle(0, 0, 25, 0xffd76a, 0.17)
      .setBlendMode(Phaser.BlendModes.ADD);
    const star = this.add.image(0, 0, 'zs-bonus-star');
    const item = this.add
      .container(x, y, [glow, star])
      .setDepth(DEPTH.bonus);

    const requiresGap = this.shotPathCrossesTrack(x, y);
    item.setData('type', 'bonus');
    item.setData('requiresGap', requiresGap);
    item.setData('points', requiresGap ? GAP_SHOT_SCORE : BONUS_SCORE);
    item.setName('bonus-item');
    item.bonusRequiresGap = requiresGap;

    this.tweens.add({
      targets: star,
      scale: { from: 0.94, to: 1.16 },
      angle: { from: -8, to: 8 },
      duration: 620,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.tweens.add({
      targets: glow,
      scale: { from: 0.85, to: 1.3 },
      alpha: { from: 0.25, to: 0.04 },
      duration: 980,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.bonusItems.push(item);
  }

  findBonusHit(shot) {
    const hitDistanceSq = (SHOT_RADIUS + BONUS_RADIUS) ** 2;

    for (const item of this.bonusItems) {
      if (!item.active) {
        continue;
      }

      const dx = item.x - shot.sprite.x;
      const dy = item.y - shot.sprite.y;

      if (dx * dx + dy * dy <= hitDistanceSq) {
        return item;
      }
    }

    return null;
  }

  collectBonus(item, shot) {
    const bonusIndex = this.bonusItems.indexOf(item);
    if (bonusIndex !== -1) {
      this.bonusItems.splice(bonusIndex, 1);
    }

    const shotIndex = this.shots.indexOf(shot);
    if (shotIndex !== -1) {
      this.shots.splice(shotIndex, 1);
    }

    shot.sprite.destroy();

    const requiresGap = item.getData('requiresGap') === true;
    const points = requiresGap ? GAP_SHOT_SCORE : BONUS_SCORE;
    const x = item.x;
    const y = item.y;

    this.addScore(points);

    this.tweens.add({
      targets: item,
      scale: 1.7,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => item.destroy(),
    });

    this.createBonusBurst(x, y, requiresGap);
    this.createFloatingText(
      x,
      y,
      requiresGap ? `穿越射擊！+${points}` : `+${points}`,
      requiresGap ? '#fff2bb' : '#ffd76a',
      requiresGap ? 18 : 15,
    );
  }

  createBonusBurst(x, y, isGapShot) {
    const color = isGapShot ? 0xffffff : 0xffd15c;
    const ring = this.add
      .circle(x, y, 18, color, 0.15)
      .setStrokeStyle(2, color, 0.75)
      .setDepth(DEPTH.effects)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: ring,
      scale: 2.6,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    for (let i = 0; i < 12; i += 1) {
      const angle =
        (i / 12) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.25, 0.25);
      const spread = Phaser.Math.FloatBetween(28, 68);
      const spark = this.add
        .circle(x, y, Phaser.Math.FloatBetween(1.5, 3), color, 0.9)
        .setDepth(DEPTH.effects)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * spread,
        y: y + Math.sin(angle) * spread,
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(330, 520),
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  createFloatingText(x, y, message, color, size = 16) {
    const label = this.add
      .text(x, y - 18, message, {
        fontFamily: UI_FONT,
        fontSize: `${size}px`,
        color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.textFx)
      .setShadow(0, 2, '#000000', 8, false, true);

    this.tweens.add({
      targets: label,
      y: y - 54,
      alpha: 0,
      duration: 850,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /* ------------------------------------------------------------------ */
  /* Atmosphere and HUD                                                  */
  /* ------------------------------------------------------------------ */

  createAmbientMotes() {
    const rng = new Phaser.Math.RandomDataGenerator(['serpentine-motes']);

    for (let i = 0; i < 16; i += 1) {
      const x = rng.between(34, VIEW_WIDTH - 34);
      const y = rng.between(90, VIEW_HEIGHT - 50);
      const radius = rng.realInRange(0.7, 1.9);
      const baseAlpha = rng.realInRange(0.12, 0.32);

      const mote = this.add
        .circle(x, y, radius, 0xe4efaf, baseAlpha)
        .setDepth(DEPTH.motes)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.tweens.add({
        targets: mote,
        x: x + rng.between(-24, 24),
        y: y - rng.between(28, 80),
        alpha: { from: baseAlpha, to: 0.02 },
        duration: rng.between(4200, 7800),
        delay: rng.between(0, 2600),
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }
  }

  createHud() {
    const title = this.add
      .text(30, 24, '祖瑪：叢林探險', {
        fontFamily: UI_FONT,
        fontSize: '20px',
        color: '#f3ebd2',
      })
      .setDepth(DEPTH.hud);

    title.setShadow(0, 2, '#000000', 8, false, true);

    this.levelText = this.add
      .text(30, 51, '', {
        fontFamily: UI_FONT,
        fontSize: '11px',
        color: '#b4c79d',
      })
      .setAlpha(0.7)
      .setDepth(DEPTH.hud);

    this.add
      .text(770, 18, '目前分數', {
        fontFamily: UI_FONT,
        fontSize: '11px',
        color: '#d8c387',
      })
      .setOrigin(1, 0)
      .setAlpha(0.72)
      .setDepth(DEPTH.hud);

    this.scoreText = this.add
      .text(770, 31, this.formatScore(this.score), {
        fontFamily: UI_FONT,
        fontSize: '24px',
        color: '#ffe39a',
      })
      .setOrigin(1, 0)
      .setDepth(DEPTH.hud);

    this.scoreText.setShadow(0, 2, '#000000', 8, false, true);

    this.highScoreText = this.add
      .text(770, 62, `最高分 ${this.formatScore(this.highScore)}`, {
        fontFamily: UI_FONT,
        fontSize: '11px',
        color: '#c8d8b2',
      })
      .setOrigin(1, 0)
      .setAlpha(0.54)
      .setDepth(DEPTH.hud);

    this.add
      .text(770, 77, '移動滑鼠瞄準，點擊發射', {
        fontFamily: UI_FONT,
        fontSize: '11px',
        color: '#c8d8b2',
      })
      .setOrigin(1, 0)
      .setAlpha(0.42)
      .setDepth(DEPTH.hud);

    this.marbleCountText = this.add
      .text(770, 92, '', {
        fontFamily: UI_FONT,
        fontSize: '11px',
        color: '#c8d8b2',
      })
      .setOrigin(1, 0)
      .setAlpha(0.38)
      .setDepth(DEPTH.hud);

    this.updateLevelHud();
    this.updateMarbleCount();
    this.updateScoreHud();
  }

  // Level-aware HUD labels. Kept as their own methods so the localisation
  // pass can replace only the text templates below.
  updateLevelHud() {
    if (!this.levelText) {
      return;
    }

    this.levelText.setText(
      `第 ${this.currentLevel} 關 / 共 ${this.getTotalMarbles()} 顆球`,
    );
  }

  updateMarbleCount() {
    if (!this.marbleCountText) {
      return;
    }

    const count = this.marbles.length;
    this.marbleCountText.setText(
      `軌道上 ${count} 顆 · 已生成 ${this.spawnedMarblesCount}/${this.getTotalMarbles()}`,
    );
  }
}
