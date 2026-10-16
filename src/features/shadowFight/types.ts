import type { Pose } from '../tracking/landmarks';

export type CombatGesture = 'jab' | 'punch' | 'block' | 'dodge' | 'kick' | null;

export type FighterAction =
  | 'idle'
  | 'jab'
  | 'punch'
  | 'kick'
  | 'block'
  | 'dodge'
  | 'hit'
  | 'ko';

export interface FighterState {
  id: 0 | 1;
  name: string;
  color: string;
  glowColor: string;
  hp: number;
  maxHp: number;
  /** Lagging display health for smooth red damage chip bar */
  chipHp: number;
  energy: number;
  maxEnergy: number;
  combo: number;
  bestCombo: number;
  roundsWon: number;
  
  // Position & physics in 2D fight arena (-1 to 1 normalized coordinates)
  x: number;
  y: number; // 0 = standing ground, > 0 = crouch / squat, < 0 = jump
  targetX: number;
  facing: 1 | -1; // 1 = facing right, -1 = facing left

  // Combat status
  action: FighterAction;
  actionTime: number; // ms remaining in current action
  actionDuration: number; // total ms of current action
  isBlocking: boolean;
  isDodging: boolean;
  dodgeType: 'squat' | 'slip' | null;
  punchHand: 'left' | 'right' | null;
  activeGesture: CombatGesture;

  // Real webcam tracking geometry
  livePose: Pose | null;
  armExtension: number; // 0..1 how extended the lead arm is
  bodySquatY: number; // 0..1 squat depth
  bodySlipX: number; // lateral shift
  isCpu: boolean;

  // Stats for match summary
  punchesLanded: number;
  jabsLanded: number;
  attacksBlocked: number;
  attacksDodged: number;
}

export type OnlineRole = 'local' | 'host' | 'guest';

export type NetworkStatus = 'offline' | 'connecting' | 'waiting' | 'connected' | 'disconnected';

export type MatchPhase =
  | 'guide'       // Calibration / stand zone guide before fight
  | 'lobby'       // Online room lobby
  | 'countdown'   // "ROUND 1 - READY..."
  | 'fighting'    // Active combat
  | 'round-end'   // "K.O.!" or "TIME OVER" slow-mo freeze
  | 'match-end';  // Final victory screen

export interface HitEffect {
  x: number;
  y: number;
  type: 'hit' | 'crit' | 'block' | 'dodge';
  text?: string;
  color: string;
  born: number;
  duration: number;
}

export interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface ShockwaveRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface AfterimageGhost {
  x: number;
  y: number;
  facing: 1 | -1;
  color: string;
  alpha: number;
  born: number;
  duration: number;
  pose: Pose | null;
  action: FighterAction;
}

export interface ShadowFightSummary {
  winner: 0 | 1;
  winnerName: string;
  roundsWonP1: number;
  roundsWonP2: number;
  totalTimeMs: number;
  p1: {
    name: string;
    punches: number;
    blocks: number;
    dodges: number;
    bestCombo: number;
  };
  p2: {
    name: string;
    punches: number;
    blocks: number;
    dodges: number;
    bestCombo: number;
  };
}
