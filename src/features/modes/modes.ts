import { COURSES, GAME_CONFIG, type CourseKind } from '../../config/game.config';
import { dailySeed, generateCourse } from '../gameplay/course';
import type { GameRules } from '../gameplay/GameEngine';
import type { CourseItem } from '../gameplay/types';
import type { ControlScheme } from '../gestures/types';
import { DEFAULT_DIFFICULTY, difficultyOf, livesAt, scaleCourse, timingAt, type Difficulty, type DifficultyDef } from './difficulty';

export type GameModeId =
  | 'mad'
  | 'classic'
  | 'endless'
  | 'sprint'
  | 'blitz'
  | 'daily'
  | 'hardcore'
  | 'jumpduck'
  | 'lanes'
  | 'practice'
  | 'dance'
  | 'dance-duo'
  | 'versus'
  | 'duel'
  | 'stars'
  | 'freeze'
  | 'reaction'
  | 'squats'
  | 'boss';

/** Groups for the mode picker. */
export type ModeCategory = 'campaign' | 'run' | 'arcade' | 'dance' | 'duo' | 'online';

export const MODE_CATEGORIES: { id: ModeCategory; title: string }[] = [
  { id: 'campaign', title: 'Campaign' },
  { id: 'run', title: 'Run' },
  { id: 'arcade', title: 'Mini-Games' },
  { id: 'dance', title: 'Dance Floor' },
  { id: 'duo', title: '2 Players' },
  { id: 'online', title: 'Online' },
];

/** Arcade mini-games (see features/arcade). */
export type ArcadeKind = 'stars' | 'freeze' | 'reaction' | 'squats' | 'boss';

export type ModeIconName =
  | 'run'
  | 'infinity'
  | 'bolt'
  | 'stopwatch'
  | 'calendar'
  | 'updown'
  | 'lanes'
  | 'heart'
  | 'target'
  | 'note'
  | 'notes'
  | 'duo'
  | 'globe'
  | 'star'
  | 'freeze'
  | 'reflex'
  | 'squat'
  | 'boss';

export interface GameModeDef {
  id: GameModeId;
  category: ModeCategory;
  /** Pictogram on the mode card. */
  icon: ModeIconName;
  /** runner = obstacle course; dance = dance floor (match poses to the beat); arcade = a mini-game. */
  kind: 'runner' | 'dance' | 'arcade' | 'mad';
  /** Which mini-game (kind = arcade). */
  arcade?: ArcadeKind;
  /** Short facts for the card instead of lives ("60s · arms"). */
  facts?: string;
  /** 2 = two players in front of one camera (left / right half of the frame). */
  players: 1 | 2;
  /** Display title (EN, short, like the rest of the HUD). */
  title: string;
  /** Small label on the card. */
  badge: string;
  /** One line summary: what makes this mode different. */
  tagline: string;
  /** Accent colour for the card and HUD. */
  accent: string;
  course: CourseKind;
  energy: number;
  practice: boolean;
  /** random = a new course every run; daily = same for everyone today; shared = set by the online room. */
  seed: 'random' | 'daily' | 'shared';
  /** Scores go to the leaderboard. */
  ranked: boolean;
  /** Needs the online backend. */
  online: boolean;
  /** Label for the progress bar area. */
  goal: string;
  /** Wider timing windows for this mode (see GameRules.timing). */
  timing?: GameRules['timing'];
}

/**
 * Two players at one camera: each tracker sees ~5 frames a second, so a move
 * registers 0.3–0.5 s later than in single play. The windows grow by about
 * that much: a longer flight and more time to be in place after arrival.
 */
const DUO_TIMING: GameRules['timing'] = { airtimeMs: 900, clearGraceMs: 450, duckGraceMs: 320 };
/** A busy laptop (e.g. a video call running next to the game): a bit more time. */
const BUSY_TIMING: GameRules['timing'] = { airtimeMs: 800, clearGraceMs: 320, duckGraceMs: 270 };

/**
 * Timing windows for how fast this device recognises poses (results per
 * second, measured before the run). Slow recognition registers every move
 * later, so the windows grow by about that delay; a fast device keeps the
 * standard ones. 0 = not measured yet.
 */
export function timingForRecognition(hz: number): GameRules['timing'] | undefined {
  if (hz <= 0 || hz >= 13) return undefined;
  return hz < 8 ? DUO_TIMING : BUSY_TIMING;
}

const RUNNER = { kind: 'runner', players: 1, practice: false, seed: 'random', ranked: true, online: false } as const;

/**
 * Mini-games keep records on this device only: the global leaderboard table
 * accepts the runner and dance modes (see supabase/schema.sql).
 */
const ARCADE = {
  kind: 'arcade',
  category: 'arcade',
  players: 1,
  practice: false,
  seed: 'random',
  ranked: false,
  online: false,
  course: 'standard',
  energy: GAME_CONFIG.energy,
} as const;

const ALL_MODES: readonly GameModeDef[] = [
  {
    id: 'mad',
    category: 'campaign',
    icon: 'target',
    kind: 'mad',
    players: 1,
    title: 'Shadow Protocol',
    badge: 'CAMPAIGN',
    tagline: 'Boxing, sword duel, assault rifle — full-body combat campaign with your body as the controller',
    accent: '#ff2b3a',
    course: 'standard',
    energy: GAME_CONFIG.energy,
    practice: false,
    seed: 'random',
    ranked: false,
    online: false,
    goal: 'Clear all operations',
    facts: 'Boxing · Sword · Rifle',
  },
  {
    ...RUNNER,
    id: 'classic',
    category: 'run',
    icon: 'run',
    title: 'Classic Run',
    badge: 'START HERE',
    tagline: '70 seconds, 4 speed phases, a new track every run',
    accent: '#2ee6ff',
    course: 'standard',
    energy: GAME_CONFIG.energy,
    goal: 'Reach the finish line',
  },
  {
    ...RUNNER,
    id: 'dance',
    category: 'dance',
    icon: 'note',
    kind: 'dance',
    title: 'Dance Floor',
    badge: 'NEW',
    tagline: 'Full-body dance floor: arm poses, squats, jumps, and steps in rhythm with the music',
    accent: '#ff5ad1',
    course: 'standard',
    energy: GAME_CONFIG.energy,
    goal: 'Match the rhythm',
  },
  {
    ...ARCADE,
    id: 'boss',
    icon: 'boss',
    arcade: 'boss',
    title: 'Boss Fight',
    badge: 'BOSS',
    tagline: 'The boss strikes with lanes, lasers, and shockwaves — dodge with your whole body, then strike when stunned',
    accent: '#ff5a6e',
    goal: 'Defeat the boss',
    facts: '5 hits · 3 lives',
  },  {
    ...ARCADE,
    id: 'stars',
    icon: 'star',
    arcade: 'stars',
    title: 'Star Catch',
    badge: 'ARMS',
    tagline: 'Stars ignite around you — catch them with your hands before they fade, and avoid bombs',
    accent: '#ffd24d',
    goal: 'Catch stars',
    facts: '60s · 3 lives',
  },
  {
    ...ARCADE,
    id: 'freeze',
    icon: 'freeze',
    arcade: 'freeze',
    title: 'Freeze!',
    badge: 'FREEZE',
    tagline: 'Red Light, Green Light: run on green, freeze in the target pose on red',
    accent: '#3dffb0',
    goal: 'Reach the finish line',
    facts: '100m · 3 lives',
  },
  {
    ...RUNNER,
    id: 'dance-duo',
    category: 'duo',
    icon: 'notes',
    kind: 'dance',
    players: 2,
    title: 'Dance Battle',
    badge: '2 PLAYERS',
    tagline: 'Two in front of one camera: left and right dancers perform the same choreography — who is more precise',
    accent: '#ffc14d',
    course: 'standard',
    energy: GAME_CONFIG.energy,
    ranked: false,
    goal: 'Outdance your partner',
  },
  {
    ...RUNNER,
    id: 'versus',
    category: 'duo',
    icon: 'duo',
    players: 2,
    title: 'Versus 2P',
    badge: '2 PLAYERS',
    tagline: 'Two on one laptop: each on their own track — who scores the most',
    accent: '#2ee6ff',
    course: 'duo',
    energy: GAME_CONFIG.energy,
    ranked: false,
    goal: 'Outrun your friend',
    timing: DUO_TIMING,
  },
  {
    ...RUNNER,
    id: 'endless',
    category: 'run',
    icon: 'infinity',
    title: 'Endless',
    badge: 'SURVIVAL',
    tagline: 'Speed increases endlessly — survive as long as you can',
    accent: '#8b5cff',
    course: 'endless',
    energy: 3,
    goal: 'Survive',
  },
  {
    ...RUNNER,
    id: 'blitz',
    category: 'run',
    icon: 'bolt',
    title: 'Blitz',
    badge: 'SPEED',
    tagline: '45 seconds at maximum speed from the very first second',
    accent: '#ff8a3d',
    course: 'blitz',
    energy: 3,
    goal: 'Keep the pace',
  },
  {
    ...RUNNER,
    id: 'sprint',
    category: 'run',
    icon: 'stopwatch',
    title: 'Sprint 30',
    badge: 'SHORT',
    tagline: '30 seconds without warm-up — score as many points as possible',
    accent: '#ffc14d',
    course: 'sprint',
    energy: GAME_CONFIG.energy,
    goal: 'Score maximum',
  },
  {
    ...RUNNER,
    id: 'daily',
    category: 'run',
    icon: 'calendar',
    title: 'Daily Challenge',
    badge: 'DAILY',
    tagline: 'A new track every day — the same for all players',
    accent: '#3dffb0',
    course: 'standard',
    energy: GAME_CONFIG.energy,
    seed: 'daily',
    goal: 'Track of the day',
  },
  {
    ...RUNNER,
    id: 'jumpduck',
    category: 'run',
    icon: 'updown',
    title: 'Jump & Squat',
    badge: 'LEG WORKOUT',
    tagline: 'Barriers and beams only: non-stop jumping and squatting',
    accent: '#5ab0ff',
    course: 'vertical',
    energy: GAME_CONFIG.energy,
    goal: 'Jump and squat',
  },
  {
    ...RUNNER,
    id: 'lanes',
    category: 'run',
    icon: 'lanes',
    title: 'Lane Rush',
    badge: 'AGILITY',
    tagline: 'Gates only: dash between lanes left and right',
    accent: '#b4ff3d',
    course: 'lanes',
    energy: GAME_CONFIG.energy,
    goal: 'Switch lanes',
  },
  {
    ...ARCADE,
    id: 'reaction',
    icon: 'reflex',
    arcade: 'reaction',
    title: 'Reaction',
    badge: 'REACTION',
    tagline: 'Wait for the signal and execute the shown movement fastest — time in milliseconds',
    accent: '#5ab0ff',
    goal: 'Faster',
    facts: '10 rounds',
  },
  {
    ...ARCADE,
    id: 'squats',
    icon: 'squat',
    arcade: 'squats',
    title: 'Squat 30',
    badge: 'CHALLENGE',
    tagline: 'How many full squats can you do in 30 seconds? The game tracks your depth',
    accent: '#ff8a3d',
    goal: 'Squat',
    facts: '30s',
  },
  {
    ...RUNNER,
    id: 'hardcore',
    category: 'run',
    icon: 'heart',
    title: 'Hardcore',
    badge: 'EXPERT',
    tagline: 'One life. One mistake and it is over',
    accent: '#ff5a3d',
    course: 'standard',
    energy: 1,
    goal: 'Flawless run',
  },
  {
    ...RUNNER,
    id: 'practice',
    category: 'run',
    icon: 'target',
    title: 'Practice',
    badge: 'TUTORIAL',
    tagline: 'Slow and penalty-free — learn moves with hints',
    accent: '#a4aac2',
    course: 'practice',
    energy: GAME_CONFIG.energy,
    practice: true,
    ranked: false,
    goal: 'Practice',
  },
  {
    ...RUNNER,
    id: 'duel',
    category: 'online',
    icon: 'globe',
    title: 'Online Duel',
    badge: 'ONLINE',
    tagline: '1v1 online race: identical track, see who scores higher',
    accent: '#ff5ad1',
    course: 'standard',
    energy: GAME_CONFIG.energy,
    seed: 'shared',
    ranked: false,
    online: true,
    goal: 'Beat your opponent',
  },
];

/** Modes shown in the menu. */
export const GAME_MODES: readonly GameModeDef[] = ALL_MODES;

export function getMode(id: string): GameModeDef {
  return ALL_MODES.find((m) => m.id === id) ?? (ALL_MODES[0] as GameModeDef);
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

/** Seed of the course for one run: random every time, the day's seed, or the online room's. */
export function seedForMode(mode: GameModeDef, sharedSeed?: number): number {
  if (mode.seed === 'daily') return dailySeed();
  if (mode.seed === 'shared' && sharedSeed !== undefined) return sharedSeed;
  return randomSeed();
}

/**
 * Difficulty applies where it makes sense: not to Practice (slow by design), not to
 * the Daily Challenge and the online duel (the same course for everyone) and not to
 * Reaction and Squat 30 (fixed tests where the time or the count is the result).
 */
export function supportsDifficulty(mode: GameModeDef): boolean {
  if (mode.practice || mode.online || mode.seed === 'daily') return false;
  return mode.kind !== 'arcade' || mode.arcade === 'stars' || mode.arcade === 'freeze' || mode.arcade === 'boss';
}

/** The difficulty a mode is actually played at. */
export function effectiveDifficulty(mode: GameModeDef, difficulty: Difficulty): DifficultyDef {
  return difficultyOf(supportsDifficulty(mode) ? difficulty : DEFAULT_DIFFICULTY);
}

export function courseForMode(mode: GameModeDef, sharedSeed?: number, difficulty: Difficulty = DEFAULT_DIFFICULTY): CourseItem[] {
  return generateCourse(seedForMode(mode, sharedSeed), scaleCourse(COURSES[mode.course], effectiveDifficulty(mode, difficulty)));
}

type Timing = Required<NonNullable<GameRules['timing']>>;

/** The widest of the given timing windows, field by field (defaults from GAME_CONFIG). */
export function widestTiming(...list: GameRules['timing'][]): Timing {
  const out: Timing = { airtimeMs: GAME_CONFIG.airtimeMs, clearGraceMs: GAME_CONFIG.clearGraceMs, duckGraceMs: GAME_CONFIG.duckGraceMs };
  for (const t of list) {
    if (!t) continue;
    out.airtimeMs = Math.max(out.airtimeMs, t.airtimeMs ?? 0);
    out.clearGraceMs = Math.max(out.clearGraceMs, t.clearGraceMs ?? 0);
    out.duckGraceMs = Math.max(out.duckGraceMs, t.duckGraceMs ?? 0);
  }
  return out;
}

export function rulesForMode(mode: GameModeDef, scheme: ControlScheme, difficulty: Difficulty = DEFAULT_DIFFICULTY): GameRules {
  const d = effectiveDifficulty(mode, difficulty);
  return {
    mode: mode.id,
    scheme,
    energy: livesAt(mode.energy, d),
    practice: mode.practice,
    timing: mode.timing || d.window > 1 ? timingAt(widestTiming(mode.timing), d) : undefined,
    scoreScale: d.score,
    difficulty: d.id,
  };
}
