import { clamp, distance, midpoint, type Point } from '../../lib/math/geometry';
import { LM, lm, type Pose } from '../tracking/landmarks';
import type { CombatGesture, FighterState } from './types';

interface HandSample {
  t: number;
  pt: Point | null;
  reach: number; // distance from shoulder in shoulder widths
}

export interface PlayerInputResult {
  gesture: CombatGesture;
  punchHand: 'left' | 'right' | null;
  isBlocking: boolean;
  isDodging: boolean;
  dodgeType: 'squat' | 'slip' | null;
  armExtension: number;
  bodySquatY: number;
  bodySlipX: number;
  moveX: number; // -1 to +1 intentional lateral movement
}

export class FighterGestureTracker {
  private readonly playerId: 0 | 1;
  private handL: HandSample[] = [];
  private handR: HandSample[] = [];
  private baselineY: number | null = null;
  private baselineX: number | null = null;
  private baselineSw: number | null = null;
  private smoothedDx = 0;
  private blockHoldUntil = 0;
  private lockUntil = 0;

  constructor(playerId: 0 | 1) {
    this.playerId = playerId;
  }

  reset(): void {
    this.handL = [];
    this.handR = [];
    this.baselineY = null;
    this.baselineX = null;
    this.baselineSw = null;
    this.smoothedDx = 0;
    this.blockHoldUntil = 0;
    this.lockUntil = 0;
  }

  private sampleAgo(samples: HandSample[], now: number, msAgo: number): HandSample | null {
    const target = now - msAgo;
    for (let i = samples.length - 1; i >= 0; i--) {
      const s = samples[i];
      if (s && s.t <= target) return s;
    }
    return samples[0] ?? null;
  }

  update(
    pose: Pose | null,
    now: number,
    dtMs: number,
    keys: {
      moveLeft?: boolean;
      moveRight?: boolean;
      jab?: boolean;
      punch?: boolean;
      block?: boolean;
      dodgeSquat?: boolean;
      dodgeSlip?: boolean;
      kick?: boolean;
    }
  ): PlayerInputResult {
    const keyMoveX = keys.moveLeft ? -1 : keys.moveRight ? 1 : 0;

    // 1. Keyboard overrides for testing / accessibility
    if (keys.block) {
      return {
        gesture: 'block',
        punchHand: null,
        isBlocking: true,
        isDodging: false,
        dodgeType: null,
        armExtension: 0.2,
        bodySquatY: 0,
        bodySlipX: 0,
        moveX: keyMoveX,
      };
    }
    if (keys.dodgeSquat) {
      return {
        gesture: 'dodge',
        punchHand: null,
        isBlocking: false,
        isDodging: true,
        dodgeType: 'squat',
        armExtension: 0,
        bodySquatY: 0.6,
        bodySlipX: 0,
        moveX: keyMoveX,
      };
    }
    if (keys.dodgeSlip) {
      return {
        gesture: 'dodge',
        punchHand: null,
        isBlocking: false,
        isDodging: true,
        dodgeType: 'slip',
        armExtension: 0,
        bodySquatY: 0.1,
        bodySlipX: this.playerId === 0 ? -0.4 : 0.4,
        moveX: keyMoveX || (this.playerId === 0 ? -0.7 : 0.7),
      };
    }
    if (keys.punch && now > this.lockUntil) {
      this.lockUntil = now + 240;
      return {
        gesture: 'punch',
        punchHand: 'right',
        isBlocking: false,
        isDodging: false,
        dodgeType: null,
        armExtension: 0.95,
        bodySquatY: 0,
        bodySlipX: 0,
        moveX: keyMoveX,
      };
    }
    if (keys.jab && now > this.lockUntil) {
      this.lockUntil = now + 160;
      return {
        gesture: 'jab',
        punchHand: 'left',
        isBlocking: false,
        isDodging: false,
        dodgeType: null,
        armExtension: 0.7,
        bodySquatY: 0,
        bodySlipX: 0,
        moveX: keyMoveX,
      };
    }
    if (keys.kick && now > this.lockUntil) {
      this.lockUntil = now + 260;
      return {
        gesture: 'kick',
        punchHand: null,
        isBlocking: false,
        isDodging: false,
        dodgeType: null,
        armExtension: 0.3,
        bodySquatY: 0,
        bodySlipX: 0,
        moveX: keyMoveX,
      };
    }

    // 2. Pose tracking from webcam
    if (!pose) {
      return {
        gesture: null,
        punchHand: null,
        isBlocking: false,
        isDodging: false,
        dodgeType: null,
        armExtension: 0,
        bodySquatY: 0,
        bodySlipX: 0,
        moveX: keyMoveX,
      };
    }

    const ls = lm(pose, LM.LEFT_SHOULDER);
    const rs = lm(pose, LM.RIGHT_SHOULDER);
    if (Math.min(ls.v, rs.v) < 0.4) {
      return {
        gesture: null,
        punchHand: null,
        isBlocking: false,
        isDodging: false,
        dodgeType: null,
        armExtension: 0,
        bodySquatY: 0,
        bodySlipX: 0,
        moveX: keyMoveX,
      };
    }

    const sw = Math.max(1e-3, distance(ls, rs));
    const sc = midpoint(ls, rs);
    const lw = lm(pose, LM.LEFT_WRIST);
    const rw = lm(pose, LM.RIGHT_WRIST);
    const lh = lw.v > 0.4 ? { x: lw.x, y: lw.y } : null;
    const rh = rw.v > 0.4 ? { x: rw.x, y: rw.y } : null;

    // Stable baseline initialization (calibrated anchor)
    if (this.baselineY === null || this.baselineX === null || this.baselineSw === null) {
      this.baselineY = sc.y;
      this.baselineX = sc.x;
      this.baselineSw = sw;
    }

    // Calculate vertical offset (squat depth) relative to standing baseline
    const dy = (sc.y - this.baselineY) / sw; // positive = lowered down (squat)
    const isSquat = dy >= 0.22;

    // Only adapt baseline Y when standing upright (never when squatting!)
    if (Math.abs(sc.y - this.baselineY) < 0.08 * sw && !isSquat) {
      const ky = 1 - Math.exp(-Math.max(1, dtMs) / 3500);
      this.baselineY += (sc.y - this.baselineY) * ky;
      this.baselineSw += (sw - this.baselineSw) * ky;
    }

    // Calculate lateral movement with deadband and smoothing filter
    const rawDx = (sc.x - this.baselineX) / sw;
    const deadband = 0.045; // filter out sensor noise
    let filteredDx = 0;
    if (Math.abs(rawDx) > deadband) {
      filteredDx = clamp((rawDx - Math.sign(rawDx) * deadband) / 0.42, -1, 1);
    }
    // Fast, responsive low-pass filter (45ms time constant) for jitter-free, zero-lag movement
    const kx = 1 - Math.exp(-Math.max(1, dtMs) / 45);
    this.smoothedDx += (filteredDx - this.smoothedDx) * kx;

    const isSlip = Math.abs(this.smoothedDx) >= 0.45;
    const isDodging = isSquat || isSlip;
    const dodgeType = isSquat ? 'squat' : isSlip ? 'slip' : null;

    // Hand reaches from shoulders
    const reachL = lh ? distance(lh, ls) / sw : 0;
    const reachR = rh ? distance(rh, rs) / sw : 0;
    const maxReach = Math.max(reachL, reachR);

    this.handL.push({ t: now, pt: lh, reach: reachL });
    this.handR.push({ t: now, pt: rh, reach: reachR });
    while (this.handL.length > 0 && now - (this.handL[0]?.t ?? 0) > 400) this.handL.shift();
    while (this.handR.length > 0 && now - (this.handR[0]?.t ?? 0) > 400) this.handR.shift();

    // High Guard (Block): Both hands raised near chest/chin/neck and held close together
    const guardPoseDetected = !!(
      lh &&
      rh &&
      lh.y < ls.y + 0.28 * sw &&
      rh.y < rs.y + 0.28 * sw &&
      distance(lh, rh) < 1.15 * sw &&
      Math.abs((lh.x + rh.x) / 2 - sc.x) < 0.75 * sw
    );

    if (guardPoseDetected) {
      this.blockHoldUntil = now + 90; // guard hysteresis buffer to prevent flicker
    }
    const isBlocking = guardPoseDetected || now < this.blockHoldUntil;

    let gesture: CombatGesture = null;
    let punchHand: 'left' | 'right' | null = null;

    if (isBlocking) {
      gesture = 'block';
    } else if (isDodging) {
      gesture = 'dodge';
    } else if (now > this.lockUntil) {
      // Compute velocities
      const oldL = this.sampleAgo(this.handL, now, 85);
      const curL = this.handL[this.handL.length - 1];
      const dtL = oldL && curL ? (curL.t - oldL.t) / 1000 : 0;
      let vL = 0;
      let vReachL = 0;
      if (oldL && curL && dtL > 0.02 && oldL.pt && curL.pt) {
        vL = distance(curL.pt, oldL.pt) / dtL / sw;
        vReachL = (curL.reach - oldL.reach) / dtL;
      }

      const oldR = this.sampleAgo(this.handR, now, 85);
      const curR = this.handR[this.handR.length - 1];
      const dtR = oldR && curR ? (curR.t - oldR.t) / 1000 : 0;
      let vR = 0;
      let vReachR = 0;
      if (oldR && curR && dtR > 0.02 && oldR.pt && curR.pt) {
        vR = distance(curR.pt, oldR.pt) / dtR / sw;
        vReachR = (curR.reach - oldR.reach) / dtR;
      }

      const punchThreshold = 1.6;
      const reachThreshold = 0.95;
      const punchL = (vL >= punchThreshold || vReachL >= reachThreshold) && reachL > 0.38;
      const punchR = (vR >= punchThreshold || vReachR >= reachThreshold) && reachR > 0.38;

      if (punchL || punchR) {
        punchHand = punchL && (!punchR || vL >= vR) ? 'left' : 'right';
        const vThrust = punchHand === 'left' ? Math.max(vL, vReachL) : Math.max(vR, vReachR);
        const reachVal = punchHand === 'left' ? reachL : reachR;

        // Heavy power punch cross: deep arm extension or heavy velocity
        const isHeavy = vThrust >= 2.1 || reachVal >= 0.58;
        gesture = isHeavy ? 'punch' : 'jab';
        this.lockUntil = now + (gesture === 'jab' ? 160 : 220);
      }
    }

    const finalMoveX = keyMoveX !== 0 ? keyMoveX : clamp(this.smoothedDx, -1, 1);

    return {
      gesture,
      punchHand,
      isBlocking,
      isDodging,
      dodgeType,
      armExtension: clamp(maxReach / 0.8, 0, 1),
      bodySquatY: clamp(dy / 0.45, 0, 1),
      bodySlipX: clamp(rawDx, -1, 1),
      moveX: finalMoveX,
    };
  }
}

/**
 * Intelligent Shadow Ninja AI Opponent for solo play or CPU rival.
 */
export class ShadowBotAI {
  private nextAttackAt = 0;
  private actionCooldown = 0;
  private moveDirection: -1 | 0 | 1 = 0;
  private nextMoveChangeAt = 0;

  reset(now: number): void {
    this.nextAttackAt = now + 1200 + Math.random() * 800;
    this.actionCooldown = 0;
    this.moveDirection = 0;
    this.nextMoveChangeAt = now + 500;
  }

  update(
    bot: FighterState,
    opponent: FighterState,
    now: number,
    _dtMs: number
  ): {
    gesture: CombatGesture;
    punchHand: 'left' | 'right' | null;
    isBlocking: boolean;
    isDodging: boolean;
    dodgeType: 'squat' | 'slip' | null;
    moveX: number;
  } {
    if (bot.hp <= 0 || bot.action === 'ko') {
      return { gesture: null, punchHand: null, isBlocking: false, isDodging: false, dodgeType: null, moveX: 0 };
    }

    // AI tactical positioning: maintains optimal combat distance
    const dist = Math.abs(bot.x - opponent.x);
    if (now >= this.nextMoveChangeAt) {
      this.nextMoveChangeAt = now + 400 + Math.random() * 600;
      if (dist > 0.48) {
        // Step forward towards opponent
        this.moveDirection = (opponent.x > bot.x ? 1 : -1);
      } else if (dist < 0.28) {
        // Step back slightly
        this.moveDirection = (opponent.x > bot.x ? -1 : 1);
      } else {
        // Micro bobbing
        this.moveDirection = (Math.random() < 0.3 ? (opponent.x > bot.x ? 1 : -1) : 0);
      }
    }

    // Reaction to opponent: if opponent is winding up a punch, chance to block or duck!
    if (opponent.action === 'punch' || opponent.action === 'jab') {
      const reactRoll = Math.random();
      if (reactRoll < 0.45) {
        // High guard block
        return { gesture: 'block', punchHand: null, isBlocking: true, isDodging: false, dodgeType: null, moveX: 0 };
      } else if (reactRoll < 0.75) {
        // Squat duck under
        return { gesture: 'dodge', punchHand: null, isBlocking: false, isDodging: true, dodgeType: 'squat', moveX: 0 };
      }
    }

    // Offensive attacks when in range
    if (now >= this.nextAttackAt && now >= this.actionCooldown && dist <= 0.52) {
      const isPower = Math.random() < 0.4;
      const gesture: CombatGesture = isPower ? 'punch' : 'jab';
      const punchHand: 'left' | 'right' = Math.random() < 0.5 ? 'left' : 'right';
      this.actionCooldown = now + (isPower ? 600 : 380);
      this.nextAttackAt = now + 1100 + Math.random() * 1200;
      return {
        gesture,
        punchHand,
        isBlocking: false,
        isDodging: false,
        dodgeType: null,
        moveX: this.moveDirection,
      };
    }

    // Occasional defensive guard / stance
    if (Math.random() < 0.015 && now >= this.actionCooldown) {
      return {
        gesture: 'block',
        punchHand: null,
        isBlocking: true,
        isDodging: false,
        dodgeType: null,
        moveX: 0,
      };
    }

    return {
      gesture: null,
      punchHand: null,
      isBlocking: false,
      isDodging: false,
      dodgeType: null,
      moveX: this.moveDirection,
    };
  }
}
