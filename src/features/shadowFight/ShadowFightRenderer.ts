import { observeCanvas } from '../render/canvas';
import { rgba } from '../render/palette';
import type {
  AfterimageGhost,
  FighterState,
  HitEffect,
  ShockwaveRing,
  SparkParticle,
} from './types';

interface AmbientLeaf {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  size: number;
  color: string;
}

export class ShadowFightRenderer {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly sizing: ReturnType<typeof observeCanvas>;
  private readonly sparks: SparkParticle[] = [];
  private readonly shockwaves: ShockwaveRing[] = [];
  private readonly hits: HitEffect[] = [];
  private readonly ghosts: AfterimageGhost[] = [];
  private readonly leaves: AmbientLeaf[] = [];
  private shakeTime = 0;
  private shakeAmount = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
    this.sizing = observeCanvas(canvas);
    this.initLeaves();
  }

  dispose(): void {
    this.sizing.dispose();
  }

  private initLeaves(): void {
    const colors = [
      'rgba(255, 90, 209, 0.45)', // Pink petal
      'rgba(46, 230, 255, 0.4)',  // Cyan wisp
      'rgba(255, 193, 77, 0.5)',  // Amber ember
    ];
    for (let i = 0; i < 28; i++) {
      this.leaves.push({
        x: Math.random(),
        y: Math.random(),
        vx: -(0.015 + Math.random() * 0.025),
        vy: 0.008 + Math.random() * 0.015,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 1.5,
        size: 3 + Math.random() * 5,
        color: colors[i % colors.length] as string,
      });
    }
  }

  triggerShake(intensity = 10, durationMs = 250): void {
    this.shakeAmount = intensity;
    this.shakeTime = performance.now() + durationMs;
  }

  addHitEffect(x: number, y: number, type: 'hit' | 'crit' | 'block' | 'dodge', text: string, color: string): void {
    this.hits.push({
      x,
      y,
      type,
      text,
      color,
      born: performance.now(),
      duration: type === 'crit' ? 900 : 750,
    });

    // Add sparks
    const count = type === 'crit' ? 24 : type === 'block' ? 16 : type === 'hit' ? 14 : 4;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const speed = (type === 'crit' ? 180 : 120) * (0.5 + Math.random());
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        size: 2 + Math.random() * 3,
        color,
        life: 0,
        maxLife: 300 + Math.random() * 250,
      });
    }

    // Add shockwave
    if (type !== 'dodge') {
      this.shockwaves.push({
        x,
        y,
        radius: 8,
        maxRadius: type === 'crit' ? 70 : 45,
        color,
        life: 0,
        maxLife: 320,
      });
    }
  }

  addAfterimage(fighter: FighterState, now: number): void {
    this.ghosts.push({
      x: fighter.x,
      y: fighter.y,
      facing: fighter.facing,
      color: fighter.color,
      alpha: 0.55,
      born: now,
      duration: 380,
      pose: fighter.livePose,
      action: fighter.action,
    });
  }

  render(
    f1: FighterState,
    f2: FighterState,
    now: number,
    dtMs: number
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { width: w, height: h, dpr } = this.sizing.size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Screen Shake
    let shakeX = 0;
    let shakeY = 0;
    if (now < this.shakeTime) {
      const remain = (this.shakeTime - now) / 250;
      const mag = this.shakeAmount * remain;
      shakeX = (Math.random() - 0.5) * mag * 2;
      shakeY = (Math.random() - 0.5) * mag * 2;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // 1. Draw 2D Shadow Fight Atmospheric Backdrop
    this.drawAtmosphere(ctx, w, h, now);

    // 2. Ambient drifting particles (cherry blossom petals / embers)
    this.drawLeaves(ctx, w, h, dtMs);

    // 3. Ground plane & platform
    const groundY = h * 0.76;
    this.drawGround(ctx, w, h, groundY);

    // 4. Ghost afterimages for dodges / dashes
    this.drawGhosts(ctx, w, groundY, now);

    // 5. Draw Fighters
    this.drawFighter(ctx, f1, w, groundY, now);
    this.drawFighter(ctx, f2, w, groundY, now);

    // 6. Draw Combat Visual FX (Sparks, Shockwaves, Damage numbers)
    this.drawEffects(ctx, dtMs, now);

    ctx.restore();
  }

  /**
   * Draws the atmospheric 2D background matching Shadow Fight 2:
   * Twilight dusk gradient sky, glowing mystic moon/sun, silhouette mountain peaks,
   * gnarled silhouette pine branch with hanging foliage sweeping from top/left.
   */
  private drawAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number, _now: number): void {
    // Sunset / twilight synthwave gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#0c0718');    // Deep midnight purple
    skyGrad.addColorStop(0.35, '#220e36'); // Rich violet
    skyGrad.addColorStop(0.65, '#56174a'); // Crimson dusk
    skyGrad.addColorStop(0.85, '#92384a'); // Amber ember glow
    skyGrad.addColorStop(1.0, '#2d112b');  // Dark ground horizon
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Giant Glowing Synthwave Sun / Mystic Moon
    const sunX = w * 0.5;
    const sunY = h * 0.42;
    const sunR = Math.min(w, h) * 0.22;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.1, sunX, sunY, sunR * 1.5);
    sunGrad.addColorStop(0, 'rgba(255, 230, 160, 0.7)');
    sunGrad.addColorStop(0.3, 'rgba(255, 110, 140, 0.45)');
    sunGrad.addColorStop(0.7, 'rgba(180, 50, 160, 0.2)');
    sunGrad.addColorStop(1, 'rgba(12, 7, 24, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Solid inner disc of the moon / sun
    ctx.fillStyle = 'rgba(255, 240, 200, 0.85)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 0.65, 0, Math.PI * 2);
    ctx.fill();

    // Distant mountain silhouettes (Layer 1)
    ctx.fillStyle = 'rgba(38, 14, 52, 0.85)';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.68);
    ctx.lineTo(w * 0.15, h * 0.54);
    ctx.lineTo(w * 0.32, h * 0.62);
    ctx.lineTo(w * 0.52, h * 0.48);
    ctx.lineTo(w * 0.72, h * 0.60);
    ctx.lineTo(w * 0.88, h * 0.52);
    ctx.lineTo(w, h * 0.66);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // Near mountain silhouettes (Layer 2)
    ctx.fillStyle = 'rgba(18, 8, 30, 0.95)';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    ctx.lineTo(w * 0.2, h * 0.60);
    ctx.lineTo(w * 0.4, h * 0.68);
    ctx.lineTo(w * 0.65, h * 0.58);
    ctx.lineTo(w * 0.85, h * 0.67);
    ctx.lineTo(w, h * 0.64);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // Iconic Shadow Fight Silhouette Tree Branch sweeping across top/sides (matching Image 1!)
    ctx.save();
    ctx.fillStyle = '#08040d'; // Deepest silhouette black
    ctx.strokeStyle = '#08040d';

    // Massive curved branch swooping from top-right to middle-left
    ctx.lineWidth = Math.max(16, w * 0.038);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 1.05, h * 0.08);
    ctx.bezierCurveTo(w * 0.82, h * 0.18, w * 0.55, h * 0.24, w * 0.15, h * 0.34);
    ctx.stroke();

    // Secondary sub-branch
    ctx.lineWidth = Math.max(9, w * 0.02);
    ctx.beginPath();
    ctx.moveTo(w * 0.62, h * 0.22);
    ctx.bezierCurveTo(w * 0.48, h * 0.28, w * 0.38, h * 0.22, w * 0.28, h * 0.15);
    ctx.stroke();

    // Third sub-branch on right
    ctx.lineWidth = Math.max(10, w * 0.024);
    ctx.beginPath();
    ctx.moveTo(w * 0.85, h * 0.16);
    ctx.bezierCurveTo(w * 0.78, h * 0.35, w * 0.72, h * 0.42, w * 0.68, h * 0.48);
    ctx.stroke();

    // Bamboo / pine leaf foliage clumps hanging down
    this.drawFoliageClump(ctx, w * 0.18, h * 0.34, 38);
    this.drawFoliageClump(ctx, w * 0.28, h * 0.16, 28);
    this.drawFoliageClump(ctx, w * 0.44, h * 0.25, 44);
    this.drawFoliageClump(ctx, w * 0.62, h * 0.23, 50);
    this.drawFoliageClump(ctx, w * 0.72, h * 0.44, 36);
    this.drawFoliageClump(ctx, w * 0.88, h * 0.18, 55);

    // Left edge gnarled bonsai tree trunk
    ctx.beginPath();
    ctx.moveTo(-10, h * 0.8);
    ctx.bezierCurveTo(w * 0.06, h * 0.6, w * 0.02, h * 0.4, -10, h * 0.2);
    ctx.lineTo(-20, h * 0.8);
    ctx.fill();
    this.drawFoliageClump(ctx, w * 0.03, h * 0.38, 48);

    ctx.restore();
  }

  private drawFoliageClump(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx - r * 0.5, cy + r * 0.3, r * 0.65, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.5, cy + r * 0.2, r * 0.7, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.2, cy + r * 0.6, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawGround(ctx: CanvasRenderingContext2D, w: number, h: number, groundY: number): void {
    ctx.save();
    // Solid black silhouette ground
    ctx.fillStyle = '#060309';
    ctx.fillRect(0, groundY, w, h - groundY);

    // Subtle neon rim along the ground turf edge
    const rimGrad = ctx.createLinearGradient(0, groundY - 2, 0, groundY + 8);
    rimGrad.addColorStop(0, 'rgba(46, 230, 255, 0.6)');
    rimGrad.addColorStop(0.5, 'rgba(255, 90, 110, 0.4)');
    rimGrad.addColorStop(1, 'rgba(6, 3, 9, 0)');
    ctx.fillStyle = rimGrad;
    ctx.fillRect(0, groundY - 2, w, 10);

    // Silhouette grass blades along the fighting turf
    ctx.fillStyle = '#060309';
    const grassCount = Math.floor(w / 14);
    for (let i = 0; i < grassCount; i++) {
      const gx = i * 14 + (i % 3) * 2;
      const gh = 7 + ((i * 7) % 11);
      ctx.beginPath();
      ctx.moveTo(gx - 4, groundY);
      ctx.lineTo(gx, groundY - gh);
      ctx.lineTo(gx + 4, groundY);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawLeaves(ctx: CanvasRenderingContext2D, w: number, h: number, dtMs: number): void {
    const dt = Math.max(1, dtMs) / 1000;
    ctx.save();
    for (const leaf of this.leaves) {
      leaf.x += leaf.vx * dt;
      leaf.y += leaf.vy * dt;
      leaf.rot += leaf.vRot * dt;
      if (leaf.x < -0.05) leaf.x = 1.05;
      if (leaf.y > 0.85) leaf.y = -0.05;

      const px = leaf.x * w;
      const py = leaf.y * h;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(leaf.rot);
      ctx.fillStyle = leaf.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, leaf.size, leaf.size * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawGhosts(ctx: CanvasRenderingContext2D, w: number, groundY: number, now: number): void {
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      if (!g) continue;
      const age = now - g.born;
      if (age > g.duration) {
        this.ghosts.splice(i, 1);
        continue;
      }
      const alpha = (1 - age / g.duration) * g.alpha;
      const cx = (w * 0.5) + g.x * (w * 0.38);
      const cy = groundY;
      const scale = Math.min(w, groundY) * 0.0016;

      ctx.save();
      ctx.globalAlpha = alpha;
      this.drawStickmanSkeleton(ctx, cx, cy, g.facing, g.color, scale, g.action, 0, 0.4, 0, true);
      ctx.restore();
    }
  }

  /**
   * Draws a Fighter in full glowing neon stickman style (Image 2)
   * with Shadow Fight 2 silhouette aesthetic & combat poses!
   */
  private drawFighter(
    ctx: CanvasRenderingContext2D,
    f: FighterState,
    w: number,
    groundY: number,
    now: number
  ): void {
    const cx = (w * 0.5) + f.x * (w * 0.38);
    const cy = groundY - f.y * (groundY * 0.25);
    const scale = Math.min(w, groundY) * 0.0017;

    // Contact shadow under the fighter
    const shadowW = 46 * scale * (f.action === 'dodge' ? 0.75 : 1.0);
    const shadowGrad = ctx.createRadialGradient(cx, groundY + 2, 0, cx, groundY + 2, shadowW);
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
    shadowGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.35)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(cx, groundY + 2, shadowW, 8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // High Guard Block Energy Shield Barrier
    if (f.isBlocking || f.action === 'block') {
      this.drawBlockShield(ctx, cx + f.facing * 34 * scale, cy - 80 * scale, f.color, scale, now);
    }

    // Punch motion trails during active strikes
    if (f.action === 'punch' || f.action === 'jab') {
      const punchProgress = 1 - (f.actionTime / f.actionDuration);
      if (punchProgress > 0.2 && punchProgress < 0.8) {
        this.drawPunchTrail(ctx, cx, cy - 85 * scale, f.facing, f.color, scale, f.action === 'punch');
      }
    }

    // Render the Stickman Skeleton
    this.drawStickmanSkeleton(
      ctx,
      cx,
      cy,
      f.facing,
      f.color,
      scale,
      f.action,
      f.armExtension,
      f.bodySquatY,
      f.bodySlipX,
      false
    );

    // Fighter Nameplate & Action Indicator
    this.drawFighterBadge(ctx, cx, cy - 170 * scale, f);
  }

  /**
   * Draws the Stickman Skeleton matching Image 2:
   * - Outer neon glow on limbs and joints
   * - Joint node circles at shoulders, elbows, wrists, spine, hips, knees, ankles
   * - Head circle with glowing ninja eye slit
   * - Combat stance transformations (punch, jab, high guard block, squat dodge, hit reaction)
   */
  private drawStickmanSkeleton(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    facing: 1 | -1,
    color: string,
    scale: number,
    action: FighterState['action'],
    _armExtension: number,
    squatY: number,
    _slipX: number,
    isGhost = false
  ): void {
    ctx.save();

    // Dynamic combat offsets
    const isSquat = action === 'dodge' || squatY > 0.3;
    const isHit = action === 'hit';
    const isKO = action === 'ko';
    const isBlock = action === 'block';
    const isPunch = action === 'punch';
    const isJab = action === 'jab';

    // Base heights in scaled units
    const crouchShift = isKO ? 90 * scale : isSquat ? 45 * scale : isHit ? 10 * scale : 0;
    const bodyBaseY = cy - 20 * scale + crouchShift;

    // Joint Positions
    // 1. Pelvis / Hips
    const hipX = cx + (isHit ? -12 * facing * scale : 0);
    const hipY = bodyBaseY - 60 * scale;

    // 2. Chest / Shoulders
    const spineLean = isKO ? -35 * facing * scale : isHit ? -20 * facing * scale : isSquat ? 10 * facing * scale : 0;
    const shoulderX = hipX + spineLean + (isPunch ? 16 * facing * scale : 0);
    const shoulderY = hipY - 60 * scale + (isSquat ? 15 * scale : 0);

    // 3. Head & Eye
    const headX = shoulderX + 4 * facing * scale;
    const headY = shoulderY - 32 * scale;
    const headR = 17 * scale;

    // 4. Legs & Knees
    // Front leg (closer to opponent)
    const frontKneeX = hipX + 18 * facing * scale;
    const frontKneeY = hipY + (isSquat ? 25 * scale : 32 * scale);
    const frontFootX = hipX + 32 * facing * scale;
    const frontFootY = cy;

    // Back leg (support)
    const backKneeX = hipX - 16 * facing * scale;
    const backKneeY = hipY + (isSquat ? 28 * scale : 34 * scale);
    const backFootX = hipX - 28 * facing * scale;
    const backFootY = cy;

    // 5. Arms & Fists
    let leadElbowX: number, leadElbowY: number, leadFistX: number, leadFistY: number;
    let rearElbowX: number, rearElbowY: number, rearFistX: number, rearFistY: number;

    if (isKO) {
      // Fallen KO posture
      leadElbowX = shoulderX + 25 * facing * scale;
      leadElbowY = shoulderY + 20 * scale;
      leadFistX = leadElbowX + 20 * facing * scale;
      leadFistY = cy - 10 * scale;

      rearElbowX = shoulderX - 20 * facing * scale;
      rearElbowY = shoulderY + 18 * scale;
      rearFistX = rearElbowX - 15 * facing * scale;
      rearFistY = cy - 8 * scale;
    } else if (isBlock) {
      // High guard: both forearms raised close near chin/chest
      leadElbowX = shoulderX + 16 * facing * scale;
      leadElbowY = shoulderY + 16 * scale;
      leadFistX = shoulderX + 14 * facing * scale;
      leadFistY = shoulderY - 14 * scale;

      rearElbowX = shoulderX + 8 * facing * scale;
      rearElbowY = shoulderY + 18 * scale;
      rearFistX = shoulderX + 10 * facing * scale;
      rearFistY = shoulderY - 16 * scale;
    } else if (isPunch) {
      // Heavy Power Punch (Cross): rear arm extends fully forward, lead arm guards
      rearElbowX = shoulderX + 40 * facing * scale;
      rearElbowY = shoulderY + 2 * scale;
      rearFistX = shoulderX + 86 * facing * scale;
      rearFistY = shoulderY + 2 * scale;

      leadElbowX = shoulderX - 10 * facing * scale;
      leadElbowY = shoulderY + 18 * scale;
      leadFistX = shoulderX + 8 * facing * scale;
      leadFistY = shoulderY - 6 * scale;
    } else if (isJab) {
      // Fast Lead Jab: lead arm snaps straight out, rear arm protects chin
      leadElbowX = shoulderX + 32 * facing * scale;
      leadElbowY = shoulderY - 2 * scale;
      leadFistX = shoulderX + 70 * facing * scale;
      leadFistY = shoulderY - 4 * scale;

      rearElbowX = shoulderX - 8 * facing * scale;
      rearElbowY = shoulderY + 16 * scale;
      rearFistX = shoulderX + 10 * facing * scale;
      rearFistY = shoulderY - 8 * scale;
    } else if (isSquat) {
      // Ducking / crouching combat stance
      leadElbowX = shoulderX + 18 * facing * scale;
      leadElbowY = shoulderY + 18 * scale;
      leadFistX = shoulderX + 26 * facing * scale;
      leadFistY = shoulderY - 4 * scale;

      rearElbowX = shoulderX - 10 * facing * scale;
      rearElbowY = shoulderY + 16 * scale;
      rearFistX = shoulderX + 8 * facing * scale;
      rearFistY = shoulderY - 10 * scale;
    } else if (isHit) {
      // Hit recoil
      leadElbowX = shoulderX + 10 * facing * scale;
      leadElbowY = shoulderY + 22 * scale;
      leadFistX = shoulderX + 18 * facing * scale;
      leadFistY = shoulderY + 8 * scale;

      rearElbowX = shoulderX - 18 * facing * scale;
      rearElbowY = shoulderY + 24 * scale;
      rearFistX = shoulderX - 8 * facing * scale;
      rearFistY = shoulderY + 12 * scale;
    } else {
      // Default Fighting Stance: fists up, rhythmic stance
      leadElbowX = shoulderX + 20 * facing * scale;
      leadElbowY = shoulderY + 18 * scale;
      leadFistX = shoulderX + 32 * facing * scale;
      leadFistY = shoulderY - 6 * scale;

      rearElbowX = shoulderX - 8 * facing * scale;
      rearElbowY = shoulderY + 16 * scale;
      rearFistX = shoulderX + 12 * facing * scale;
      rearFistY = shoulderY - 14 * scale;
    }

    // DRAWING: 2-Pass Rendering (Neon Glow Halo + Solid Core)
    const bonePairs: [number, number, number, number][] = [
      // Spine
      [hipX, hipY, shoulderX, shoulderY],
      // Front Leg
      [hipX, hipY, frontKneeX, frontKneeY],
      [frontKneeX, frontKneeY, frontFootX, frontFootY],
      // Back Leg
      [hipX, hipY, backKneeX, backKneeY],
      [backKneeX, backKneeY, backFootX, backFootY],
      // Lead Arm
      [shoulderX, shoulderY, leadElbowX, leadElbowY],
      [leadElbowX, leadElbowY, leadFistX, leadFistY],
      // Rear Arm
      [shoulderX, shoulderY, rearElbowX, rearElbowY],
      [rearElbowX, rearElbowY, rearFistX, rearFistY],
    ];

    const joints: [number, number, number][] = [
      [hipX, hipY, 4.5 * scale],
      [shoulderX, shoulderY, 5 * scale],
      [frontKneeX, frontKneeY, 4 * scale],
      [frontFootX, frontFootY, 4 * scale],
      [backKneeX, backKneeY, 4 * scale],
      [backFootX, backFootY, 4 * scale],
      [leadElbowX, leadElbowY, 3.8 * scale],
      [leadFistX, leadFistY, 5.5 * scale],
      [rearElbowX, rearElbowY, 3.8 * scale],
      [rearFistX, rearFistY, 5.5 * scale],
    ];

    // Pass 1: Outer Neon Aura Glow
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = isGhost ? color : rgba(color, 0.4);
    ctx.lineWidth = 11 * scale;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of bonePairs) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // Pass 2: Sharp Inner Bright Core
    ctx.strokeStyle = isGhost ? rgba(color, 0.6) : '#ffffff';
    ctx.lineWidth = 4.2 * scale;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of bonePairs) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // Pass 3: Joints
    for (const [jx, jy, jr] of joints) {
      // Glow halo
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(jx, jy, jr + 2 * scale, 0, Math.PI * 2);
      ctx.fill();

      // White inner core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(jx, jy, jr * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pass 4: Head (Outer ring + Silhouette interior + Glowing Ninja Eye)
    // Head Glow Ring
    ctx.strokeStyle = color;
    ctx.lineWidth = 4 * scale;
    ctx.fillStyle = '#08050e'; // Inner dark silhouette fill
    ctx.beginPath();
    ctx.arc(headX, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Glowing Ninja Eye Slit (Shadow Fight iconic glowing eye!)
    if (!isKO) {
      const eyeX = headX + (headR * 0.38) * facing;
      const eyeY = headY - 1 * scale;
      const eyeW = 7 * scale;
      const eyeH = 2.4 * scale;

      // Eye aura wisp
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(eyeX, eyeY, eyeW * 1.6, eyeH * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Sharp white eye slit
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(eyeX, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawBlockShield(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    color: string,
    scale: number,
    now: number
  ): void {
    ctx.save();
    const pulse = 1 + Math.sin(now * 0.015) * 0.08;
    const r = 44 * scale * pulse;

    // Glowing shield outer ring
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5 * scale;
    ctx.fillStyle = rgba(color, 0.18);
    ctx.beginPath();
    // Hexagonal martial energy shield
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const hx = bx + Math.cos(angle) * r;
      const hy = by + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Shield inner energy pulse
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8 * scale;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const hx = bx + Math.cos(angle) * (r * 0.65);
      const hy = by + Math.sin(angle) * (r * 0.65);
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }

  private drawPunchTrail(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    facing: 1 | -1,
    color: string,
    scale: number,
    isHeavy: boolean
  ): void {
    ctx.save();
    const trailGrad = ctx.createLinearGradient(x, y, x + facing * 80 * scale, y);
    trailGrad.addColorStop(0, rgba(color, 0));
    trailGrad.addColorStop(0.7, rgba(color, 0.4));
    trailGrad.addColorStop(1, '#ffffff');

    ctx.strokeStyle = trailGrad;
    ctx.lineWidth = (isHeavy ? 14 : 8) * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + facing * 20 * scale, y + (isHeavy ? 10 : 0) * scale);
    ctx.lineTo(x + facing * 85 * scale, y);
    ctx.stroke();
    ctx.restore();
  }

  private drawFighterBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, f: FighterState): void {
    if (f.action === 'idle' || f.action === 'ko') return;
    ctx.save();
    let text = '';
    let badgeColor = f.color;

    switch (f.action) {
      case 'block':
        text = '🛡️ BLOCK';
        badgeColor = '#3dffb0';
        break;
      case 'dodge':
        text = f.dodgeType === 'squat' ? '⚡ SQUAT DUCK' : '⚡ SLIP DODGE';
        badgeColor = '#ffd24d';
        break;
      case 'jab':
        text = '🥊 LEAD JAB';
        break;
      case 'punch':
        text = '💥 POWER PUNCH';
        badgeColor = '#ff5a6e';
        break;
      case 'hit':
        text = '💥 HIT';
        badgeColor = '#ff5a6e';
        break;
    }

    if (text) {
      ctx.font = '800 13px Unbounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = badgeColor;
      ctx.shadowColor = badgeColor;
      ctx.shadowBlur = 8;
      ctx.fillText(text, cx, cy);
    }
    ctx.restore();
  }

  private drawEffects(ctx: CanvasRenderingContext2D, dtMs: number, now: number): void {
    const dt = Math.max(1, dtMs) / 1000;

    // 1. Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      if (!sw) continue;
      sw.life += dtMs;
      if (sw.life >= sw.maxLife) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      const progress = sw.life / sw.maxLife;
      const r = sw.radius + (sw.maxRadius - sw.radius) * progress;
      const alpha = 1 - progress;

      ctx.save();
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = 3.5 * (1 - progress);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 2. Sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      if (!sp) continue;
      sp.life += dtMs;
      if (sp.life >= sp.maxLife) {
        this.sparks.splice(i, 1);
        continue;
      }
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += 220 * dt; // gravity

      const progress = sp.life / sp.maxLife;
      ctx.save();
      ctx.fillStyle = sp.color;
      ctx.globalAlpha = 1 - progress;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size * (1 - progress * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Floating Combat Hits & Damage text
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (!h) continue;
      const age = now - h.born;
      if (age >= h.duration) {
        this.hits.splice(i, 1);
        continue;
      }
      const progress = age / h.duration;
      const fy = h.y - progress * 55;
      const alpha = Math.sin((1 - progress) * Math.PI * 0.5);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '900 18px Unbounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = h.color;
      ctx.shadowColor = h.color;
      ctx.shadowBlur = 10;
      if (h.text) ctx.fillText(h.text, h.x, fy);
      ctx.restore();
    }
  }
}
