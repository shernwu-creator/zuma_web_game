import Phaser from 'phaser';

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 600;
const CENTER_X = VIEW_WIDTH / 2;
const CENTER_Y = VIEW_HEIGHT / 2;

const BALL_COUNT = 10;
const BALL_RADIUS = 18;
const BALL_SPACING = 43;
const CHAIN_SPEED = 48; // pixels per second
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
  '#f4c75a',
  '#ef6f6c',
  '#4fd1b5',
  '#8b9dff',
  '#d7ee70',
  '#ff8fd8',
  '#ff9d5c',
  '#7fe3ff',
  '#f2e7bd',
  '#c39bff',
];

const DEPTH = {
  backdrop: -40,
  foliage: -20,
  vignette: -10,
  motes: -5,
  track: 2,
  trackDebug: 3,
  balls: 5,
  launcherGlow: 7,
  launcherBase: 8,
  launcher: 9,
  hud: 30,
};

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    this.trackLength = 0;
    this.chainHeadDistance = 0;
    this.chainComplete = false;
    this.pointerSeen = false;
    this.marbles = [];
  }

  create() {
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

    this.aimAtPointer();

    this.game.canvas.setAttribute(
      'aria-label',
      'Serpentine prototype: ten marbles move along an S-shaped spline. Move the mouse to aim the central launcher.',
    );
  }

  update(_time, delta) {
    const step = Math.min(delta, MAX_FRAME_DELTA) / 1000;

    if (!this.chainComplete) {
      this.chainHeadDistance = Math.min(
        this.chainHeadDistance + CHAIN_SPEED * step,
        this.trackLength,
      );

      if (this.chainHeadDistance >= this.trackLength) {
        this.chainComplete = true;
      }
    }

    this.updateChainPositions();
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

    // Start with the head far enough along the spline for all ten marbles to
    // be visible, then lock every marble to the shared arc-length chain.
    this.chainHeadDistance = (BALL_COUNT - 1) * BALL_SPACING;
    this.chainComplete = false;

    this.marbles = MARBLE_COLORS.map((_, index) =>
      this.add.image(0, 0, `zs-marble-${index}`).setDepth(DEPTH.balls),
    );

    this.updateChainPositions();
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

  updateChainPositions() {
    this.marbles.forEach((marble, index) => {
      const distance = Phaser.Math.Clamp(
        this.chainHeadDistance - index * BALL_SPACING,
        0,
        this.trackLength,
      );
      const position = this.getTrackPoint(distance);
      marble.setPosition(position.x, position.y);
    });
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
    turret.lineBetween(45, 0, 104, 0);
    turret.fillStyle(0xf7e7ab, 0.28);
    turret.fillCircle(104, 0, 2);

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

    this.cannon.add(turret);
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
      .text(30, 51, 'PHASE 01 / SPLINE PROTOTYPE', {
        fontFamily: '"Courier New", monospace',
        fontSize: '9px',
        color: '#b4c79d',
      })
      .setAlpha(0.7)
      .setDepth(DEPTH.hud);

    this.add
      .text(770, 27, 'MOVE MOUSE TO AIM', {
        fontFamily: '"Courier New", monospace',
        fontSize: '9px',
        color: '#c8d8b2',
      })
      .setOrigin(1, 0)
      .setAlpha(0.62)
      .setDepth(DEPTH.hud);

    this.add
      .text(770, 44, '10 MARBLES / 01 PATH', {
        fontFamily: '"Courier New", monospace',
        fontSize: '9px',
        color: '#c8d8b2',
      })
      .setOrigin(1, 0)
      .setAlpha(0.38)
      .setDepth(DEPTH.hud);
  }
}
