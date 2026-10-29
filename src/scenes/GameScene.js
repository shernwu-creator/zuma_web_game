import Phaser from 'phaser';
import { computeViewSize, DESIGN_HEIGHT, DESIGN_WIDTH } from './viewport.js';

// Design-space constants. Overlays (menu, victory/loss panel), baked textures
// and the HUD anchors are authored in this 800x600 space; live gameplay uses
// the per-instance view rectangle (this.vw / this.vh / launcherX / launcherY)
// so the board can follow the window aspect ratio.
const VIEW_WIDTH = DESIGN_WIDTH;
const VIEW_HEIGHT = DESIGN_HEIGHT;
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

// World/Stage progression: 3 worlds x 10 stages. The absolute difficulty is
//   D = (world - 1) * 10 + stage        (W1S1 = 1 ... W3S10 = 30)
//   total marbles = 30 + D * 5          (W1S1 = 35 ... W3S10 = 180)
//   chain speed   = 35 + D * 2.5        (W1S1 = 37.5 ... W3S10 = 110 px/s)
const LEVEL_BASE_MARBLES = 30;
const LEVEL_MARBLES_STEP = 5;
const LEVEL_BASE_SPEED = 35; // pixels per second
const LEVEL_SPEED_STEP = 2.5;
const MAX_WORLD = 3;
const MAX_STAGE = 10;
// Same-colour magnetism may pull a rear segment across a fairly large hole.
// A 3-match plus the elastic kickback leaves roughly a 4.5-slot gap, so the
// old 1.6-slot limit disabled the cascade entirely. Ten slots covers that
// case while still refusing to yank a marble across a genuinely empty lane.
const CATCH_UP_MULTIPLIER = 4.5;
const MAGNET_MAX_SLOTS = 10.0;
const SHOT_SPEED = 520; // pixels per second
const SHOT_RADIUS = BALL_RADIUS;
const SHOT_SPAWN_OFFSET = 56;
const SHOT_CULL_MARGIN = 48;
const MAX_FRAME_DELTA = 50;
// Progressive special-marble chances. `difficulty` ramps 0.1..1.0 over World
// 1 (matching the old L1..L10 curve) and continues smoothly across Worlds 2-3
// up to 2.0 at W3S10:
//   bomb    = 0.02 + 0.08 * difficulty  (W1S1 2.8% ... W3S10 18%)
//   reverse = 0.00 + 0.08 * difficulty  (W1S1 0.8% ... W3S10 16%)
//   pause   = 0.02 + 0.06 * difficulty  (W1S1 2.6% ... W3S10 14%)
const BOMB_BASE_CHANCE = 0.02;
const BOMB_LEVEL_CHANCE = 0.08;
const REVERSE_LEVEL_CHANCE = 0.08;
const PAUSE_BASE_CHANCE = 0.02;
const PAUSE_LEVEL_CHANCE = 0.06;
// Special marbles carry NO colour any more: a hit (or a bomb blast) removes
// them and hands out their buff, exactly like a coloured marble that is shot
// away. Because they can never be matched nor pushed into a run, they can also
// never block a colour the launcher is missing.
const SPECIAL_MARBLE_TYPES = ['bomb', 'reverse', 'pause', 'sniper'];
const SPECIAL_COLOR_INDEX = -1;
// Neutral stone body used by every special marble texture, so a power-up can
// never be mistaken for a matchable colour.
const SPECIAL_MARBLE_BODY = 0x5f6f63;
// Spread the specials out: at least SPECIAL_SPAWN_GAP marbles must spawn
// between two specials, and the first SPECIAL_MIN_SPAWN marbles are always
// plain colours so a stage never opens with a cluster of power-ups.
const SPECIAL_SPAWN_GAP = 9;
const SPECIAL_MIN_SPAWN = 6;
// localStorage key for the music mute preference (the SFX stay on).
const MUSIC_STORAGE_KEY = 'zumaJungleMusicMuted';
const REVERSE_DURATION = 2.0;
const PAUSE_DURATION = 3.0;
// Sniper marble: documented ~5% special chance (mutually exclusive with
// bomb/reverse/pause) that grants an aiming laser + instant-fire shots. The
// buff window was doubled from the original 3 s to 6 s so the reward is
// actually worth playing around.
const SNIPER_CHANCE = 0.05;
const SNIPER_BUFF_DURATION = 6.0;
const SNIPER_SHOT_SPEED = 10000; // instant-fire shot speed while buffed
const SNIPER_LASER_DEPTH = 11; // above balls (5) and launcher (9)
const BOMB_BLAST_NEIGHBOURS = 2;
const BOMB_SCORE = 300;
const BONUS_COUNT = 3;
const BONUS_RADIUS = 16;
const BONUS_SCORE = 100;
const GAP_SHOT_SCORE = 300;
const TRACK_CLEARANCE = 44;
const BONUS_SPAWN_INTERVAL = 8;
const WIN_BONUS = 500;

// Custom background-music tracks. The mp3 files live in public/ and are
// referenced RELATIVE to the page ("./<name>.mp3"), never with a leading "/":
// GitHub Pages serves this game from a subpath such as /zuma_web_game/, so a
// root-absolute URL would 404 there. Vite's base:'./' keeps index.html itself
// relative too. A missing file only disables that track (the manager checks
// the Phaser audio cache before every play). They MUST be in the final commit.
const BGM_KEYS = {
  menu: 'bgm-menu',
  gameplay: 'bgm-gameplay',
  victory: 'bgm-victory',
};
const BGM_TRACKS = [
  { key: BGM_KEYS.menu, url: './pixel_lounge.mp3' },
  { key: BGM_KEYS.gameplay, url: './whimsical_wander.mp3' },
  { key: BGM_KEYS.victory, url: './playful_path.mp3' },
];
const BGM_VOLUME = 0.42;

// Victory clips. The same win panel hosts one of two cuts:
//   landscape -> the wide 16:9 celebration clip (desktop, tablet, docked phone)
//   portrait  -> a dedicated 720x1280 vertical clip, so a phone in portrait
//                really fills its tall board instead of cover-cropping a
//                16:9 video down to a thin strip.
// Both files live in public/ and are referenced RELATIVE to the page for the
// same GitHub Pages subpath reason as the BGM tracks. A missing/unplayable cut
// simply falls back to the other one, then to the graphics fallback.
const VICTORY_VIDEO_KEYS = {
  landscape: 'zs-victory-video',
  portrait: 'zs-victory-video-portrait',
};
const VICTORY_VIDEO_SOURCES = {
  landscape: './match-three_game_stage_clear_20261027.mp4',
  portrait: './marble_shooter_stage_clear_portrait_20261027.mp4',
};

// Distinct World palettes for the play board and the home-screen preview.
// World 1 reuses the original jungle backdrop textures; the desert and volcano
// variants are generated as canvases on first use.
const WORLD_THEMES = [
  {
    id: 1,
    name: '叢林',
    sky: '#1a3320',
    glow: [
      'rgba(91, 137, 88, 0.30)',
      'rgba(49, 89, 54, 0.18)',
      'rgba(22, 48, 29, 0.08)',
    ],
    shaft: 'rgba(194, 216, 146, 0.028)',
    speck: '190, 215, 154',
    vignette: '2, 10, 5',
    foliageTint: 0xffffff,
    menuTint: '#041009',
    accent: '#c6d5ad',
  },
  {
    id: 2,
    name: '沙漠',
    sky: '#382c18',
    glow: [
      'rgba(198, 158, 94, 0.30)',
      'rgba(120, 92, 50, 0.22)',
      'rgba(58, 40, 20, 0.10)',
    ],
    shaft: 'rgba(240, 214, 156, 0.035)',
    speck: '228, 201, 148',
    vignette: '18, 11, 4',
    foliageTint: 0xd8b57a,
    menuTint: '#120c05',
    accent: '#d8b57a',
  },
  {
    id: 3,
    name: '火山',
    sky: '#2a1417',
    glow: [
      'rgba(184, 72, 54, 0.30)',
      'rgba(112, 38, 32, 0.24)',
      'rgba(40, 12, 12, 0.10)',
    ],
    shaft: 'rgba(236, 130, 92, 0.03)',
    speck: '240, 150, 110',
    vignette: '14, 3, 3',
    foliageTint: 0xb9654d,
    menuTint: '#0d0506',
    accent: '#d99a7c',
  },
];

// One outer track per stage, cycled with `(D - 1) % TRACK_LAYOUTS.length`.
// Every layout lives inside the 800x600 board and keeps the sampled track
// centerline clear (>= 22px, plus a little margin) of the on-screen UI:
//   - top-left HUD title/level area  (about 15..300 x 15..110)
//   - top-right score HUD            (about 610..800 x 10..110)
//   - bottom-right home capsule      (about 646..770 x 536..570 + margin)
// Most entrances (t = 0) are on the left/upper-left edge; layout 4 is the
// exception and enters from the bottom-right corner. Each layout keeps a
// distinct silhouette:
//   layout 1 - wide S crossing the board (original S shape, re-routed around UI)
//   layout 2 - two staggered S-bands (upper serpentine -> right descent ->
//              lower serpentine) with more, tighter bends than layout 1
//   layout 3 - a wavy loop that encircles the launcher and opens on the left
//   layout 4 - enters bottom-right (clear of the home capsule) and spirals
//              inwards towards the middle of the board
//   layout 5 - continuous hairpin switchbacks running up and down the board
const TRACK_LAYOUTS = [
  // Layout 1: wide S, re-routed around the UI corners.
  [
    [44, 162], [140, 146], [248, 140], [322, 134], [396, 96], [478, 68],
    [560, 80], [588, 132], [600, 190], [660, 238], [738, 300], [712, 356],
    [600, 398], [470, 384], [360, 402], [240, 384], [152, 424], [118, 496],
    [160, 552], [270, 576], [390, 580], [500, 560], [562, 516], [612, 468],
    [690, 452],
  ],
  // Layout 2: double S-band serpentine with extra bends.
  [
    [46, 150], [170, 144], [250, 146], [315, 140], [370, 116], [430, 80],
    [490, 64], [540, 86], [570, 120], [592, 164], [636, 190], [684, 222],
    [728, 256], [748, 302], [742, 352], [712, 398], [676, 436], [620, 470],
    [540, 446], [460, 478], [380, 450], [300, 482], [220, 454], [140, 486],
    [100, 446], [68, 400],
  ],
  // Layout 3: wavy loop around the launcher, open on the left.
  [
    [58, 204], [150, 176], [250, 154], [340, 134], [410, 88], [475, 58],
    [535, 76], [572, 112], [600, 164], [650, 214], [712, 250], [754, 300],
    [734, 356], [750, 412], [716, 456], [680, 470], [594, 500], [490, 492],
    [386, 524], [282, 496], [178, 532], [72, 544], [50, 486], [58, 418],
    [56, 360], [82, 306], [126, 268], [162, 246],
  ],
  // Layout 4: enters bottom-right (outside the home capsule) and spirals
  // inwards towards the middle of the board.
  [
    [720, 470], [676, 494], [620, 492], [560, 512], [490, 536], [400, 540],
    [300, 528], [190, 540], [104, 512], [64, 440], [58, 360], [72, 286],
    [110, 220], [168, 166], [260, 142], [350, 130], [430, 112], [520, 130],
    [590, 164], [646, 206], [694, 258], [716, 322], [700, 388], [650, 430],
    [590, 458], [520, 468], [452, 446], [398, 406], [352, 392],
  ],
  // Layout 5: continuous hairpin switchbacks sweeping across the board.
  [
    [46, 150], [160, 142], [280, 138], [400, 128], [520, 140], [630, 150],
    [700, 160], [742, 192], [752, 238], [744, 290], [728, 342], [706, 382],
    [672, 404], [640, 424], [560, 420], [480, 438], [400, 420], [320, 440],
    [240, 420], [160, 440], [96, 420], [64, 448], [56, 492], [82, 522],
    [140, 540], [220, 530], [320, 548], [420, 530], [520, 548], [590, 536],
    [618, 512], [636, 486], [664, 470], [680, 460],
  ],
];

// World 3 runs TWO independent chains. The outer chain uses one of the five
// TRACK_LAYOUTS; the inner chain uses one of these compact rings so the two
// splines have clearly different silhouettes and both stay clear of the
// launcher (>= 115px from the centre), the HUD corners and the home capsule.
const DUAL_INNER_LAYOUTS = [
  // Inner 1: rounded central circuit, open on the left.
  [
    [210, 190], [320, 165], [440, 170], [545, 205], [600, 270], [595, 345],
    [545, 410], [455, 445], [350, 440], [255, 410], [195, 350], [180, 270],
  ],
  // Inner 2: wide wavy oval (upper band -> right descent -> lower band).
  [
    [170, 190], [270, 170], [380, 185], [490, 170], [590, 195], [650, 245],
    [650, 355], [590, 405], [490, 425], [380, 420], [270, 425], [170, 405],
    [120, 350], [120, 250],
  ],
  // Inner 3: diagonal sweep with a hooked lower-left return.
  [
    [180, 220], [290, 185], [410, 180], [520, 200], [600, 245], [630, 310],
    [600, 375], [530, 420], [440, 430], [360, 420], [300, 370], [250, 390],
    [200, 430], [150, 440], [120, 390], [130, 320], [150, 260],
  ],
];

const OUTER_TRACK_STYLE = {
  shadow: 0x000000,
  shadowAlpha: 0.26,
  baseDark: 0x09190e,
  base: 0x2b4b31,
  highlight: 0xa4bb87,
  debug: 0xe7efc4,
  glow: 0xe8cf82,
  ring: 0xe8cf82,
};

const INNER_TRACK_STYLE = {
  shadow: 0x000000,
  shadowAlpha: 0.3,
  baseDark: 0x081420,
  base: 0x274a5c,
  highlight: 0x9cc7dd,
  debug: 0xc2e8ff,
  glow: 0x8fd4ff,
  ring: 0x8fd4ff,
};

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

    // Tracks are level-dependent and do NOT exist on the start menu. They are
    // (re)built in startLevel() from TRACK_LAYOUTS (plus DUAL_INNER_LAYOUTS for
    // World 3) into independent chain contexts. `this.track*`, `this.deltaT`
    // and `this.marbles` are kept as aliases of the primary (outer) chain for
    // compatibility with older tooling and UI helpers.
    this.chains = [];
    this.primaryChain = null;
    this.spawnChainCursor = 0;
    this.track = null;
    this.trackLength = 0;
    this.trackSamples = [];
    this.trackGraphics = null;
    this.trackDebugGraphics = null;
    this.startGlow = null;
    this.startRing = null;
    this.tunnelEntrance = null;
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
    this.reverseTimer = 0;
    this.pauseTimer = 0;
    this.sniperBuffActive = false;
    this.sniperTimer = 0;
    this.sniperLaser = null;
    this.sniperLaserTarget = null;
    this.sniperLaserEnd = null;
    this.sniperLaserVisible = false;
    this.audioCtx = null;
    this.score = 0;
    this.highScore = 0;

    try {
      this.highScore = Number(localStorage.getItem('zumaHighScore')) || 0;
    } catch {
      this.highScore = 0;
    }

    // World/Stage progression. `currentWorld` 1..3 and `currentStage` 1..10;
    // absolute difficulty D = (world - 1) * 10 + stage (1..30).
    this.currentWorld = 1;
    this.currentStage = 1;
    // Selection exposed for the two-tier home menu.
    this.selectedWorld = 1;
    this.selectedStage = 1;
    // Highest unlocked progress, persisted as zumaMaxWorld/zumaMaxStage.
    this.maxUnlockedWorld = 1;
    this.maxUnlockedStage = 1;
    // Flat-level mirrors kept for the current single-row selector and for
    // older callers/tests; they always mirror selectedWorld/currentWorld.
    this.maxUnlockedLevel = 1;
    this.selectedLevel = 1;
    this.menuLevelText = null;
    this.menuArrowLeft = null;
    this.menuArrowRight = null;
    this.menuStartHitArea = null;
    this.menuControlDownTime = null;
    // Two-tier World/Stage selector records + World backdrop layers.
    this.menuWorldButtons = [];
    this.menuStageButtons = [];
    this.backdropImage = null;
    this.vignetteImage = null;
    this.foliageSprites = [];
    this.loadProgress();

    this.bonusItems = [];
    this.scoreText = null;
    this.highScoreText = null;
    this.levelText = null;
    this.gameState = 'MENU';
    this.spawnedMarblesCount = 0;
    // Spawn index of the last special marble, so power-ups stay spread out
    // (see SPECIAL_SPAWN_GAP / SPECIAL_MIN_SPAWN).
    this.lastSpecialSpawnIndex = -SPECIAL_SPAWN_GAP;
    this.bonusTimer = 0;
    this.levelWon = false;
    this.menuOverlay = null;
    this.gameOverOverlay = null;
    this.menuButton = null;
    this.restartButton = null;
    this.homeButton = null;
    this.homeHover = null;
    this.exitButtonDownTime = null;
    // Victory animation on the win overlay (video when H.264 is available,
    // Graphics/star fallback otherwise).
    this.victoryVideoSupported = false;
    this.victoryVideo = null;
    this.victoryVideoKey = null;
    this.victoryVideoErrorHandler = null;
    this.victorySlot = null;
    this.victoryFallbackTweens = [];
    this.hudObjects = [];
    this.launcherHalo = null;
    this.launcherBase = null;

    // Responsive playfield. `vw`/`vh` are the live logical board size, `cx`/`cy`
    // its centre and `launcherX`/`launcherY` where the turret sits (centre on a
    // landscape board, bottom-centre on a portrait board). `uiScale` is the
    // uniform factor applied to the design-space overlays so text and pills
    // never distort. All values are (re)computed by applyViewport().
    this.vw = VIEW_WIDTH;
    this.vh = VIEW_HEIGHT;
    this.cx = CENTER_X;
    this.cy = CENTER_Y;
    this.isPortraitView = false;
    this.uiScale = 1;
    this.uiOriginX = 0;
    this.uiOriginY = 0;
    this.launcherX = CENTER_X;
    this.launcherY = CENTER_Y;
    this.hudLeftTexts = [];
    this.hudRightTexts = [];
    this.layoutSpecs = [];
    this.menuBackdrop = null;
    this.resultBackdrop = null;
    this.foliagePlacements = [];
    this.moteSprites = [];
    // Music mute toggle (HUD-level button, visible on the menu too).
    this.musicMuted = false;
    this.musicButton = null;
    this.musicButtonBg = null;
    this.musicButtonHover = null;
    this.musicButtonStrike = null;
    this.musicButtonLabel = null;
    this.musicButtonBounds = null;
    this.musicControlDownTime = null;
    this.pendingBgmKey = null;
    this.loadMusicPreference();

    // Background-music manager state (custom mp3 tracks, see preload()).
    this.bgmTracks = {};
    this.currentBgmKey = null;
    this.bgmUnlockBound = false;
    this.bgmDecodePatched = false;
  }

  preload() {
    // Chromium's callback-style decodeAudioData ALSO returns (and rejects) a
    // Promise. For a corrupt/missing mp3 that rejection is unhandled and
    // surfaces as an uncaught EncodingError. Attach a no-op catch so a bad
    // BGM asset can never crash/white-screen the game; Phaser's own failure
    // callback still reports the load error and boot continues.
    const audioContext = this.sound && this.sound.context;

    if (audioContext && typeof audioContext.decodeAudioData === 'function') {
      this.bgmDecodePatched = true;
      this.bgmOriginalDecode = audioContext.decodeAudioData.bind(audioContext);

      audioContext.decodeAudioData = (data, success, failure) => {
        let promise = null;

        try {
          promise = this.bgmOriginalDecode(data, success, failure);
        } catch (error) {
          if (typeof failure === 'function') {
            failure(error);
          }

          return;
        }

        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => {});
        }

        return promise;
      };

      this.load.once('complete', () => {
        if (this.bgmDecodePatched) {
          audioContext.decodeAudioData = this.bgmOriginalDecode;
          this.bgmDecodePatched = false;
        }
      });
    }

    // Stream the custom BGM through Phaser's loader so the manager can rely
    // on decoded cache entries. A 404 or undecodable file only warns; the
    // game keeps running silently (playBgm() checks the cache first).
    this.load.on('loaderror', (file) => {
      if (file && typeof file.key === 'string' && file.key.startsWith('bgm-')) {
        console.warn(
          `[BGM] failed to load "${file.key}" (${file.src || file.url})`,
        );
      }

      // A missing victory cut is survivable: the win panel falls back to the
      // other orientation and finally to the generated graphics art.
      if (
        file &&
        typeof file.key === 'string' &&
        Object.values(VICTORY_VIDEO_KEYS).includes(file.key)
      ) {
        console.warn(
          `[Victory] failed to load "${file.key}" (${file.src || file.url})`,
        );
      }
    });

    for (const track of BGM_TRACKS) {
      if (!this.cache.audio.exists(track.key)) {
        this.load.audio(track.key, track.url);
      }
    }

    // Optional victory clip, loaded only when H.264 decoding is available.
    this.loadVictoryVideoAsset();
  }

  loadVictoryVideoAsset() {
    this.victoryVideoSupported = false;

    try {
      const probe = document.createElement('video');
      const canPlayH264 =
        probe.canPlayType('video/mp4; codecs="avc1.42E01E"') !== '';

      if (
        !canPlayH264 ||
        !this.load ||
        typeof this.load.video !== 'function'
      ) {
        return false;
      }

      // Relative to the page (no leading "/"), so the clip also loads when the
      // build is deployed under a GitHub Pages subpath. The H.264 gate above
      // and the hasVictoryVideoTexture() fallback still guard playback.
      // Both cuts are registered up front: the board can flip orientation
      // (phone rotation, desktop window resize) while the win panel is open.
      for (const orientation of Object.keys(VICTORY_VIDEO_KEYS)) {
        const key = VICTORY_VIDEO_KEYS[orientation];

        if (this.cache && this.cache.video && this.cache.video.exists(key)) {
          continue;
        }

        this.load.video(
          key,
          VICTORY_VIDEO_SOURCES[orientation],
          'loadeddata',
          true,
        );
      }

      this.victoryVideoSupported = true;
      return true;
    } catch {
      this.victoryVideoSupported = false;
      return false;
    }
  }

  create() {
    this.slowdownTimer = 0;
    this.reverseTimer = 0;
    this.pauseTimer = 0;
    this.sniperBuffActive = false;
    this.sniperTimer = 0;
    this.sniperLaser = null;
    this.sniperLaserTarget = null;
    this.sniperLaserEnd = null;
    this.sniperLaserVisible = false;
    // BGM state is rebuilt every scene create; stop any stale track first.
    this.stopBgm();
    this.bgmTracks = {};
    this.currentBgmKey = null;
    this.bgmUnlockBound = false;
    this.score = 0;
    this.currentWorld = 1;
    this.currentStage = 1;
    this.chains = [];
    this.primaryChain = null;
    this.spawnChainCursor = 0;
    this.spawnedMarblesCount = 0;
    this.bonusTimer = 0;
    this.levelWon = false;
    this.gameState = 'MENU';
    this.bonusItems = [];
    this.exitButtonDownTime = null;
    this.menuControlDownTime = null;
    // Derive the live board rectangle from the configured game size before
    // anything is built, so every layer below uses the responsive geometry.
    this.applyViewport(true);
    this.createBackdrop();

    // No track and no marble chain on the start menu: they are built per level
    // in startLevel(). The launcher still needs the marble textures, so they
    // are created here before createLauncher() bakes the colour socket.
    this.createMarbleTextures();
    this.createLauncher();
    this.createAmbientMotes();
    this.createHud();
    this.createMusicToggle();

    this.hudObjects = this.children.list.filter(
      (object) => object.depth === DEPTH.hud,
    );
    this.setHudVisible(false);
    this.setLauncherVisible(false);
    this.createMenu();

    // The board follows the window: main.js keeps the Phaser game size in sync
    // with the viewport aspect ratio, and every resize re-lays-out the scene.
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleViewportResize, this);

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
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleViewportResize, this);
      this.stopBgm();
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
    this.updateSniper(step);
    this.checkWinCondition();
  }

  setHudVisible(visible) {
    for (const object of this.hudObjects) {
      object.setVisible(visible);
    }

    // The exit button's hover highlight is tweened, so make sure a hidden HUD
    // cannot leave it mid-tween when the round ends or the player returns home.
    if (!visible && this.homeHover) {
      this.tweens.killTweensOf(this.homeHover);
      this.homeHover.setAlpha(0);
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
      this.menuBackdrop = null;
    }

    // The win video owns a media element plus a private texture key, so it is
    // torn down through its own helper (stops playback, frees the texture).
    this.destroyVictoryVideo();

    if (this.victoryFallbackTweens.length > 0) {
      for (const tween of this.victoryFallbackTweens) {
        if (tween) {
          tween.remove();
        }
      }
      this.victoryFallbackTweens = [];
    }

    this.victorySlot = null;

    if (this.gameOverOverlay) {
      this.gameOverOverlay.destroy();
      this.gameOverOverlay = null;
      this.resultBackdrop = null;
    }

    this.menuButton = null;
    this.restartButton = null;
    this.menuLevelText = null;
    this.menuArrowLeft = null;
    this.menuArrowRight = null;
    this.menuStartHitArea = null;
  }

  clearRoundObjects() {
    for (const chain of this.chains) {
      for (const marble of chain.marbles) {
        this.tweens.killTweensOf(marble);
        marble.destroy();
      }
      chain.marbles = [];
      chain.headDistance = 0;
      chain.chainComplete = false;
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

  // Absolute difficulty D = (world - 1) * MAX_STAGE + stage, 1..30.
  getDifficulty() {
    return (this.currentWorld - 1) * MAX_STAGE + this.currentStage;
  }

  // World 3 (D >= 21) runs two independent tracks/chains. A portrait board is
  // too narrow for two overlapping serpentines, so it always stays single-track.
  isDualTrack() {
    return this.currentWorld >= MAX_WORLD && !this.isPortraitView;
  }

  getTotalMarbles() {
    return LEVEL_BASE_MARBLES + this.getDifficulty() * LEVEL_MARBLES_STEP;
  }

  getChainSpeed() {
    return LEVEL_BASE_SPEED + this.getDifficulty() * LEVEL_SPEED_STEP;
  }

  // 0.1..1.0 across World 1 (matching the old W1/L1..L10 ramp exactly), then
  // a smooth continuation across Worlds 2 and 3 up to 2.0 at D = 30.
  getDifficultyRatio() {
    const difficulty = this.getDifficulty();

    return difficulty <= MAX_STAGE
      ? difficulty / MAX_STAGE
      : 1 + (difficulty - MAX_STAGE) / 20;
  }

  // Progressive palette: D 1-2 use 3 colours, D 3-4 use 4, D 5+ use all 5.
  // Only indices below this limit may ever be placed on a chain or queued in
  // the launcher, so no "locked" colour can appear before it is shootable.
  getActiveColorCount() {
    const difficulty = Math.max(1, this.getDifficulty());

    return Math.min(
      MARBLE_COLORS.length,
      3 + Math.floor((difficulty - 1) / 2),
    );
  }

  // Special-marble odds ramp smoothly with absolute difficulty D. World 1
  // keeps the previously verified L1 (2.8/0.8/2.6%) .. L10 (10/8/8%) curve;
  // Worlds 2-3 continue ramping to roughly 18/16/14% at W3S10.
  getSpecialChances() {
    const difficulty = this.getDifficultyRatio();

    return {
      bomb: BOMB_BASE_CHANCE + BOMB_LEVEL_CHANCE * difficulty,
      reverse: REVERSE_LEVEL_CHANCE * difficulty,
      pause: PAUSE_BASE_CHANCE + PAUSE_LEVEL_CHANCE * difficulty,
      // Fixed ~5% documented chance: an instant-fire sniper marble.
      sniper: SNIPER_CHANCE,
    };
  }

  getNextWorldStage(world = this.currentWorld, stage = this.currentStage) {
    if (stage < MAX_STAGE) {
      return { world, stage: stage + 1 };
    }

    if (world < MAX_WORLD) {
      return { world: world + 1, stage: 1 };
    }

    // W3S10 is the final stage: the "next level" action replays it.
    return { world: MAX_WORLD, stage: MAX_STAGE };
  }

  worldStageToLevel(world, stage) {
    return (world - 1) * MAX_STAGE + stage;
  }

  levelToWorldStage(level) {
    const flat = Phaser.Math.Clamp(
      Math.round(level) || 1,
      1,
      MAX_WORLD * MAX_STAGE,
    );

    return {
      world: Math.floor((flat - 1) / MAX_STAGE) + 1,
      stage: ((flat - 1) % MAX_STAGE) + 1,
    };
  }

  // Highest stage available in `world`: every stage of an earlier world, the
  // stored unlock in the newest world, and none for a still-locked world.
  getMaxStageForWorld(world) {
    if (world < this.maxUnlockedWorld) {
      return MAX_STAGE;
    }

    if (world === this.maxUnlockedWorld) {
      return this.maxUnlockedStage;
    }

    return 0;
  }

  getWorldTheme(world = this.selectedWorld) {
    const index = Phaser.Math.Clamp(Math.round(world) || 1, 1, MAX_WORLD) - 1;
    return WORLD_THEMES[index];
  }

  isWorldLocked(world) {
    return world > Math.max(1, this.maxUnlockedWorld);
  }

  // Progressive pickup cap: W1 stays readable with 1-2 stars and later worlds
  // grow to four. D1-8 = 1, D9-16 = 2, D17-24 = 3, D25-30 = 4.
  getBonusCap() {
    const difficulty = Math.max(1, this.getDifficulty());
    return Math.min(4, 1 + Math.floor((difficulty - 1) / 8));
  }

  // Paint one World/Stage choice pill in its locked / selected / normal state.
  paintMenuChoice(record) {
    const { bg, label, x, y, width, height, locked, selected } = record;
    const radius = Math.min(10, height / 2);
    const left = x - width / 2;
    const top = y - height / 2;

    bg.clear();

    if (locked) {
      bg.fillStyle(0x000000, 0.18);
      bg.fillRoundedRect(left, top, width, height, radius);
      bg.lineStyle(1, 0x6f6a5e, 0.14);
      bg.strokeRoundedRect(left + 0.5, top + 0.5, width - 1, height - 1, radius);
      label.setColor('#6f6a5e');
      label.setAlpha(0.5);
      return;
    }

    if (selected) {
      bg.fillStyle(0x3f3218, 0.86);
      bg.fillRoundedRect(left, top, width, height, radius);
      bg.lineStyle(2, 0xffd98a, 0.9);
      bg.strokeRoundedRect(left + 1, top + 1, width - 2, height - 2, radius - 1);
      label.setColor('#ffe9a8');
      label.setAlpha(1);
      return;
    }

    bg.fillStyle(0x000000, 0.32);
    bg.fillRoundedRect(left, top, width, height, radius);
    bg.lineStyle(1, 0xd7c17d, 0.24);
    bg.strokeRoundedRect(left + 0.5, top + 0.5, width - 1, height - 1, radius);
    label.setColor('#d9c68c');
    label.setAlpha(0.92);
  }

  // Generate the desert/volcanic backdrop + vignette canvases once. World 1
  // keeps the original jungle textures so its look stays untouched.
  createWorldBackdropVariants() {
    for (const theme of WORLD_THEMES) {
      if (theme.id === 1) {
        continue;
      }

      const backdropKey = `zs-backdrop-w${theme.id}`;

      if (!this.textures.exists(backdropKey)) {
        const canvas = document.createElement('canvas');
        canvas.width = VIEW_WIDTH;
        canvas.height = VIEW_HEIGHT;

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = theme.sky;
        ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

        const glow = ctx.createRadialGradient(
          CENTER_X + 24,
          250,
          30,
          CENTER_X,
          300,
          500,
        );
        glow.addColorStop(0, theme.glow[0]);
        glow.addColorStop(0.42, theme.glow[1]);
        glow.addColorStop(0.72, theme.glow[2]);
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = theme.shaft;
        ctx.beginPath();
        ctx.moveTo(130, -40);
        ctx.lineTo(244, -40);
        ctx.lineTo(420, 640);
        ctx.lineTo(248, 640);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = theme.shaft;
        ctx.beginPath();
        ctx.moveTo(560, -40);
        ctx.lineTo(660, -40);
        ctx.lineTo(790, 640);
        ctx.lineTo(618, 640);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        const rng = new Phaser.Math.RandomDataGenerator([
          `serpentine-backdrop-${theme.id}`,
        ]);
        for (let i = 0; i < 220; i += 1) {
          const x = rng.between(0, VIEW_WIDTH);
          const y = rng.between(0, VIEW_HEIGHT);
          const radius = rng.realInRange(0.35, 1.5);
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${theme.speck}, ${rng.realInRange(0.015, 0.055)})`;
          ctx.fill();
        }

        this.textures.addCanvas(backdropKey, canvas);
      }

      const vignetteKey = `zs-vignette-w${theme.id}`;

      if (!this.textures.exists(vignetteKey)) {
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
        vignette.addColorStop(0, `rgba(${theme.vignette}, 0)`);
        vignette.addColorStop(0.62, `rgba(${theme.vignette}, 0.14)`);
        vignette.addColorStop(1, `rgba(${theme.vignette}, 0.66)`);
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

        this.textures.addCanvas(vignetteKey, canvas);
      }
    }
  }

  // Swap the visible backdrop/vignette/foliage to a World's palette.
  applyWorldBackdrop(world = this.selectedWorld) {
    const theme = this.getWorldTheme(world);

    if (this.backdropImage) {
      this.backdropImage.setTexture(
        theme.id === 1 ? 'zs-backdrop' : `zs-backdrop-w${theme.id}`,
      );
    }

    if (this.vignetteImage) {
      this.vignetteImage.setTexture(
        theme.id === 1 ? 'zs-vignette' : `zs-vignette-w${theme.id}`,
      );
    }

    if (this.foliageSprites) {
      for (const leaf of this.foliageSprites) {
        leaf.setTint(theme.foliageTint);
      }
    }

    return theme;
  }

  clampSelectedProgress() {
    this.selectedWorld = Phaser.Math.Clamp(
      Math.round(this.selectedWorld) || 1,
      1,
      Math.max(1, this.maxUnlockedWorld),
    );
    this.selectedStage = Phaser.Math.Clamp(
      Math.round(this.selectedStage) || 1,
      1,
      Math.max(1, this.getMaxStageForWorld(this.selectedWorld)),
    );
    this.selectedLevel = this.worldStageToLevel(
      this.selectedWorld,
      this.selectedStage,
    );
  }

  // Load the highest unlocked World/Stage pair from localStorage. Legacy
  // `zumaMaxLevel` (flat 1..30) is migrated when the new keys are absent;
  // corrupt/missing values fall back to W1S1 and everything is clamped.
  loadProgress() {
    let maxWorld = 1;
    let maxStage = 1;

    try {
      const rawWorld = localStorage.getItem('zumaMaxWorld');
      const rawStage = localStorage.getItem('zumaMaxStage');

      if (rawWorld !== null || rawStage !== null) {
        const world = Number(rawWorld);
        const stage = Number(rawStage);

        if (Number.isFinite(world)) {
          maxWorld = Math.floor(world);
        }

        if (Number.isFinite(stage)) {
          maxStage = Math.floor(stage);
        }
      } else {
        const legacy = Number(localStorage.getItem('zumaMaxLevel'));

        if (Number.isFinite(legacy) && legacy >= 1) {
          const migrated = this.levelToWorldStage(legacy);
          maxWorld = migrated.world;
          maxStage = migrated.stage;
        }
      }
    } catch {
      maxWorld = 1;
      maxStage = 1;
    }

    this.maxUnlockedWorld = Phaser.Math.Clamp(
      Number.isFinite(maxWorld) ? maxWorld : 1,
      1,
      MAX_WORLD,
    );
    this.maxUnlockedStage = Phaser.Math.Clamp(
      Number.isFinite(maxStage) ? maxStage : 1,
      1,
      MAX_STAGE,
    );
    this.maxUnlockedLevel = this.worldStageToLevel(
      this.maxUnlockedWorld,
      this.maxUnlockedStage,
    );

    this.selectedWorld = 1;
    this.selectedStage = 1;
    this.selectedLevel = 1;
  }

  saveProgress() {
    try {
      localStorage.setItem('zumaMaxWorld', String(this.maxUnlockedWorld));
      localStorage.setItem('zumaMaxStage', String(this.maxUnlockedStage));
      // Legacy mirror so older builds/tests can still read a flat cap.
      localStorage.setItem('zumaMaxLevel', String(this.maxUnlockedLevel));
    } catch {
      // Storage can be unavailable in private or embedded contexts.
    }
  }

  // Legacy flat-level selector movement, used by the current single-row home
  // menu. The two-tier menu agent should drive selectedWorld/selectedStage.
  changeSelectedLevel(delta) {
    const maxLevel = Math.max(1, this.maxUnlockedLevel);
    const next = Phaser.Math.Clamp(
      Math.round(this.selectedLevel) + delta,
      1,
      maxLevel,
    );

    if (next === this.selectedLevel) {
      return;
    }

    this.selectedLevel = next;
    const target = this.levelToWorldStage(next);
    this.selectedWorld = target.world;
    this.selectedStage = target.stage;
    this.refreshLevelSelector();
  }

  // Redraw the level label and dim arrows that cannot move any further.
  refreshLevelSelector() {
    this.clampSelectedProgress();

    if (this.menuLevelText) {
      this.menuLevelText.setText(
        `第 ${this.selectedWorld} 世界 · 第 ${this.selectedStage} 關`,
      );
    }

    const updateArrow = (arrow, enabled) => {
      if (!arrow) {
        return;
      }

      arrow.setAlpha(enabled ? 1 : 0.22);
      arrow.setColor(enabled ? '#ffd98a' : '#8f7f5c');

      if (arrow.input) {
        arrow.input.enabled = enabled;
      }
    };

    updateArrow(this.menuArrowLeft, this.selectedLevel > 1);
    updateArrow(
      this.menuArrowRight,
      this.selectedLevel < Math.max(1, this.maxUnlockedLevel),
    );
  }

  /* ------------------------------------------------------------------ */
  /* Procedural retro audio (Web Audio API, no external files)           */
  /* ------------------------------------------------------------------ */

  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;

      if (AudioContext) {
        try {
          this.audioCtx = new AudioContext();
        } catch {
          this.audioCtx = null;
        }
      }
    }

    // Browsers suspend audio until the first user gesture; resume whenever a
    // click reaches the game so the synth is unlocked immediately.
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        const resume = this.audioCtx.resume();
        if (resume && typeof resume.catch === 'function') {
          resume.catch(() => {});
        }
      } catch {
        // Audio is a progressive enhancement; never break gameplay for it.
      }
    }

    // A gesture must also unlock the Phaser SoundManager + its AudioContext
    // and retry the intended BGM (mobile autoplay settles asynchronously).
    this.unlockBgmAudio();
  }

  /* ------------------------------------------------------------------ */
  /* Background music (custom mp3 tracks loaded in preload())            */
  /* ------------------------------------------------------------------ */

  // Resolve a cached BGM key to a Phaser Sound, creating it lazily.
  getBgmTrack(key) {
    if (!key || !this.sound) {
      return null;
    }

    const cached = this.cache && this.cache.audio && this.cache.audio.exists(key);

    if (!cached) {
      // Missing / undecodable asset: never throw, just remember the intent.
      return null;
    }

    if (this.bgmTracks[key]) {
      return this.bgmTracks[key];
    }

    let track = null;

    try {
      track = this.sound.get(key);
    } catch {
      track = null;
    }

    if (!track) {
      try {
        track = this.sound.add(key, { loop: true, volume: BGM_VOLUME });
      } catch {
        track = null;
      }
    }

    if (track) {
      this.bgmTracks[key] = track;
    }

    return track;
  }

  // Play one BGM track and stop every other one. Returns the Sound or null.
  playBgm(key) {
    if (!key) {
      return null;
    }

    // Muted: remember the theme (so unmuting resumes it) but stay silent.
    if (this.musicMuted) {
      this.stopBgm();
      this.currentBgmKey = key;
      this.pendingBgmKey = null;
      return null;
    }

    this.pendingBgmKey = key;

    // Browser autoplay lock: remember the intent and retry on first gesture.
    if (!this.sound || !this.isSoundUnlocked()) {
      this.stopBgm({ except: key });
      this.currentBgmKey = key;
      this.bindBgmUnlockRetry();
      return this.bgmTracks[key] || null;
    }

    const track = this.getBgmTrack(key);

    if (!track) {
      // Asset unavailable: stop the previous theme, keep the intent so a
      // later hook/gesture can retry once the asset exists.
      this.stopBgm({ except: key });
      this.currentBgmKey = key;
      return null;
    }

    // Never restart a track that is already playing.
    if (this.currentBgmKey === key && track.isPlaying) {
      return track;
    }

    this.stopBgm({ except: key });

    try {
      track.setVolume(BGM_VOLUME);
      track.play();
    } catch {
      // A racing autoplay lock must never break the game.
      this.bindBgmUnlockRetry();
    }

    this.currentBgmKey = key;
    return track;
  }

  // Stop every BGM track (optionally keeping one key playing).
  stopBgm(options = {}) {
    const except = options && options.except ? options.except : null;

    for (const track of BGM_TRACKS) {
      const key = track.key;

      if (except && key === except) {
        continue;
      }

      let sound = this.bgmTracks ? this.bgmTracks[key] : null;

      if (!sound && this.sound) {
        try {
          sound = this.sound.get(key);
        } catch {
          sound = null;
        }
      }

      if (!sound) {
        continue;
      }

      try {
        sound.stop();
      } catch {
        // Already stopped/destroyed tracks are fine.
      }
    }

    if (!except) {
      this.currentBgmKey = null;
    }
  }

  // True when a BGM key exists in the cache and is currently playing.
  isBgmPlaying(key) {
    const track = this.getBgmTrack(key);
    return !!(track && track.isPlaying);
  }

  // Current track key (helper for menus/tests).
  getCurrentBgmKey() {
    return this.currentBgmKey;
  }

  // Retry the intended BGM after an autoplay unlock / user gesture.
  retryBgmAfterUnlock() {
    if (!this.sound || !this.currentBgmKey) {
      return;
    }

    if (!this.isSoundUnlocked()) {
      return;
    }

    if (!this.isBgmPlaying(this.currentBgmKey)) {
      this.playBgm(this.currentBgmKey);
    }
  }

  // True when the Phaser sound manager is usable. iOS/Safari can keep
  // locked=true for a tick after the AudioContext actually resumed, so a
  // running context counts as unlocked (play() is safe then).
  isSoundUnlocked() {
    if (!this.sound) {
      return false;
    }

    if (!this.sound.locked) {
      return true;
    }

    const context = this.sound.context;
    return !!(context && context.state === 'running');
  }

  // Mobile autoplay unlock: called from every real user gesture (start tap,
  // pointerdown and initAudio). Every Phaser call is feature-guarded so an
  // HTML5-only / older / no-audio manager can never throw; afterwards the
  // intended BGM is retried, including once more after the unlock settles.
  unlockBgmAudio() {
    if (!this.sound) {
      return false;
    }

    // Both Phaser backends expose unlock(); calling it resumes the context
    // and flushes Phaser's locked-actions queue (queued BGM play included).
    try {
      if (typeof this.sound.unlock === 'function') {
        this.sound.unlock();
      }
    } catch {
      // Audio is a progressive enhancement; never break gameplay for it.
    }

    // Resume the underlying AudioContext directly as well: on iOS Safari the
    // explicit resume inside the gesture is what actually starts playback.
    const context = this.sound.context;

    if (context && typeof context.resume === 'function') {
      try {
        const resume = context.resume();
        if (resume && typeof resume.catch === 'function') {
          resume.catch(() => {});
        }
      } catch {
        // Ignore resume races; the retries below still cover the unlock.
      }
    }

    this.retryBgmAfterUnlock();

    // Last-chance retry once the async unlock promise has settled (Safari
    // fires 'unlocked' late). playBgm never restarts a playing track.
    if (this.currentBgmKey && !this.isBgmPlaying(this.currentBgmKey)) {
      try {
        this.time.delayedCall(80, () => this.retryBgmAfterUnlock());
      } catch {
        // Scene clock unavailable (shutdown) - ignore.
      }
    }

    return this.isSoundUnlocked();
  }

  // Listen once for the Phaser sound unlock and retry the queued BGM.
  bindBgmUnlockRetry() {
    if (this.bgmUnlockBound) {
      return;
    }

    this.bgmUnlockBound = true;

    const retry = () => {
      this.bgmUnlockBound = false;
      this.retryBgmAfterUnlock();
    };

    try {
      if (this.sound && typeof this.sound.once === 'function') {
        this.sound.once('unlocked', retry);
      }
    } catch {
      // Ignore: the gesture-based retry below still covers the unlock.
    }

    try {
      if (this.input && typeof this.input.once === 'function') {
        this.input.once('pointerdown', retry);
      }
    } catch {
      // Ignore: the sound-manager unlock event above is the primary path.
    }
  }

  playShootSound() {
    if (!this.audioCtx) {
      return;
    }

    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  playClickSound() {
    if (!this.audioCtx) {
      return;
    }

    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(150, now);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.05);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  playMatchSound() {
    if (!this.audioCtx) {
      return;
    }

    const now = this.audioCtx.currentTime;
    const notes = [523, 659, 783];

    notes.forEach((frequency, index) => {
      const start = now + index * 0.08;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.08);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.085);
    });
  }

  playBonusSound() {
    if (!this.audioCtx) {
      return;
    }

    // Bright C-major arpeggio: C6, E6, G6, C7 - fast, short, sine only.
    const now = this.audioCtx.currentTime;
    const notes = [1046.5, 1318.5, 1568, 2093];

    notes.forEach((frequency, index) => {
      const start = now + index * 0.06;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.075);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.08);
    });
  }

  playExplosionSound() {
    if (!this.audioCtx) {
      return;
    }

    const now = this.audioCtx.currentTime;
    const duration = 0.8;

    // Main rumble: a low sawtooth sweeping down 45 Hz -> 24 Hz with a
    // loud, long exponential decay (0.8 -> silence over ~0.8 s).
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(45, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + duration);

    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);

    // A second, deeper detuned oscillator adds a physical shake underneath.
    const sub = this.audioCtx.createOscillator();
    const subGain = this.audioCtx.createGain();

    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(30, now);
    sub.frequency.exponentialRampToValueAtTime(15, now + duration);
    sub.detune.setValueAtTime(-14, now);

    subGain.gain.setValueAtTime(0.45, now);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    sub.connect(subGain);
    subGain.connect(this.audioCtx.destination);
    sub.start(now);
    sub.stop(now + duration + 0.02);

    // 9 Hz gain tremor makes the tail of the boom shake.
    const lfo = this.audioCtx.createOscillator();
    const lfoGain = this.audioCtx.createGain();

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(9, now);
    lfoGain.gain.setValueAtTime(0.12, now);

    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start(now);
    lfo.stop(now + duration);
  }

  // Fresh run from the home menu or after a loss: start the selected level
  // with a zeroed run score. `startLevel` handles the rest of the setup.
  startGame(world = this.selectedWorld, stage = this.selectedStage) {
    this.initAudio();

    let target;

    if (arguments.length === 0) {
      // Normal start from the home menu: use the selected World/Stage pair,
      // clamped defensively in case the menu exposes a locked selection.
      this.clampSelectedProgress();
      target = { world: this.selectedWorld, stage: this.selectedStage };
    } else if (arguments.length === 1) {
      // Legacy flat-level signature startGame(1..30). Also used by the loss
      // restart below via startGame(1, 1) instead.
      const requested = Number.isFinite(world) ? world : this.selectedLevel;
      target = this.levelToWorldStage(
        Phaser.Math.Clamp(
          Math.round(requested) || 1,
          1,
          Math.max(1, this.maxUnlockedLevel),
        ),
      );
    } else {
      const targetWorld = Phaser.Math.Clamp(
        Math.round(world) || 1,
        1,
        Math.max(1, this.maxUnlockedWorld),
      );
      const maxStage = Math.max(1, this.getMaxStageForWorld(targetWorld));
      target = {
        world: targetWorld,
        stage: Phaser.Math.Clamp(Math.round(stage) || 1, 1, maxStage),
      };
    }

    this.currentWorld = target.world;
    this.currentStage = target.stage;
    this.selectedWorld = target.world;
    this.selectedStage = target.stage;
    this.selectedLevel = this.worldStageToLevel(target.world, target.stage);
    this.score = 0;
    this.startLevel();

    // The start tap IS the user gesture on mobile: force the unlock here so
    // the gameplay theme starts even when the sound manager settles late.
    this.unlockBgmAudio();
  }

  // Begin (or continue into) the current World/Stage. Score, currentWorld and
  // currentStage are intentionally NOT reset here so clearing a stage keeps
  // the cumulative run score.
  startLevel() {
    this.destroyOverlays();
    this.clearRoundObjects();

    this.applyWorldBackdrop(this.currentWorld);

    // Build the stage's track(s) before anything else can reference them. The
    // selection happens here (not in create()) so the start menu has no track
    // and every stage gets freshly built spline(s) + visuals. World 3 builds
    // two independent chain contexts; Worlds 1-2 build a single one.
    this.buildLevelTracks();
    this.createMarbles();
    this.createTracks();

    this.gameState = 'PLAYING';
    this.spawnedMarblesCount = 0;
    this.spawnChainCursor = 0;
    this.lastSpecialSpawnIndex = -SPECIAL_SPAWN_GAP;
    this.bonusTimer = 0;
    this.slowdownTimer = 0;
    this.reverseTimer = 0;
    this.pauseTimer = 0;
    this.sniperBuffActive = false;
    this.sniperTimer = 0;
    if (this.sniperLaser) {
      this.sniperLaser.destroy();
      this.sniperLaser = null;
    }
    this.sniperLaserTarget = null;
    this.sniperLaserEnd = null;
    this.sniperLaserVisible = false;
    this.chainComplete = false;
    this.chainHeadDistance = 0;
    this.levelWon = false;
    // Reset the launcher queue inside the palette active for this stage (also
    // covers jumping stages/worlds through the home selector). The queued next
    // colour goes through pickNextBulletColor so a late level can never ask for
    // a colour that is no longer on the board.
    const activeColorCount = this.getActiveColorCount();
    this.currentBulletColor = INITIAL_CURRENT_COLOR % activeColorCount;
    this.nextBulletColor = this.pickNextBulletColor(this.currentBulletColor);
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

    // PLAYING (including startNextLevel) always runs the gameplay theme;
    // the menu/victory tracks are stopped by playBgm().
    this.playBgm(BGM_KEYS.gameplay);
  }

  // Called by the win overlay ("進入下一關"): advance Stage 1..10, rolling
  // Stage 10 into the next World. At the W3S10 cap the same final stage is
  // replayed. Cumulative score is preserved.
  startNextLevel() {
    if (this.gameState !== 'GAMEOVER' || !this.levelWon) {
      return;
    }

    const next = this.getNextWorldStage();
    const currentFlat = this.worldStageToLevel(
      this.currentWorld,
      this.currentStage,
    );
    const nextFlat = this.worldStageToLevel(next.world, next.stage);

    if (nextFlat > currentFlat) {
      this.currentWorld = next.world;
      this.currentStage = next.stage;
    }

    this.selectedWorld = this.currentWorld;
    this.selectedStage = this.currentStage;
    this.selectedLevel = this.worldStageToLevel(
      this.currentWorld,
      this.currentStage,
    );
    this.startLevel();
  }

  endGame(isWin) {
    if (this.gameState !== 'PLAYING') {
      return;
    }

    this.gameState = 'GAMEOVER';
    this.levelWon = isWin;
    this.slowdownTimer = 0;
    this.sniperBuffActive = false;
    this.sniperTimer = 0;
    this.hideSniperLaser();

    if (isWin) {
      this.addScore(WIN_BONUS);

      // Clearing a stage unlocks the next one (Stage 10 -> next World Stage
      // 1, capped at W3S10) and persists the highest unlock immediately.
      const next = this.getNextWorldStage();
      const nextLevel = this.worldStageToLevel(next.world, next.stage);

      if (nextLevel > this.maxUnlockedLevel) {
        if (next.world > this.maxUnlockedWorld) {
          this.maxUnlockedWorld = next.world;
          this.maxUnlockedStage = next.stage;
        } else if (next.world === this.maxUnlockedWorld) {
          this.maxUnlockedStage = Math.max(
            this.maxUnlockedStage,
            next.stage,
          );
        }

        this.maxUnlockedLevel = this.worldStageToLevel(
          this.maxUnlockedWorld,
          this.maxUnlockedStage,
        );
        this.saveProgress();
      }

      this.selectedWorld = this.currentWorld;
      this.selectedStage = this.currentStage;
      this.selectedLevel = this.worldStageToLevel(
        this.currentWorld,
        this.currentStage,
      );

      // Victory: the gameplay loop stops and the victory theme plays.
      this.stopBgm();
      this.playBgm(BGM_KEYS.victory);
    } else {
      // Loss: gameplay music stops; the menu theme resumes on return.
      this.stopBgm();
    }

    this.setHudVisible(false);
    this.setLauncherVisible(false);
    this.showGameOverOverlay(isWin);
  }

  getTotalChainMarbles() {
    let total = 0;

    for (const chain of this.chains) {
      total += chain.marbles.length;
    }

    return total;
  }

  checkWinCondition() {
    if (this.gameState !== 'PLAYING') {
      return;
    }

    if (
      this.spawnedMarblesCount >= this.getTotalMarbles() &&
      this.getTotalChainMarbles() === 0
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

    if (this.bonusItems.length < this.getBonusCap()) {
      this.spawnRandomBonusItem();
    }
  }

  spawnRandomBonusItem() {
    // Prefer a non-gap pickup; on the World 3 dual-track board most firing
    // lanes cross a track, so fall back to any clear spot to respect the cap.
    const spot =
      this.findOpenBonusSpot(this.bonusItems, false) ||
      this.findOpenBonusSpot(this.bonusItems, true);

    if (!spot) {
      return false;
    }

    this.spawnBonusItem(spot.x, spot.y);
    return true;
  }

  createMenu() {
    this.destroyOverlays();
    this.setHudVisible(false);
    this.setLauncherVisible(false);

    // The home screen previews the selected world's backdrop palette.
    this.applyWorldBackdrop(this.selectedWorld);
    const theme = this.getWorldTheme(this.selectedWorld);

    const overlay = this.add
      .container(0, 0)
      .setDepth(DEPTH.overlay);

    const backdrop = this.add.rectangle(
      CENTER_X,
      CENTER_Y,
      VIEW_WIDTH,
      VIEW_HEIGHT,
      Phaser.Display.Color.HexStringToColor(theme.menuTint).color,
      0.72,
    );

    const kicker = this.add
      .text(CENTER_X, 104, `${theme.name}探險`, {
        fontFamily: UI_FONT,
        fontSize: '13px',
        color: theme.accent,
      })
      .setOrigin(0.5)
      .setAlpha(0.72);

    const title = this.add
      .text(CENTER_X, 166, '祖瑪：叢林探險', {
        fontFamily: UI_FONT,
        fontSize: '54px',
        color: '#f7e9c2',
      })
      .setOrigin(0.5)
      .setShadow(0, 5, '#000000', 16, false, true);

    const rule = this.add.rectangle(
      CENTER_X,
      214,
      260,
      1,
      0xd7c17d,
      0.4,
    );

    const highScore = this.add
      .text(
        CENTER_X,
        242,
        `最高分  ${this.formatScore(this.highScore)}`,
        {
          fontFamily: UI_FONT,
          fontSize: '13px',
          color: '#d9c68c',
        },
      )
      .setOrigin(0.5)
      .setAlpha(0.8);

    // Two-tier World / Stage selector. Every choice is a Graphics pill with a
    // centred label and its own interactive Zone; locked choices stay grey and
    // non-interactive so they can never start a run or fire a marble.
    this.menuWorldButtons = [];
    this.menuStageButtons = [];

    const makeChoiceButton = ({
      kind,
      value,
      x,
      y,
      width,
      height,
      label,
      locked,
      selected,
      onPick,
    }) => {
      const record = {
        kind,
        value,
        x,
        y,
        width,
        height,
        locked,
        selected,
        bg: null,
        label: null,
        zone: null,
      };

      record.bg = this.add.graphics();
      record.label = this.add
        .text(x, y, label, {
          fontFamily: UI_FONT,
          fontSize: '13px',
          color: '#d9c68c',
        })
        .setOrigin(0.5);

      record.zone = this.add.zone(x, y, width, height).setOrigin(0.5);

      if (!locked) {
        record.zone.setInteractive({ useHandCursor: true });

        record.zone.on('pointerover', () => {
          record.label.setColor('#fff4c9');
        });

        record.zone.on('pointerout', () => {
          this.paintMenuChoice(record);
        });

        record.zone.on('pointerdown', (pointer, _localX, _localY, event) => {
          // Selector presses must never fall through to the scene handler,
          // which would otherwise launch a run or shoot a marble.
          event.stopPropagation();
          this.menuControlDownTime = pointer.downTime;
          onPick();
        });
      }

      this.paintMenuChoice(record);
      return record;
    };

    const worldY = 286;
    const worldWidth = 104;
    const worldHeight = 32;
    const worldGap = 12;
    const worldStartX =
      CENTER_X -
      ((MAX_WORLD * worldWidth + (MAX_WORLD - 1) * worldGap) / 2);

    const worldCaption = this.add
      .text(worldStartX - 10, worldY, '世界', {
        fontFamily: UI_FONT,
        fontSize: '11px',
        color: theme.accent,
      })
      .setOrigin(1, 0.5)
      .setAlpha(0.55);

    for (let world = 1; world <= MAX_WORLD; world += 1) {
      const worldTheme = this.getWorldTheme(world);
      const x =
        worldStartX + (world - 1) * (worldWidth + worldGap) + worldWidth / 2;

      this.menuWorldButtons.push(
        makeChoiceButton({
          kind: 'world',
          value: world,
          x,
          y: worldY,
          width: worldWidth,
          height: worldHeight,
          label: `${world} · ${worldTheme.name}`,
          locked: this.isWorldLocked(world),
          selected: world === this.selectedWorld,
          onPick: () => {
            this.selectedWorld = world;
            this.selectedStage = Phaser.Math.Clamp(
              this.selectedStage,
              1,
              Math.max(1, this.getMaxStageForWorld(world)),
            );
            this.createMenu();
          },
        }),
      );
    }

    const stageY = 334;
    const stageWidth = 30;
    const stageHeight = 30;
    const stageGap = 6;
    const stageStartX =
      CENTER_X -
      ((MAX_STAGE * stageWidth + (MAX_STAGE - 1) * stageGap) / 2);

    const stageLimit = Math.max(
      1,
      this.getMaxStageForWorld(this.selectedWorld),
    );

    const stageCaption = this.add
      .text(stageStartX - 10, stageY, '關卡', {
        fontFamily: UI_FONT,
        fontSize: '11px',
        color: theme.accent,
      })
      .setOrigin(1, 0.5)
      .setAlpha(0.55);

    for (let stage = 1; stage <= MAX_STAGE; stage += 1) {
      const x =
        stageStartX + (stage - 1) * (stageWidth + stageGap) + stageWidth / 2;
      const locked = stage > stageLimit;

      this.menuStageButtons.push(
        makeChoiceButton({
          kind: 'stage',
          value: stage,
          x,
          y: stageY,
          width: stageWidth,
          height: stageHeight,
          label: String(stage),
          locked,
          selected: stage === this.selectedStage,
          onPick: () => {
            this.selectedStage = stage;
            this.createMenu();
          },
        }),
      );
    }

    const selection = this.add
      .text(
        CENTER_X,
        374,
        `第 ${this.selectedWorld} 世界 · 第 ${this.selectedStage} 關`,
        {
          fontFamily: UI_FONT,
          fontSize: '13px',
          color: '#ffe39a',
        },
      )
      .setOrigin(0.5)
      .setAlpha(0.88);

    const hint = this.add
      .text(CENTER_X, 402, '同色三消 · 引爆炸彈 · 收集星星', {
        fontFamily: UI_FONT,
        fontSize: '12px',
        color: '#a9bd96',
      })
      .setOrigin(0.5)
      .setAlpha(0.52);

    const startButton = this.add
      .text(CENTER_X, 442, '點擊開始遊戲', {
        fontFamily: UI_FONT,
        fontSize: '22px',
        color: '#ffe39a',
      })
      .setOrigin(0.5)
      .setShadow(0, 2, '#000000', 8, false, true);

    // Explicit start target. The selector pills sit well outside this zone and
    // scene-level menu clicks are otherwise inert, so a selector click (or a
    // stray click on the title / high score) can never launch a run.
    this.menuStartHitArea = this.add
      .zone(CENTER_X, 442, 292, 54)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.menuStartHitArea.on('pointerover', () => {
      startButton.setColor('#fff4c9');
    });

    this.menuStartHitArea.on('pointerout', () => {
      startButton.setColor('#ffe39a');
    });

    this.menuStartHitArea.on(
      'pointerdown',
      (pointer, _localX, _localY, event) => {
        event.stopPropagation();
        this.menuControlDownTime = pointer.downTime;
        this.startGame();
      },
    );

    const choiceObjects = [
      ...this.menuWorldButtons.flatMap((record) => [
        record.bg,
        record.label,
        record.zone,
      ]),
      ...this.menuStageButtons.flatMap((record) => [
        record.bg,
        record.label,
        record.zone,
      ]),
    ];

    overlay.add([
      backdrop,
      kicker,
      title,
      rule,
      highScore,
      worldCaption,
      stageCaption,
      ...choiceObjects,
      selection,
      hint,
      startButton,
      this.menuStartHitArea,
    ]);

    this.menuOverlay = overlay;
    this.menuBackdrop = backdrop;
    this.menuButton = startButton;
    this.layoutOverlays();

    this.tweens.add({
      targets: startButton,
      alpha: { from: 1, to: 0.24 },
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Home screen BGM. Idempotent (same key is not restarted) and it queues
    // safely when the browser has not unlocked audio yet.
    this.playBgm(BGM_KEYS.menu);
  }

  // Leave the current run and go back to the start screen. Called directly by
  // the HUD exit button, so every round object has to be torn down: nothing
  // from the abandoned run may keep moving, shooting or showing behind home.
  returnToMenu() {
    if (this.gameState === 'MENU') {
      return;
    }

    this.gameState = 'MENU';
    this.clearRoundObjects();

    // The home screen must not show any part of the abandoned run's track:
    // wipe the drawn spline, its dashes, the start glow and the start ring.
    // The spline itself is rebuilt by the next startLevel().
    this.clearTrackVisuals();
    this.chains = [];
    this.primaryChain = null;
    this.track = null;
    this.trackSamples = [];
    this.trackLength = 0;
    this.deltaT = 0;
    this.marbles = [];

    this.setHudVisible(false);
    this.setLauncherVisible(false);

    // Reset the round-only state so a game started later begins from a clean
    // slate even if the player sits on the menu for a while.
    this.slowdownTimer = 0;
    this.reverseTimer = 0;
    this.pauseTimer = 0;
    this.sniperBuffActive = false;
    this.sniperTimer = 0;
    if (this.sniperLaser) {
      this.sniperLaser.destroy();
      this.sniperLaser = null;
    }
    this.sniperLaserTarget = null;
    this.sniperLaserEnd = null;
    this.sniperLaserVisible = false;
    this.bonusTimer = 0;
    this.chainComplete = false;
    this.levelWon = false;

    // Drop any residual camera shake/flash from the last impact so the home
    // screen is presented cleanly.
    this.cameras.main.resetFX();

    // The home selector picks up the World/Stage the player was just on,
    // clamped to the unlocked range, so returning home never shows a locked
    // stage.
    this.selectedWorld = Phaser.Math.Clamp(
      Math.round(this.currentWorld) || 1,
      1,
      Math.max(1, this.maxUnlockedWorld),
    );
    this.selectedStage = Phaser.Math.Clamp(
      Math.round(this.currentStage) || 1,
      1,
      Math.max(1, this.getMaxStageForWorld(this.selectedWorld)),
    );
    this.selectedLevel = this.worldStageToLevel(
      this.selectedWorld,
      this.selectedStage,
    );

    this.destroyOverlays();
    this.createMenu();

    // Mid-game exit: switch straight back to the menu theme.
    this.playBgm(BGM_KEYS.menu);
  }

  // Phaser's video loader stores the clip in the Video Cache (not the Texture
  // Manager); a same-key canvas texture must not be treated as playable.
  hasVictoryVideoTexture(key = VICTORY_VIDEO_KEYS.landscape) {
    try {
      if (
        this.cache &&
        this.cache.video &&
        typeof this.cache.video.exists === 'function' &&
        this.cache.video.exists(key)
      ) {
        return true;
      }

      if (!this.textures.exists(key)) {
        return false;
      }

      const texture = this.textures.get(key);
      const source = texture && texture.source && texture.source[0];
      return !!(source && source.video);
    } catch {
      return false;
    }
  }

  // Which cut the current board should show. Portrait boards (phones held
  // upright) get the vertical clip; everything else keeps the landscape clip
  // that was already shipped. If the preferred file is missing or unplayable
  // the other one is used, so a deployment that forgets one asset still shows a
  // video instead of the fallback art.
  resolveVictoryVideoKey() {
    const preferred = this.isPortraitView
      ? VICTORY_VIDEO_KEYS.portrait
      : VICTORY_VIDEO_KEYS.landscape;
    const other =
      preferred === VICTORY_VIDEO_KEYS.portrait
        ? VICTORY_VIDEO_KEYS.landscape
        : VICTORY_VIDEO_KEYS.portrait;

    if (this.hasVictoryVideoTexture(preferred)) {
      return preferred;
    }

    return this.hasVictoryVideoTexture(other) ? other : null;
  }

  // Build the win-layer objects. The caller adds them to a dedicated slot
  // container placed right after the backdrop and before all text/buttons, so
  // `進入下一關` always renders on top and stays clickable.
  createVictoryAnimation() {
    const videoKey = this.resolveVictoryVideoKey();

    if (videoKey) {
      try {
        return this.createVictoryVideo(videoKey);
      } catch {
        // A half-built video still owns a texture key, so tear it down fully
        // before falling back to the generated art.
        this.destroyVictoryVideo();
      }
    }

    return this.createVictoryFallback();
  }

  // Cover-fit the victory video over the live board. Called on creation, when
  // its metadata arrives and on every resize while the result panel is open.
  fitVictoryVideo(video = this.victoryVideo) {
    if (!video || video.active === false) {
      return;
    }

    const key = this.victoryVideoKey || VICTORY_VIDEO_KEYS.landscape;
    const cached =
      this.cache && this.cache.video ? this.cache.video.get(key) : null;
    const element = video.video;
    const sourceWidth =
      (element && element.videoWidth) ||
      (cached && cached.videoWidth) ||
      this.vw;
    const sourceHeight =
      (element && element.videoHeight) ||
      (cached && cached.videoHeight) ||
      this.vh;
    const cover = Math.max(this.vw / sourceWidth, this.vh / sourceHeight);

    video.setPosition(this.cx, this.cy);
    // `setScale`, not `setDisplaySize`: a Video Game Object starts life as a
    // 256x256 placeholder and Phaser keeps the resulting scale when the first
    // decoded frame replaces that placeholder, so a display size would end up
    // several times too large. A uniform scale stays exact through the swap.
    video.setScale(cover);
  }

  // A Phaser Video Game Object cannot switch to a clip with another aspect
  // ratio (its texture keeps the size of the first decoded frame), so a board
  // that flips orientation while the win panel is open gets a fresh object for
  // the new cut.
  refreshVictoryVideoOrientation() {
    if (!this.victoryVideo || !this.victorySlot) {
      return;
    }

    const key = this.resolveVictoryVideoKey();

    if (!key || key === this.victoryVideoKey) {
      return;
    }

    this.destroyVictoryVideo();
    // The slot only ever hosts one cut, so drop the previous veil as well.
    this.victorySlot.removeAll(true);

    let layers = [];

    try {
      layers = this.createVictoryVideo(key);
    } catch {
      this.victoryVideo = null;
      this.victoryVideoKey = null;
      layers = this.createVictoryFallback();
    }

    if (layers.length > 0) {
      this.victorySlot.add(layers);
    }
  }

  // Tear the video object (and its private video texture) down without
  // touching the rest of the win panel.
  destroyVictoryVideo() {
    const video = this.victoryVideo;

    if (this.victoryVideoErrorHandler) {
      try {
        this.victoryVideoErrorHandler.element.removeEventListener(
          'error',
          this.victoryVideoErrorHandler.handler,
        );
      } catch {
        // The media element may already be gone.
      }
      this.victoryVideoErrorHandler = null;
    }

    this.victoryVideo = null;
    this.victoryVideoKey = null;

    if (!video) {
      return;
    }

    // The per-object video texture is a UUID key that Phaser does not release
    // on destroy, so remember it and free it after the object is gone.
    const textureKey = video.videoTexture ? video.videoTexture.key : null;

    try {
      this.tweens.killTweensOf(video);
      video.stop();
      video.destroy();
    } catch {
      // Already torn down.
    }

    if (textureKey) {
      try {
        if (this.textures.exists(textureKey)) {
          this.textures.remove(textureKey);
        }
      } catch {
        // Nothing left to free.
      }
    }
  }

  createVictoryVideo(key = VICTORY_VIDEO_KEYS.landscape) {
    const video = this.add.video(this.cx, this.cy, key);
    const element = video.video;

    // Remember which cut is on screen before the first cover fit runs, so
    // fitVictoryVideo() can fall back to the right cache entry.
    this.victoryVideo = video;
    this.victoryVideoKey = key;

    if (element) {
      element.muted = true;
      element.loop = true;
      element.playsInline = true;
      element.setAttribute('playsinline', '');
    }

    video.setMute(true);
    video.setLoop(true);
    video.setOrigin(0.5);
    video.setPosition(this.cx, this.cy);

    // Cover the whole live board without letterboxing. Metadata can arrive a
    // frame later, and the cached HTMLVideoElement is a second reliable source
    // for the intrinsic size.
    const applyCover = () => this.fitVictoryVideo(video);

    applyCover();

    if (element && !element.videoWidth) {
      element.addEventListener('loadedmetadata', applyCover, { once: true });
      element.addEventListener('loadeddata', applyCover, { once: true });
    }

    // Phaser only builds the video texture once the first frame is decoded, so
    // re-apply the cover fit when that happens.
    video.once(Phaser.GameObjects.Events.VIDEO_TEXTURE, applyCover);

    video.setAlpha(0);

    this.tweens.add({
      targets: video,
      alpha: 0.46,
      duration: 420,
      ease: 'Sine.easeOut',
    });

    this.time.delayedCall(120, () => {
      if (this.victoryVideo === video) {
        applyCover();
      }
    });

    try {
      video.play();

      if (element && element.play) {
        const playing = element.play();
        if (playing && typeof playing.catch === 'function') {
          playing.catch(() => {
            // Autoplay may be rejected; the poster frame still renders.
          });
        }
      }
    } catch {
      // Autoplay may be rejected; the video still renders its poster frame.
    }

    if (element) {
      const handleError = () => this.replaceVictoryVideoWithFallback(video);
      element.addEventListener('error', handleError, { once: true });
      this.victoryVideoErrorHandler = { element, handler: handleError };
    }

    // Subtle dark veil keeps the CJK title/score/button readable.
    const veil = this.add.rectangle(
      this.cx,
      this.cy,
      this.vw,
      this.vh,
      0x041009,
      0.26,
    );

    return [video, veil];
  }

  // Fallback used by headless/Linux browsers without H.264: golden rings, rays
  // and slowly twinkling stars behind the win text.
  createVictoryFallback() {
    const layers = [];

    const glow = this.add.graphics().setPosition(this.cx, this.cy);

    for (let ring = 6; ring >= 1; ring -= 1) {
      glow.fillStyle(0xffd76a, 0.014 * ring);
      glow.fillCircle(0, 0, 72 * ring);
    }

    glow.lineStyle(1.5, 0xffe39a, 0.18);
    for (let ring = 1; ring <= 3; ring += 1) {
      glow.strokeCircle(0, 0, 84 + ring * 44);
    }

    glow.lineStyle(2, 0xffe08a, 0.09);
    for (let ray = 0; ray < 12; ray += 1) {
      const angle = (ray / 12) * Math.PI * 2;
      glow.beginPath();
      glow.moveTo(Math.cos(angle) * 92, Math.sin(angle) * 92);
      glow.lineTo(Math.cos(angle) * 268, Math.sin(angle) * 268);
      glow.strokePath();
    }

    layers.push(glow);

    const stars = [];
    const rng = new Phaser.Math.RandomDataGenerator(['zs-victory-fallback']);

    for (let index = 0; index < 14; index += 1) {
      const angle = rng.realInRange(0, Math.PI * 2);
      const distance = rng.realInRange(105, 255);
      const star = this.add
        .image(
          this.cx + Math.cos(angle) * distance,
          this.cy + Math.sin(angle) * distance,
          'zs-bonus-star',
        )
        .setAlpha(rng.realInRange(0.25, 0.7))
        .setScale(rng.realInRange(0.45, 0.95))
        .setAngle(rng.between(-22, 22));

      stars.push(star);
      layers.push(star);
    }

    const glowTween = this.tweens.add({
      targets: glow,
      alpha: { from: 0.72, to: 1 },
      scale: { from: 0.97, to: 1.03 },
      duration: 1700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const starTween = this.tweens.add({
      targets: stars,
      alpha: { from: 0.2, to: 0.85 },
      scale: { from: 0.5, to: 1.05 },
      duration: 1150,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.victoryFallbackTweens = [glowTween, starTween];

    return layers;
  }

  // A decode error can arrive after the overlay is built; swap the video for
  // the Graphics/star fallback in the same slot without touching the text.
  replaceVictoryVideoWithFallback(video) {
    if (this.victoryVideo !== video) {
      return;
    }

    if (!this.victorySlot || !this.gameOverOverlay) {
      return;
    }

    this.tweens.killTweensOf(video);

    // destroyVictoryVideo() also drops the error listener and frees the
    // per-object video texture key, so the swap does not leak GPU textures.
    this.destroyVictoryVideo();
    this.victorySlot.removeAll(true);

    const fallbackLayers = this.createVictoryFallback();

    if (fallbackLayers.length > 0) {
      this.victorySlot.add(fallbackLayers);
    }
  }

  showGameOverOverlay(isWin) {
    this.destroyOverlays();

    let victorySlot = null;

    if (isWin) {
      victorySlot = this.add.container(0, 0);
      this.victorySlot = victorySlot;
      const victoryLayers = this.createVictoryAnimation();

      if (victoryLayers.length > 0) {
        victorySlot.add(victoryLayers);
      }
    }

    const overlay = this.add
      .container(0, 0)
      .setDepth(DEPTH.overlay);

    const backdrop = this.add.rectangle(
      CENTER_X,
      CENTER_Y,
      VIEW_WIDTH,
      VIEW_HEIGHT,
      0x041009,
      isWin ? 0.68 : 0.84,
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
      ...(victorySlot ? [victorySlot] : []),
      title,
      bonusLine,
      finalLabel,
      finalScore,
      highLine,
      restartButton,
    ]);

    this.gameOverOverlay = overlay;
    this.resultBackdrop = backdrop;
    this.restartButton = restartButton;
    this.layoutOverlays();

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
  /* Responsive viewport                                                 */
  /* ------------------------------------------------------------------ */

  // Derive every live geometry value from the current game size. `initial` is
  // true exactly once (inside create(), where nothing else exists yet); later
  // calls come from the RESIZE handler and re-map the running board in place.
  applyViewport(initial = false) {
    const size = this.scale.gameSize;
    const width = Math.round(size.width || VIEW_WIDTH);
    const height = Math.round(size.height || VIEW_HEIGHT);
    const wasPortrait = this.isPortraitView;

    this.vw = Math.max(320, width);
    this.vh = Math.max(320, height);
    this.cx = this.vw / 2;
    this.cy = this.vh / 2;
    this.isPortraitView = this.vh > this.vw;

    // The turret always sits in the middle of the board: the landscape
    // serpentines wrap around it and the portrait spiral opens right above it.
    this.launcherX = this.cx;
    this.launcherY = this.cy;

    this.uiScale = this.getOverlayScale();
    this.uiOriginX = this.cx - CENTER_X * this.uiScale;
    this.uiOriginY = this.cy - CENTER_Y * this.uiScale;

    this.layoutBackdrop();
    this.layoutFoliage();
    this.layoutLauncher();
    this.layoutHud();
    this.createMusicToggle();
    this.layoutMusicToggle();
    this.layoutOverlays();

    if (initial) {
      return;
    }

    this.createAmbientMotes();

    // A portrait board hosts a single chain, so flipping a World-3 level
    // between the two orientations changes how many chains the board needs.
    if (
      this.gameState === 'PLAYING' &&
      this.chains.length > 0 &&
      wasPortrait !== this.isPortraitView &&
      (this.chains.length > 1 || this.isDualTrack())
    ) {
      this.relayoutForOrientation();
    } else {
      this.rebuildTrackForView();
    }

    this.updateSniperLaser();
  }

  // Uniform factor for every design-space overlay (menu, result panel, HUD
  // pills). Fitting the 800x600 authoring box keeps the text undistorted
  // instead of stretching it with the board.
  getOverlayScale() {
    return Phaser.Math.Clamp(
      Math.min(this.vw / VIEW_WIDTH, this.vh / VIEW_HEIGHT),
      0.44,
      1.4,
    );
  }

  // Phaser fires RESIZE once per layout change (main.js debounces the canvas
  // resize itself), so a rebuild per event is cheap enough and always exact.
  handleViewportResize() {
    this.applyViewport(false);
  }

  layoutBackdrop() {
    // Both textures are baked at 800x600. Apply a single uniform ENVELOP scale
    // and centre the result, so the radial canopy glow stays a perfect circle
    // in 16:9, 9:16 and every aspect in between. Independent width/height
    // scaling is what used to stretch the glow into an ellipse; cropping the
    // overflow is preferable to distorting it.
    const coverScale = Math.max(
      this.vw / VIEW_WIDTH,
      this.vh / VIEW_HEIGHT,
    );
    const displayWidth = VIEW_WIDTH * coverScale;
    const displayHeight = VIEW_HEIGHT * coverScale;

    for (const image of [this.backdropImage, this.vignetteImage]) {
      if (image) {
        image
          .setOrigin(0.5)
          .setDisplaySize(displayWidth, displayHeight)
          .setPosition(this.cx, this.cy);
      }
    }
  }

  layoutFoliage() {
    if (!this.foliageSprites) {
      return;
    }

    const sx = this.vw / VIEW_WIDTH;
    const sy = this.vh / VIEW_HEIGHT;

    this.foliageSprites.forEach((leaf, index) => {
      const placement = this.foliagePlacements
        ? this.foliagePlacements[index]
        : null;

      if (!placement) {
        return;
      }

      leaf.setPosition(placement.x * sx, placement.y * sy);
    });
  }

  layoutLauncher() {
    // The halo/base graphics are painted around the design centre, so they
    // only need an offset; the cannon container is anchored directly.
    const offsetX = this.launcherX - CENTER_X;
    const offsetY = this.launcherY - CENTER_Y;

    if (this.launcherHalo) {
      this.launcherHalo.setPosition(offsetX, offsetY);
    }

    if (this.launcherBase) {
      this.launcherBase.setPosition(offsetX, offsetY);
    }

    if (this.cannon) {
      this.cannon.setPosition(this.launcherX, this.launcherY);
    }
  }

  // HUD text is authored against the 800x600 corners: keep the left column
  // pinned to the left edge and the right column pinned to the right edge of
  // whatever board the window currently uses.
  layoutHud() {
    const margin = 30;
    const right = Math.max(margin + 120, this.vw - margin);

    for (const text of this.hudLeftTexts || []) {
      text.setX(margin);
    }

    for (const text of this.hudRightTexts || []) {
      text.setX(right);
    }

    if (this.homeButton) {
      this.homeButton.setPosition(right, this.vh - margin);
    }
  }

  layoutOverlays() {
    this.layoutOverlay(this.menuOverlay, this.menuBackdrop);
    this.layoutOverlay(this.gameOverOverlay, this.resultBackdrop);

    // The win video/fallback art is not part of a scaled container, so it has
    // to be re-centred whenever the board changes shape - and switched to the
    // other orientation cut when the board flips portrait <-> landscape.
    this.refreshVictoryVideoOrientation();
    this.fitVictoryVideo();
  }

  // Scale a design-space overlay container into the live board and keep its
  // dim backdrop covering the whole board instead of the 800x600 design box.
  layoutOverlay(container, backdrop) {
    if (!container) {
      return;
    }

    const scale = this.uiScale || 1;

    container.setScale(scale);
    container.setPosition(this.uiOriginX, this.uiOriginY);

    if (backdrop) {
      // setDisplaySize() drives width, height and scale together through the
      // object's transform, so the backdrop covers the whole live board on both
      // the WebGL and the Canvas renderer. Assigning `width` alone only changed
      // the shape's data and left the rendered quad at design size.
      backdrop.setPosition(CENTER_X, CENTER_Y);
      backdrop.setDisplaySize(this.vw / scale, this.vh / scale);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Track geometry for the live board                                   */
  /* ------------------------------------------------------------------ */

  createSpline(points) {
    return new Phaser.Curves.Spline(
      points.map(([x, y]) => new Phaser.Math.Vector2(x, y)),
    );
  }

  // Turn a level's layout spec into live board points. Landscape boards reuse
  // the authored serpentines (simply spread to the window); portrait boards
  // cannot fit them and get a generated spiral instead.
  resolveLayoutPoints(spec) {
    if (!spec) {
      return this.buildPortraitSpiral();
    }

    // A portrait board can never host the wide landscape serpentines.
    if (spec.portrait || this.isPortraitView) {
      return this.buildPortraitSpiral();
    }

    return this.mapDesignLayout(spec.points);
  }

  // Map a design-space (800x600) point list onto the live board. The X and Y
  // axes are scaled separately so a landscape serpentine stretches out and
  // fills a 16:9 board instead of sitting as a small 4:3 island in the middle.
  // X is capped at 1.45x the Y scale so an ultra-wide window cannot smear the
  // curves horizontally; both axes keep a 0.6 floor so two lanes can only ever
  // move further apart than in the authored layout - never closer than one
  // marble.
  mapDesignLayout(points) {
    const marginX = 30;
    const marginY = 30;
    const rawSx = Math.max(
      0.6,
      (this.vw - marginX * 2) / (VIEW_WIDTH - marginX * 2),
    );
    const sy = Math.max(
      0.6,
      (this.vh - marginY * 2) / (VIEW_HEIGHT - marginY * 2),
    );
    const sx = Math.min(rawSx, sy * 1.45);

    return points.map(([x, y]) => [
      this.cx + (x - CENTER_X) * sx,
      this.cy + (y - CENTER_Y) * sy,
    ]);
  }

  // Portrait boards cannot host the wide landscape serpentines, so the level
  // generates its own track: a two-turn rounded-rectangle spiral around the
  // turret. The chain enters on the outer coil and ends next to the launcher,
  // exactly like the classic spiral stages. A portrait board is always
  // single-track (see isDualTrack), so one spiral covers the whole level.
  buildPortraitSpiral() {
    const turns = 2;
    const laneGap = BALL_DIAMETER + 10; // neighbouring coils never touch
    const sideMargin = 26;
    const topMargin = 126; // clears the two HUD rows
    const bottomMargin = 104; // clears the home / music capsules

    const startX = Math.max(120, this.vw / 2 - sideMargin);
    const startY = Math.max(
      startX,
      Math.min(this.vh / 2 - topMargin, this.vh / 2 - bottomMargin),
    );
    const endX = Math.max(56, startX - turns * laneGap);
    const endY = Math.max(72, startY - turns * laneGap);
    const steps = turns * 26;
    // Exponent < 1 turns the ellipse into a squarish super-ellipse, which
    // fills a phone screen far better than a round spiral.
    const roundness = 0.66;
    const points = [];

    for (let i = 0; i <= steps; i += 1) {
      const progress = i / steps;
      const angle = -Math.PI / 2 + progress * turns * Math.PI * 2;
      const radiusX = startX + (endX - startX) * progress;
      const radiusY = startY + (endY - startY) * progress;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      points.push([
        this.cx + radiusX * Math.sign(cos) * Math.abs(cos) ** roundness,
        this.cy + radiusY * Math.sign(sin) * Math.abs(sin) ** roundness,
      ]);
    }

    return points;
  }

  // Re-map the running level's splines after a window resize. Marble positions
  // are arc-length fractions (t), so they survive the remap untouched and the
  // chain keeps its order, spacing and progress.
  rebuildTrackForView() {
    if (this.chains.length === 0 || !this.layoutSpecs) {
      return;
    }

    this.chains.forEach((chain) => {
      const spec = this.layoutSpecs[chain.index];

      if (!spec) {
        return;
      }

      const track = this.createSpline(this.resolveLayoutPoints(spec));

      chain.track = track;
      chain.trackLength = track.getLength();
      chain.trackSamples = track.getSpacedPoints(240);
      chain.deltaT =
        chain.trackLength > 0 ? BALL_DIAMETER / chain.trackLength : 0;
    });

    this.syncPrimaryAliases();
    this.initialGapT = this.deltaT;
    this.createTracks();
    this.updateChainPositions();
  }

  // A live orientation flip can change how many chains the board hosts
  // (portrait boards are single-track). Rebuild the level's tracks for the new
  // orientation: the primary chain keeps its marbles and progress, extra chains
  // are removed and their marbles go back into the spawn budget so the level
  // still spawns exactly getTotalMarbles() marbles, and a newly required second
  // chain starts empty and is filled by the round-robin spawner.
  relayoutForOrientation() {
    const carried = this.chains[0] ? this.chains[0].marbles : [];
    let dropped = 0;

    for (const chain of this.chains.slice(1)) {
      dropped += chain.marbles.length;

      for (const marble of chain.marbles) {
        marble.destroy();
      }
    }

    this.buildLevelTracks();

    const primary = this.chains[0];

    if (primary) {
      primary.marbles = carried;

      for (const marble of carried) {
        marble.chain = primary;
      }

      this.refreshChainMetrics(primary);
    }

    if (dropped > 0) {
      this.spawnedMarblesCount = Math.max(
        0,
        this.spawnedMarblesCount - dropped,
      );
    }

    // Specials restart their spacing from the new layout.
    this.lastSpecialSpawnIndex = -SPECIAL_SPAWN_GAP;
    this.syncPrimaryAliases();
    this.initialGapT = this.deltaT;
    this.createTracks();
    this.updateChainPositions();
    this.updateMarbleCount();
  }

  /* ------------------------------------------------------------------ */
  /* Music mute toggle                                                   */
  /* ------------------------------------------------------------------ */

  // A small capsule pinned to the bottom-left corner, visible on every screen
  // (menu, gameplay and both result panels). Layout mirrors the HUD exit
  // button: every child sits in negative local space so the Container itself
  // carries the (left, bottom) anchor.
  createMusicToggle() {
    if (this.musicButton) {
      return;
    }

    const width = (this.musicButtonWidth = 98);
    const height = (this.musicButtonHeight = 34);
    const left = -width;
    const top = -height;

    const bg = this.add.graphics().setPosition(left, top);
    const hover = this.add
      .graphics()
      .setPosition(left, top)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    const strike = this.add.graphics().setPosition(left, top);
    const label = this.add
      .text(left + width / 2, top + height / 2, '♪ 音樂', {
        fontFamily: UI_FONT,
        fontSize: '13px',
        color: '#f7efd2',
      })
      .setOrigin(0.5);
    label.setShadow(0, 1, '#000000', 4, false, true);

    const hitArea = this.add
      .zone(left, top, width, height)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });

    this.musicButtonBg = bg;
    this.musicButtonHover = hover;
    this.musicButtonStrike = strike;
    this.musicButtonLabel = label;

    hitArea.on('pointerover', () => {
      this.tweens.killTweensOf(hover);
      this.tweens.add({
        targets: hover,
        alpha: 0.28,
        duration: 150,
        ease: 'Sine.easeOut',
      });
    });

    hitArea.on('pointerout', () => {
      this.tweens.killTweensOf(hover);
      this.tweens.add({
        targets: hover,
        alpha: 0,
        duration: 150,
        ease: 'Sine.easeOut',
      });
    });

    hitArea.on('pointerdown', (pointer, _x, _y, event) => {
      if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }

      if (pointer) {
        this.musicControlDownTime = pointer.downTime;
      }

      this.toggleMusicMute();
    });

    this.musicButton = this.add
      .container(0, 0, [bg, hover, strike, label, hitArea])
      .setDepth(DEPTH.overlay + 10);

    this.paintMusicToggle();
    this.layoutMusicToggle();
  }

  paintMusicToggle() {
    const width = this.musicButtonWidth || 98;
    const height = this.musicButtonHeight || 34;
    const radius = height / 2;

    if (this.musicButtonBg) {
      const bg = this.musicButtonBg;

      bg.clear();
      bg.fillStyle(0x06120c, 0.74);
      bg.fillRoundedRect(0, 0, width, height, radius);
      bg.fillStyle(0xffffff, 0.06);
      bg.fillRoundedRect(3, 2, width - 6, height / 2 - 2, {
        tl: radius - 2,
        tr: radius - 2,
        bl: 0,
        br: 0,
      });
      bg.lineStyle(1, 0xd9e6b8, 0.36);
      bg.strokeRoundedRect(0.5, 0.5, width - 1, height - 1, radius - 0.5);
    }

    if (this.musicButtonHover) {
      this.musicButtonHover.clear();
      this.musicButtonHover.fillStyle(0xf2ffd4, 1);
      this.musicButtonHover.fillRoundedRect(0, 0, width, height, radius);
    }

    if (this.musicButtonStrike) {
      this.musicButtonStrike.clear();

      if (this.musicMuted) {
        this.musicButtonStrike.lineStyle(2, 0xff9c9c, 0.92);
        this.musicButtonStrike.lineBetween(7, height - 7, width - 7, 7);
      }
    }

    if (this.musicButtonLabel) {
      this.musicButtonLabel.setText(this.musicMuted ? '♪ 靜音' : '♪ 音樂');
      this.musicButtonLabel.setColor(this.musicMuted ? '#e6b0b0' : '#f7efd2');
    }
  }

  layoutMusicToggle() {
    if (!this.musicButton) {
      return;
    }

    const margin = 30;
    const width = this.musicButtonWidth || 98;
    const height = this.musicButtonHeight || 34;

    this.musicButton.setPosition(margin + width, this.vh - margin);

    // Cached hit rectangle so a press on the capsule never fires a marble.
    this.musicButtonBounds = new Phaser.Geom.Rectangle(
      margin,
      this.vh - margin - height,
      width,
      height,
    );
  }

  // Mute/unmute only the background music; the synthesised SFX stay audible.
  toggleMusicMute() {
    const resumeKey = this.pendingBgmKey || this.currentBgmKey;

    this.musicMuted = !this.musicMuted;
    this.saveMusicPreference();
    this.paintMusicToggle();

    if (this.musicMuted) {
      this.stopBgm();
      // Remember the theme so unmuting resumes exactly where it left off.
      this.currentBgmKey = resumeKey;
      this.pendingBgmKey = null;
      return;
    }

    this.initAudio();
    this.playBgm(resumeKey || BGM_KEYS.menu);
  }

  loadMusicPreference() {
    try {
      this.musicMuted = localStorage.getItem(MUSIC_STORAGE_KEY) === '1';
    } catch {
      this.musicMuted = false;
    }
  }

  saveMusicPreference() {
    try {
      localStorage.setItem(MUSIC_STORAGE_KEY, this.musicMuted ? '1' : '0');
    } catch {
      // Private mode / disabled storage: the toggle still works for the session.
    }
  }

  /* ------------------------------------------------------------------ */
  /* Marble colours and specials                                         */
  /* ------------------------------------------------------------------ */

  // A special marble carries no colour (SPECIAL_COLOR_INDEX): it can never be
  // matched, never counts towards a run, and never blocks a colour the
  // launcher still has to serve.
  isSpecialMarble(marble) {
    if (!marble) {
      return false;
    }

    if (marble.colorIndex === SPECIAL_COLOR_INDEX) {
      return true;
    }

    return !!(
      marble.isBomb ||
      marble.isReverse ||
      marble.isPause ||
      marble.isSniper
    );
  }

  // Neutral (colour-less) texture key of a special marble.
  getSpecialTextureKey(marble) {
    if (!marble) {
      return null;
    }

    if (marble.isBomb) {
      return 'zs-marble-bomb';
    }

    if (marble.isReverse) {
      return 'zs-marble-reverse';
    }

    if (marble.isPause) {
      return 'zs-marble-pause';
    }

    if (marble.isSniper) {
      return 'zs-marble-sniper';
    }

    return null;
  }

  // 0xRRGGBB value of a marble colour index; specials fall back to stone.
  getMarbleColorValue(colorIndex) {
    if (
      colorIndex === SPECIAL_COLOR_INDEX ||
      colorIndex === null ||
      colorIndex === undefined ||
      !MARBLE_COLORS[colorIndex]
    ) {
      return SPECIAL_MARBLE_BODY;
    }

    return Phaser.Display.Color.HexStringToColor(MARBLE_COLORS[colorIndex])
      .color;
  }

  // Colour indices still present on any chain (specials excluded).
  getColorsOnChain() {
    const colors = [];
    const activeCount = this.getActiveColorCount();

    for (const chain of this.chains) {
      for (const marble of chain.marbles) {
        const index = marble.colorIndex;

        if (index >= 0 && index < activeCount && !colors.includes(index)) {
          colors.push(index);
        }
      }
    }

    return colors;
  }

  // Next queued ammo colour. While marbles still spawn the queue simply walks
  // the active palette; once everything has spawned it can only serve colours
  // that are still on the board, so a leftover run can always be finished
  // instead of the launcher cycling through colours that no longer exist.
  pickNextBulletColor(previousColor) {
    const activeCount = this.getActiveColorCount();
    const fallback = (previousColor + 1) % activeCount;

    if (this.spawnedMarblesCount < this.getTotalMarbles()) {
      return fallback;
    }

    const remaining = this.getColorsOnChain();

    if (remaining.length === 0) {
      return fallback;
    }

    for (let step = 1; step <= activeCount; step += 1) {
      const candidate = (previousColor + step) % activeCount;

      if (remaining.includes(candidate)) {
        return candidate;
      }
    }

    return fallback;
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

    this.createWorldBackdropVariants();

    this.backdropImage = this.add
      .image(0, 0, 'zs-backdrop')
      .setOrigin(0)
      .setDepth(DEPTH.backdrop);

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

    this.vignetteImage = this.add
      .image(0, 0, 'zs-vignette')
      .setOrigin(0)
      .setDepth(DEPTH.vignette);
    // Both baked canvases are 800x600; stretch them over the live board.
    this.layoutBackdrop();
    this.createFoliage();
    this.applyWorldBackdrop(this.selectedWorld);
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

    this.foliagePlacements = placements;
    this.foliageSprites = placements.map(({ x, y, angle, scale, alpha }) =>
      this.add
        .image(x, y, 'zs-leaf')
        .setOrigin(0, 0.5)
        .setAngle(angle)
        .setScale(scale)
        .setAlpha(alpha)
        .setDepth(DEPTH.foliage),
    );

    // Spread the leaves over whatever board size the window currently uses.
    this.layoutFoliage();
  }

  /* ------------------------------------------------------------------ */
  /* Track                                                               */
  /* ------------------------------------------------------------------ */

  // Pick the layout for the current level and rebuild the arc-length cache.
  // Called from startLevel() every time a level begins.
  // Build one independent chain context around a spline layout. Every value
  // that used to be a single scene field (track, length, samples, deltaT,
  // marbles, head metrics) lives here so Worlds 1-2 can run one chain and
  // World 3 can run two without sharing any state.
  createChainContext(spec, index) {
    const track = this.createSpline(this.resolveLayoutPoints(spec));
    const trackLength = track.getLength();

    return {
      index,
      isInner: index > 0,
      track,
      trackLength,
      trackSamples: track.getSpacedPoints(240),
      deltaT: trackLength > 0 ? BALL_DIAMETER / trackLength : 0,
      marbles: [],
      headDistance: 0,
      chainComplete: false,
      trackGraphics: null,
      trackDebugGraphics: null,
      startGlow: null,
      startRing: null,
      tunnelEntrance: null,
    };
  }

  buildLevelTracks() {
    // Drop the previous stage's drawn splines/glow/ring/tunnels BEFORE the
    // chain contexts are replaced, otherwise their visual references would be
    // orphaned and old track traces would survive the level change.
    this.clearTrackVisuals();

    const difficulty = Math.max(1, this.getDifficulty());
    const layoutIndex = (difficulty - 1) % TRACK_LAYOUTS.length;
    // Portrait boards cannot host the wide landscape serpentines, so every
    // stage there uses the generated spiral (see buildPortraitSpiral).
    const specs = this.isPortraitView
      ? [{ portrait: true, index: 0 }]
      : [{ points: TRACK_LAYOUTS[layoutIndex] }];

    // World 3 (D >= 21) gets a second, independent inner spline.
    if (this.isDualTrack()) {
      const innerIndex =
        (Math.max(21, difficulty) - 21) % DUAL_INNER_LAYOUTS.length;
      specs.push({ points: DUAL_INNER_LAYOUTS[innerIndex] });
    }

    this.layoutSpecs = specs;
    this.chains = specs.map((spec, index) =>
      this.createChainContext(spec, index),
    );
    this.syncPrimaryAliases();

    return this.track;
  }

  // Compatibility alias for tooling that still calls the old single-track
  // builder name.
  buildLevelTrack() {
    return this.buildLevelTracks();
  }

  // Keep the historic single-track fields pointing at chain 0. Gameplay code
  // uses chain contexts directly; older UI/tooling can keep reading these.
  syncPrimaryAliases() {
    const primary = this.chains[0] ?? null;
    this.primaryChain = primary;
    this.track = primary ? primary.track : null;
    this.trackLength = primary ? primary.trackLength : 0;
    this.trackSamples = primary ? primary.trackSamples : [];
    this.deltaT = primary ? primary.deltaT : 0;
    this.marbles = primary ? primary.marbles : [];
    this.chainHeadDistance = primary ? primary.headDistance : 0;
    this.chainComplete = primary ? primary.chainComplete : false;
    this.trackGraphics = primary ? primary.trackGraphics : null;
    this.trackDebugGraphics = primary ? primary.trackDebugGraphics : null;
    this.startGlow = primary ? primary.startGlow : null;
    this.startRing = primary ? primary.startRing : null;
    this.tunnelEntrance = primary ? primary.tunnelEntrance : null;
  }

  refreshChainMetrics(chain) {
    const front = chain.marbles[0];
    chain.headDistance = front ? front.t * chain.trackLength : 0;
    chain.chainComplete = front
      ? front.t >= 1
      : this.spawnedMarblesCount >= this.getTotalMarbles();
  }

  // Remove every display object that belongs to the active tracks (drawn
  // splines + debug dashes + start glow/ring/tunnels and their tweens). Safe
  // to call when no track exists, which is the case on the start menu.
  clearTrackVisuals() {
    const destroyWithTweens = (ref) => {
      if (!ref) {
        return;
      }

      this.tweens.killTweensOf(ref);
      ref.destroy();
    };

    const cleared = new Set();

    for (const chain of this.chains) {
      for (const key of [
        'startRing',
        'startGlow',
        'tunnelEntrance',
        'trackGraphics',
        'trackDebugGraphics',
      ]) {
        const ref = chain[key];

        if (ref) {
          cleared.add(ref);
          destroyWithTweens(ref);
          chain[key] = null;
        }
      }
    }

    // Defensive cleanup for legacy single-track references that are not part
    // of a chain context (for example a leftover from old tooling).
    for (const key of [
      'startRing',
      'startGlow',
      'tunnelEntrance',
      'trackGraphics',
      'trackDebugGraphics',
    ]) {
      const ref = this[key];

      if (ref && !cleared.has(ref)) {
        destroyWithTweens(ref);
      }

      this[key] = null;
    }
  }

  // Redraw every active chain's spline, debug dashes, start glow/ring and
  // tunnel entrance. Called once per stage after all chain contexts exist.
  createTracks() {
    this.clearTrackVisuals();

    for (const chain of this.chains) {
      this.createTrackForChain(chain);
    }

    this.syncPrimaryAliases();
  }

  // Compatibility alias for tooling that calls createTrack() directly.
  createTrack() {
    this.createTracks();
  }

  createTrackForChain(chain) {
    const style = chain.isInner ? INNER_TRACK_STYLE : OUTER_TRACK_STYLE;
    const samples = chain.track.getSpacedPoints(280);
    const shadowSamples = samples.map(
      (point) => new Phaser.Math.Vector2(point.x + 5, point.y + 8),
    );

    const track = (chain.trackGraphics = this.add
      .graphics()
      .setDepth(DEPTH.track));

    track.lineStyle(28, style.shadow, style.shadowAlpha);
    track.strokePoints(shadowSamples, false, false);

    track.lineStyle(22, style.baseDark, 0.95);
    track.strokePoints(samples, false, false);

    track.lineStyle(14, style.base, 1);
    track.strokePoints(samples, false, false);

    track.lineStyle(1, style.highlight, 0.2);
    track.strokePoints(samples, false, false);

    // The dashed line is the visual debug overlay asked for in phase 01.
    // It follows the exact same arc-length curve used by the chain.
    const debugLine = (chain.trackDebugGraphics = this.add
      .graphics()
      .setDepth(DEPTH.trackDebug));
    debugLine.lineStyle(1.5, style.debug, 0.52);

    const dashLength = 10;
    const dashGap = 12;
    for (
      let distance = 0;
      distance < chain.trackLength;
      distance += dashLength + dashGap
    ) {
      const from = chain.track.getPointAt(distance / chain.trackLength);
      const to = chain.track.getPointAt(
        Math.min(distance + dashLength, chain.trackLength) /
          chain.trackLength,
      );
      debugLine.lineBetween(from.x, from.y, to.x, to.y);
    }

    const start = chain.track.getPointAt(0);

    chain.startGlow = this.add
      .circle(start.x, start.y, 19, style.glow, 0.08)
      .setDepth(DEPTH.trackDebug);
    chain.startRing = this.add
      .circle(start.x, start.y, 10)
      .setStrokeStyle(1.5, style.ring, 0.52)
      .setDepth(DEPTH.trackDebug);

    // Dark jungle cave mouth at the track start, rebuilt for every layout.
    // It sits ABOVE the marble layer (DEPTH.balls + 1) so a freshly spawned
    // ball at t = 0 is hidden under the tunnel and only becomes visible as it
    // rolls out of the mouth.
    const startTangent = chain.track.getTangentAt(0).normalize();
    const startAngle = Math.atan2(startTangent.y, startTangent.x);
    const tunnelRadius = 30;
    const tunnel = (chain.tunnelEntrance = this.add
      .graphics()
      .setPosition(start.x, start.y)
      .setRotation(startAngle)
      .setDepth(DEPTH.balls + 1));

    // Soft outer shadow that sinks the mouth into the jungle floor.
    tunnel.fillStyle(0x000000, 0.3);
    tunnel.fillCircle(0, 0, tunnelRadius + 5);

    // Faint rock ring separates the mouth from the dark jungle floor.
    tunnel.lineStyle(2, 0x53734c, 0.3);
    tunnel.strokeCircle(0, 0, tunnelRadius + 1);

    // Dark rock rim, heavier on the back half of the mouth.
    tunnel.lineStyle(7, 0x0f2415, 0.98);
    tunnel.beginPath();
    tunnel.arc(0, 0, tunnelRadius - 1, Math.PI / 2, Math.PI * 1.5, false);
    tunnel.strokePath();
    tunnel.lineStyle(2, 0x3c5c3a, 0.45);
    tunnel.beginPath();
    tunnel.arc(0, 0, tunnelRadius - 4, Math.PI * 0.6, Math.PI * 1.4, false);
    tunnel.strokePath();

    // Cave mouth void with an oval inner depth.
    tunnel.fillStyle(0x010603, 0.97);
    tunnel.fillCircle(0, 0, tunnelRadius - 2);
    tunnel.fillStyle(0x000000, 0.9);
    tunnel.fillEllipse(3, 0, tunnelRadius * 1.35, tunnelRadius * 1.7);

    // Thin lit lip on the side the marbles roll out of.
    tunnel.lineStyle(2, 0xb6cf9b, 0.3);
    tunnel.beginPath();
    tunnel.arc(0, 0, tunnelRadius - 1, -Math.PI / 2, Math.PI / 2, false);
    tunnel.strokePath();

    // A few mossy rocks blend the rim into the surrounding foliage.
    tunnel.fillStyle(0x102616, 1);
    tunnel.fillCircle(-tunnelRadius + 4, -tunnelRadius + 8, 6);
    tunnel.fillCircle(-tunnelRadius + 2, tunnelRadius - 10, 5);
    tunnel.fillCircle(-tunnelRadius - 2, 2, 4);
    tunnel.fillStyle(0x4f7048, 0.6);
    tunnel.fillCircle(-tunnelRadius + 7, -tunnelRadius + 5, 2.5);

    this.tweens.add({
      targets: chain.startRing,
      scale: 2.4,
      alpha: 0,
      duration: 2400,
      ease: 'Sine.easeOut',
      repeat: -1,
    });

    this.tweens.add({
      targets: chain.startGlow,
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

    for (const chain of this.chains) {
      chain.marbles = [];
      chain.headDistance = 0;
      chain.chainComplete = false;
    }

    this.syncPrimaryAliases();
    this.initialGapT = this.deltaT;
    this.chainComplete = false;
    this.chainHeadDistance = 0;
    this.spawnedMarblesCount = 0;
    this.spawnChainCursor = 0;
    // Specials are staggered from the first spawn of the level.
    this.lastSpecialSpawnIndex = -SPECIAL_SPAWN_GAP;
  }

  trySpawnMarble() {
    if (this.gameState !== 'PLAYING') {
      return false;
    }

    if (this.spawnedMarblesCount >= this.getTotalMarbles()) {
      return false;
    }

    // A chain can accept a marble once its tail has cleared the tunnel mouth.
    // In World 3 both chains are eligible independently; the round-robin
    // cursor spreads the global level total across both tracks.
    const eligible = this.chains.filter((chain) => {
      if (chain.marbles.length === 0) {
        return true;
      }

      return (
        chain.marbles[chain.marbles.length - 1].t > chain.deltaT
      );
    });

    if (eligible.length === 0) {
      return false;
    }

    const chain = eligible[this.spawnChainCursor % eligible.length];
    this.spawnChainCursor =
      (this.spawnChainCursor + 1) % Math.max(1, this.chains.length);

    // Only the palette unlocked for this difficulty may spawn on the chain.
    const colorIndex = Phaser.Math.Between(0, this.getActiveColorCount() - 1);
    const marble = this.createPathMarble(chain, colorIndex, 0);

    // One mutually exclusive special roll (bomb -> reverse -> pause ->
    // sniper); the first three grow with absolute difficulty (World/Stage),
    // sniper is a fixed documented ~5% chance. Specials are spread out so the
    // board never stacks them: none during the opening marbles and at least
    // SPECIAL_SPAWN_GAP marbles between two of them.
    const chances = this.getSpecialChances();
    const specialRoll = Phaser.Math.FloatBetween(0, 1);
    const reverseThreshold = chances.bomb + chances.reverse;
    const pauseThreshold = reverseThreshold + chances.pause;
    const sniperThreshold = pauseThreshold + chances.sniper;
    const specialSlotOpen =
      this.spawnedMarblesCount >= SPECIAL_MIN_SPAWN &&
      this.spawnedMarblesCount - this.lastSpecialSpawnIndex >= SPECIAL_SPAWN_GAP;

    const isBomb = specialSlotOpen && specialRoll < chances.bomb;
    const isReverse =
      specialSlotOpen && !isBomb && specialRoll < reverseThreshold;
    const isPause =
      specialSlotOpen && !isBomb && !isReverse && specialRoll < pauseThreshold;
    const isSniper =
      specialSlotOpen &&
      !isBomb &&
      !isReverse &&
      !isPause &&
      specialRoll < sniperThreshold;

    marble.isBomb = isBomb;
    marble.isReverse = isReverse;
    marble.isPause = isPause;
    marble.isSniper = isSniper;

    if (this.isSpecialMarble(marble)) {
      // A special carries NO colour at all (SPECIAL_COLOR_INDEX), so it can
      // never be matched, never counts towards a run and never turns the
      // launcher's colour queue into an impossible request.
      marble.colorIndex = SPECIAL_COLOR_INDEX;
      marble.setData('colorIndex', SPECIAL_COLOR_INDEX);
      marble.setTexture(this.getSpecialTextureKey(marble));
      this.lastSpecialSpawnIndex = this.spawnedMarblesCount;
    }

    chain.marbles.push(marble);
    this.spawnedMarblesCount += 1;
    chain.chainComplete = false;
    this.refreshChainMetrics(chain);
    this.syncPrimaryAliases();
    this.updateChainPositions();
    this.updateMarbleCount();

    return true;
  }

  updateSpawner() {
    // New marbles must not feed in while time is paused.
    if (this.pauseTimer > 0) {
      return;
    }

    this.trySpawnMarble();
  }

  // Attach a marble to a specific chain. New code passes
  // (chain, colorIndex, t, x, y); the old (colorIndex, t, x, y) signature is
  // still accepted and targets the primary chain for older tooling.
  createPathMarble(...args) {
    let chain;
    let colorIndex;
    let t;
    let x = 0;
    let y = 0;

    if (typeof args[0] === 'number') {
      chain = this.chains[0] ?? null;
      [colorIndex, t, x = 0, y = 0] = args;
    } else {
      [chain, colorIndex, t, x = 0, y = 0] = args;
    }

    if (!chain) {
      return null;
    }

    const marble = this.add
      .follower(chain.track, x, y, `zs-marble-${colorIndex}`)
      .setDepth(DEPTH.balls)
      .setData('type', 'marble')
      .setData('colorIndex', colorIndex);

    marble.chain = chain;
    marble.colorIndex = colorIndex;
    marble.t = Phaser.Math.Clamp(t, 0, 1);
    marble.pushOffset = 0;
    marble.magnetApproaching = false;
    marble.isBomb = false;
    marble.isReverse = false;
    marble.isPause = false;
    marble.isSniper = false;

    return marble;
  }

  normalizePushedChain(chain = this.chains[0]) {
    if (!chain || chain.marbles.length === 0) {
      return;
    }

    const marbles = chain.marbles;
    const deltaT = chain.deltaT;

    // If pushing a marble past the entrance would put it below t = 0, slide
    // the whole chain forward by the deficit. The spacing relative to the
    // insertion point is preserved, but the tail never overlaps at the start.
    let minT = Infinity;
    let maxT = -Infinity;

    for (const marble of marbles) {
      minT = Math.min(minT, marble.t);
      maxT = Math.max(maxT, marble.t);
    }

    if (minT < 0) {
      const forwardShift = -minT;
      for (const marble of marbles) {
        marble.t += forwardShift;
        // Keep the rendered marble where it was: pushOffset decays over the
        // next frames, so the whole chain slides forward instead of snapping.
        marble.pushOffset -= forwardShift;
      }
      maxT += forwardShift;
    }

    if (maxT > 1) {
      const backwardShift = 1 - maxT;
      for (const marble of marbles) {
        marble.t += backwardShift;
        marble.pushOffset -= backwardShift;
      }
    }

    // Safety net: no pair may be closer than one physical diameter, even
    // after boundary shifts or floating-point drift.
    for (let index = 1; index < marbles.length; index += 1) {
      const maxTrailingT = marbles[index - 1].t - deltaT;

      if (marbles[index].t > maxTrailingT) {
        marbles[index].t = Math.max(0, maxTrailingT);
      }
    }

    for (const marble of marbles) {
      marble.t = Phaser.Math.Clamp(marble.t, 0, 1);
    }
  }

  createMarbleTextures() {
    if (
      this.textures.exists('zs-marble-0') &&
      this.textures.exists('zs-marble-bomb-0') &&
      this.textures.exists('zs-marble-reverse-0') &&
      this.textures.exists('zs-marble-pause-0') &&
      this.textures.exists('zs-marble-sniper-0')
    ) {
      this.createNeutralSpecialTextures(BALL_RADIUS * 2 + 18);
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

      // Reverse-time variant: the same coloured marble with a dark inset
      // core and two bright left-pointing chevrons (<<), so a reverse
      // marble reads instantly against every other chain marble.
      graphics.clear();

      graphics.fillStyle(0x000000, 0.3);
      graphics.fillCircle(center + 2.5, center + 4.5, BALL_RADIUS + 1);
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

      graphics.fillStyle(0x04141d, 0.94);
      graphics.fillCircle(center, center, BALL_RADIUS - 3.2);
      graphics.lineStyle(1.5, 0x9ef4ff, 0.85);
      graphics.strokeCircle(center, center, BALL_RADIUS - 3.6);

      const drawChevron = (apexX) => {
        graphics.beginPath();
        graphics.moveTo(apexX + 4.8, center - 6.2);
        graphics.lineTo(apexX, center);
        graphics.lineTo(apexX + 4.8, center + 6.2);
        graphics.strokePath();
      };

      // Soft cyan halo first, then a crisp white core for contrast.
      graphics.lineStyle(4.4, 0x63e6ff, 0.35);
      drawChevron(center - 7.4);
      drawChevron(center + 2.4);
      graphics.lineStyle(2.4, 0xf2ffff, 1);
      drawChevron(center - 7.4);
      drawChevron(center + 2.4);

      graphics.generateTexture(`zs-marble-reverse-${index}`, size, size);

      // Pause variant: the same coloured marble with a deep blue inset
      // core and two bright vertical bars (||) that read as a stop sign.
      graphics.clear();

      graphics.fillStyle(0x000000, 0.3);
      graphics.fillCircle(center + 2.5, center + 4.5, BALL_RADIUS + 1);
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

      graphics.fillStyle(0x061a2e, 0.95);
      graphics.fillCircle(center, center, BALL_RADIUS - 3.2);
      graphics.lineStyle(1.5, 0x9fd8ff, 0.9);
      graphics.strokeCircle(center, center, BALL_RADIUS - 3.6);

      // Two vertical bars with a soft blue halo, then a crisp white core.
      graphics.fillStyle(0x63c9ff, 0.35);
      graphics.fillRoundedRect(center - 8.3, center - 8, 6.6, 16, 3);
      graphics.fillRoundedRect(center + 1.7, center - 8, 6.6, 16, 3);
      graphics.fillStyle(0xeaf9ff, 1);
      graphics.fillRoundedRect(center - 6.6, center - 6.4, 4.4, 12.8, 2);
      graphics.fillRoundedRect(center + 2.2, center - 6.4, 4.4, 12.8, 2);

      graphics.generateTexture(`zs-marble-pause-${index}`, size, size);

      // Sniper variant: a dark ruby core with a glowing red crosshair and
      // a small target arrow, so the instant-fire power-up reads instantly.
      graphics.clear();

      graphics.fillStyle(0x000000, 0.3);
      graphics.fillCircle(center + 2.5, center + 4.5, BALL_RADIUS + 1);
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

      graphics.fillStyle(0x1c0306, 0.94);
      graphics.fillCircle(center, center, BALL_RADIUS - 3.2);
      graphics.lineStyle(3.6, 0xff2d2d, 0.28);
      graphics.strokeCircle(center, center, BALL_RADIUS - 4.2);
      graphics.lineStyle(1.8, 0xff4d4d, 0.95);
      graphics.strokeCircle(center, center, BALL_RADIUS - 6.2);

      // Four crosshair ticks plus a bright centre dot.
      graphics.lineStyle(2.6, 0xff7a7a, 1);
      graphics.lineBetween(center - 12.4, center, center - 7.6, center);
      graphics.lineBetween(center + 7.6, center, center + 12.4, center);
      graphics.lineBetween(center, center - 12.4, center, center - 7.6);
      graphics.lineBetween(center, center + 7.6, center, center + 12.4);
      graphics.fillStyle(0xffe2e2, 1);
      graphics.fillCircle(center, center, 2.1);

      // Small glowing target arrow near the top edge (aim hint).
      graphics.fillStyle(0xff3030, 0.95);
      graphics.beginPath();
      graphics.moveTo(center, center - 15.2);
      graphics.lineTo(center - 3.6, center - 10.6);
      graphics.lineTo(center + 3.6, center - 10.6);
      graphics.closePath();
      graphics.fillPath();

      graphics.generateTexture(`zs-marble-sniper-${index}`, size, size);
    });

    graphics.destroy();
    this.createNeutralSpecialTextures(size);
  }

  // Bake colour-less copies of the four authored special marbles. A power-up
  // must never read as a matchable colour, so the original art is desaturated
  // and tinted with the neutral stone body before it becomes the runtime
  // texture (`zs-marble-<type>`).
  createNeutralSpecialTextures(size) {
    SPECIAL_MARBLE_TYPES.forEach((type) => {
      const key = `zs-marble-${type}`;
      const sourceKey = `${key}-0`;

      if (this.textures.exists(key) || !this.textures.exists(sourceKey)) {
        return;
      }

      const source = this.textures.get(sourceKey).getSourceImage();
      const texture = this.textures.createCanvas(key, size, size);

      if (!texture) {
        return;
      }

      const ctx = texture.getContext();

      ctx.clearRect(0, 0, size, size);
      // Desaturate the authored marble, then wash the stone body over the
      // existing pixels only (source-atop keeps the round silhouette).
      ctx.filter = 'grayscale(1) brightness(1.12)';
      ctx.drawImage(source, 0, 0, size, size);

      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(95, 111, 99, 0.42)`;
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'source-over';

      texture.refresh();
    });
  }

  updateChainMovement(step) {
    // Pause marble: time is frozen for ALL chains. No tail push, magnetic
    // catch-up, momentum transfer or combo can run; only the timer ticks.
    if (this.pauseTimer > 0) {
      this.pauseTimer = Math.max(0, this.pauseTimer - step);

      for (const chain of this.chains) {
        for (const marble of chain.marbles) {
          marble.magnetApproaching = false;
        }

        this.refreshChainMetrics(chain);
      }

      this.syncPrimaryAliases();
      return;
    }

    const isSlowed = this.slowdownTimer > 0;

    if (isSlowed) {
      this.slowdownTimer = Math.max(0, this.slowdownTimer - step);
    }

    // Reverse-time marble: the timer is read once per frame so the frame
    // that consumes the final chunk of time still reverses; the next frame
    // falls back to normal forward movement. It also decrements with empty
    // chains so a hit can never leave the timer stuck on.
    const isReversing = this.reverseTimer > 0;

    if (isReversing) {
      this.reverseTimer = Math.max(0, this.reverseTimer - step);
    }

    for (const chain of this.chains) {
      this.updateChainMovementForChain(chain, step, isSlowed, isReversing);
    }

    this.syncPrimaryAliases();

    // Any chain reaching the end of its own track ends the run.
    if (
      this.gameState === 'PLAYING' &&
      this.chains.some(
        (chain) => chain.marbles.length > 0 && chain.marbles[0].t >= 1,
      )
    ) {
      this.endGame(false);
    }
  }

  updateChainMovementForChain(chain, step, isSlowed, isReversing) {
    const marbles = chain.marbles;
    const trackLength = chain.trackLength;
    const deltaT = chain.deltaT;

    if (marbles.length === 0) {
      chain.headDistance = 0;
      chain.chainComplete =
        this.spawnedMarblesCount >= this.getTotalMarbles();
      return;
    }

    const chainSpeed = this.getChainSpeed();
    const standardTravelT =
      (chainSpeed * (isSlowed ? 0.3 : 1) * step) / trackLength;
    const catchUpTravelT =
      (chainSpeed * CATCH_UP_MULTIPLIER * step) / trackLength;

    // Step 1: split the array wherever a real physical gap exists.
    const segments = [];
    let segment = [marbles[0]];

    for (let index = 1; index < marbles.length; index += 1) {
      const ahead = marbles[index - 1];
      const marble = marbles[index];

      if (ahead.t - marble.t > deltaT + 0.002) {
        segments.push(segment);
        segment = [marble];
      } else {
        segment.push(marble);
      }
    }
    segments.push(segment);

    // Reverse-time marble: while the timer runs every segment - including
    // detached ones - is dragged backwards at double the chain speed. The
    // rear-most speed is stated explicitly and then propagated forwards so
    // the whole chain ("all balls") reverses. Forward-only behaviour must
    // not run here: no magnetic catch-up, no momentum transfer and no combo
    // detonation. Marbles stop at the entrance instead of leaving the track.
    if (isReversing) {
      const reverseTravelT = -standardTravelT * 2;
      const reverseRear = segments[segments.length - 1];
      reverseRear.speed = reverseTravelT;

      for (let index = segments.length - 2; index >= 0; index -= 1) {
        segments[index].speed = segments[index + 1].speed;
      }

      for (const current of segments) {
        current.isMagnetic = false;

        for (const marble of current) {
          marble.magnetApproaching = false;
          marble.t = Phaser.Math.Clamp(
            marble.t + current.speed,
            0,
            1,
          );
        }
      }

      this.refreshChainMetrics(chain);
      return;
    }

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
      const holeT = frontTail.t - rearHead.t;
      const holeSlots = deltaT > 0 ? holeT / deltaT : Number.POSITIVE_INFINITY;

      // Magnetism only closes a hole that is smaller than MAGNET_MAX_SLOTS.
      // A special marble is colour-less (colorIndex -1), so it can never be
      // magnetically pulled and never fakes a same-colour connection.
      if (
        rearHead.colorIndex >= 0 &&
        rearHead.colorIndex === frontTail.colorIndex &&
        holeSlots <= MAGNET_MAX_SLOTS
      ) {
        rear.speed = catchUpTravelT;
        rear.isMagnetic = true;
      }

      // Momentum transfer: once a moving rear segment is within one frame of
      // touching the tail of a stopped segment ahead, the rear's speed is
      // handed to that segment. Without this the rear can never advance past
      // the rigid-clamp limit (frontTail.t - deltaT), so a stopped front
      // segment permanently deadlocks the whole chain. This loop walks from
      // the back towards the front, so the inherited speed keeps propagating
      // into the next stopped car in the same frame: the connected chain is
      // pushed like a train instead of one car at a time.
      const closingDistance = holeT - deltaT;

      if (closingDistance <= rear.speed + 0.002) {
        // The inherited speed is capped at the base chain speed. A magnetic
        // same-colour rear moves at 4.5x to slam the gap shut, and handing
        // that full overspeed to the car ahead would keep the gap constant
        // forever, so the Step 3/4 magnetic combo could never fire.
        front.speed = Math.max(
          front.speed,
          Math.min(rear.speed, standardTravelT),
        );
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
        const maxT = frontTail.t - deltaT;
        const newGap = frontTail.t - nextT;

        // The +0.002 grouping tolerance would merge these two segments on
        // the next frame. Treat entering that band as contact now, snap to
        // the rigid spacing, and allow the magnetic combo check to fire.
        if (nextT >= maxT || newGap <= deltaT + 0.002) {
          nextT = maxT;

          if (
            current.isMagnetic &&
            head.colorIndex >= 0 &&
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
          current[cart - 1].t - deltaT,
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

    this.refreshChainMetrics(chain);
  }

  updateChainPositions() {
    for (const chain of this.chains) {
      for (const marble of chain.marbles) {
        marble.t = Phaser.Math.Clamp(marble.t, 0, 1);
        marble.pushOffset = Phaser.Math.Linear(
          marble.pushOffset ?? 0,
          0,
          0.15,
        );

        // Physical progress (t) is authoritative; pushOffset only delays the
        // visual slide so the insertion reads as a physical shove.
        const visualT = Phaser.Math.Clamp(
          marble.t + marble.pushOffset,
          0,
          1,
        );
        const position = chain.track.getPointAt(visualT);
        marble.setPosition(position.x, position.y);
      }
    }
  }

  getTrackPoint(distance, chain = this.chains[0]) {
    if (!chain || chain.trackLength <= 0) {
      return new Phaser.Math.Vector2(this.cx, this.cy);
    }

    const t = Phaser.Math.Clamp(distance / chain.trackLength, 0, 1);

    return chain.track.getPointAt(t);
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

    // Anchor the freshly built launcher on the live board centre.
    this.layoutLauncher();
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

    // Any real gesture unlocks/resumes the Phaser sound manager and retries
    // the BGM queued behind the browser autoplay lock (iOS/Safari included).
    this.unlockBgmAudio();

    // The HUD exit button has its own object-level handler. Depending on the
    // Phaser dispatch order the scene-wide 'pointerdown' can still arrive for
    // the same press, so both orders are guarded here: a click inside the
    // visible button is ignored, and a scene event that arrives after the
    // button already ran for this press is swallowed as well. Without this,
    // the exit click could fire a shot or instantly start a new game from the
    // menu that was just opened.
    if (this.consumeExitButtonClick(pointer)) {
      return;
    }

    // The home-menu arrows and start button own their pointerdown handlers;
    // swallow the scene-level event dispatched for the same press so changing
    // a level can never launch a run or fire a marble.
    if (this.consumeMenuControlClick(pointer)) {
      return;
    }

    // The music capsule exists on every screen (menu, play, results). Tapping
    // it must never aim, shoot, start or restart anything.
    if (this.consumeMusicButtonClick(pointer)) {
      return;
    }

    if (this.gameState === 'MENU') {
      // Only the explicit start target below the level selector launches a
      // run; clicks on the title, arrows or empty space stay side-effect free.
      return;
    }

    if (this.gameState === 'GAMEOVER') {
      if (this.levelWon) {
        this.startNextLevel();
      } else {
        // A lost run restarts a fresh run at World 1 Stage 1 with a zeroed
        // score. Unlocked progress and the high score are preserved.
        this.startGame(1, 1);
      }
      return;
    }

    this.initAudio();
    this.pointerSeen = true;
    this.shootAt(pointer.worldX, pointer.worldY);
  }

  // True when this scene-level pointerdown belongs to a click on the HUD exit
  // button and must not shoot, start or restart anything. Also clears the
  // one-shot marker so it can never leak into a later, unrelated click.
  consumeExitButtonClick(pointer) {
    if (this.exitButtonDownTime !== null) {
      const isSamePress = pointer.downTime === this.exitButtonDownTime;
      this.exitButtonDownTime = null;

      if (isSamePress) {
        return true;
      }
    }

    if (
      this.gameState === 'PLAYING' &&
      this.homeButton &&
      this.homeButton.visible &&
      this.homeButton.active
    ) {
      return Phaser.Geom.Rectangle.Contains(
        this.homeButton.getBounds(),
        pointer.worldX,
        pointer.worldY,
      );
    }

    return false;
  }

  // True when this scene-level pointerdown belongs to a home-menu control
  // (level arrow or start button) and must not start the game or fire a shot.
  // The marker is cleared on every call so it cannot leak into a later click.
  consumeMenuControlClick(pointer) {
    if (this.menuControlDownTime === null) {
      return false;
    }

    const isSamePress = pointer.downTime === this.menuControlDownTime;
    this.menuControlDownTime = null;
    return isSamePress;
  }

  // True when this scene-level pointerdown belongs to the music capsule. The
  // one-shot press marker covers the dispatch order where the capsule handler
  // already ran, the cached bounds cover the opposite order. A lost run
  // restarts on any click, so this guard is what keeps the mute button from
  // wiping the result screen.
  consumeMusicButtonClick(pointer) {
    if (this.musicControlDownTime !== null) {
      const isSamePress = pointer.downTime === this.musicControlDownTime;
      this.musicControlDownTime = null;

      if (isSamePress) {
        return true;
      }
    }

    return !!(
      this.musicButtonBounds &&
      Phaser.Geom.Rectangle.Contains(
        this.musicButtonBounds,
        pointer.worldX,
        pointer.worldY,
      )
    );
  }

  shootAt(targetX, targetY) {
    if (!this.cannon) {
      return;
    }

    const distanceToTarget = Phaser.Math.Distance.Between(
      this.launcherX,
      this.launcherY,
      targetX,
      targetY,
    );

    // A click directly on the pivot has no direction; reuse the current aim.
    const angle =
      distanceToTarget < 1
        ? this.cannon.rotation
        : Phaser.Math.Angle.Between(
            this.launcherX,
            this.launcherY,
            targetX,
            targetY,
          );

    const muzzleX = this.launcherX + Math.cos(angle) * SHOT_SPAWN_OFFSET;
    const muzzleY = this.launcherY + Math.sin(angle) * SHOT_SPAWN_OFFSET;
    const colorIndex = this.currentBulletColor;

    // Consume the loaded marble and immediately promote the queued colour.
    this.currentBulletColor = this.nextBulletColor;
    this.nextBulletColor = this.pickNextBulletColor(this.currentBulletColor);
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
    sprite.isReverse = false;
    sprite.isPause = false;
    sprite.isSniper = false;

    // Sniper buff: near-instant projectiles (swept collision prevents
    // tunneling in updateShots); normal shots keep the base speed.
    const shotSpeed = this.sniperBuffActive
      ? SNIPER_SHOT_SPEED
      : SHOT_SPEED;

    this.shots.push({
      sprite,
      vx: Math.cos(angle) * shotSpeed,
      vy: Math.sin(angle) * shotSpeed,
      radius: SHOT_RADIUS,
      colorIndex,
    });

    this.createMuzzleFlash(muzzleX, muzzleY);
    this.playShootSound();
  }

  updateShots(step) {
    for (let index = this.shots.length - 1; index >= 0; index -= 1) {
      const shot = this.shots[index];

      // Straight-line, constant-speed travel. The direction was captured at
      // the moment of the click and never changes afterwards.
      const previousX = shot.sprite.x;
      const previousY = shot.sprite.y;
      shot.sprite.x += shot.vx * step;
      shot.sprite.y += shot.vy * step;

      // Sniper instant-fire shots cover up to 10000 px/s, so point tests
      // would tunnel straight through the target. Sweep the travel segment.
      const marble = this.sniperBuffActive
        ? this.findSweptMarbleHit(
            previousX,
            previousY,
            shot.sprite.x,
            shot.sprite.y,
          )
        : this.findMarbleHit(shot);
      if (marble) {
        this.resolveHit(shot, marble);
        continue;
      }

      const bonus = this.sniperBuffActive
        ? this.findSweptBonusHit(
            previousX,
            previousY,
            shot.sprite.x,
            shot.sprite.y,
          )
        : this.findBonusHit(shot);
      if (bonus) {
        this.collectBonus(bonus, shot);
        continue;
      }

      const { x, y } = shot.sprite;
      if (
        x < -SHOT_CULL_MARGIN ||
        x > this.vw + SHOT_CULL_MARGIN ||
        y < -SHOT_CULL_MARGIN ||
        y > this.vh + SHOT_CULL_MARGIN
      ) {
        shot.sprite.destroy();
        this.shots.splice(index, 1);
      }
    }
  }

  findMarbleHit(shot) {
    const hitDistanceSq = (SHOT_RADIUS + BALL_RADIUS) ** 2;

    // Shots search every active chain; the hit marble carries a back-reference
    // to its own chain so insertion/matching can never leak across tracks.
    for (const chain of this.chains) {
      for (const marble of chain.marbles) {
        if (!marble.active) {
          continue;
        }

        const dx = marble.x - shot.sprite.x;
        const dy = marble.y - shot.sprite.y;

        if (dx * dx + dy * dy <= hitDistanceSq) {
          return marble;
        }
      }
    }

    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Sniper marble: aiming laser + instant hitscan shots                 */
  /* ------------------------------------------------------------------ */

  // Every marble on every active chain (World 3 runs two independent chains).
  getAllMarbles() {
    if (Array.isArray(this.chains) && this.chains.length > 0) {
      const all = [];

      for (const chain of this.chains) {
        if (chain && Array.isArray(chain.marbles)) {
          all.push(...chain.marbles);
        }
      }

      return all;
    }

    return this.marbles;
  }

  // Ray/circle entry distance. Returns the distance along the ray at which the
  // aim line first enters the marble, or null when the ray misses it.
  rayCircleEntry(originX, originY, dirX, dirY, centerX, centerY, radius) {
    const toCenterX = centerX - originX;
    const toCenterY = centerY - originY;
    const along = toCenterX * dirX + toCenterY * dirY;

    if (along <= 0) {
      return null;
    }

    const perpendicularSq =
      toCenterX * toCenterX + toCenterY * toCenterY - along * along;

    if (perpendicularSq > radius * radius) {
      return null;
    }

    const entry = along - Math.sqrt(Math.max(0, radius * radius - perpendicularSq));

    return entry >= 0 ? entry : along;
  }

  // Nearest marble on ANY track along the aim ray (the laser impact point).
  findSniperRayTarget(originX, originY, dirX, dirY) {
    let best = null;

    for (const marble of this.getAllMarbles()) {
      if (!marble || marble.active === false) {
        continue;
      }

      const entry = this.rayCircleEntry(
        originX,
        originY,
        dirX,
        dirY,
        marble.x,
        marble.y,
        BALL_RADIUS,
      );

      if (entry !== null && (!best || entry < best.distance)) {
        best = { marble, distance: entry };
      }
    }

    return best;
  }

  // First positive intersection of the aim ray with the screen border.
  sniperEdgePoint(originX, originY, dirX, dirY) {
    const candidates = [];

    if (dirX > 1e-6) {
      candidates.push((this.vw - originX) / dirX);
    } else if (dirX < -1e-6) {
      candidates.push((0 - originX) / dirX);
    }

    if (dirY > 1e-6) {
      candidates.push((this.vh - originY) / dirY);
    } else if (dirY < -1e-6) {
      candidates.push((0 - originY) / dirY);
    }

    let distance = Math.hypot(this.vw, this.vh);

    for (const candidate of candidates) {
      if (candidate > 0 && candidate < distance) {
        distance = candidate;
      }
    }

    return {
      x: originX + dirX * distance,
      y: originY + dirY * distance,
      distance,
    };
  }

  // Red aiming laser from the cannon centre to the nearest marble on either
  // track (or the screen edge). Drawn above balls/track depth.
  updateSniperLaser() {
    if (!this.sniperBuffActive) {
      this.hideSniperLaser();
      return;
    }

    const originX = this.launcherX;
    const originY = this.launcherY;
    const angle = this.cannon ? this.cannon.rotation : -Math.PI / 2;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const rayTarget = this.findSniperRayTarget(originX, originY, dirX, dirY);
    const edge = this.sniperEdgePoint(originX, originY, dirX, dirY);
    const end = rayTarget
      ? {
          x: originX + dirX * rayTarget.distance,
          y: originY + dirY * rayTarget.distance,
          distance: rayTarget.distance,
        }
      : edge;

    if (!this.sniperLaser) {
      this.sniperLaser = this.add.graphics().setDepth(SNIPER_LASER_DEPTH);
    }

    const laser = this.sniperLaser;
    laser.clear();
    laser.setVisible(true);

    // Outer glow, solid core, then a hot inner line.
    laser.lineStyle(7, 0xff2222, 0.16);
    laser.lineBetween(originX, originY, end.x, end.y);
    laser.lineStyle(2.4, 0xff3b3b, 0.82);
    laser.lineBetween(originX, originY, end.x, end.y);
    laser.lineStyle(1, 0xffd0d0, 0.95);
    laser.lineBetween(originX, originY, end.x, end.y);

    // Reticle at the impact point (bigger when a marble is targeted).
    laser.lineStyle(2, 0xff5252, 0.9);
    laser.strokeCircle(end.x, end.y, rayTarget ? BALL_RADIUS + 4 : 9);
    laser.lineStyle(1.2, 0xffb0b0, 0.85);
    laser.lineBetween(end.x - 12, end.y, end.x + 12, end.y);
    laser.lineBetween(end.x, end.y - 12, end.x, end.y + 12);

    this.sniperLaserTarget = rayTarget ? rayTarget.marble : null;
    this.sniperLaserEnd = { x: end.x, y: end.y, distance: end.distance };
    this.sniperLaserVisible = true;
  }

  hideSniperLaser() {
    this.sniperLaserVisible = false;
    this.sniperLaserTarget = null;
    this.sniperLaserEnd = null;

    if (this.sniperLaser) {
      this.sniperLaser.clear();
      this.sniperLaser.setVisible(false);
    }
  }

  // Per-frame sniper tick (called once from update()). Decrements the buff and
  // refreshes the laser; the laser is hidden exactly when the timer hits 0.
  updateSniper(step) {
    if (!this.sniperBuffActive) {
      if (this.sniperLaser && this.sniperLaser.visible) {
        this.hideSniperLaser();
      }
      return;
    }

    this.sniperTimer = Math.max(0, this.sniperTimer - step);

    if (this.sniperTimer <= 0) {
      this.sniperBuffActive = false;
      this.sniperTimer = 0;
      this.hideSniperLaser();
      return;
    }

    this.updateSniperLaser();
  }

  // Entry parameter (0..1) of a segment against a circle, or null when missed.
  segmentCircleEntry(
    fromX,
    fromY,
    segmentX,
    segmentY,
    segmentLengthSq,
    centerX,
    centerY,
    radius,
  ) {
    const toCenterX = centerX - fromX;
    const toCenterY = centerY - fromY;

    if (segmentLengthSq <= 1e-9) {
      const dx = centerX - fromX;
      const dy = centerY - fromY;
      return dx * dx + dy * dy <= radius * radius ? 0 : null;
    }

    const b = -2 * (toCenterX * segmentX + toCenterY * segmentY);
    const c =
      toCenterX * toCenterX + toCenterY * toCenterY - radius * radius;
    const discriminant = b * b - 4 * segmentLengthSq * c;

    if (discriminant < 0) {
      return null;
    }

    const root = Math.sqrt(discriminant);
    const entry = (-b - root) / (2 * segmentLengthSq);
    const exit = (-b + root) / (2 * segmentLengthSq);

    if (entry >= 0 && entry <= 1) {
      return entry;
    }

    if (exit >= 0 && entry < 0) {
      return 0; // segment starts inside the circle
    }

    return null;
  }

  // Swept marble test for instant-fire shots: first marble the travel segment
  // crosses, across EVERY chain, so high speed cannot tunnel or pick the wrong
  // track (the hit marble keeps its chain back-reference for resolveHit).
  findSweptMarbleHit(fromX, fromY, toX, toY) {
    const radius = SHOT_RADIUS + BALL_RADIUS;
    const segmentX = toX - fromX;
    const segmentY = toY - fromY;
    const segmentLengthSq = segmentX * segmentX + segmentY * segmentY;
    let best = null;
    let bestEntry = Infinity;

    for (const marble of this.getAllMarbles()) {
      if (!marble || marble.active === false) {
        continue;
      }

      const entry = this.segmentCircleEntry(
        fromX,
        fromY,
        segmentX,
        segmentY,
        segmentLengthSq,
        marble.x,
        marble.y,
        radius,
      );

      if (entry !== null && entry < bestEntry) {
        bestEntry = entry;
        best = marble;
      }
    }

    return best;
  }

  // Swept bonus test so fast sniper shots still collect stars.
  findSweptBonusHit(fromX, fromY, toX, toY) {
    const radius = SHOT_RADIUS + BONUS_RADIUS;
    const segmentX = toX - fromX;
    const segmentY = toY - fromY;
    const segmentLengthSq = segmentX * segmentX + segmentY * segmentY;
    let best = null;
    let bestEntry = Infinity;

    for (const item of this.bonusItems) {
      if (!item || item.active === false) {
        continue;
      }

      const entry = this.segmentCircleEntry(
        fromX,
        fromY,
        segmentX,
        segmentY,
        segmentLengthSq,
        item.x,
        item.y,
        radius,
      );

      if (entry !== null && entry < bestEntry) {
        bestEntry = entry;
        best = item;
      }
    }

    return best;
  }

  resolveHit(shot, hitMarble) {
    const chain = hitMarble.chain ?? this.chains[0];

    if (!chain) {
      return;
    }

    const marbles = chain.marbles;
    const hitIndex = marbles.indexOf(hitMarble);

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

    // Reverse-time marble: the hit consumes the shot and the marble and
    // drags the whole chain backwards. It must not insert a marble or run
    // any match; bomb and reverse are mutually exclusive by spawn roll.
    if (hitMarble.isReverse) {
      const shotIndex = this.shots.indexOf(shot);
      if (shotIndex !== -1) {
        this.shots.splice(shotIndex, 1);
      }

      shot.sprite.destroy();

      const reverseX = hitMarble.x;
      const reverseY = hitMarble.y;
      const reverseColor = hitMarble.colorIndex;
      hitMarble.magnetApproaching = false;
      marbles.splice(hitIndex, 1);

      this.tweens.add({
        targets: hitMarble,
        scale: 1.35,
        alpha: 0,
        angle: hitMarble.angle - 70,
        duration: 220,
        ease: 'Cubic.easeOut',
        onComplete: () => hitMarble.destroy(),
      });

      this.refreshChainMetrics(chain);
      this.syncPrimaryAliases();
      this.updateMarbleCount();

      this.reverseTimer = REVERSE_DURATION;
      this.createMatchBurst(reverseX, reverseY, reverseColor);
      this.createFloatingText(
        reverseX,
        reverseY,
        '時間倒流！',
        '#aef7ff',
        20,
      );
      this.cameras.main.flash(140, 90, 200, 255);
      return;
    }

    // Pause marble: the hit consumes the shot and the marble and freezes
    // the whole chain for a few seconds. Like reverse it never inserts a
    // marble or runs a match, and it cancels an in-flight reverse.
    if (hitMarble.isPause) {
      const shotIndex = this.shots.indexOf(shot);
      if (shotIndex !== -1) {
        this.shots.splice(shotIndex, 1);
      }

      shot.sprite.destroy();

      const pauseX = hitMarble.x;
      const pauseY = hitMarble.y;
      const pauseColor = hitMarble.colorIndex;
      hitMarble.magnetApproaching = false;
      marbles.splice(hitIndex, 1);

      this.tweens.add({
        targets: hitMarble,
        scale: 1.3,
        alpha: 0,
        angle: hitMarble.angle + 40,
        duration: 240,
        ease: 'Cubic.easeOut',
        onComplete: () => hitMarble.destroy(),
      });

      this.refreshChainMetrics(chain);
      this.syncPrimaryAliases();
      this.updateMarbleCount();

      this.reverseTimer = 0;
      this.pauseTimer = PAUSE_DURATION;
      this.createMatchBurst(pauseX, pauseY, pauseColor);
      this.createFloatingText(pauseX, pauseY, '時間暫停！', '#bfe6ff', 20);
      this.cameras.main.flash(160, 120, 200, 255);
      return;
    }

    // Sniper marble: the hit consumes the shot and the marble and grants
    // the instant-fire buff (aiming laser + 10000 px/s shots) for
    // SNIPER_BUFF_DURATION (6 s). It removes the marble from its OWN chain
    // only and never inserts/matches.
    if (hitMarble.isSniper) {
      const shotIndex = this.shots.indexOf(shot);
      if (shotIndex !== -1) {
        this.shots.splice(shotIndex, 1);
      }

      shot.sprite.destroy();

      const sniperX = hitMarble.x;
      const sniperY = hitMarble.y;
      const sniperColor = hitMarble.colorIndex;
      hitMarble.magnetApproaching = false;
      marbles.splice(hitIndex, 1);

      this.tweens.add({
        targets: hitMarble,
        scale: 1.3,
        alpha: 0,
        angle: hitMarble.angle - 35,
        duration: 240,
        ease: 'Cubic.easeOut',
        onComplete: () => hitMarble.destroy(),
      });

      this.refreshChainMetrics(chain);
      this.syncPrimaryAliases();
      this.updateMarbleCount();

      this.sniperBuffActive = true;
      this.sniperTimer = SNIPER_BUFF_DURATION;
      this.createMatchBurst(sniperX, sniperY, sniperColor);
      this.createFloatingText(sniperX, sniperY, '狙擊模式！', '#ff9a9a', 20);
      this.cameras.main.flash(160, 255, 90, 90);
      this.updateSniperLaser();
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
    // struck marble owns the new slot. The tangent comes from the HIT chain's
    // spline, never from the primary track.
    const tangent = chain.track.getTangentAt(hitT);
    const tangentAngle = Math.atan2(tangent.y, tangent.x);
    const impactAngle = Math.atan2(shotY - hitY, shotX - hitX);
    const angleFromTangent = Phaser.Math.Angle.Wrap(
      impactAngle - tangentAngle,
    );
    const approachedFromFront = Math.abs(angleFromTangent) <= Math.PI / 2;

    // Do not push the tail past t = 0. A rear insertion at the entrance is
    // mirrored to the front side so it can always open a legal slot.
    const isTail = hitIndex === marbles.length - 1;
    const wouldFallOffStart =
      !approachedFromFront && isTail && hitT < chain.deltaT;
    const insertInFront = approachedFromFront || wouldFallOffStart;
    const insertIndex = insertInFront ? hitIndex : hitIndex + 1;

    // The projectile is already a PathFollower. Rebind the exact same object
    // to the hit chain now that its t value can be assigned.
    const insertedMarble = shot.sprite;
    insertedMarble
      .setDepth(DEPTH.balls)
      .setData('type', 'marble')
      .setData('colorIndex', shot.colorIndex);
    insertedMarble.chain = chain;
    insertedMarble.colorIndex = shot.colorIndex;
    insertedMarble.t = insertInFront ? hitT : hitT - chain.deltaT;
    insertedMarble.pushOffset = 0;
    insertedMarble.magnetApproaching = false;
    insertedMarble.isBomb = false;
    insertedMarble.isReverse = false;
    insertedMarble.isPause = false;

    // Insert first, then propagate the pressure forwards through the chain.
    // A sufficiently large pre-existing gap absorbs the force completely.
    marbles.splice(insertIndex, 0, insertedMarble);

    for (
      let index = insertIndex;
      index < marbles.length - 1;
      index += 1
    ) {
      const current = marbles[index];
      const behind = marbles[index + 1];
      const gap = current.t - behind.t;

      if (gap >= chain.deltaT) {
        // The gap is large enough to absorb the push. The rest of the chain
        // must not move at all.
        break;
      }

      const shiftAmount = chain.deltaT - gap;
      behind.t -= shiftAmount;
      behind.pushOffset += shiftAmount;
    }

    // Commit all pushed t values to screen coordinates BEFORE scanning for
    // matches. This keeps the visual chain and the matching logic in sync.
    this.normalizePushedChain(chain);
    this.updateChainPositions();
    this.refreshChainMetrics(chain);
    this.syncPrimaryAliases();
    this.updateMarbleCount();

    this.createInsertPulse(hitX, hitY, shot.colorIndex);
    console.log('Hit!');

    const matchLength = this.resolveMatches(insertedMarble);

    if (matchLength === 0) {
      this.playClickSound();
    }
  }

  // Inclusive [start, end] index range destroyed by a bomb. The chain array is
  // ordered head -> tail (t descending), so the shockwave simply walks outwards
  // from the bomb index and stops at the first real gap. Two neighbouring
  // marbles that are more than one diameter apart form a hole that absorbs the
  // blast, so marbles beyond it are neither destroyed nor displaced: the
  // explosion can never travel across empty track to reach a distant marble.
  getBombBlastRange(marbles, bombIndex, deltaT) {
    const contactTolerance = 0.005;
    let start = bombIndex;
    let end = bombIndex;

    // Towards the head of the chain (front of the blast).
    for (let step = 0; step < BOMB_BLAST_NEIGHBOURS; step += 1) {
      const index = start - 1;

      if (index < 0) {
        break;
      }

      const gap = marbles[index].t - marbles[index + 1].t;

      if (!Number.isFinite(gap) || gap > deltaT + contactTolerance) {
        break;
      }

      start = index;
    }

    // Towards the tail of the chain (back of the blast).
    for (let step = 0; step < BOMB_BLAST_NEIGHBOURS; step += 1) {
      const index = end + 1;

      if (index > marbles.length - 1) {
        break;
      }

      const gap = marbles[index - 1].t - marbles[index].t;

      if (!Number.isFinite(gap) || gap > deltaT + contactTolerance) {
        break;
      }

      end = index;
    }

    return { start, end };
  }

  resolveBombHit(shot, bombMarble, bombIndex) {
    this.playExplosionSound();

    const chain = bombMarble.chain ?? this.chains[0];
    const marbles = chain ? chain.marbles : [];

    const shotIndex = this.shots.indexOf(shot);
    if (shotIndex !== -1) {
      this.shots.splice(shotIndex, 1);
    }
    shot.sprite.destroy();

    const bombX = bombMarble.x;
    const bombY = bombMarble.y;
    const colorIndex = bombMarble.colorIndex;
    // Blast radius measured along the track: only the marbles physically
    // packed against the blast group are destroyed, and the survivors below
    // keep their own t. No push is applied anywhere else, so a hole in the
    // chain stops the shockwave instead of shoving distant marbles into it.
    const { start, end } = this.getBombBlastRange(
      marbles,
      bombIndex,
      chain ? chain.deltaT : 0,
    );

    const destroyed = marbles.splice(start, end - start + 1);
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

    if (chain) {
      this.refreshChainMetrics(chain);
    }

    this.syncPrimaryAliases();
    this.updateMarbleCount();

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
    const chain = marble.chain ?? this.chains[0];

    if (!chain) {
      return null;
    }

    const marbles = chain.marbles;
    const insertedIndex = marbles.indexOf(marble);

    if (insertedIndex === -1) {
      return null;
    }

    const colorIndex = marble.colorIndex;
    let start = insertedIndex;
    let end = insertedIndex;

    while (start > 0 && marbles[start - 1].colorIndex === colorIndex) {
      start -= 1;
    }

    while (
      end < marbles.length - 1 &&
      marbles[end + 1].colorIndex === colorIndex
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
    const chain = insertedMarble.chain ?? this.chains[0];

    if (!chain) {
      return 0;
    }

    const marbles = chain.marbles;
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

    // The marble directly after the removed run receives an elastic kickback,
    // but ONLY when it is physically touching that run. The gap is measured
    // before the splice, while both marbles still exist. A rear marble that
    // sits across an existing hole must not be yanked backwards across it
    // (that telekinetic pull was the old pushback bug).
    const pushbackMarble = marbles[end + 1] ?? null;
    const pushbackGap = pushbackMarble
      ? marbles[end].t - pushbackMarble.t
      : 0;
    const pushbackTouching = pushbackGap <= chain.deltaT + 0.005;

    const matched = marbles.splice(start, matchLength);
    let centerX = 0;
    let centerY = 0;
    for (const marble of matched) {
      centerX += marble.x;
      centerY += marble.y;
    }
    centerX /= matched.length;
    centerY /= matched.length;

    this.slowdownTimer = 1.5;
    let needsStartNormalize = false;

    if (pushbackMarble) {
      if (pushbackTouching) {
        pushbackMarble.pushOffset = chain.deltaT * 1.5;
        pushbackMarble.t = Math.max(
          0,
          pushbackMarble.t - chain.deltaT * 1.5,
        );

        // The elastic kick opens a 1.5-diameter hole at the match site, but
        // the marbles packed behind the kicked marble still hold the old
        // spacing. Without propagating that overlap they are rigid-clamped
        // against each other on the next movement frame, which teleports
        // them backwards in one step (a visible snap). Walk the packed run
        // towards the tail now and hand each overlapping pair its correct
        // position; pushOffset keeps the rendered marble where it was so the
        // recoil then slides out smoothly instead of jumping. The loop is
        // bounded by the array length and stops at the first real gap.
        const pushbackIndex = marbles.indexOf(pushbackMarble);

        if (pushbackIndex !== -1) {
          for (
            let index = pushbackIndex;
            index < marbles.length - 1;
            index += 1
          ) {
            const current = marbles[index];
            const behind = marbles[index + 1];
            const gap = current.t - behind.t;

            if (!Number.isFinite(gap) || gap >= chain.deltaT) {
              break;
            }

            const overlap = chain.deltaT - gap;

            if (!Number.isFinite(overlap) || overlap <= 0) {
              break;
            }

            behind.t -= overlap;
            behind.pushOffset = (behind.pushOffset ?? 0) + overlap;
            behind.magnetApproaching = false;

            if (behind.t < 0) {
              needsStartNormalize = true;
            }
          }
        }
      }

      pushbackMarble.magnetApproaching = false;
    }

    // Only when the cascade pushed the tail past the entrance: slide the
    // whole chain forward by the deficit (bounded to [0, 1]) so no marble is
    // stranded behind t = 0. Relative spacing is preserved.
    if (needsStartNormalize) {
      this.normalizePushedChain(chain);
    }

    this.refreshChainMetrics(chain);
    this.syncPrimaryAliases();
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
    this.playMatchSound();
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
    const color = this.getMarbleColorValue(colorIndex);

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
    // Specials have no colour; getMarbleColorValue falls back to stone.
    const color = this.getMarbleColorValue(colorIndex);

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

    const cap = this.getBonusCap();
    const regularTarget = Math.max(1, cap - 1);
    const positions = [];
    const anchors = Phaser.Utils.Array.Shuffle(this.getBonusAnchors());

    // Regular 100-point pickups must be directly reachable; otherwise every
    // star would accidentally become a 300-point gap shot. Early worlds spawn
    // fewer stars so the board never feels cluttered.
    for (const anchor of anchors) {
      if (positions.length >= regularTarget) {
        break;
      }

      const x = Phaser.Math.Clamp(
        anchor.x + Phaser.Math.Between(-10, 10),
        70,
        Math.max(70, this.vw - 70),
      );
      const y = Phaser.Math.Clamp(
        anchor.y + Phaser.Math.Between(-10, 10),
        80,
        Math.max(80, this.vh - 70),
      );

      if (
        this.isBonusPositionClear(x, y, positions, 48) &&
        !this.shotPathCrossesTrack(x, y)
      ) {
        positions.push({ x, y, clearance: 48 });
      }
    }

    // World 3's second track covers many of the old anchors, so fill any
    // remaining slots from the open-spot grid (these may become gap shots).
    while (positions.length < regularTarget) {
      const spot = this.findOpenBonusSpot(positions, true);

      if (!spot) {
        break;
      }

      positions.push({ x: spot.x, y: spot.y, clearance: 48 });
    }

    // One star sits above the top track: reaching it requires firing through
    // a gap in the chain, so it is worth the 300-point Gap Shot bonus. It is
    // only added once the world's cap leaves room for a second pickup.
    if (cap > 1) {
      let gapX = Phaser.Math.Between(
        this.cx + this.vw * 0.1,
        this.cx + this.vw * 0.25,
      );
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
        gapX = this.cx + this.vw * 0.175;
        gapY = 28;
      }

      positions.push({
        x: gapX,
        y: gapY,
        clearance: TRACK_CLEARANCE,
      });
    }

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

  // Curated pickup anchors as fractions of the live board, so the same layout
  // works on a wide desktop board and on a tall phone board.
  getBonusAnchors() {
    return [
      [0.3, 0.367],
      [0.7, 0.367],
      [0.25, 0.5],
      [0.75, 0.5],
      [0.3, 0.433],
      [0.7, 0.433],
    ].map(([fx, fy]) => ({ x: fx * this.vw, y: fy * this.vh }));
  }

  isBonusPositionClear(x, y, positions, clearance) {
    if (
      Phaser.Math.Distance.Between(this.launcherX, this.launcherY, x, y) < 115
    ) {
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

  // Pick an open pickup spot. The curated anchors keep the classic layout for
  // Worlds 1-2; a board-wide fallback grid makes sure the progressive pickup
  // cap can still be filled on World 3's busier dual-track board.
  findOpenBonusSpot(positions, allowCross = false) {
    const anchors = Phaser.Utils.Array.Shuffle(this.getBonusAnchors());

    const candidates = anchors.map((anchor) => ({
      x: Phaser.Math.Clamp(
        anchor.x + Phaser.Math.Between(-15, 15),
        70,
        Math.max(70, this.vw - 70),
      ),
      y: Phaser.Math.Clamp(
        anchor.y + Phaser.Math.Between(-15, 15),
        80,
        Math.max(80, this.vh - 70),
      ),
    }));

    for (let x = 90; x <= this.vw - 90; x += 40) {
      for (let y = 130; y <= this.vh - 100; y += 35) {
        candidates.push({ x, y });
      }
    }

    for (const candidate of candidates) {
      if (
        !this.isBonusPositionClear(
          candidate.x,
          candidate.y,
          positions,
          48,
        )
      ) {
        continue;
      }

      if (
        !allowCross &&
        this.shotPathCrossesTrack(candidate.x, candidate.y)
      ) {
        continue;
      }

      return candidate;
    }

    return null;
  }

  distanceToTrack(x, y) {
    let nearest = Infinity;

    // Bonus placement and "shoots through a gap" checks consider EVERY active
    // track (both World 3 chains) and use the closest one.
    for (const chain of this.chains) {
      for (const point of chain.trackSamples) {
        const distance = Phaser.Math.Distance.Between(x, y, point.x, point.y);
        if (distance < nearest) {
          nearest = distance;
        }
      }
    }

    return nearest;
  }

  shotPathCrossesTrack(targetX, targetY) {
    const steps = 60;

    for (let step = 6; step <= steps - 4; step += 1) {
      const ratio = step / steps;
      const x = this.launcherX + (targetX - this.launcherX) * ratio;
      const y = this.launcherY + (targetY - this.launcherY) * ratio;

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
    this.playBonusSound();

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
    // A resize regenerates the field, so drop the previous motes (and their
    // infinite tweens) first or every layout change would stack another 16.
    for (const mote of this.moteSprites || []) {
      this.tweens.killTweensOf(mote);
      mote.destroy();
    }

    this.moteSprites = [];

    const rng = new Phaser.Math.RandomDataGenerator(['serpentine-motes']);

    for (let i = 0; i < 16; i += 1) {
      const x = rng.between(34, Math.max(68, this.vw - 34));
      const y = rng.between(Math.min(90, this.vh / 4), Math.max(140, this.vh - 50));
      const radius = rng.realInRange(0.7, 1.9);
      const baseAlpha = rng.realInRange(0.12, 0.32);

      const mote = this.add
        .circle(x, y, radius, 0xe4efaf, baseAlpha)
        .setDepth(DEPTH.motes)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.moteSprites.push(mote);

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

    // Exit-to-home control: a bottom-right HUD capsule anchored at (770, 570).
    // Every child is laid out in negative local space, so the Container itself
    // carries the (right, bottom) anchor and the capsule + interactive Zone
    // always span x 646..770, y 536..570 (124 x 34) as one moving unit.
    // The Container keeps DEPTH.hud so the depth-filtered hudObjects list
    // toggles the capsule, label and hit zone together with the rest of the
    // HUD (visible while PLAYING, hidden on the menu and on the end panels).
    const homeWidth = 124;
    const homeHeight = 34;
    const homeRadius = homeHeight / 2;
    const homeLeft = -homeWidth;
    const homeTop = -homeHeight;

    const homeBg = this.add.graphics().setPosition(homeLeft, homeTop);

    // Additive highlight layer. Its alpha is tweened on hover instead of
    // repainting the capsule, which keeps the highlight transition smooth.
    const homeHover = this.add
      .graphics()
      .setPosition(homeLeft, homeTop)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);

    const homeLabel = this.add
      .text(-homeWidth / 2, -homeHeight / 2, '退出回首頁', {
        fontFamily: UI_FONT,
        fontSize: '13px',
        color: '#f7efd2',
      })
      .setOrigin(0.5);
    homeLabel.setShadow(0, 1, '#000000', 4, false, true);

    const homeHitArea = this.add
      .zone(homeLeft, homeTop, homeWidth, homeHeight)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });

    const paintHomeButton = () => {
      homeBg.clear();

      // Semi-transparent dark jungle capsule (radius = half height).
      homeBg.fillStyle(0x06120c, 0.74);
      homeBg.fillRoundedRect(0, 0, homeWidth, homeHeight, homeRadius);

      // Subtle top gloss, tucked inside the rounded upper half.
      homeBg.fillStyle(0xffffff, 0.06);
      homeBg.fillRoundedRect(3, 2, homeWidth - 6, homeHeight / 2 - 2, {
        tl: homeRadius - 2,
        tr: homeRadius - 2,
        bl: 0,
        br: 0,
      });

      // Thin light border.
      homeBg.lineStyle(1, 0xd9e6b8, 0.36);
      homeBg.strokeRoundedRect(
        0.5,
        0.5,
        homeWidth - 1,
        homeHeight - 1,
        homeRadius - 0.5,
      );

      // Fill for the additive highlight layer; its alpha is tweened.
      homeHover.clear();
      homeHover.fillStyle(0xf2ffd4, 1);
      homeHover.fillRoundedRect(0, 0, homeWidth, homeHeight, homeRadius);
    };

    const tweenHomeHover = (targetAlpha) => {
      this.tweens.killTweensOf(homeHover);
      this.tweens.add({
        targets: homeHover,
        alpha: targetAlpha,
        duration: 150,
        ease: 'Sine.easeOut',
      });
    };

    paintHomeButton();

    homeHitArea.on('pointerover', () => {
      tweenHomeHover(0.3);
      homeLabel.setColor('#fffbe8');
    });

    homeHitArea.on('pointerout', () => {
      tweenHomeHover(0);
      homeLabel.setColor('#f7efd2');
    });

    homeHitArea.on('pointerdown', (pointer, _localX, _localY, event) => {
      event.stopPropagation();

      // Mark this exact press so a scene-level 'pointerdown' dispatched for
      // the same click (before or after this handler) is ignored instead of
      // shooting or restarting the game from the menu.
      this.exitButtonDownTime = pointer.downTime;

      // Clear any in-flight hover highlight before the HUD is hidden.
      this.tweens.killTweensOf(homeHover);
      homeHover.setAlpha(0);
      this.returnToMenu();
    });

    this.homeHover = homeHover;
    this.homeButton = this.add
      .container(770, 570, [homeBg, homeHover, homeLabel, homeHitArea])
      .setDepth(DEPTH.hud);

    const scoreLabel = this.add
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

    const hintText = this.add
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

    // Kept so a resize can re-pin both HUD columns against the live board
    // edges instead of the authored 800x600 corners.
    this.hudLeftTexts = [title, this.levelText];
    this.hudRightTexts = [
      scoreLabel,
      this.scoreText,
      this.highScoreText,
      hintText,
      this.marbleCountText,
    ];

    this.updateLevelHud();
    this.updateMarbleCount();
    this.updateScoreHud();
    this.layoutHud();
  }

  // World/Stage-aware HUD labels (World-Stage + absolute difficulty D).
  updateLevelHud() {
    if (!this.levelText) {
      return;
    }

    this.levelText.setText(
      `世界 ${this.currentWorld}-${this.currentStage} · D${this.getDifficulty()} · 共 ${this.getTotalMarbles()} 顆球`,
    );
  }

  updateMarbleCount() {
    if (!this.marbleCountText) {
      return;
    }

    const count = this.getTotalChainMarbles();
    const dualSuffix = this.isDualTrack() ? '（雙軌）' : '';
    this.marbleCountText.setText(
      `軌道上 ${count} 顆${dualSuffix} · 已生成 ${this.spawnedMarblesCount}/${this.getTotalMarbles()}`,
    );
  }
}
