import type { MadResult, Rating } from './MadGame';
import { LEVELS } from './levels';

const KEY = 'mad-movimiento:progress:v1';
const RANK: Record<Rating, number> = { C: 0, B: 1, A: 2, S: 3 };

export interface LevelBest {
  rating: Rating;
  score: number;
  timeMs: number;
}

export interface MadProgress {
  /** Highest mission the player may start (1-based). Weapons up to this one are unlocked. */
  unlocked: number;
  best: Record<number, LevelBest>;
}

const EMPTY = (): MadProgress => ({ unlocked: 1, best: {} });

export function loadMadProgress(): MadProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY();
    const p = JSON.parse(raw) as Partial<MadProgress>;
    return { unlocked: Math.min(LEVELS.length, Math.max(1, Number(p.unlocked) || 1)), best: p.best && typeof p.best === 'object' ? p.best : {} };
  } catch {
    return EMPTY();
  }
}

function save(p: MadProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable: progress is just not kept.
  }
}

export interface RecordedMission {
  progress: MadProgress;
  newBest: boolean;
  /** The weapon of this mission number was unlocked by this run. */
  unlockedLevel: number | null;
}

/** Stores a finished mission: keeps the best rating/score and unlocks the next mission. */
export function recordMission(result: MadResult, progress = loadMadProgress()): RecordedMission {
  if (!result.cleared) return { progress, newBest: false, unlockedLevel: null };
  const prev = progress.best[result.level];
  const better = !prev || RANK[result.rating] > RANK[prev.rating] || (RANK[result.rating] === RANK[prev.rating] && result.score > prev.score);
  const next: MadProgress = { unlocked: progress.unlocked, best: { ...progress.best } };
  if (better) next.best[result.level] = { rating: result.rating, score: result.score, timeMs: result.timeMs };
  let unlockedLevel: number | null = null;
  if (result.level >= next.unlocked && result.level < LEVELS.length) {
    next.unlocked = result.level + 1;
    unlockedLevel = next.unlocked;
  }
  save(next);
  return { progress: next, newBest: better, unlockedLevel };
}

export function resetMadProgress(): MadProgress {
  const fresh = EMPTY();
  save(fresh);
  return fresh;
}
