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

const MAX_PORTRAIT_HEIGHT = 1500;
// The stage is always the window minus a few pixels of padding/decoration, so a
// measurement that is dramatically smaller than the viewport can only be a
// stale layout box (browser still restoring its window, a collapsed flex track,
// a hidden tab). Trusting it would letterbox the board into a sliver of the
// screen, so such a measurement is ignored and the window size is used.
const MIN_STAGE_RATIO = 0.6;

export function computeViewSize(
  win = typeof window === 'undefined' ? null : window,
  bounds = null,
  { trustBounds = false } = {},
) {
  const windowWidth = (win && win.innerWidth) || 0;
  const windowHeight = (win && win.innerHeight) || 0;
  const boundsWidth = bounds && bounds.width > 0 ? bounds.width : 0;
  const boundsHeight = bounds && bounds.height > 0 ? bounds.height : 0;

  // `bounds` is the measured #game box. Using it (instead of the window) makes
  // the canvas fill the stage exactly, so FIT never has to letterbox.
  const useBounds =
    boundsWidth > 0 &&
    boundsHeight > 0 &&
    (trustBounds ||
      ((!windowWidth || boundsWidth >= windowWidth * MIN_STAGE_RATIO) &&
        (!windowHeight || boundsHeight >= windowHeight * MIN_STAGE_RATIO)));

  const rawWidth = useBounds ? boundsWidth : windowWidth || DESIGN_WIDTH;
  const rawHeight = useBounds ? boundsHeight : windowHeight || DESIGN_HEIGHT;

  // FIT centres the board inside the stage and scales it down on the tighter
  // axis, so the canvas only fills the whole stage while the two aspect ratios
  // match. Clamping only one axis (a minimum width, a maximum height) is what
  // leaves black bars on the other one, so the ratio below is used as-is and
  // every clamp re-derives the opposite axis from it.
  const aspect = Math.min(
    12,
    Math.max(0.25, rawWidth / Math.max(1, rawHeight)),
  );

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

  // Portrait: fix the width and grow downwards. An extremely tall window is the
  // only case that needs a clamp, and it re-derives the width from the height.
  const portraitHeight = Math.round(PORTRAIT_WIDTH / aspect);

  if (portraitHeight > MAX_PORTRAIT_HEIGHT) {
    return {
      width: Math.round(MAX_PORTRAIT_HEIGHT * aspect),
      height: MAX_PORTRAIT_HEIGHT,
      portrait: true,
    };
  }

  return {
    width: PORTRAIT_WIDTH,
    height: Math.max(PORTRAIT_WIDTH, portraitHeight),
    portrait: true,
  };
}
