import Phaser from 'phaser';
import './style.css';
import { GameScene } from './scenes/GameScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 800,
  height: 600,
  backgroundColor: '#1a3320',
  scene: [GameScene],
  scale: {
    // Keep the fixed 4:3 playfield letterboxed and centred on every device.
    // No orientation is forced: the board is playable in BOTH portrait and
    // landscape, and FIT simply letterboxes the canvas inside its parent on
    // whichever axis the device leaves over.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    expandParent: true,
    autoRound: true,
    resizeInterval: 250,
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
