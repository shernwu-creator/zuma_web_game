// Shared viewport maths for the responsive playfield.
//
// The game no longer renders into a fixed 4:3 800x600 canvas. The logical
// playfield now follows the window aspect ratio:
//
//   landscape -> the 800x600 board keeps its 600px height and grows sideways
//                (16:9 -> 1067x600) or, on a near-square window, keeps its
//                800px width and grows downwards. The level layouts are
//                remapped into that box by scaling their offsets around the
//                board centre, which can only *increase* the clearance
//                between lanes, never shrink it.
//   portrait  -> a 420px wide board that grows downwards (9:16 -> 420x747)
//                with its own generated spiral track wrapped around the
//                centre launcher, so a phone finally uses its whole screen.
//
// Everything the player reads as a "shape" (marbles, the turret, every text
// node) keeps its pixel size: only positions change, never the aspect ratio of
// a sprite or a glyph.

export const DESIGN_WIDTH = 800;
export const DESIGN_HEIGHT = 600;
export const PORTRAIT_WIDTH = 420;

const MIN_VIEW = 320;
const MAX_PORTRAIT_HEIGHT = 1500;

export function computeViewSize(
  win = typeof window === 'undefined' ? null : window,
  bounds = null,
) {
  // `bounds` is the measured #game box. Using it (instead of the window) makes
  // the canvas fill the stage exactly, so FIT never has to letterbox.
  const cssWidth = Math.max(
    MIN_VIEW,
    Math.round(
      (bounds && bounds.width) || (win && win.innerWidth) || DESIGN_WIDTH,
    ),
  );
  const cssHeight = Math.max(
    MIN_VIEW,
    Math.round(
      (bounds && bounds.height) || (win && win.innerHeight) || DESIGN_HEIGHT,
    ),
  );
  const aspect = cssWidth / cssHeight;

  if (aspect >= 1) {
    // Wide landscape: fix the height, stretch the width.
    if (aspect >= DESIGN_WIDTH / DESIGN_HEIGHT) {
      const height = DESIGN_HEIGHT;
      return { width: Math.round(height * aspect), height, portrait: false };
    }

    // Near-square landscape: fix the width, let the board grow downwards.
    return {
      width: DESIGN_WIDTH,
      height: Math.round(DESIGN_WIDTH / aspect),
      portrait: false,
    };
  }

  const height = Math.min(
    MAX_PORTRAIT_HEIGHT,
    Math.round(PORTRAIT_WIDTH / aspect),
  );

  return {
    width: PORTRAIT_WIDTH,
    height: Math.max(PORTRAIT_WIDTH, height),
    portrait: true,
  };
}
