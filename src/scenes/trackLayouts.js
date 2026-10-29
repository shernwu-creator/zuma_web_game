// Track geometry for every stage.
//
// This used to live inside GameScene as two flat coordinate tables: five
// landscape serpentines cycled with `(D - 1) % 5` (so 30 stages repeated the
// same five tracks six times) and a single, parameter-less portrait spiral (so
// all 30 portrait stages shared one picture). Both families are now generated
// so every stage owns its own route:
//
//   landscape -> 8 mothers x 4 safe geometric transforms (8 * 4 = 32 >= 30)
//   portrait  -> 4 geometric mothers x 8 parameter cycles     (4 * 8 = 32 >= 30)
//
// Everything in this module is pure: no Phaser, no scene state, no globals. The
// scene hands in the live board as `frame` and only consumes the returned
// point lists, which keeps the whole family verifiable from Node (bounds, HUD
// clearance, turret clearance, uniqueness) instead of by eye in a browser.
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './viewport.js';

const CENTER_X = DESIGN_WIDTH / 2;
const CENTER_Y = DESIGN_HEIGHT / 2;

// Thirty stages = 3 worlds x 10 stages, matching MAX_WORLD * MAX_STAGE in
// GameScene. Only used to clamp the requested difficulty.
const STAGE_COUNT = 30;

// Turret keep-out on the 800x600 design board. The five authored serpentines
// were hand-tuned against it (their final approach closes to ~104px, which is
// what keeps the chain head reachable), and every generated mother keeps its
// whole body outside it.
const LAUNCHER_RADIUS = 110;
// Clearance floors enforced by sanitizeDesignPoints: a generated mother is drawn
// outside the keep-out and may not be nudged inside it, while an authored
// serpentine keeps its hand-tuned final approach (still 58px clear of the
// cannon sprite itself).
const GENERATED_LAUNCHER_FLOOR = LAUNCHER_RADIUS + 8;
const AUTHORED_LAUNCHER_FLOOR = LAUNCHER_RADIUS - 6;
const BOARD_PADDING = 16;

// HUD / capsule rectangles the track centreline must never enter. The numbers
// are the real on-screen boxes padded by a few pixels:
//   top-left   title + level rows      15..300 x 15..110
//   top-right  score HUD              610..800 x 10..110
//   bottom-right exit capsule         646..770 x 536..570
//   bottom-left  music capsule         30..128 x 536..570
const UI_KEEPOUT = [
  { x1: 4, y1: 4, x2: 310, y2: 120 },
  { x1: 600, y1: 4, x2: 796, y2: 116 },
  { x1: 636, y1: 520, x2: 788, y2: 586 },
  { x1: 14, y1: 520, x2: 146, y2: 586 },
];

// The five hand-authored landscape mothers. `(D - 1) % 8` picks a mother from
// LANDSCAPE_LAYOUT_POOL (these five plus three generated ones, see below) and
// `floor((D - 1) / 8)` picks the safe transform applied to it, so all 30
// landscape stages get their own route.
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
// Exported for the geometry checks and for LANDSCAPE_LAYOUT_POOL below.
export const TRACK_LAYOUTS = [
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

// World 3 runs TWO independent chains. The outer chain uses one of the eight
// LANDSCAPE_LAYOUT_POOL mothers; the inner chain uses one of these three
// compact rings (plus the per-stage transform in dualInnerTrackPoints) so the
// two splines always have clearly different silhouettes and both stay clear of
// the launcher (>= 115px from the centre), the HUD corners and the capsules.
export const DUAL_INNER_LAYOUTS = [
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

const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));

const clampStage = (difficulty) =>
  clampValue(Math.round(Number(difficulty) || 1), 1, STAGE_COUNT);

// Keep a design-space point inside the board.
const clampToBoard = (x, y) => [
  clampValue(x, BOARD_PADDING, DESIGN_WIDTH - BOARD_PADDING),
  clampValue(y, BOARD_PADDING, DESIGN_HEIGHT - BOARD_PADDING),
];

const insideRect = (x, y, rect) =>
  x > rect.x1 && x < rect.x2 && y > rect.y1 && y < rect.y2;

// Move a point that landed in a HUD/capsule rectangle out through the nearest
// *safe* edge, along the ray from the rectangle's centre. Clamping straight to
// the nearest edge (what a plain min-distance push does) flattens a whole run
// onto one line and squeezes it against the next lane (measured: 18px). Pushing
// along the ray instead keeps the run's diagonal flow and exits through
// whichever edge the run was already heading for. Edges that sit against the
// board border are skipped, because "escaping" through them just clamps back
// inside the rectangle.
const pushOutOfRect = (x, y, rect) => {
  const centreX = (rect.x1 + rect.x2) / 2;
  const centreY = (rect.y1 + rect.y2) / 2;
  const dx = x - centreX;
  const dy = y - centreY;
  const minX = BOARD_PADDING;
  const maxX = DESIGN_WIDTH - BOARD_PADDING;
  const minY = BOARD_PADDING;
  const maxY = DESIGN_HEIGHT - BOARD_PADDING;
  let scale = Infinity;

  if (dx > 0 && rect.x2 <= maxX) {
    scale = Math.min(scale, (rect.x2 - x) / dx);
  } else if (dx < 0 && rect.x1 >= minX) {
    scale = Math.min(scale, (rect.x1 - x) / dx);
  }

  if (dy > 0 && rect.y2 <= maxY) {
    scale = Math.min(scale, (rect.y2 - y) / dy);
  } else if (dy < 0 && rect.y1 >= minY) {
    scale = Math.min(scale, (rect.y1 - y) / dy);
  }

  if (!Number.isFinite(scale) || scale <= 0) {
    return [x, y];
  }

  return clampToBoard(x + dx * scale * 1.02, y + dy * scale * 1.02);
};

// Push every point that ended up inside the turret disc back onto its rim. The
// offsets are at most a few pixels for the authored layouts, so the route keeps
// its silhouette while the generated mothers are the ones that actually rely on
// this net after a wave has been added.
const projectOutOfLauncher = (points, radius) =>
  points.map(([x, y]) => {
    const dx = x - CENTER_X;
    const dy = y - CENTER_Y;
    const distance = Math.hypot(dx, dy);

    if (distance >= radius || distance === 0) {
      return [x, y];
    }

    const scale = radius / distance;

    return [CENTER_X + dx * scale, CENTER_Y + dy * scale];
  });

// Offset every point sideways along the local normal of the polyline. The
// amplitude is tapered with sin(pi * u), so the entrance and the tail stay
// exactly where the mother put them - a stage never changes how a chain enters
// or where it can be shot, only how it swings in between.
const applyNormalWave = (points, amplitude, cycles, phase) => {
  if (amplitude <= 0 || points.length < 3) {
    return points;
  }

  const lengths = [0];
  let total = 0;

  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
    );
    lengths.push(total);
  }

  if (total <= 0) {
    return points;
  }

  return points.map(([x, y], index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const tangentX = next[0] - previous[0];
    const tangentY = next[1] - previous[1];
    const tangentLength = Math.hypot(tangentX, tangentY) || 1;
    const normalX = -tangentY / tangentLength;
    const normalY = tangentX / tangentLength;
    const u = lengths[index] / total;
    const taper = Math.sin(Math.PI * u);
    const offset =
      amplitude * taper * Math.sin(u * cycles * Math.PI * 2 + phase);

    return [x + normalX * offset, y + normalY * offset];
  });
};

/* ------------------------------------------------------------------ */
/* Generated landscape mothers (800x600 design space)                  */
/* ------------------------------------------------------------------ */

// Mother 6: six-point star spiral. The lobes are an *additive* radial wave, so
// the two laps stay exactly one lane apart (82px in x, 49px in y) instead of
// growing and shrinking with the radius. The wave is phased so the star's peak
// sits on the top edge and its valleys sit at the left and right extremes: the
// tall part of the arc then lives in the clear column between the two HUD pills
// (x 310..600) and the arc has already dropped below the HUD by the time it
// reaches the corners, so no point has to be nudged. The last lap stops on the
// turret ring, outside the 110px keep-out.
function createStarRingLayout() {
  const points = [];
  const steps = 200;
  const turns = 1.25;
  const lobes = 6;
  const lobeDepth = 18;
  const startAngle = Math.PI * 0.94;
  // The vertical room above the turret ring is only 58px (164 -> 118), which is
  // 1.25 laps of a 46px lane: the star therefore coils once and a quarter, one
  // full lane apart in both axes, and still ends beside the cannon.
  const outerX = 342;
  const outerY = 176;
  const innerX = 284;
  const innerY = 118;

  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const angle = startAngle + u * turns * Math.PI * 2;
    const wave = lobeDepth * (0.5 - 0.5 * Math.cos(lobes * angle));
    const radiusX = outerX - (outerX - innerX) * u + wave;
    const radiusY = outerY - (outerY - innerY) * u + wave;

    points.push([
      CENTER_X + Math.cos(angle) * radiusX,
      CENTER_Y + Math.sin(angle) * radiusY,
    ]);
  }

  return points;
}

// One closed loop around a rounded rectangle, walked clockwise from the middle
// of the top edge. Used by the corner maze mother.
function roundedRectLoop({ x1, y1, x2, y2, radius, cornerSteps = 8 }) {
  const points = [];
  const corner = (cx, cy, from, to) => {
    for (let i = 1; i <= cornerSteps; i += 1) {
      const angle = from + ((to - from) * i) / cornerSteps;

      points.push([
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius,
      ]);
    }
  };

  points.push([x1 + radius, y1]);
  points.push([(x1 + x2) / 2, y1]);
  points.push([x2 - radius, y1]);
  corner(x2 - radius, y1 + radius, -Math.PI / 2, 0);
  points.push([x2, (y1 + y2) / 2]);
  points.push([x2, y2 - radius]);
  corner(x2 - radius, y2 - radius, 0, Math.PI / 2);
  points.push([(x1 + x2) / 2, y2]);
  points.push([x1 + radius, y2]);
  corner(x1 + radius, y2 - radius, Math.PI / 2, Math.PI);
  points.push([x1, (y1 + y2) / 2]);
  points.push([x1, y1 + radius]);
  corner(x1 + radius, y1 + radius, Math.PI, Math.PI * 1.5);

  return points;
}

// Sample a closed loop between two fractions of its own perimeter. Both rings
// of the maze are similar shapes, so equal fractions sit at the same angle and
// the step from one ring to the next is a clean radial hop.
function sliceLoop(loop, fromFraction, toFraction, count) {
  const total = loop.length;
  const points = [];

  for (let i = 0; i <= count; i += 1) {
    const fraction = fromFraction + ((toFraction - fromFraction) * i) / count;
    const position = ((fraction % 1) + 1) % 1;
    const index = position * total;
    const base = Math.floor(index) % total;
    const next = (base + 1) % total;
    const mix = index - Math.floor(index);

    points.push([
      loop[base][0] + (loop[next][0] - loop[base][0]) * mix,
      loop[base][1] + (loop[next][1] - loop[base][1]) * mix,
    ]);
  }

  return points;
}

// Mother 7: four-corner switchback maze. Two concentric rounded-rectangle
// corridors (52-56px apart, so neighbouring laps never touch) are joined by a
// radial step, and the inner lap is cut on the bottom edge - 118px under the
// turret, i.e. right beside the cannon, which is where the chain head has to
// end up. Every corner of the board is visited, which no other mother does.
function createCornerMazeLayout() {
  const outer = roundedRectLoop({
    x1: 62,
    y1: 130,
    x2: 738,
    y2: 470,
    radius: 46,
  });
  const inner = roundedRectLoop({
    x1: 118,
    y1: 182,
    x2: 682,
    y2: 418,
    radius: 40,
  });
  // Fraction 0 is the middle of the top edge, so 0.875 is the middle of the
  // left edge - the chain enters on the left, like most authored layouts - and
  // 0.86 later it hands over to the inner lap a lane inwards.
  const start = 0.875;

  return [
    ...sliceLoop(outer, start, start + 0.86, 84),
    ...sliceLoop(inner, start + 0.86, start + 1.72, 84),
  ];
}

// Mother 8: hourglass wave loop. The horizontal reach is pinched at mid-height
// (the waist is an absolute radius, so it stays clear of the turret) and wide at
// the top and bottom, so the silhouette is a waist rather than an oval. One and
// a bit laps shrink the waist by 56px each and a four-lobe wave rides on top.
// The vertical radius is capped at 190 so the upper arc has already dropped
// below the HUD pills by the time it reaches the corners (the tall part of the
// arc sits in the clear column between them).
function createHourglassLoopLayout() {
  const points = [];
  const steps = 200;
  const turns = 1.15;
  const lobes = 4;
  const wave = 10;
  const waistEnd = 128;
  const startAngle = Math.PI / 2;
  const inset = 56 * turns;

  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const angle = startAngle + u * turns * Math.PI * 2;
    const radiusX = 330 - inset * u;
    const radiusY = 190 - inset * u;
    const waist = waistEnd + inset * (1 - u);
    const reach = waist + (radiusX - waist) * Math.abs(Math.sin(angle));
    const modulation = wave * Math.sin(angle * lobes);

    points.push([
      CENTER_X + (reach + modulation) * Math.cos(angle),
      CENTER_Y + (radiusY + modulation) * Math.sin(angle),
    ]);
  }

  return points;
}

export const LANDSCAPE_EXTRA_LAYOUTS = [
  createStarRingLayout(),
  createCornerMazeLayout(),
  createHourglassLoopLayout(),
];

// Eight mothers: the five authored serpentines plus three generated routes.
// `(D - 1) % 8` picks the mother, `floor((D - 1) / 8)` picks the transform.
export const LANDSCAPE_LAYOUT_POOL = [
  ...TRACK_LAYOUTS,
  ...LANDSCAPE_EXTRA_LAYOUTS,
];

// Four safe variants (the requirement's "safe geometric transforms"). Only
// isometries that fix the turret are used, plus a mild 0.94 scale that pulls a
// route *away* from the HUD corners:
//   keep        - the authored/generated mother as drawn
//   mirrorX     - x' = 800 - x; swaps the top-left HUD with the score HUD and
//                 the two bottom capsules, which are mirror images of each other
//   inset       - uniform 0.94 scale about the turret: 6% further from every
//                 HUD/capsule, 6% tighter lanes (still way above one marble)
//   mirrorX+inset - both, so the last six stages differ from the first six
// A vertical mirror (y' = 600 - y) and a 180 degree rotation are deliberately
// NOT used: the authored serpentines hug the bottom edge (y 520..580) and the
// top edge carries the HUD, so flipping vertically drops 46-100px of track
// straight into the HUD (measured: lane separation collapsed to 18px).
export const LANDSCAPE_TRANSFORMS = ['keep', 'mirrorX', 'inset', 'mirrorX+inset'];

const DESIGN_INSET_SCALE = 0.94;



const applyDesignTransform = (points, transform) => {
  const mirror = transform.includes('mirrorX');
  const inset = transform.includes('inset') ? DESIGN_INSET_SCALE : 1;

  if (!mirror && inset === 1) {
    return points;
  }

  return points.map(([x, y]) => {
    const mirroredX = mirror ? DESIGN_WIDTH - x : x;

    return [
      CENTER_X + (mirroredX - CENTER_X) * inset,
      CENTER_Y + (y - CENTER_Y) * inset,
    ];
  });
};

// Final safety net for a design-space layout: keep every point on the board, out
// of the HUD/capsule rectangles and outside the turret disc.
const sanitizeDesignPoints = (points, minLauncherRadius) => {
  const projected =
    minLauncherRadius > 0
      ? projectOutOfLauncher(points, minLauncherRadius)
      : points;

  return projected.map(([rawX, rawY]) => {
    let [x, y] = clampToBoard(rawX, rawY);

    for (const rect of UI_KEEPOUT) {
      if (insideRect(x, y, rect)) {
        [x, y] = pushOutOfRect(x, y, rect);
        [x, y] = clampToBoard(x, y);
      }
    }

    return [x, y];
  });
};

// Build the landscape route for one stage: mother + transform + a gentle wave.
// The wave amplitude and phase come from the stage number, so the six stages
// that share the `rotate180` transform are still six different routes.
export function landscapeTrackPoints(difficulty) {
  const stage = clampStage(difficulty);
  const motherIndex = (stage - 1) % LANDSCAPE_LAYOUT_POOL.length;
  const cycle = Math.floor((stage - 1) / LANDSCAPE_LAYOUT_POOL.length);
  const transform = LANDSCAPE_TRANSFORMS[cycle % LANDSCAPE_TRANSFORMS.length];
  const waveAmplitude = 3 + ((stage * 5) % 4) * 2;
  const waveCycles = 2 + (stage % 3);
  const wavePhase = (stage % 5) * 0.9;

  const mother = LANDSCAPE_LAYOUT_POOL[motherIndex].map(([x, y]) => [x, y]);
  const waved = applyNormalWave(
    applyDesignTransform(mother, transform),
    waveAmplitude,
    waveCycles,
    wavePhase,
  );
  // 104 keeps the authored final approaches exactly as hand-tuned. The three
  // generated mothers are drawn with a 118px turret clearance, and their floor
  // here trims any wave dent that would eat into it.
  const floor =
    motherIndex >= TRACK_LAYOUTS.length
      ? GENERATED_LAUNCHER_FLOOR
      : AUTHORED_LAUNCHER_FLOOR;
  const points = sanitizeDesignPoints(waved, floor);

  return { points, motherIndex, transform, stage };
}

// World 3's inner chain. Three authored rings are combined with four transforms
// and a stage-derived wave, so the ten World-3 stages get ten distinct
// inner/outer pairings instead of a three-way repeat.
export function dualInnerTrackPoints(difficulty) {
  const stage = clampStage(difficulty);
  const worldStage = clampValue(stage - 20, 1, 10);
  const motherIndex = (worldStage - 1) % DUAL_INNER_LAYOUTS.length;
  const cycle = Math.floor((worldStage - 1) / DUAL_INNER_LAYOUTS.length);
  const transform =
    LANDSCAPE_TRANSFORMS[cycle % LANDSCAPE_TRANSFORMS.length];
  const waveAmplitude = 4 + (worldStage % 3) * 2;
  const waveCycles = 3 + (worldStage % 4);
  const wavePhase = (worldStage % 7) * 0.7;

  const mother = DUAL_INNER_LAYOUTS[motherIndex].map(([x, y]) => [x, y]);
  const waved = applyNormalWave(
    applyDesignTransform(mother, transform),
    waveAmplitude,
    waveCycles,
    wavePhase,
  );

  // The inner ring must stay on its own side of the turret (>= 116px) so the
  // two chains never share a lane.
  return sanitizeDesignPoints(waved, 116);
}


/* ------------------------------------------------------------------ */
/* Portrait family (live board coordinates)                            */
/* ------------------------------------------------------------------ */

// Safe frame for a phone board, in live pixels. `side` keeps the coil off the
// screen edges, `top` clears the two HUD rows and `bottom` clears the exit and
// music capsules - the same numbers the old single spiral used.
export const PORTRAIT_SAFE = Object.freeze({ side: 26, top: 126, bottom: 104 });
// How far the final marble must stay from the turret centre.
export const PORTRAIT_LAUNCHER_CLEARANCE = 68;
// Wrapping radius of the serpentine's central bypass (> the 110px keep-out).
export const PORTRAIT_BYPASS_RADIUS = 116;

const PORTRAIT_MOTHERS = ['spiral', 'lobed', 'serpentine', 'hourglass'];

// Four entrances: top, bottom, upper-left and upper-right of the board.
const PORTRAIT_ENTRY_ANGLES = [
  -Math.PI / 2,
  Math.PI / 2,
  -Math.PI * 0.75,
  -Math.PI * 0.25,
];

export function portraitTrackFrame(width, height, ballDiameter) {
  const boardWidth = Math.max(320, width);
  const boardHeight = Math.max(320, height);
  const cx = boardWidth / 2;
  const cy = boardHeight / 2;
  const minRadius = ballDiameter * 2.4;

  return {
    width: boardWidth,
    height: boardHeight,
    cx,
    cy,
    ballDiameter,
    minX: PORTRAIT_SAFE.side,
    maxX: boardWidth - PORTRAIT_SAFE.side,
    minY: PORTRAIT_SAFE.top,
    maxY: boardHeight - PORTRAIT_SAFE.bottom,
    radiusX: Math.max(minRadius, cx - PORTRAIT_SAFE.side),
    radiusY: Math.max(
      minRadius,
      Math.min(
        cy - PORTRAIT_SAFE.top,
        boardHeight - PORTRAIT_SAFE.bottom - cy,
      ),
    ),
  };
}

// Every portrait stage is one mother plus one parameter cycle. The four mothers
// repeat every four stages, and the eight cycles then vary the entrance, the
// spin direction, the turn count, the super-ellipse squareness, the lobe count
// and amplitude, the mirror and the fold/waist count - so no two of the 30
// stages can produce the same route.
export function portraitTrackParams(difficulty) {
  const stage = clampStage(difficulty);
  const mother = PORTRAIT_MOTHERS[(stage - 1) % PORTRAIT_MOTHERS.length];
  const cycle = Math.floor((stage - 1) / PORTRAIT_MOTHERS.length); // 0..7
  const lobed = mother === 'lobed';

  return {
    stage,
    mother,
    cycle,
    // Even stages coil one way, odd stages the other way.
    dir: stage % 2 === 0 ? 1 : -1,
    // Cycles 0-3 are the plain mothers, cycles 4-7 their mirror images, which
    // is what keeps stage D and stage D + 16 from ever producing the same route.
    mirror: cycle >= 4,
    entryAngle: PORTRAIT_ENTRY_ANGLES[cycle % PORTRAIT_ENTRY_ANGLES.length],
    // 1.6 .. 2.05 turns. The lobed coil stays at 1.6/1.75 and the hourglass at
    // 1.35/1.5 so their wave and waist budgets can never squeeze the lane gap
    // under BALL_DIAMETER + 10.
    turns:
      mother === 'hourglass'
        ? 1.35 + (cycle % 2) * 0.15
        : lobed
          ? 1.6 + (cycle % 2) * 0.15
          : 1.6 + (cycle % 4) * 0.15,
    // < 1 squares the coil off, 1 keeps a clean ellipse: the four values walk
    // rounded square -> soft rectangle -> wide oval -> ellipse.
    roundness: [0.58, 0.74, 0.88, 1][cycle % 4],
    lobes: 3 + (cycle % 4),
    amplitude: lobed ? 7 + (cycle % 3) * 2 : 0,
    lanes: 2 + (cycle % 3),
    waist: 0.56 + (cycle % 3) * 0.05,
  };
}

/* ---- Mother 1 + 2: plain and lobed coils -------------------------- */

// The plain spiral and the lobed/petal spiral share one generator; the lobed
// variant only adds a sine wave to the radius. An integer lobe count keeps the
// modulation identical on every lap, so neighbouring coils keep their exact
// centre-line gap no matter how strong the wave is.
function buildPortraitCoil(params, frame, lobed) {
  const amplitude = lobed ? params.amplitude : 0;
  // The wave is budgeted twice: it must not push the outer lap into the safe
  // margin, and it must not pull the inner lap into the turret's 68px ring.
  const radiusX = Math.max(
    frame.ballDiameter * 2.4,
    frame.radiusX - amplitude - 2,
  );
  const radiusY = Math.max(
    frame.ballDiameter * 2.4,
    frame.radiusY - amplitude - 2,
  );
  const maxInset = Math.max(
    0,
    Math.min(frame.radiusX, frame.radiusY) -
      amplitude * 2 -
      PORTRAIT_LAUNCHER_CLEARANCE -
      4,
  );
  // One lane per turn, BALL_DIAMETER + 11..22 apart, but never so wide that the
  // last lap would end inside the turret clearance ring.
  const laneStep = Math.min(
    clampValue(
      maxInset / params.turns,
      frame.ballDiameter + 11,
      frame.ballDiameter + 22,
    ),
    maxInset / params.turns,
  );
  const inset = laneStep * params.turns;
  const steps = Math.max(96, Math.round(params.turns * 72));
  const points = [];

  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const angle = params.entryAngle + params.dir * u * params.turns * Math.PI * 2;
    const wave = lobed ? amplitude * Math.sin(angle * params.lobes) : 0;
    const reachX = radiusX - inset * u + wave;
    const reachY = radiusY - inset * u + wave;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    points.push([
      frame.cx + reachX * Math.sign(cos) * Math.abs(cos) ** params.roundness,
      frame.cy + reachY * Math.sign(sin) * Math.abs(sin) ** params.roundness,
    ]);
  }

  return points;
}

/* ---- Mother 3: vertical serpentine with central bypass ------------ */

// Horizontal runs fold down (or up) the board, then the chain wraps the turret
// at PORTRAIT_BYPASS_RADIUS instead of crossing it: the last stretch spirals
// around the cannon and finishes in the opposite half, which is what gives the
// serpentine stages their "hooked" ending.
function buildPortraitSerpentine(params, frame) {
  const fromTop = Math.sin(params.entryAngle) < 0;
  const stepY = fromTop ? 1 : -1;
  const laneCount = clampValue(params.lanes, 2, 4);
  // Every run stays in the entry half. Letting a run jump across the turret band
  // would leave a full-width lane on both sides, and any closing wrap would then
  // have to cross one of them (measured: 1.9px lane separation).
  const laneStep = frame.ballDiameter + 16;
  const turnRadius = laneStep / 2;
  const clearOfTurret = PORTRAIT_BYPASS_RADIUS + 12;
  const edgeY = fromTop ? frame.minY + 4 : frame.maxY - 4;
  const leftX = frame.minX + 2;
  const rightX = frame.maxX - 2;
  const laneLimit = fromTop
    ? frame.cy - clearOfTurret
    : frame.cy + clearOfTurret;
  const room = Math.floor(Math.abs(laneLimit - edgeY) / laneStep) + 1;
  const lanes = clampValue(Math.min(laneCount, room), 1, 4);
  const laneYs = [];

  for (let lane = 0; lane < lanes; lane += 1) {
    laneYs.push(edgeY + stepY * laneStep * lane);
  }

  const points = [];
  // Always drawn entering on the left; portraitTrackPoints applies the mirror
  // for the stages that need the opposite entrance.
  let heading = 1;
  let x = leftX;

  points.push([x, laneYs[0]]);

  for (let lane = 0; lane < laneYs.length; lane += 1) {
    const y = laneYs[lane];
    const turnX = heading > 0 ? rightX - turnRadius : leftX + turnRadius;
    const runSteps = Math.max(4, Math.round(Math.abs(turnX - x) / 14));

    for (let i = 1; i <= runSteps; i += 1) {
      points.push([x + (turnX - x) * (i / runSteps), y]);
    }

    x = turnX;

    if (lane === laneYs.length - 1) {
      break;
    }

    // Side S-bend: quarter arc out into the margin, straight run to the next
    // lane, quarter arc back in. It copes with any lane pitch, including the
    // widest one the narrow boards allow.
    const nextY = laneYs[lane + 1];
    const arcDir = heading > 0 === stepY > 0 ? 1 : -1;
    const outerAngle = heading > 0 ? 0 : Math.PI;
    const laneAngle = stepY > 0 ? -Math.PI / 2 : Math.PI / 2;
    const arcSteps = 8;
    const edgeX = heading > 0 ? rightX : leftX;
    const firstCenterY = y + stepY * turnRadius;
    const secondCenterY = nextY - stepY * turnRadius;

    // Quarter arc out into the side margin.
    for (let i = 1; i <= arcSteps; i += 1) {
      const angle = laneAngle + (arcDir * (Math.PI / 2) * i) / arcSteps;

      points.push([
        turnX + Math.cos(angle) * turnRadius,
        firstCenterY + Math.sin(angle) * turnRadius,
      ]);
    }

    // Straight run along the margin, up to the next lane's turn circle.
    const runStartY = firstCenterY + stepY * turnRadius;
    const verticalSteps = Math.max(
      2,
      Math.round(Math.abs(secondCenterY - runStartY) / 14),
    );

    for (let i = 1; i <= verticalSteps; i += 1) {
      points.push([
        edgeX,
        runStartY + (secondCenterY - runStartY) * (i / verticalSteps),
      ]);
    }

    // Quarter arc back onto the next lane.
    for (let i = 1; i <= arcSteps; i += 1) {
      const angle = outerAngle + (arcDir * (Math.PI / 2) * i) / arcSteps;

      points.push([
        turnX + Math.cos(angle) * turnRadius,
        secondCenterY + Math.sin(angle) * turnRadius,
      ]);
    }

    x = turnX;
    heading = -heading;
  }

  // Central bypass: wrap the turret instead of crossing it, so the chain folds
  // down (or up) the board and then spirals around the cannon to finish in the
  // opposite half. Both sweep directions are candidates and the one that keeps
  // the most room to the horizontal runs wins, so the wrap can never cut across
  // a lane when the tail happens to sit right beside one.
  const wrapStartX = points[points.length - 1][0];
  const wrapStartY = points[points.length - 1][1];
  const startRadius = Math.hypot(wrapStartX - frame.cx, wrapStartY - frame.cy);
  const startAngle = Math.atan2(wrapStartY - frame.cy, wrapStartX - frame.cx);
  const endRadius = Math.min(
    Math.max(startRadius - laneStep, PORTRAIT_LAUNCHER_CLEARANCE + 26),
    PORTRAIT_BYPASS_RADIUS,
  );
  const sweepSize = Math.PI * (1.1 + (params.cycle % 2) * 0.15);
  const wrapSteps = 64;
  const buildWrap = (sweep) => {
    const wrap = [];

    for (let i = 1; i <= wrapSteps; i += 1) {
      const u = i / wrapSteps;
      const angle = startAngle + sweep * u;
      const radius = startRadius + (endRadius - startRadius) * u;

      wrap.push([
        frame.cx + Math.cos(angle) * radius,
        frame.cy + Math.sin(angle) * radius,
      ]);
    }

    return wrap;
  };
  // The wrap always starts on the last run, so the first fifth of it is ignored
  // and the run's own tail is excluded from the comparison.
  const clearanceToRuns = (wrap) => {
    const runs = points.slice(0, Math.max(1, points.length - 24));
    let closest = Infinity;

    for (let i = Math.floor(wrap.length * 0.2); i < wrap.length; i += 1) {
      for (const [laneX, laneY] of runs) {
        closest = Math.min(
          closest,
          Math.hypot(wrap[i][0] - laneX, wrap[i][1] - laneY),
        );
      }
    }

    return closest;
  };
  const forward = buildWrap(sweepSize);
  const backward = buildWrap(-sweepSize);

  return points.concat(
    clearanceToRuns(forward) >= clearanceToRuns(backward) ? forward : backward,
  );
}

/* ---- Mother 4: hourglass / pinched loop --------------------------- */

// Wide lobes at the top and bottom, pinched at mid-height on both sides of the
// turret (>= PORTRAIT_LAUNCHER_CLEARANCE + 28), and the waist widens with every
// lap so two passes stay a full lane apart. The coil shrinks by one lane per
// turn and ends beside the cannon.
function buildPortraitHourglass(params, frame) {
  const steps = Math.max(96, Math.round(params.turns * 72));
  // The waist depth is what makes the silhouette read as an hourglass, and it
  // varies per cycle (90..95px from the turret, i.e. still well outside the
  // cannon itself).
  const waistEnd = PORTRAIT_LAUNCHER_CLEARANCE + 12 + params.waist * 40;
  // The waist shrinks by one lane per lap, and the widest lap may not exceed the
  // frame, so the lane pitch is what fits in the room that is actually left.
  const laneStep = clampValue(
    (frame.radiusX - waistEnd) / params.turns,
    frame.ballDiameter + 10,
    frame.ballDiameter + 20,
  );
  const inset = laneStep * params.turns;
  const points = [];

  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const angle = params.entryAngle + params.dir * u * params.turns * Math.PI * 2;
    const radiusX = frame.radiusX - inset * u;
    const radiusY = frame.radiusY - inset * u;
    // The waist is an absolute radius, but it may never exceed the lap it
    // belongs to (on a narrow board the outer lap would otherwise turn inside
    // out and overlap its neighbour).
    const waist = Math.min(frame.radiusX, waistEnd + inset * (1 - u));
    const reach = waist + (radiusX - waist) * Math.abs(Math.sin(angle));

    points.push([
      frame.cx + reach * Math.cos(angle),
      frame.cy + radiusY * Math.sin(angle),
    ]);
  }

  return points;
}

const PORTRAIT_BUILDERS = {
  spiral: (params, frame) => buildPortraitCoil(params, frame, false),
  lobed: (params, frame) => buildPortraitCoil(params, frame, true),
  serpentine: (params, frame) => buildPortraitSerpentine(params, frame),
  hourglass: (params, frame) => buildPortraitHourglass(params, frame),
};

// Clamp the route into the safe frame, then guarantee the 68px turret clearance
// at the tail, which is where the chain head will sit at the end of the stage.
function finalizePortraitPoints(points, frame) {
  const cleaned = points.map(([x, y]) => [
    clampValue(x, frame.minX, frame.maxX),
    clampValue(y, frame.minY, frame.maxY),
  ]);
  const last = cleaned[cleaned.length - 1];
  const dx = last[0] - frame.cx;
  const dy = last[1] - frame.cy;
  const distance = Math.hypot(dx, dy);

  if (distance > 0 && distance < PORTRAIT_LAUNCHER_CLEARANCE) {
    const scale = PORTRAIT_LAUNCHER_CLEARANCE / distance;

    last[0] = clampValue(frame.cx + dx * scale, frame.minX, frame.maxX);
    last[1] = clampValue(frame.cy + dy * scale, frame.minY, frame.maxY);
  }

  return cleaned;
}

// One portrait route for one stage, in live board pixels.
export function portraitTrackPoints(difficulty, frame) {
  const params = portraitTrackParams(difficulty);
  const build = PORTRAIT_BUILDERS[params.mother];
  const points = build(params, frame);

  if (!params.mirror) {
    return finalizePortraitPoints(points, frame);
  }

  // Mirroring around the board's vertical centreline keeps the entrance on the
  // opposite side without touching the lane geometry.
  return finalizePortraitPoints(
    points.map(([x, y]) => [frame.cx * 2 - x, y]),
    frame,
  );
}
