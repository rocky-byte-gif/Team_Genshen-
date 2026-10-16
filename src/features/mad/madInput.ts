import { clamp, type Point } from '../../lib/math/geometry';
import { bodyOf } from '../arcade/types';
import { motionEnergy } from '../arcade/freeze';
import { handPoint } from '../arcade/starCatch';
import type { MotionFrame } from '../engine/MotionEngine';
import { copyPoseInto, createPose, LM, lm } from '../tracking/landmarks';
import type { FireStyle } from './weapons';

/** A shot the body asked for. Aim is in screen units: x, y ∈ [-1, 1], y up. */
export interface Trigger {
  x: number;
  y: number;
}

export interface MadControls {
  tracked: boolean;
  /** Jogging on the spot, 0 (standing) … ~1.2 (sprint). */
  speed: number;
  /** Crosshair, smoothed. */
  aim: Trigger;
  /** -1 left, 0 centre, 1 right: which way the player leans out of cover. */
  peek: -1 | 0 | 1;
  /** Continuous lean, -1..1 (camera). */
  lean: number;
  crouch: boolean;
  /** Two-hand pose held (rifle / automatic). */
  held: boolean;
  /** Scope steadiness / rocket loaded / bomb armed, 0..1. */
  charge: number;
  /** Fire requests this frame (punch, slash, flick, throw, push, scope lock). */
  triggers: Trigger[];
  /** Gesture-based camera perspective switch (temple tap or hands up). */
  cameraToggle: boolean;
  /** Which hand threw a punch (for boxing / punching). */
  punchHand: 'left' | 'right' | null;
  /** Boxing specific gesture: 'jab' | 'punch' | 'block' | 'dodge' */
  boxingGesture: 'jab' | 'punch' | 'block' | 'dodge' | null;
  /** True when player has both hands up in guard position */
  isBlocking: boolean;
  /** True when player ducks (crouch) or slips (leans left/right) */
  isDodging: boolean;
  /** Type of punch thrown */
  punchType: 'jab' | 'punch' | null;
}

/** Keyboard / mouse stand-in for the camera (testing and accessibility). */
export interface KeyState {
  run: boolean;
  left: boolean;
  right: boolean;
  crouch: boolean;
  hold: boolean;
  aim: Trigger;
  fire: boolean;
  charge: boolean;
  cameraToggle?: boolean;
  block?: boolean;
  jab?: boolean;
}

export const NEUTRAL_CONTROLS: MadControls = {
  tracked: false,
  speed: 0,
  aim: { x: 0, y: 0 },
  peek: 0,
  lean: 0,
  crouch: false,
  held: false,
  charge: 0,
  triggers: [],
  cameraToggle: false,
  punchHand: null,
  boxingGesture: null,
  isBlocking: false,
  isDodging: false,
  punchType: null,
};

const T = {
  /** Jog: motion energy (shoulder widths per second) that counts as full speed, and the dead zone. */
  runFull: 2.2,
  runDead: 0.45,
  energyTauMs: 180,
  /** Lean out of cover, in shoulder widths from the calibrated centre. */
  peekOn: 0.3,
  peekOff: 0.18,
  punchSpeed: 1.7,
  punchReach: 1.2,
  slash: 2.3,
  flickUp: 2.6,
  flickAimLagMs: 220,
  throwDown: 3.2,
  throwWindowMs: 650,
  pushOut: 2.6,
  scopeSteady: 0.95,
  scopeNear: 1.0,
  scopeChargeMs: 700,
  pushChargeMs: 450,
  histMs: 700,
};

interface Sample {
  t: number;
  hand: Point | null;
  /** The hand's distance from its own shoulder, shoulder widths. */
  reach: number;
}

/**
 * Turns the pose into game controls. Everything is measured in the player's own shoulder
 * widths (SW), so it works at any distance from the camera.
 */
export class MadInput {
  style: FireStyle = 'flick';
  private readonly prev = createPose();
  private hasPrev = false;
  private prevAt = 0;
  private energy = 0;
  private aim: Trigger = { x: 0, y: 0 };
  private aimTrail: { t: number; x: number; y: number }[] = [];
  private hand: Sample[] = [];
  private handL: Sample[] = [];
  private handR: Sample[] = [];
  private side: 'left' | 'right' = 'right';
  private peekState: -1 | 0 | 1 = 0;
  private charge = 0;
  private armedAt = -1;
  private armedAim: Trigger = { x: 0, y: 0 };
  private lockUntil = 0;
  private cameraToggleHold = 0;
  private cameraToggleCooldown = 0;
  private keyPunchAlternate = false;

  reset(): void {
    this.hasPrev = false;
    this.energy = 0;
    this.charge = 0;
    this.armedAt = -1;
    this.hand = [];
    this.handL = [];
    this.handR = [];
    this.aimTrail = [];
    this.lockUntil = 0;
    this.cameraToggleHold = 0;
    this.cameraToggleCooldown = 0;
  }

  update(frame: Readonly<MotionFrame>, dtMs: number, keys: KeyState | null): MadControls {
    if (keys) return this.fromKeys(frame.time, dtMs, keys);
    const pose = frame.trackable ? frame.pose : null;
    const body = pose ? bodyOf(pose) : null;
    if (!pose || !body) {
      this.hasPrev = false;
      return { ...NEUTRAL_CONTROLS, aim: { ...this.aim }, triggers: [] };
    }
    const now = frame.time;
    const triggers: Trigger[] = [];
    let punchHand: 'left' | 'right' | null = null;

    // --- Jogging on the spot -------------------------------------------------
    if (frame.inferred || !this.hasPrev) {
      if (this.hasPrev && now > this.prevAt) {
        const e = motionEnergy(this.prev, pose, now - this.prevAt, body.sw);
        const raw = e.legs > 0 ? e.legs : e.arms * 0.8;
        this.energy += (raw - this.energy) * (1 - Math.exp(-(now - this.prevAt) / T.energyTauMs));
      }
      copyPoseInto(pose, this.prev);
      this.hasPrev = true;
      this.prevAt = now;
    }
    const speed = this.energy < T.runDead ? 0 : clamp(this.energy / T.runFull, 0, 1.2);

    // --- Lean (peek) and crouch ---------------------------------------------
    const lean = frame.baseline ? (body.center.x - frame.baseline.shoulderCenter.x) / body.sw : 0;
    const mag = Math.abs(lean);
    if (this.peekState === 0 && mag >= T.peekOn) this.peekState = lean < 0 ? -1 : 1;
    else if (this.peekState !== 0 && (mag < T.peekOff || Math.sign(lean) !== this.peekState)) this.peekState = mag >= T.peekOn ? (lean < 0 ? -1 : 1) : 0;
    let peek: -1 | 0 | 1 = this.peekState;
    if (peek === 0 && frame.lateral.phase === 'CONFIRMED') peek = frame.lateral.gesture === 'LEAN_LEFT' ? -1 : frame.lateral.gesture === 'LEAN_RIGHT' ? 1 : 0;
    const crouch = frame.vertical.phase === 'CONFIRMED' && frame.vertical.gesture === 'CROUCH';

    // --- Hands ---------------------------------------------------------------
    const l = handPoint(pose, 'left');
    const r = handPoint(pose, 'right');
    const ls = lm(pose, LM.LEFT_SHOULDER);
    const rs = lm(pose, LM.RIGHT_SHOULDER);
    const nose = lm(pose, LM.NOSE);

    // Sample each hand individually for punching
    const reachL = l ? Math.hypot(l.x - ls.x, l.y - ls.y) / body.sw : 9;
    const reachR = r ? Math.hypot(r.x - rs.x, r.y - rs.y) / body.sw : 9;
    this.handL.push({ t: now, hand: l ? { ...l } : null, reach: reachL });
    this.handR.push({ t: now, hand: r ? { ...r } : null, reach: reachR });
    while (this.handL.length > 0 && now - (this.handL[0] as Sample).t > T.histMs) this.handL.shift();
    while (this.handR.length > 0 && now - (this.handR[0] as Sample).t > T.histMs) this.handR.shift();

    // The raised hand aims (it sticks until the other is clearly higher).
    if (l && r) {
      if (this.side === 'right' && l.y < r.y - 0.3 * body.sw) this.side = 'left';
      else if (this.side === 'left' && r.y < l.y - 0.3 * body.sw) this.side = 'right';
    } else if (l && !r) this.side = 'left';
    else if (r && !l) this.side = 'right';
    const hand = this.side === 'left' ? l : r;
    const shoulder = this.side === 'left' ? ls : rs;
    const reach = hand ? Math.hypot(hand.x - shoulder.x, hand.y - shoulder.y) / body.sw : 9;
    this.hand.push({ t: now, hand: hand ? { ...hand } : null, reach });
    while (this.hand.length > 0 && now - (this.hand[0] as Sample).t > T.histMs) this.hand.shift();

    // Where the hand points, in screen units.
    const both = l && r ? { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 } : null;
    let target: Trigger | null = null;
    if (this.style === 'scope' && hand && nose.v > 0.4) {
      target = { x: clamp((hand.x - nose.x) / body.sw / 0.55, -1, 1), y: clamp((nose.y - hand.y) / body.sw / 0.45, -1, 1) };
    } else if (this.style === 'hold' && both) {
      target = { x: clamp((both.x - body.center.x) / body.sw / 1.0, -1, 1), y: clamp((body.center.y - both.y) / body.sw / 0.9 + 0.9, -1, 1) };
    } else if (hand) {
      target = { x: clamp((hand.x - body.center.x) / body.sw / 1.7, -1, 1), y: clamp((body.center.y - hand.y) / body.sw / 1.5, -1, 1) };
    }
    if (target) {
      const k = 1 - Math.exp(-Math.max(dtMs, 1) / (this.style === 'scope' ? 120 : 65));
      this.aim.x += (target.x - this.aim.x) * k;
      this.aim.y += (target.y - this.aim.y) * k;
    }
    this.aimTrail.push({ t: now, x: this.aim.x, y: this.aim.y });
    while (this.aimTrail.length > 0 && now - (this.aimTrail[0] as { t: number }).t > T.histMs) this.aimTrail.shift();

    const old = this.sampleAgo(now, 110);
    const cur = this.hand[this.hand.length - 1];
    const dt = old && cur ? (cur.t - old.t) / 1000 : 0;
    let vx = 0;
    let vy = 0;
    let vReach = 0;
    if (old && cur && dt > 0.04 && old.hand && cur.hand) {
      vx = (cur.hand.x - old.hand.x) / dt / body.sw;
      vy = (cur.hand.y - old.hand.y) / dt / body.sw; // down is positive
      vReach = (cur.reach - old.reach) / dt;
    }
    const speedHand = Math.hypot(vx, vy);
    const locked = now < this.lockUntil;

    // --- Boxing Gestures: Block & Dodge ---------------------------------------
    // High Guard (Block): Both hands raised to chest/chin level and held close
    const isBlocking = !!(
      l && r &&
      l.y < ls.y + 0.22 * body.sw &&
      r.y < rs.y + 0.22 * body.sw &&
      Math.hypot(l.x - r.x, l.y - r.y) < 1.05 * body.sw &&
      Math.abs((l.x + r.x) / 2 - body.center.x) < 0.7 * body.sw
    );

    // Dodge: Ducking (crouch) or slipping (lateral body shift / sway left or right)
    const isDodging = crouch || Math.abs(lean) >= 0.22;
    let punchType: 'jab' | 'punch' | null = null;
    let boxingGesture: 'jab' | 'punch' | 'block' | 'dodge' | null = null;

    // --- Weapon gestures -----------------------------------------------------
    let held = false;
    switch (this.style) {
      case 'punch': {
        const oldL = this.sampleAgoL(now, 90);
        const oldR = this.sampleAgoR(now, 90);
        const curL = this.handL[this.handL.length - 1];
        const curR = this.handR[this.handR.length - 1];
        const dtL = oldL && curL ? (curL.t - oldL.t) / 1000 : 0;
        const dtR = oldR && curR ? (curR.t - oldR.t) / 1000 : 0;

        let vL = 0;
        let vReachL = 0;
        if (oldL && curL && dtL > 0.02 && oldL.hand && curL.hand) {
          vL = Math.hypot(curL.hand.x - oldL.hand.x, curL.hand.y - oldL.hand.y) / dtL / body.sw;
          vReachL = (curL.reach - oldL.reach) / dtL;
        }

        let vR = 0;
        let vReachR = 0;
        if (oldR && curR && dtR > 0.02 && oldR.hand && curR.hand) {
          vR = Math.hypot(curR.hand.x - oldR.hand.x, curR.hand.y - oldR.hand.y) / dtR / body.sw;
          vReachR = (curR.reach - oldR.reach) / dtR;
        }

        if (!locked) {
          const punchL = (vL >= T.punchSpeed || vReachL >= T.punchReach) && curL && curL.reach > 0.38;
          const punchR = (vR >= T.punchSpeed || vReachR >= T.punchReach) && curR && curR.reach > 0.38;
          if (punchL || punchR) {
            triggers.push({ x: this.aim.x, y: this.aim.y });
            punchHand = punchL && (!punchR || vL >= vR) ? 'left' : 'right';
            const reachVal = punchL ? (curL ? curL.reach : 0) : (curR ? curR.reach : 0);
            const isHeavy = (punchL ? vReachL : vReachR) >= 1.3 || reachVal > 0.62;
            punchType = isHeavy ? 'punch' : 'jab';
            boxingGesture = punchType;
            this.lockUntil = now + (punchType === 'jab' ? 140 : 200);
          }
        }
        break;
      }
      case 'slash':
        if (!locked && hand && speedHand >= T.slash) {
          triggers.push({ x: this.aim.x, y: this.aim.y });
          this.lockUntil = now + 260;
        }
        break;
      case 'flick':
        if (!locked && hand && -vy >= T.flickUp && hand.y < body.center.y + 1.7 * body.sw) {
          const lag = this.aimAgo(now, T.flickAimLagMs);
          triggers.push(lag);
          this.lockUntil = now + 240;
        }
        break;
      case 'hold':
        held = !!(l && r && Math.hypot(l.x - r.x, l.y - r.y) < 1.0 * body.sw && both && both.y > body.center.y - 0.6 * body.sw && both.y < body.center.y + 2.2 * body.sw && Math.abs(both.x - body.center.x) < 1.6 * body.sw);
        break;
      case 'scope': {
        const near = !!hand && nose.v > 0.4 && Math.hypot(hand.x - nose.x, hand.y - nose.y) < T.scopeNear * body.sw && hand.y < nose.y + 0.6 * body.sw;
        if (near && speedHand < T.scopeSteady && !locked) this.charge = Math.min(1, this.charge + dtMs / T.scopeChargeMs);
        else this.charge = Math.max(0, this.charge - dtMs / (near ? 400 : 150));
        if (this.charge >= 1) {
          triggers.push({ x: this.aim.x, y: this.aim.y });
          this.charge = 0;
          this.lockUntil = now + 700;
        }
        break;
      }
      case 'throw': {
        if (hand && hand.y < body.center.y - 0.25 * body.sw) {
          this.armedAt = now;
          this.armedAim = { x: clamp((hand.x - body.center.x) / body.sw / 1.4, -1, 1), y: clamp(0.05 + (body.center.y - hand.y) / body.sw / 3, -0.1, 0.35) };
        }
        const armed = this.armedAt >= 0 && now - this.armedAt < T.throwWindowMs;
        this.charge = armed ? 1 : 0;
        if (armed && !locked && vy >= T.throwDown && hand && hand.y > body.center.y - 0.35 * body.sw) {
          triggers.push({ ...this.armedAim });
          this.armedAt = -1;
          this.charge = 0;
          this.lockUntil = now + 500;
        }
        break;
      }
      case 'push': {
        const shouldered = !!hand && reach < 0.8;
        if (shouldered && !locked) this.charge = Math.min(1, this.charge + dtMs / T.pushChargeMs);
        else if (this.charge < 1) this.charge = Math.max(0, this.charge - dtMs / 500);
        if (this.charge >= 1 && !locked && hand && vReach >= T.pushOut && reach > 0.95) {
          triggers.push({ x: this.aim.x, y: this.aim.y });
          this.charge = 0;
          this.lockUntil = now + 800;
        } else if (this.charge >= 1 && !shouldered && reach > 1.6) {
          this.charge = 0;
        }
        break;
      }
    }

    if (!boxingGesture) {
      if (isBlocking) boxingGesture = 'block';
      else if (isDodging) boxingGesture = 'dodge';
    }

    // --- Camera Perspective Toggle Gesture (Temple touch or hands raised) ---
    let cameraToggle = false;
    const templeTouch = !!nose && nose.v > 0.35 && (
      (l && Math.abs(l.y - nose.y) < 0.45 * body.sw && Math.abs(l.x - nose.x) < 0.85 * body.sw) ||
      (r && Math.abs(r.y - nose.y) < 0.45 * body.sw && Math.abs(r.x - nose.x) < 0.85 * body.sw)
    );
    const handsUp = !!l && !!r && l.y < ls.y - 0.45 * body.sw && r.y < rs.y - 0.45 * body.sw;
    const isToggleGesture = templeTouch || handsUp;

    if (isToggleGesture) {
      this.cameraToggleHold += dtMs;
      if (this.cameraToggleHold >= 300 && now >= this.cameraToggleCooldown) {
        cameraToggle = true;
        this.cameraToggleCooldown = now + 1400;
        this.cameraToggleHold = 0;
      }
    } else {
      this.cameraToggleHold = Math.max(0, this.cameraToggleHold - dtMs * 2);
    }

    return {
      tracked: true,
      speed,
      aim: { x: this.aim.x, y: this.aim.y },
      peek,
      lean: clamp(lean / 0.55, -1, 1),
      crouch,
      held,
      charge: this.charge,
      triggers,
      cameraToggle,
      punchHand,
      boxingGesture,
      isBlocking,
      isDodging,
      punchType,
    };
  }

  /** Keyboard / mouse version: the same controls without the camera. */
  private fromKeys(now: number, dtMs: number, k: KeyState): MadControls {
    const k1 = 1 - Math.exp(-Math.max(dtMs, 1) / 60);
    this.aim.x += (k.aim.x - this.aim.x) * k1;
    this.aim.y += (k.aim.y - this.aim.y) * k1;
    const triggers: Trigger[] = [];
    let punchHand: 'left' | 'right' | null = null;
    let punchType: 'jab' | 'punch' | null = null;
    let boxingGesture: 'jab' | 'punch' | 'block' | 'dodge' | null = null;

    const isBlocking = !!(k.block || k.hold);
    const isDodging = !!(k.crouch || k.left || k.right);

    if (k.fire && now >= this.lockUntil) {
      triggers.push({ x: this.aim.x, y: this.aim.y });
      punchHand = k.jab ? 'left' : this.keyPunchAlternate ? 'left' : 'right';
      punchType = k.jab ? 'jab' : 'punch';
      boxingGesture = punchType;
      this.keyPunchAlternate = !this.keyPunchAlternate;
      this.lockUntil = now + (punchType === 'jab' ? 120 : 180);
    } else if (isBlocking) {
      boxingGesture = 'block';
    } else if (isDodging) {
      boxingGesture = 'dodge';
    }
    this.charge = k.charge ? Math.min(1, this.charge + dtMs / 600) : Math.max(0, this.charge - dtMs / 300);
    const peek: -1 | 0 | 1 = k.left ? -1 : k.right ? 1 : 0;
    const cameraToggle = !!k.cameraToggle;
    return {
      tracked: true,
      speed: k.run ? 1 : 0,
      aim: { ...this.aim },
      peek,
      lean: peek,
      crouch: k.crouch,
      held: k.hold,
      charge: this.charge,
      triggers,
      cameraToggle,
      punchHand,
      boxingGesture,
      isBlocking,
      isDodging,
      punchType,
    };
  }

  private sampleAgo(now: number, ms: number): Sample | null {
    for (let i = this.hand.length - 1; i >= 0; i--) {
      const s = this.hand[i] as Sample;
      if (now - s.t >= ms) return s;
    }
    return this.hand[0] ?? null;
  }

  private sampleAgoL(now: number, ms: number): Sample | null {
    for (let i = this.handL.length - 1; i >= 0; i--) {
      const s = this.handL[i] as Sample;
      if (now - s.t >= ms) return s;
    }
    return this.handL[0] ?? null;
  }

  private sampleAgoR(now: number, ms: number): Sample | null {
    for (let i = this.handR.length - 1; i >= 0; i--) {
      const s = this.handR[i] as Sample;
      if (now - s.t >= ms) return s;
    }
    return this.handR[0] ?? null;
  }

  private aimAgo(now: number, ms: number): Trigger {
    for (let i = this.aimTrail.length - 1; i >= 0; i--) {
      const s = this.aimTrail[i] as { t: number; x: number; y: number };
      if (now - s.t >= ms) return { x: s.x, y: s.y };
    }
    const first = this.aimTrail[0];
    return first ? { x: first.x, y: first.y } : { ...this.aim };
  }
}

