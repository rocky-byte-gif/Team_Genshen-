import type { BodyPart } from '../tracking/landmarks';

export const GESTURE_TYPES = ['LEAN_LEFT', 'LEAN_RIGHT', 'JUMP', 'CROUCH'] as const;
export type GestureType = (typeof GESTURE_TYPES)[number];

/**
 * Gestures live on two independent channels so they can combine naturally:
 * you can stay leaned into the left lane AND raise your arms to jump.
 * Within a channel, conflicts are resolved by a fixed priority.
 */
export type GestureChannel = 'lateral' | 'vertical';

export const GESTURE_CHANNEL: Record<GestureType, GestureChannel> = {
  LEAN_LEFT: 'lateral',
  LEAN_RIGHT: 'lateral',
  JUMP: 'vertical',
  CROUCH: 'vertical',
};

/** Deterministic priority inside a channel (higher wins). */
export const GESTURE_PRIORITY: Record<GestureType, number> = {
  LEAN_LEFT: 1,
  LEAN_RIGHT: 1,
  JUMP: 2,
  CROUCH: 1,
};

/** What the game / tutorial currently wants from the player. CENTER = return to neutral. */
export type ExpectedMotion = GestureType | 'CENTER';

export type Arrow = 'up' | 'down' | 'left' | 'right';

export interface MotionMeta {
  /** Display name (HUD / cards). */
  title: string;
  /** Russian instruction shown as a cue. */
  cue: string;
  /** What it does in the game. */
  action: string;
  arrow: Arrow | null;
  focus: BodyPart[];
}

/**
 * body   — full body visible: real steps, real jumps, real squats
 * seated — upper body only: shoulder lean, arms up, duck
 */
export type ControlScheme = 'body' | 'seated';

/** Calibration decides the scheme: hips visible → play with the whole body. */
export function schemeOf(mode: 'full' | 'upper' | null | undefined): ControlScheme {
  return mode === 'full' ? 'body' : 'seated';
}

export const BODY_MOTION_META: Record<ExpectedMotion, MotionMeta> = {
  LEAN_LEFT: {
    title: 'Step Left',
    cue: 'Move left — into the left side of the frame',
    action: 'Left Lane',
    arrow: 'left',
    focus: ['hips', 'legs'],
  },
  LEAN_RIGHT: {
    title: 'Step Right',
    cue: 'Move right — into the right side of the frame',
    action: 'Right Lane',
    arrow: 'right',
    focus: ['hips', 'legs'],
  },
  JUMP: {
    title: 'Jump',
    cue: 'Jump up — leave the floor',
    action: 'Jump over barrier',
    arrow: 'up',
    focus: ['hips', 'legs'],
  },
  CROUCH: {
    title: 'Squat',
    cue: 'Squat down — lower your hips',
    action: 'Duck under beam',
    arrow: 'down',
    focus: ['hips', 'legs'],
  },
  CENTER: {
    title: 'Center',
    cue: 'Return to center',
    action: 'Center Lane',
    arrow: null,
    focus: ['hips', 'torso'],
  },
};

/** Texts and focus for a motion in the given control scheme. */
export function motionMeta(motion: ExpectedMotion, scheme: ControlScheme): MotionMeta {
  return scheme === 'body' ? BODY_MOTION_META[motion] : MOTION_META[motion];
}

/** Seated scheme texts. */
export const MOTION_META: Record<ExpectedMotion, MotionMeta> = {
  LEAN_LEFT: {
    title: 'Lean Left',
    cue: 'Lean your upper body left',
    action: 'Left Lane',
    arrow: 'left',
    focus: ['shoulders', 'torso'],
  },
  LEAN_RIGHT: {
    title: 'Lean Right',
    cue: 'Lean your upper body right',
    action: 'Right Lane',
    arrow: 'right',
    focus: ['shoulders', 'torso'],
  },
  JUMP: {
    title: 'Arms Up',
    cue: 'Raise both hands above your head',
    action: 'Jump over barrier',
    arrow: 'up',
    focus: ['leftArm', 'rightArm'],
  },
  CROUCH: {
    title: 'Duck',
    cue: 'Duck down — lower your shoulders',
    action: 'Duck under beam',
    arrow: 'down',
    focus: ['hips', 'torso'],
  },
  CENTER: {
    title: 'Center',
    cue: 'Sit straight in the center',
    action: 'Center Lane',
    arrow: null,
    focus: ['shoulders', 'torso'],
  },
};

/** Compact, copyable feature summary attached to every gesture event. */
export interface GestureEventFeatures {
  leanX: number;
  crouchDepth: number;
  leftHandLift: number;
  rightHandLift: number;
}

export interface GestureEvent {
  type: GestureType;
  phase: 'start' | 'end';
  confidence: number;
  timestamp: number;
  features: GestureEventFeatures;
  source: 'pose-rules';
}
