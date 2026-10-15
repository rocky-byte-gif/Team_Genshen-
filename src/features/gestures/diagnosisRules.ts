import { GESTURE_CONFIG } from '../../config/gesture.config';
import type { BodyPart } from '../tracking/landmarks';
import type { Baseline } from './calibration';
import type { BodyFeatures } from './FeatureExtractor';
import type { Classification, GestureReading } from './GestureClassifier';
import type { Arrow, ControlScheme, ExpectedMotion } from './types';

/**
 * correct — the expected motion is recognised
 * near    — right motion, not enough of it (e.g. hands at 80% height)
 * wrong   — the motion is performed incorrectly (one hand, wrong direction…)
 * other   — the user performs a DIFFERENT gesture than expected
 * idle    — no attempt yet; we only show a cue, never an error
 */
export type Verdict = 'correct' | 'near' | 'wrong' | 'other' | 'idle';

export interface RuleContext {
  expected: ExpectedMotion;
  scheme: ControlScheme;
  f: BodyFeatures;
  c: Classification;
  baseline: Baseline;
  /** Reading of the expected gesture (null for CENTER). */
  reading: GestureReading | null;
  /** -1 = left, 1 = right, 0 = n/a — for lateral wording. */
  dir: -1 | 0 | 1;
  /** Sideways offset of the body in this scheme (hips when standing, shoulders when seated), SW. */
  lateral: number;
}

export interface RuleOutput {
  message: string;
  focus: BodyPart[];
  arrow: Arrow | null;
}

export interface DiagnosisRule {
  id: string;
  expects: readonly ExpectedMotion[];
  /** Control schemes the rule applies to (default: both). */
  schemes?: readonly ControlScheme[];
  /** Higher = evaluated first. The first matching rule wins. */
  priority: number;
  verdict: Verdict;
  when: (ctx: RuleContext) => boolean;
  build: (ctx: RuleContext) => RuleOutput;
}

const LEAN = GESTURE_CONFIG.lean;
const JUMP = GESTURE_CONFIG.jump;
const CROUCH = GESTURE_CONFIG.crouch;
const BODY = GESTURE_CONFIG.body;

const SEATED = ['seated'] as const;
const STANDING = ['body'] as const;
const LEANS = ['LEAN_LEFT', 'LEAN_RIGHT'] as const;

const toward = (dir: number) => (dir < 0 ? 'left' : 'right');
const further = (dir: number) => (dir < 0 ? 'further left' : 'further right');
const sideArrow = (dir: number): Arrow => (dir < 0 ? 'left' : 'right');
const body = (ctx: RuleContext) => ctx.scheme === 'body';
/** Two players at one camera: lanes follow the shoulders, so a lean counts as much as a step. */
const leanOrStep = (ctx: RuleContext) => body(ctx) && ctx.baseline.laneFrom === 'shoulders';
/** How to move sideways: "step" (standing, whole body) or "lean" (seated, or two players). */
const move = (ctx: RuleContext) => (body(ctx) && !leanOrStep(ctx) ? 'step' : 'lean');
const lateralFocus = (ctx: RuleContext): BodyPart[] => (body(ctx) && !leanOrStep(ctx) ? ['hips', 'legs'] : ['shoulders', 'torso']);
const legsFocus: BodyPart[] = ['hips', 'legs'];

/** Lateral shift toward the requested side, in SW (scheme-aware). */
const towardShift = (ctx: RuleContext) => ctx.dir * ctx.lateral;
const metric = (ctx: RuleContext) => ctx.reading?.metric ?? 0;
const near = (ctx: RuleContext) => ctx.reading?.thresholds.near ?? 0;

const lowerHand = (f: BodyFeatures) => (f.leftHandLiftEffective <= f.rightHandLiftEffective ? 'left' : 'right');
const higherLift = (f: BodyFeatures) => Math.max(f.leftHandLiftEffective, f.rightHandLiftEffective);
const lowerLift = (f: BodyFeatures) => Math.min(f.leftHandLiftEffective, f.rightHandLiftEffective);
const armPart = (side: 'left' | 'right'): BodyPart => (side === 'left' ? 'leftArm' : 'rightArm');
const handName = (side: 'left' | 'right') => (side === 'left' ? 'left arm' : 'right arm');
const handNameNom = (side: 'left' | 'right') => (side === 'left' ? 'Left' : 'Right');

/**
 * Rule table: condition → diagnosis → instruction → priority.
 * Every condition reads real landmark-derived features; the instruction names
 * the body part, the direction and (via the metric bar) how much is missing.
 */
export const DIAGNOSIS_RULES: readonly DiagnosisRule[] = [
  // ─── JUMP ────────────────────────────────────────────────────────────
  {
    id: 'JUMP_OK',
    expects: ['JUMP'],
    priority: 100,
    verdict: 'correct',
    when: (ctx) => ctx.c.readings.JUMP.active,
    build: (ctx) =>
      body(ctx)
        ? { message: 'Jump landed!', focus: legsFocus, arrow: null }
        : { message: 'Jump detected — arms above head!', focus: ['leftArm', 'rightArm'], arrow: null },
  },
  {
    id: 'JUMP_DOING_CROUCH',
    expects: ['JUMP'],
    priority: 90,
    verdict: 'other',
    when: (ctx) => ctx.c.readings.CROUCH.active && (body(ctx) ? metric(ctx) < near(ctx) : higherLift(ctx.f) < JUMP.near),
    build: (ctx) =>
      body(ctx)
        ? { message: 'That is a squat. Push off and jump up', focus: legsFocus, arrow: 'up' }
        : { message: 'That is a squat. Stand up and raise both arms to jump', focus: ['leftArm', 'rightArm'], arrow: 'up' },
  },
  {
    id: 'JUMP_ARMS_ONLY',
    expects: ['JUMP'],
    schemes: STANDING,
    priority: 85,
    verdict: 'other',
    when: (ctx) => higherLift(ctx.f) >= BODY.jump.armsOnlyLift && metric(ctx) < near(ctx),
    build: () => ({ message: 'Arms alone do not count — jump with your whole body!', focus: legsFocus, arrow: 'up' }),
  },
  {
    id: 'JUMP_TOO_LOW',
    expects: ['JUMP'],
    schemes: STANDING,
    priority: 60,
    verdict: 'near',
    when: (ctx) => metric(ctx) >= near(ctx),
    build: () => ({ message: 'Jump is too low — push off harder', focus: legsFocus, arrow: 'up' }),
  },
  {
    id: 'JUMP_HANDS_OUT_OF_FRAME',
    expects: ['JUMP'],
    schemes: SEATED,
    priority: 85,
    verdict: 'near',
    when: (ctx) =>
      !ctx.f.leftWristVisible &&
      !ctx.f.rightWristVisible &&
      Math.max(ctx.f.leftElbowLift, ctx.f.rightElbowLift) > 0 &&
      !ctx.c.readings.JUMP.active,
    build: () => ({ message: 'Wrists leave top of frame — take a step back', focus: ['leftArm', 'rightArm'], arrow: null }),
  },
  {
    id: 'JUMP_ONE_HAND',
    expects: ['JUMP'],
    schemes: SEATED,
    priority: 80,
    verdict: 'wrong',
    when: (ctx) => higherLift(ctx.f) >= JUMP.activation && lowerLift(ctx.f) < JUMP.near,
    build: (ctx) => {
      const side = lowerHand(ctx.f);
      return { message: `Raise your ${handName(side)} too — both arms must be above your head`, focus: [armPart(side)], arrow: 'up' };
    },
  },
  {
    id: 'JUMP_ONE_HAND_LOW',
    expects: ['JUMP'],
    schemes: SEATED,
    priority: 75,
    verdict: 'near',
    when: (ctx) => higherLift(ctx.f) >= JUMP.activation && lowerLift(ctx.f) >= JUMP.near,
    build: (ctx) => {
      const side = lowerHand(ctx.f);
      return { message: `${handNameNom(side)} arm is too low — raise it above your head`, focus: [armPart(side)], arrow: 'up' };
    },
  },
  {
    id: 'JUMP_ELBOWS_BENT',
    expects: ['JUMP'],
    schemes: SEATED,
    priority: 70,
    verdict: 'near',
    when: (ctx) =>
      lowerLift(ctx.f) >= JUMP.near &&
      Math.min(ctx.f.leftElbowAngle, ctx.f.rightElbowAngle) < JUMP.bentElbowDeg &&
      ctx.f.leftWristVisible &&
      ctx.f.rightWristVisible,
    build: (ctx) => {
      const bentLeft = ctx.f.leftElbowAngle < JUMP.bentElbowDeg;
      const bentRight = ctx.f.rightElbowAngle < JUMP.bentElbowDeg;
      const focus: BodyPart[] = bentLeft && bentRight ? ['leftArm', 'rightArm'] : [bentLeft ? 'leftArm' : 'rightArm'];
      const which = bentLeft && bentRight ? 'Arms bent at elbows' : `${bentLeft ? 'Left' : 'Right'} arm bent`;
      return { message: `${which} — extend them straight up above your head`, focus, arrow: 'up' };
    },
  },
  {
    id: 'JUMP_HANDS_LOW',
    expects: ['JUMP'],
    schemes: SEATED,
    priority: 60,
    verdict: 'near',
    when: (ctx) => lowerLift(ctx.f) >= JUMP.near,
    build: (ctx) => ({
      message: lowerLift(ctx.f) < 0.12 ? 'Arms at shoulder level — raise them above your head' : 'Almost! Reach higher with your arms',
      focus: ['leftArm', 'rightArm'],
      arrow: 'up',
    }),
  },
  {
    id: 'JUMP_IDLE',
    expects: ['JUMP'],
    priority: 0,
    verdict: 'idle',
    when: () => true,
    build: (ctx) =>
      body(ctx)
        ? { message: 'Jump up — leave the floor', focus: legsFocus, arrow: 'up' }
        : { message: 'Raise both arms above your head', focus: ['leftArm', 'rightArm'], arrow: 'up' },
  },

  // ─── SIDEWAYS (step when standing, lean when seated) ─────────────────
  {
    id: 'LEAN_OK',
    expects: LEANS,
    priority: 100,
    verdict: 'correct',
    when: (ctx) => ctx.reading?.active === true,
    build: (ctx) => ({
      message: body(ctx) ? `Got it! You are in the ${ctx.dir < 0 ? 'left' : 'right'} lane` : `Got it! Hold lean to the ${toward(ctx.dir)}`,
      focus: lateralFocus(ctx),
      arrow: null,
    }),
  },
  {
    id: 'LEAN_WRONG_DIRECTION',
    expects: LEANS,
    priority: 90,
    verdict: 'wrong',
    when: (ctx) => towardShift(ctx) <= -near(ctx) * 1.5,
    build: (ctx) => ({
      message: `Wrong direction — ${move(ctx)} ${toward(ctx.dir).toUpperCase()}`,
      focus: lateralFocus(ctx),
      arrow: sideArrow(ctx.dir),
    }),
  },
  {
    id: 'LEAN_DOING_CROUCH',
    expects: LEANS,
    priority: 85,
    verdict: 'other',
    when: (ctx) => ctx.c.readings.CROUCH.active && towardShift(ctx) < near(ctx),
    build: (ctx) => ({
      message: `No need to squat — ${move(ctx)} ${toward(ctx.dir)}`,
      focus: lateralFocus(ctx),
      arrow: sideArrow(ctx.dir),
    }),
  },
  {
    id: 'LEAN_DOING_JUMP',
    expects: LEANS,
    priority: 84,
    verdict: 'other',
    when: (ctx) => ctx.c.readings.JUMP.active && towardShift(ctx) < near(ctx),
    build: (ctx) => ({
      message: body(ctx) ? `No need to jump — ${move(ctx)} ${toward(ctx.dir)}` : `Arms will not help here — lean ${toward(ctx.dir)}`,
      focus: lateralFocus(ctx),
      arrow: sideArrow(ctx.dir),
    }),
  },
  {
    id: 'LEAN_SHOULDERS_ONLY',
    expects: LEANS,
    schemes: STANDING,
    priority: 80,
    verdict: 'wrong',
    when: (ctx) => !leanOrStep(ctx) && ctx.dir * ctx.f.leanX >= BODY.step.shouldersOnlyShift && towardShift(ctx) < near(ctx),
    build: (ctx) => ({
      message: `Only shoulders are moving — step ${toward(ctx.dir)} with your whole body`,
      focus: ['hips', 'legs', 'shoulders'],
      arrow: sideArrow(ctx.dir),
    }),
  },
  {
    id: 'LEAN_HEAD_ONLY',
    expects: LEANS,
    schemes: SEATED,
    priority: 80,
    verdict: 'wrong',
    when: (ctx) => ctx.dir * ctx.f.headX >= LEAN.headOnlyHeadShift && towardShift(ctx) < LEAN.headOnlyShoulderShift,
    build: (ctx) => ({
      message: `Only head is tilting — shift shoulders ${toward(ctx.dir)} with your torso`,
      focus: ['shoulders', 'head'],
      arrow: sideArrow(ctx.dir),
    }),
  },
  {
    id: 'LEAN_TURNED',
    expects: LEANS,
    priority: 75,
    verdict: 'wrong',
    when: (ctx) => ctx.f.scaleRatio < LEAN.turnedScaleRatio,
    build: (ctx) => ({
      message: `You turned sideways — face the camera and ${move(ctx)} ${toward(ctx.dir)}`,
      focus: ['shoulders'],
      arrow: sideArrow(ctx.dir),
    }),
  },
  {
    id: 'LEAN_INSUFFICIENT',
    expects: LEANS,
    priority: 60,
    verdict: 'near',
    when: (ctx) => towardShift(ctx) >= near(ctx),
    build: (ctx) => ({
      message: leanOrStep(ctx)
        ? `A bit ${further(ctx.dir)} — lean more`
        : body(ctx)
          ? `Step ${further(ctx.dir)} — whole body`
          : `Lean is not enough — shift ${further(ctx.dir)}`,
      focus: lateralFocus(ctx),
      arrow: sideArrow(ctx.dir),
    }),
  },
  {
    id: 'LEAN_IDLE',
    expects: LEANS,
    priority: 0,
    verdict: 'idle',
    when: () => true,
    build: (ctx) => ({
      message: leanOrStep(ctx)
        ? `Lean or step ${toward(ctx.dir)}`
        : body(ctx)
          ? `Step ${toward(ctx.dir)} with your whole body`
          : `Lean your upper body ${toward(ctx.dir)}`,
      focus: lateralFocus(ctx),
      arrow: sideArrow(ctx.dir),
    }),
  },

  // ─── CROUCH / SQUAT ──────────────────────────────────────────────────
  {
    id: 'CROUCH_OK',
    expects: ['CROUCH'],
    priority: 100,
    verdict: 'correct',
    when: (ctx) => ctx.c.readings.CROUCH.active,
    build: () => ({ message: 'Great — you are under the beam!', focus: ['hips', 'torso'], arrow: null }),
  },
  {
    id: 'CROUCH_DOING_JUMP',
    expects: ['CROUCH'],
    priority: 90,
    verdict: 'other',
    when: (ctx) => ctx.c.readings.JUMP.active || (!body(ctx) && higherLift(ctx.f) >= JUMP.activation),
    build: (ctx) =>
      body(ctx)
        ? { message: 'Do not jump — squat and lower your hips', focus: legsFocus, arrow: 'down' }
        : { message: 'Arms down — duck under the beam instead of jumping', focus: ['leftArm', 'rightArm'], arrow: 'down' },
  },
  {
    id: 'CROUCH_BOW',
    expects: ['CROUCH'],
    schemes: STANDING,
    priority: 80,
    verdict: 'wrong',
    when: (ctx) => ctx.f.crouchDepth >= BODY.squat.bowShoulderDrop && metric(ctx) < near(ctx),
    build: () => ({ message: 'Do not bow — bend your knees and lower your hips', focus: legsFocus, arrow: 'down' }),
  },
  {
    id: 'CROUCH_HEAD_ONLY',
    expects: ['CROUCH'],
    schemes: SEATED,
    priority: 80,
    verdict: 'wrong',
    when: (ctx) => ctx.f.noseDrop >= CROUCH.headOnlyNoseDrop && ctx.f.crouchDepth < CROUCH.near,
    build: () => ({ message: 'Only head is lowering — duck with your whole upper body', focus: ['head', 'shoulders'], arrow: 'down' }),
  },
  {
    id: 'CROUCH_OFF_CENTER',
    expects: ['CROUCH'],
    priority: 75,
    verdict: 'wrong',
    when: (ctx) =>
      metric(ctx) >= near(ctx) && Math.abs(ctx.lateral) >= (body(ctx) ? BODY.squat.maxLateralDrift : CROUCH.maxLateralDrift),
    build: () => ({ message: 'Squat lower while staying centered', focus: ['torso', 'hips'], arrow: 'down' }),
  },
  {
    id: 'CROUCH_INSUFFICIENT',
    expects: ['CROUCH'],
    priority: 60,
    verdict: 'near',
    when: (ctx) => metric(ctx) >= near(ctx),
    build: (ctx) =>
      body(ctx)
        ? { message: 'Squat deeper — lower your hips', focus: legsFocus, arrow: 'down' }
        : { message: 'Duck deeper — a little lower', focus: ['shoulders', 'torso'], arrow: 'down' },
  },
  {
    id: 'CROUCH_IDLE',
    expects: ['CROUCH'],
    priority: 0,
    verdict: 'idle',
    when: () => true,
    build: (ctx) =>
      body(ctx)
        ? { message: 'Squat down — lower your hips', focus: legsFocus, arrow: 'down' }
        : { message: 'Duck down — lower your shoulders', focus: ['hips', 'torso'], arrow: 'down' },
  },

  // ─── CENTER (return to neutral) ──────────────────────────────────────
  {
    id: 'CENTER_OK',
    expects: ['CENTER'],
    priority: 100,
    verdict: 'correct',
    when: (ctx) => Math.abs(ctx.lateral) < GESTURE_CONFIG.center.tolerance,
    build: (ctx) => ({ message: 'Right in the center — keep it up', focus: lateralFocus(ctx), arrow: null }),
  },
  {
    id: 'CENTER_OFF',
    expects: ['CENTER'],
    priority: 50,
    verdict: 'wrong',
    when: () => true,
    build: (ctx) => ({
      message: leanOrStep(ctx)
        ? 'Return to center — stay in your spot'
        : body(ctx)
          ? `Return to center — step ${ctx.lateral < 0 ? 'right' : 'left'}`
          : `Return torso to center — Move ${ctx.lateral < 0 ? 'right' : 'left'}`,
      focus: lateralFocus(ctx),
      arrow: ctx.lateral < 0 ? 'right' : 'left',
    }),
  },
];

/** Caption of the live progress meter for the expected motion. */
export function metricCaption(expected: ExpectedMotion, scheme: ControlScheme): string {
  switch (expected) {
    case 'JUMP':
      return scheme === 'body' ? 'Jump height' : 'Arm height';
    case 'LEAN_LEFT':
    case 'LEAN_RIGHT':
      return scheme === 'body' ? 'Sidestep' : 'Torso lean';
    case 'CROUCH':
      return 'Squat depth';
    case 'CENTER':
      return 'Centering';
  }
}
