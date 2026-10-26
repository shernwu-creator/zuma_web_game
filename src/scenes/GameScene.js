import Phaser from 'phaser';

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 600;
const CENTER_X = VIEW_WIDTH / 2;
const CENTER_Y = VIEW_HEIGHT / 2;

const BALL_COUNT = 10;
const BALL_RADIUS = 18;
const BALL_DIAMETER = BALL_RADIUS * 2;
const MIN_MATCH = 3;
const MATCH_FADE_DURATION = 260;
const SHOOTER_BALL_SCALE = 0.75;
const INITIAL_CURRENT_COLOR = 0;
const INITIAL_NEXT_COLOR = 1;
const CHAIN_SPEED = 48; // pixels per second
const CATCH_UP_SPEED = CHAIN_SPEED * 1.8;
const SHOT_SPEED = 520; // pixels per second
const SHOT_RADIUS = BALL_RADIUS;
const SHOT_SPAWN_OFFSET = 56;
const SHOT_CULL_MARGIN = 48;
const MAX_FRAME_DELTA = 50;

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

// The first two marbles share a colour so the player can immediately create
// a three-in-a-row by inserting the first (red) shot beside them. Every index
// must remain within the five-colour palette.
const INITIAL_CHAIN_COLORS = [0, 0, 2, 3, 4, 1, 2, 3, 4, 1];

const DEPTH = {
  backdrop: -40,
  foliage: -20,
  vignette: -10,
  motes: -5,
  track: 2,
  trackDebug: 3,
  balls: 5,
  shots: 6,
  launcherGlow: 7,
  launcherBase: 8,
  launcher: 9,
  effects: 12,
  hud: 30,
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
  }

  create() {
    this.slowdownTimer = 0;
    this.createBackdrop();

    this.track = new Phaser.Curves.Spline(
      PATH_POINTS.map(([x, y]) => new Phaser.Math.Vector2(x, y)),
    );
    this.trackLength = this.track.getLength();

    this.createTrack();
    this.createMarbles();
    this.createLauncher();
    this.createAmbientMotes();
    this.createHud();

    this.input.on('pointermove', () => {
      this.pointerSeen = true;
    });

    this.input.on('pointerdown', this.handlePointerDown, this);

    this.aimAtPointer();

    this.game.canvas.setAttribute(
      'aria-label',
      'Serpentine: insert fired marbles into the S-shaped chain and match three or more colours to clear them.',
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.handlePointerDown, this);
      this.shots = [];
    });
  }

  update(_time, delta) {
    const step = Math.min(delta, MAX_FRAME_DELTA) / 1000;

    this.updateChainMovement(step);
    this.updateChainPositions();
    this.updateShots(step);
    this.aimAtPointer();
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

    // deltaT is the proportion of the spline covered by one physical marble
    // diameter. This is the exact amount every trailing marble is pushed.
    this.deltaT = BALL_DIAMETER / this.trackLength;
    this.initialGapT = this.deltaT;
    this.chainComplete = false;

    // Every chain marble is a genuine PathFollower. Its t is driven manually
    // so the chain can be moved, inserted into and pushed as a group.
    this.marbles = INITIAL_CHAIN_COLORS.map((colorIndex, index) =>
      this.createPathMarble(
        colorIndex,
        (BALL_COUNT - 1 - index) * this.initialGapT,
      ),
    );

    this.chainHeadDistance = this.marbles[0].t * this.trackLength;
    this.updateChainPositions();
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
    if (this.textures.exists('zs-marble-0')) {
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
    });

    graphics.destroy();
  }

  updateChainMovement(step) {
    const isSlowed = this.slowdownTimer > 0;

    if (isSlowed) {
      this.slowdownTimer = Math.max(0, this.slowdownTimer - step);
    }

    const first = this.marbles[0];

    if (!first) {
      this.chainHeadDistance = this.trackLength;
      this.chainComplete = true;
      return;
    }

    const standardTravelT =
      (CHAIN_SPEED * (isSlowed ? 0.3 : 1) * step) / this.trackLength;
    const catchUpTravelT = (CATCH_UP_SPEED * step) / this.trackLength;

    // Segment 1 locomotive: it always moves at standard speed until the end.
    if (!this.chainComplete) {
      first.t = Math.min(first.t + standardTravelT, 1);
    }

    for (let index = 1; index < this.marbles.length; index += 1) {
      const ahead = this.marbles[index - 1];
      const marble = this.marbles[index];
      const gap = ahead.t - marble.t;

      if (gap <= this.deltaT + 0.002) {
        // Cart rule: no independent speed, hard-link to the car ahead.
        marble.t = Math.max(0, ahead.t - this.deltaT);
        marble.magnetApproaching = false;
        continue;
      }

      // This marble is the locomotive of a new, disconnected segment.
      const sameColor = marble.colorIndex === ahead.colorIndex;

      if (!sameColor) {
        // Different colours at the break: this segment waits in place.
        marble.magnetApproaching = false;
        continue;
      }

      // Same-colour magnetic traction for this independent segment head.
      marble.magnetApproaching = true;
      marble.t = Math.min(
        marble.t + catchUpTravelT,
        ahead.t - this.deltaT,
      );
      marble.t = Math.max(0, marble.t);

      const newGap = ahead.t - marble.t;
      if (newGap <= this.deltaT + 0.002) {
        marble.magnetApproaching = false;

        // Confirm the entire contiguous colour run includes at least three
        // marbles before mutating anything or firing the chain reaction.
        const run = this.findMatchRun(marble);
        if (run && run.length >= MIN_MATCH) {
          this.resolveMatches(marble);
          this.slowdownTimer = 1.5;

          const front = this.marbles[0];
          this.chainHeadDistance = front
            ? front.t * this.trackLength
            : this.trackLength;
          this.chainComplete = front ? front.t >= 1 : true;

          // Do not process any further segments in the same frame.
          return;
        }
      }
    }

    const currentFront = this.marbles[0];
    this.chainHeadDistance = currentFront
      ? currentFront.t * this.trackLength
      : this.trackLength;
    this.chainComplete = currentFront ? currentFront.t >= 1 : true;
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
    const halo = this.add.graphics().setDepth(DEPTH.launcherGlow);
    halo.fillStyle(0xe7cd7c, 0.035);
    halo.fillCircle(CENTER_X, CENTER_Y, 76);
    halo.fillStyle(0xe7cd7c, 0.045);
    halo.fillCircle(CENTER_X, CENTER_Y, 61);
    halo.lineStyle(1, 0xd5bd75, 0.16);
    halo.strokeCircle(CENTER_X, CENTER_Y, 70);

    const base = this.add.graphics().setDepth(DEPTH.launcherBase);

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

    // Subtle aim guide, rotating with the triangle.
    turret.lineStyle(1, 0xf7e7ab, 0.2);
    turret.lineBetween(68, 0, 112, 0);
    turret.fillStyle(0xf7e7ab, 0.28);
    turret.fillCircle(112, 0, 2);

    // Shadow and dark silhouette.
    turret.fillStyle(0x000000, 0.35);
    turret.fillTriangle(-17, -18, 41, 6, -17, 21);
    turret.fillStyle(0x09170f, 1);
    turret.fillTriangle(-22, -21, 48, 0, -22, 21);

    // The launcher itself is a clear, glowing triangle.
    turret.fillStyle(0xe4c36d, 1);
    turret.fillTriangle(-16, -16, 40, 0, -16, 16);
    turret.fillStyle(0x7e5f23, 0.34);
    turret.fillTriangle(-16, 0, 40, 0, -16, 16);
    turret.lineStyle(1.5, 0xfff0b8, 0.65);
    turret.strokeTriangle(-16, -16, 40, 0, -16, 16);

    // Pivot jewel.
    turret.fillStyle(0x0a1a10, 1);
    turret.fillCircle(-5, 0, 12);
    turret.lineStyle(1.5, 0xefda94, 0.5);
    turret.strokeCircle(-5, 0, 12);
    turret.fillStyle(0xecd68d, 1);
    turret.fillCircle(-5, 0, 4.5);
    turret.fillStyle(0xffffff, 0.45);
    turret.fillCircle(-6.5, -1.5, 1.6);

    // The loaded marble sits at the muzzle and is a child of the cannon,
    // so it rotates together with the launcher when aiming.
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

  resolveMatches(insertedMarble) {
    const run = this.findMatchRun(insertedMarble);

    if (!run || run.length < MIN_MATCH) {
      return 0;
    }

    const { start, end } = run;
    const matchLength = run.length;
    const colorIndex = insertedMarble.colorIndex;

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
      .text(30, 24, 'SERPENTINE', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '22px',
        color: '#f3ebd2',
      })
      .setDepth(DEPTH.hud);

    title.setShadow(0, 2, '#000000', 8, false, true);

    this.add
      .text(30, 51, 'PHASE 03 / INSERT / PUSH / MATCH', {
        fontFamily: '"Courier New", monospace',
        fontSize: '9px',
        color: '#b4c79d',
      })
      .setAlpha(0.7)
      .setDepth(DEPTH.hud);

    this.add
      .text(770, 27, 'AIM + CLICK TO SHOOT', {
        fontFamily: '"Courier New", monospace',
        fontSize: '9px',
        color: '#c8d8b2',
      })
      .setOrigin(1, 0)
      .setAlpha(0.62)
      .setDepth(DEPTH.hud);

    this.marbleCountText = this.add
      .text(770, 44, `${this.marbles.length} MARBLES / 01 PATH`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '9px',
        color: '#c8d8b2',
      })
      .setOrigin(1, 0)
      .setAlpha(0.38)
      .setDepth(DEPTH.hud);
  }

  updateMarbleCount() {
    if (!this.marbleCountText) {
      return;
    }

    const count = this.marbles.length;
    this.marbleCountText.setText(
      `${count} ${count === 1 ? 'MARBLE' : 'MARBLES'} / 01 PATH`,
    );
  }
}
