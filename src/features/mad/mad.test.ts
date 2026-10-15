import { beforeEach, describe, expect, it } from 'vitest';
import { LEVELS } from './levels';
import { MadGame, type Target } from './MadGame';
import { MadInput, NEUTRAL_CONTROLS, type KeyState, type MadControls } from './madInput';
import { loadMadProgress, recordMission, resetMadProgress } from './madProgress';
import { WEAPONS } from './weapons';

const ctl = (over: Partial<MadControls> = {}): MadControls => ({ ...NEUTRAL_CONTROLS, tracked: true, triggers: [], ...over });
const ASPECT = 16 / 9;

/** Every enemy sits on screen where the test says. */
function targetsFor(game: MadGame): Map<number, Target> {
  const m = new Map<number, Target>();
  for (const e of game.enemies) m.set(e.id, { bx: e.spec.lane * 0.5, by: 0, br: 0.1, hx: e.spec.lane * 0.5, hy: 0.15, hr: 0.04 });
  return m;
}

function runToCombat(game: MadGame): void {
  for (let i = 0; i < 4000 && game.phase !== 'combat'; i++) game.update(ctl({ speed: 1 }), 16, ASPECT, new Map());
}

describe('campaign data', () => {
  it('has eight missions, one weapon each, in the deck order', () => {
    expect(LEVELS).toHaveLength(8);
    expect(LEVELS.map((l) => l.weapon)).toEqual(WEAPONS.slice(0, 8).map((w) => w.id));
    expect(WEAPONS.slice(0, 8).map((w) => w.name)).toEqual(['Boxing Gloves', 'Katana Blade', 'Automatic Rifle', 'Desert Eagle', 'Tactical Rifle', 'Sniper', 'Bomb', 'Rocket Launcher']);
  });
});

describe('MadGame', () => {
  it('does not move while the player stands still, and runs when jogging', () => {
    const game = new MadGame(LEVELS[0]!);
    for (let i = 0; i < 100; i++) game.update(ctl({ speed: 0 }), 16, ASPECT, new Map());
    expect(game.distance).toBe(0);
    runToCombat(game);
    expect(game.phase).toBe('combat');
    expect(game.distance).toBe(LEVELS[0]!.run);
  });

  it('pauses when the player leaves the frame', () => {
    const game = new MadGame(LEVELS[0]!);
    game.update({ ...NEUTRAL_CONTROLS, tracked: false }, 16, ASPECT, new Map());
    expect(game.time).toBe(0);
  });

  it('clears a mission with boxing and rates it', () => {
    const game = new MadGame(LEVELS[0]!);
    runToCombat(game);
    for (let i = 0; i < 2500 && !game.done; i++) {
      const targets = targetsFor(game);
      const aimAt = game.enemies.find((e) => e.state !== 'dead' && e.vis >= 0.6);
      const t = aimAt ? targets.get(aimAt.id) : undefined;
      const aim = t ? { x: t.bx / ASPECT, y: t.by } : { x: 0, y: 0 };
      game.update(ctl({ aim, triggers: t ? [aim] : [] }), 16, ASPECT, targets);
    }
    expect(game.phase).toBe('cleared');
    const r = game.result();
    expect(r.cleared).toBe(true);
    expect(r.kills).toBe(1);
    expect(['S', 'A', 'B', 'C']).toContain(r.rating);
    expect(r.score).toBeGreaterThan(300);
  });

  it('cover blocks enemy fire; standing in the open does not', () => {
    const hpAfter = (crouch: boolean): number => {
      const game = new MadGame(LEVELS[1]!);
      runToCombat(game);
      for (let i = 0; i < 400; i++) game.update(ctl({ crouch }), 16, ASPECT, new Map());
      return game.hp;
    };
    expect(hpAfter(true)).toBeGreaterThan(95);
    expect(hpAfter(false)).toBeLessThan(90);
  });

  it('cannot fire from cover, needs a reload when empty, and reloads while crouched', () => {
    const game = new MadGame(LEVELS[1]!);
    runToCombat(game);
    const first = game.enemies[0]!;
    game.update(ctl(), 16, ASPECT, targetsFor(game));
    const before = game.ammo;
    game.update(ctl({ crouch: true, triggers: [{ x: 0, y: 0 }] }), 16, ASPECT, targetsFor(game));
    expect(game.ammo).toBe(before);
    game.ammo = 0;
    for (let i = 0; i < 80; i++) game.update(ctl({ crouch: true }), 16, ASPECT, targetsFor(game));
    expect(game.ammo).toBe(game.weapon.mag);
    expect(first.state).toBeDefined();
  });

  it('fails when health runs out', () => {
    const game = new MadGame(LEVELS[3]!, { damage: 4, score: 1 });
    runToCombat(game);
    for (let i = 0; i < 3000 && !game.done; i++) game.update(ctl(), 16, ASPECT, new Map());
    expect(game.phase).toBe('failed');
    expect(game.result().cleared).toBe(false);
  });

  it('explosives hurt every enemy in the blast', () => {
    const game = new MadGame(LEVELS[6]!);
    runToCombat(game);
    // Let the first two (left lane, same spot) rise.
    for (let i = 0; i < 60; i++) game.update(ctl({ crouch: true }), 16, ASPECT, new Map());
    const targets = new Map<number, Target>();
    for (const e of game.enemies) targets.set(e.id, { bx: e.id <= 2 ? -0.5 : 2, by: 0, br: 0.1, hx: 0, hy: 0, hr: 0.03 });
    game.update(ctl({ aim: { x: -0.5 / ASPECT, y: 0 }, triggers: [{ x: -0.5 / ASPECT, y: 0 }] }), 16, ASPECT, targets);
    expect(game.enemies.filter((e) => e.hp < e.maxHp).length).toBeGreaterThanOrEqual(2);
  });
});

describe('MadInput (keyboard path)', () => {
  it('maps keys to controls', () => {
    const input = new MadInput();
    const keys: KeyState = { run: true, left: true, right: false, crouch: false, hold: false, aim: { x: 0.4, y: -0.2 }, fire: true, charge: false };
    const frame = { time: 1000, trackable: true, pose: null, inferred: false, baseline: null } as never;
    const c = input.update(frame, 16, keys);
    expect(c.speed).toBe(1);
    expect(c.peek).toBe(-1);
    expect(c.triggers).toHaveLength(1);
  });
});

describe('progress', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    resetMadProgress();
  });

  it('unlocks the next mission and keeps the best rating', () => {
    expect(loadMadProgress().unlocked).toBe(1);
    const base = { level: 1, cleared: true, rating: 'B' as const, score: 900, timeMs: 50000, accuracy: 0.8, kills: 3, headshots: 0, hp: 90, shots: 4 };
    const first = recordMission(base);
    expect(first.unlockedLevel).toBe(2);
    expect(first.progress.unlocked).toBe(2);
    const worse = recordMission({ ...base, rating: 'C' as const, score: 2000 }, first.progress);
    expect(worse.newBest).toBe(false);
    expect(worse.progress.best[1]?.rating).toBe('B');
    const better = recordMission({ ...base, rating: 'S' as const, score: 500 }, worse.progress);
    expect(better.progress.best[1]?.rating).toBe('S');
    expect(recordMission({ ...base, cleared: false }, better.progress).progress.unlocked).toBe(2);
  });
});
