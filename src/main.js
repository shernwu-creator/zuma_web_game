import Phaser from 'phaser';
import './style.css';
import { GameScene } from './scenes/GameScene.js';
import { computeViewSize } from './scenes/viewport.js';

// The logical playfield follows the stage aspect ratio (16:9 stays 16:9,
// 9:16 becomes a tall portrait board). FIT then scales that board up to the
// whole stage, so the player gets the biggest possible picture without any
// sprite, turret or glyph being stretched.
const measureStage = () => {
  const element = document.getElementById('game');
  const rect = element ? element.getBoundingClientRect() : null;

  if (rect && rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }

  return null;
};

const initialView = computeViewSize(
  typeof window === 'undefined' ? null : window,
  measureStage(),
);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: initialView.width,
  height: initialView.height,
  backgroundColor: '#1a3320',
  scene: [GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    expandParent: false,
    autoRound: true,
    resizeInterval: 120,
  },
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance',
  },
});

// Handy for checking game state from the browser console during phase 01.
window.__ZUMA_GAME__ = game;

/* ------------------------------------------------------------------ */
/* Responsive playfield                                                */
/* ------------------------------------------------------------------ */

// Re-derive the logical board size whenever the viewport changes. Phaser's
// ScaleManager then fires RESIZE, which the scene listens to in order to
// re-lay-out the backdrop, the track, the launcher, the HUD and the overlays.
// Returns true when the board (and therefore the canvas) was rebuilt.
const syncViewSize = () => {
  const size = computeViewSize(window, measureStage());
  const current = game.scale.gameSize;

  if (current.width === size.width && current.height === size.height) {
    return false;
  }

  game.scale.setGameSize(size.width, size.height);
  return true;
};

const stageHost = document.querySelector('.stage');
const gameHost = document.getElementById('game');

// FIT only leaves the canvas smaller than its parent when the logical board
// aspect no longer matches the stage box, so "the canvas fills #game" is the
// invariant that keeps the picture full screen. Checking it (instead of
// assuming it) is what stops the board from ever staying squeezed into a
// corner after a window restore, a tab switch or a mobile browser hiding its
// toolbars at load time.
const canvasFillsHost = () => {
  const host = gameHost;
  const canvas = game.canvas;

  if (!host || !canvas) {
    return true;
  }

  const hostRect = host.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();

  // Not laid out yet (hidden tab, pre-boot): nothing to verify.
  if (hostRect.width < 16 || hostRect.height < 16) {
    return true;
  }

  if (canvasRect.width < 16 || canvasRect.height < 16) {
    return true;
  }

  return (
    canvasRect.width >= hostRect.width * 0.99 &&
    canvasRect.height >= hostRect.height * 0.99
  );
};

const repairCanvasFill = (attempt = 0) => {
  if (canvasFillsHost()) {
    return;
  }

  // First try the cheap fix: re-apply FIT against the current parent box.
  game.scale.refresh();

  if (attempt >= 1) {
    // Still wrong, so the logical board itself is stale: rebuild it from the
    // current measurement. `trustBounds` is deliberately NOT forced here - that
    // bypassed the MIN_STAGE_RATIO guard in viewport.js and locked the canvas
    // to a bogus flat aspect while the page was still settling.
    syncViewSize();
    game.scale.refresh();
    return;
  }

  window.setTimeout(() => repairCanvasFill(attempt + 1), 180);
};

let viewResizeTimer = null;

const scheduleViewSync = (delay = 140) => {
  if (viewResizeTimer !== null) {
    clearTimeout(viewResizeTimer);
  }

  viewResizeTimer = setTimeout(() => {
    viewResizeTimer = null;
    syncViewSize();
    repairCanvasFill();
  }, delay);
};

window.addEventListener('resize', () => scheduleViewSync());
window.addEventListener('orientationchange', () => scheduleViewSync(320));

// The window "resize" event is not the only thing that changes the stage box:
// restoring a maximised window, the mobile browser hiding its URL bar, entering
// fullscreen or a webfont swap all resize it. Watching the element itself keeps
// the board matched to what the player actually sees.
if (typeof ResizeObserver === 'function' && stageHost) {
  const stageObserver = new ResizeObserver(() => scheduleViewSync(0));
  stageObserver.observe(stageHost);
}

if (window.visualViewport && window.visualViewport.addEventListener) {
  window.visualViewport.addEventListener('resize', () => scheduleViewSync(60));
}

document.addEventListener('fullscreenchange', () => scheduleViewSync(0));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    scheduleViewSync(0);
  }
});
window.addEventListener('pageshow', () => scheduleViewSync(0));

// The very first measurement happens while the page is still settling, so the
// board size is re-checked a few times after boot. Every call is idempotent:
// an unchanged size does not touch the scene at all.
const scheduleBootViewChecks = () => {
  for (const delay of [0, 150, 500, 1200, 2500]) {
    window.setTimeout(() => {
      syncViewSize();
      repairCanvasFill();
    }, delay);
  }

  if (
    document.fonts &&
    document.fonts.ready &&
    typeof document.fonts.ready.then === 'function'
  ) {
    document.fonts.ready
      .then(() => {
        syncViewSize();
        repairCanvasFill();
      })
      .catch(() => {});
  }
};

scheduleBootViewChecks();

/* ------------------------------------------------------------------ */
/* Optional mobile immersive mode                                      */
/* ------------------------------------------------------------------ */

const isCoarsePointer = () => {
  if (typeof window.matchMedia !== 'function') {
    return false;
  }

  return (
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(hover: none)').matches
  );
};

// Best-effort fullscreen request. Every step is optional: desktop browsers,
// iOS Safari and embedded webviews simply reject the promise, so failures are
// swallowed and the normal FIT canvas keeps working. The screen orientation is
// deliberately NOT locked any more: portrait and landscape are both playable.
const requestImmersiveMode = async () => {
  const root = document.documentElement;

  try {
    if (
      !document.fullscreenElement &&
      typeof root.requestFullscreen === 'function'
    ) {
      await root.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch {
    // Fullscreen may be blocked by policy or unsupported (iOS Safari).
  }
};

// Arm the request on the first real user gesture only (autoplay/fullscreen
// policies require it), and only on touch-first devices so desktop players
// are never surprised by fullscreen.
const armImmersiveOnFirstGesture = () => {
  if (!isCoarsePointer()) {
    return;
  }

  let armed = true;

  const onFirstGesture = () => {
    if (!armed) {
      return;
    }

    armed = false;
    window.removeEventListener('pointerdown', onFirstGesture);
    window.removeEventListener('touchstart', onFirstGesture);
    void requestImmersiveMode();
  };

  window.addEventListener('pointerdown', onFirstGesture, {
    once: true,
    passive: true,
  });
  window.addEventListener('touchstart', onFirstGesture, {
    once: true,
    passive: true,
  });
};

armImmersiveOnFirstGesture();
