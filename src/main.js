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
const syncViewSize = () => {
  const size = computeViewSize(window, measureStage());
  const current = game.scale.gameSize;

  if (current.width === size.width && current.height === size.height) {
    return;
  }

  game.scale.setGameSize(size.width, size.height);
};

let viewResizeTimer = null;

const scheduleViewSync = (delay = 140) => {
  if (viewResizeTimer !== null) {
    clearTimeout(viewResizeTimer);
  }

  viewResizeTimer = setTimeout(() => {
    viewResizeTimer = null;
    syncViewSize();
  }, delay);
};

window.addEventListener('resize', () => scheduleViewSync());
window.addEventListener('orientationchange', () => scheduleViewSync(320));

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
