import type { SfxName } from '../../lib/audio/sfx';
import { clamp } from '../../lib/math/geometry';
import { createRng } from '../gameplay/course';
import type { EnemySpec, LevelDef } from './levels';
import type { MadControls, Trigger } from './madInput';
import { weaponOf, type WeaponDef } from './weapons';

export type MadPhase = 'run' | 'arrive' | 'combat' | 'cleared' | 'failed';
export type EnemyState = 'hidden' | 'rising' | 'exposed' | 'aiming' | 'firing' | 'ducking' | 'dead';
export type Rating = 'S' | 'A' | 'B' | 'C';

/** Timings of one enemy cycle (ms). The red ▼ marker shows during `aiming`. */
export const CYCLE = { rise: 350, exposed: 900, aim: 850, fire: 280, duck: 350, minHidden: 450 };

export const MAD = {
  /** Running on the spot at full effort, metres per second. */
  runSpeedMps: 5.2,
  hp: 100,
  /** Share of a volley that reaches the player: in cover / leaning out / standing. */
  exposure: { cover: 0.04, peek: 0.55, open: 1 },
  /** Mission start: the arrival pause before the fight, ms. */
  arriveMs: 1500,
  regenCoverPerSec: 9,
  regenIdlePerSec: 2,
  /** A target can be hit only when this much of it is above its cover. */
  hitVisibility: 0.55,
  headVisibility: 0.85,
  /** Generous hit areas (a webcam is not a mouse). */
  bodyTolerance: 1.35,
  headTolerance: 1.4,
  knifeArc: 0.3,
};

export interface Enemy {
  id: number;
  spec: EnemySpec;
  hp: number;
  maxHp: number;
  state: EnemyState;
  /** Time in the current state, ms. */
  t: number;
  /** Seconds-based cycle: when it next rises, in fight time. */
  riseAt: number;
  /** 0 = behind cover … 1 = fully up. */
  vis: number;
  /** vis as drawn: a flanker stays mostly hidden unless the player leans to its side. */
  shown: number;
  x: number;
  z: number;
  hitFlash: number;
  /** Time of death, fight ms. */
  diedAt: number;
}

/** Where the scene says an enemy is on screen (aspect-corrected screen units, y up). */
export interface Target {
  bx: number;
  by: number;
  br: number;
  hx: number;
  hy: number;
  hr: number;
}

export type FxEvent =
  | { t: 'shot'; weapon: WeaponDef['id'] }
  | { t: 'hit'; id: number; head: boolean }
  | { t: 'kill'; id: number; head: boolean }
  | { t: 'explosion'; x: number; y: number; r: number }
  | { t: 'impact'; x: number; y: number }
  | { t: 'volley'; id: number; blocked: boolean }
  | { t: 'hurt'; amount: number }
  | { t: 'dry' }
  | { t: 'reload' }
  | { t: 'cover' };

export interface MadHud {
  phase: MadPhase;
  objective: string;
  /** 0..1 progress of the run (or of the clear in combat). */
  progress: number;
  timeMs: number;
  hp: number;
  ammo: number;
  mag: number;
  reload: number;
  enemiesLeft: number;
  enemiesTotal: number;
  message: { text: string; tone: 'go' | 'warn' | 'bad' | 'good' | 'info' } | null;
  score: number;
  kills: number;
}

export interface MadResult {
  level: number;
  cleared: boolean;
  rating: Rating;
  score: number;
  timeMs: number;
  accuracy: number;
  kills: number;
  headshots: number;
  hp: number;
  shots: number;
}

export interface MadTune {
  /** Enemy damage multiplier. */
  damage: number;
  /** Points multiplier. */
  score: number;
}

export const NORMAL_MAD_TUNE: MadTune = { damage: 1, score: 1 };

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export class MadGame {
  readonly level: LevelDef;
  readonly weapon: WeaponDef;
  phase: MadPhase = 'run';
  time = 0;
  /** Fight time (starts when the combat spot is reached). */
  fightT = 0;
  distance = 0;
  speed = 0;
  hp = MAD.hp;
  ammo: number;
  reloadT = 0;
  cooldown = 0;
  kills = 0;
  headshots = 0;
  shots = 0;
  hits = 0;
  score = 0;
  enemies: Enemy[] = [];
  /** Smoothed lean (-1..1) and cover (0..1) for the camera. */
  peekAmt = 0;
  coverAmt = 0;
  /** Last controls (the scene reads the aim, charge and held pose from here). */
  controls: MadControls | null = null;
  /** Damage flash 0..1 (screen). */
  hurt = 0;
  private arriveT = 0;
  private lastHurtAt = -9999;
  private doneAt = 0;
  private fx: FxEvent[] = [];
  private msg: MadHud['message'] = null;
  private msgUntil = 0;
  private readonly rng: () => number;
  private readonly tune: MadTune;
  private dryAt = -1000;
  private lastRunMsg = '';

  constructor(level: LevelDef, tune: MadTune = NORMAL_MAD_TUNE, seed = Math.floor(Math.random() * 0x7fffffff)) {
    this.level = level;
    this.weapon = weaponOf(level.weapon);
    this.tune = tune;
    this.rng = createRng(seed);
    this.ammo = this.weapon.mag;
    this.enemies = level.enemies.map((spec, i) => ({
      id: i + 1,
      spec,
      hp: spec.hits * this.weapon.damage,
      maxHp: spec.hits * this.weapon.damage,
      state: 'hidden',
      t: 0,
      riseAt: spec.at,
      vis: 0,
      shown: 0,
      x: spec.lane * 4.2 + (spec.dx ?? 0),
      z: -(level.run + level.range),
      hitFlash: 0,
      diedAt: 0,
    }));
  }

  get done(): boolean {
    return this.phase === 'cleared' || this.phase === 'failed';
  }

  get enemiesLeft(): number {
    return this.enemies.filter((e) => e.state !== 'dead').length;
  }

  drainFx(): FxEvent[] {
    const out = this.fx;
    this.fx = [];
    return out;
  }

  update(c: MadControls, dtMs: number, aspect: number, targets: ReadonlyMap<number, Target>): SfxName[] {
    const sounds: SfxName[] = [];
    this.controls = c;
    if (this.done) return sounds;
    // Paused while the player is out of view.
    if (!c.tracked) {
      this.say('STEP BACK INTO THE FRAME', 'warn', 400);
      return sounds;
    }
    const dt = Math.min(dtMs, 100);
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt / 600);

    // Camera lean and cover ease.
    this.peekAmt += (c.peek - this.peekAmt) * (1 - Math.exp(-dt / 90));
    this.coverAmt += ((c.crouch ? 1 : 0) - this.coverAmt) * (1 - Math.exp(-dt / 110));

    if (this.phase === 'run') this.updateRun(c, dt, sounds);
    else if (this.phase === 'arrive') {
      this.arriveT += dt;
      this.say('COVER REACHED — MOVEMENT LOCKED', 'good', 400);
      if (this.arriveT >= MAD.arriveMs) {
        this.phase = 'combat';
        sounds.push('go');
      }
    }
    if (this.phase === 'combat') this.updateCombat(c, dt, aspect, targets, sounds);
    if (this.hp <= 0 && this.phase !== 'cleared') {
      this.phase = 'failed';
      this.doneAt = this.time;
      sounds.push('gameover');
    }
    return sounds;
  }

  // --- Run ------------------------------------------------------------------

  private updateRun(c: MadControls, dt: number, sounds: SfxName[]): void {
    this.speed += (c.speed - this.speed) * (1 - Math.exp(-dt / 160));
    const before = this.distance;
    this.distance = Math.min(this.level.run, this.distance + this.speed * MAD.runSpeedMps * (dt / 1000));
    if (Math.floor(this.distance / 2.2) !== Math.floor(before / 2.2) && this.speed > 0.2) sounds.push('step');
    const text = this.speed < 0.12 ? 'JOG IN PLACE TO MOVE' : '';
    if (text) this.say(text, 'go', 300);
    else if (this.lastRunMsg) this.msgUntil = 0;
    this.lastRunMsg = text;
    if (this.distance >= this.level.run) {
      this.phase = 'arrive';
      this.arriveT = 0;
      this.speed = 0;
      sounds.push('clear');
    }
  }

  // --- Combat ---------------------------------------------------------------

  private updateCombat(c: MadControls, dt: number, aspect: number, targets: ReadonlyMap<number, Target>, sounds: SfxName[]): void {
    this.fightT += dt;
    const w = this.weapon;
    this.cooldown = Math.max(0, this.cooldown - dt);

    // Reload while crouched behind cover.
    if (w.mag > 0 && this.ammo < w.mag && c.crouch) {
      this.reloadT += dt;
      if (this.reloadT >= w.reloadMs) {
        this.ammo = w.mag;
        this.reloadT = 0;
        this.fx.push({ t: 'reload' });
        sounds.push('clear');
      }
    } else if (!c.crouch && this.reloadT > 0) this.reloadT = Math.max(0, this.reloadT - dt * 0.5);

    // Fire.
    const canFire = !c.crouch && this.cooldown <= 0;
    const fires: Trigger[] = [];
    if (canFire) {
      if (w.style === 'hold') {
        if (c.held) fires.push(c.aim);
      } else fires.push(...c.triggers.slice(0, 1));
    }
    for (const aim of fires) this.fire(aim, aspect, targets, sounds);
    if (!canFire && c.triggers.length > 0 && c.crouch) this.say('STAND OR LEAN TO FIRE', 'warn', 900);

    // Enemies.
    const peek = c.peek;
    for (const e of this.enemies) this.updateEnemy(e, dt, c, peek, sounds);

    // Health comes back behind cover.
    const sinceHurt = this.time - this.lastHurtAt;
    if (this.hp > 0 && this.hp < MAD.hp) {
      if (c.crouch && sinceHurt > 1200) this.hp = Math.min(MAD.hp, this.hp + (MAD.regenCoverPerSec * dt) / 1000);
      else if (sinceHurt > 4000) this.hp = Math.min(MAD.hp, this.hp + (MAD.regenIdlePerSec * dt) / 1000);
    }

    // Hints.
    const aiming = this.enemies.some((e) => e.state === 'aiming');
    if (aiming && !c.crouch) this.say('TAKE COVER — CROUCH!', 'bad', 300);
    else if (w.mag > 0 && this.ammo <= 0) this.say('OUT OF AMMO — CROUCH TO RELOAD', 'warn', 300);
    else if (c.crouch && w.mag > 0 && this.ammo < w.mag) this.say('RELOADING…', 'info', 300);
    else if (this.fightT < 6000 && !c.crouch && c.peek === 0) this.say('LEAN LEFT / RIGHT TO PEEK AND FIRE', 'go', 500);

    if (this.enemiesLeft === 0) {
      this.phase = 'cleared';
      this.doneAt = this.time;
      sounds.push('complete');
    }
  }

  private updateEnemy(e: Enemy, dt: number, c: MadControls, peek: -1 | 0 | 1, sounds: SfxName[]): void {
    e.hitFlash = Math.max(0, e.hitFlash - dt / 160);
    if (e.state === 'dead') {
      e.vis = Math.max(0, e.vis - dt / 500);
      e.shown = e.vis;
      return;
    }
    e.t += dt;
    const s = e.spec;
    switch (e.state) {
      case 'hidden':
        e.vis = 0;
        if (this.fightT >= e.riseAt) this.go(e, 'rising');
        break;
      case 'rising':
        e.vis = Math.min(1, e.t / CYCLE.rise);
        if (e.t >= CYCLE.rise) this.go(e, 'exposed');
        break;
      case 'exposed':
        e.vis = 1;
        if (e.t >= CYCLE.exposed) this.go(e, 'aiming');
        break;
      case 'aiming':
        e.vis = 1;
        if (e.t >= CYCLE.aim) {
          this.go(e, 'firing');
          this.volley(e, c, peek, sounds);
        }
        break;
      case 'firing':
        e.vis = 1;
        if (e.t >= CYCLE.fire) this.go(e, 'ducking');
        break;
      case 'ducking':
        e.vis = Math.max(0, 1 - e.t / CYCLE.duck);
        if (e.t >= CYCLE.duck) {
          this.go(e, 'hidden');
          const cycle = CYCLE.rise + CYCLE.exposed + CYCLE.aim + CYCLE.fire + CYCLE.duck;
          e.riseAt = this.fightT + Math.max(CYCLE.minHidden, s.every - cycle);
        }
        break;
    }
    const seen = !s.hideSide || peek === s.hideSide;
    e.shown = e.vis * (seen ? 1 : 0.28);
  }

  private go(e: Enemy, state: EnemyState): void {
    e.state = state;
    e.t = 0;
  }

  private volley(e: Enemy, c: MadControls, peek: -1 | 0 | 1, sounds: SfxName[]): void {
    const exposure = c.crouch ? MAD.exposure.cover : peek !== 0 ? MAD.exposure.peek : MAD.exposure.open;
    const dmg = e.spec.dmg * this.tune.damage * exposure * (0.85 + this.rng() * 0.3);
    const blocked = c.crouch;
    this.fx.push({ t: 'volley', id: e.id, blocked });
    if (blocked) {
      this.fx.push({ t: 'cover' });
      return;
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.hurt = Math.min(1, this.hurt + dmg / 30);
    this.lastHurtAt = this.time;
    this.fx.push({ t: 'hurt', amount: dmg });
    sounds.push('miss');
  }

  // --- Shooting -------------------------------------------------------------

  private canHit(e: Enemy, peek: -1 | 0 | 1): boolean {
    if (e.state === 'dead' || e.vis < MAD.hitVisibility) return false;
    return !e.spec.hideSide || peek === e.spec.hideSide;
  }

  private fire(aimIn: Trigger, aspect: number, targets: ReadonlyMap<number, Target>, sounds: SfxName[]): void {
    const w = this.weapon;
    const c = this.controls;
    const peek = c ? c.peek : 0;
    if (w.mag > 0 && this.ammo <= 0) {
      if (this.time - this.dryAt > 500) {
        this.dryAt = this.time;
        this.fx.push({ t: 'dry' });
      }
      this.cooldown = 250;
      return;
    }
    if (w.mag > 0) this.ammo--;
    this.cooldown = w.cooldownMs;
    this.shots++;
    this.fx.push({ t: 'shot', weapon: w.id });
    let ax = aimIn.x * aspect + (this.rng() - 0.5) * 2 * w.spread * aspect;
    let ay = aimIn.y + (this.rng() - 0.5) * 2 * w.spread;
    let connected = false;

    if (w.splash > 0) {
      // Explosives land on the nearest target in reach, otherwise where the hand points.
      let best: { e: Enemy; d: number; t: Target } | null = null;
      for (const e of this.enemies) {
        const t = targets.get(e.id);
        if (!t || e.state === 'dead' || e.vis < 0.3) continue;
        const d = dist(ax, ay, t.bx, t.by);
        if (d < 0.38 && (!best || d < best.d)) best = { e, d, t };
      }
      if (best) {
        ax = best.t.bx;
        ay = best.t.by;
      }
      this.fx.push({ t: 'explosion', x: ax, y: ay, r: w.splash });
      for (const e of this.enemies) {
        const t = targets.get(e.id);
        if (!t || e.state === 'dead' || e.vis < 0.3) continue;
        const d = dist(ax, ay, t.bx, t.by);
        if (d <= w.splash) {
          this.damage(e, w.damage * (1 - 0.55 * (d / w.splash)), false, sounds);
          connected = true;
        }
      }
    } else if (w.style === 'slash') {
      this.fx.push({ t: 'impact', x: ax, y: ay });
      for (const e of this.enemies) {
        const t = targets.get(e.id);
        if (!t || !this.canHit(e, peek)) continue;
        if (dist(ax, ay, t.bx, t.by) <= MAD.knifeArc + t.br) {
          this.damage(e, w.damage, false, sounds);
          connected = true;
        }
      }
    } else {
      let hit: { e: Enemy; head: boolean; d: number } | null = null;
      for (const e of this.enemies) {
        const t = targets.get(e.id);
        if (!t || !this.canHit(e, peek)) continue;
        const dh = dist(ax, ay, t.hx, t.hy);
        const db = dist(ax, ay, t.bx, t.by);
        if (e.vis >= MAD.headVisibility && dh <= t.hr * MAD.headTolerance + 0.012) {
          if (!hit || dh < hit.d) hit = { e, head: true, d: dh };
        } else if (db <= t.br * MAD.bodyTolerance + 0.015) {
          if (!hit || db < hit.d) hit = { e, head: false, d: db };
        }
      }
      if (hit) {
        this.damage(hit.e, w.damage * (hit.head ? w.head : 1), hit.head, sounds);
        connected = true;
      } else this.fx.push({ t: 'impact', x: ax, y: ay });
    }
    if (connected) this.hits++;
    else if (w.splash === 0) sounds.push('miss');
  }

  private damage(e: Enemy, amount: number, head: boolean, sounds: SfxName[]): void {
    e.hp -= amount;
    e.hitFlash = 1;
    if (e.hp <= 0) {
      e.hp = 0;
      e.state = 'dead';
      e.t = 0;
      e.diedAt = this.fightT;
      this.kills++;
      if (head) this.headshots++;
      this.score += 100 + (head ? 60 : 0);
      this.fx.push({ t: 'kill', id: e.id, head });
      sounds.push(head ? 'perfect' : 'orb');
      this.say(head ? 'HEADSHOT!' : 'ENEMY DOWN', 'good', 900);
    } else {
      this.fx.push({ t: 'hit', id: e.id, head });
      sounds.push('orb');
    }
  }

  // --- Reporting ------------------------------------------------------------

  private say(text: string, tone: NonNullable<MadHud['message']>['tone'], ms: number): void {
    // Short hints never replace a longer one that is still showing.
    if (this.msg && this.time < this.msgUntil && this.msg.text !== text && this.msgUntil - this.time > ms + 200 && this.msg.tone === 'good') return;
    this.msg = { text, tone };
    this.msgUntil = this.time + ms;
  }

  hud(): MadHud {
    const total = this.enemies.length;
    const objective =
      this.phase === 'run' ? `REACH THE COMBAT SPOT · ${Math.max(0, Math.ceil(this.level.run - this.distance))} m` : this.phase === 'arrive' ? 'TAKE COVER' : `ELIMINATE ALL ENEMIES · ${total - this.enemiesLeft}/${total}`;
    const progress = this.phase === 'run' ? this.distance / this.level.run : this.phase === 'arrive' ? 1 : total > 0 ? (total - this.enemiesLeft) / total : 1;
    const w = this.weapon;
    return {
      phase: this.phase,
      objective,
      progress,
      timeMs: this.time,
      hp: Math.round(this.hp),
      ammo: this.ammo,
      mag: w.mag,
      reload: w.mag > 0 && this.ammo < w.mag ? clamp(this.reloadT / w.reloadMs, 0, 1) : 0,
      enemiesLeft: this.enemiesLeft,
      enemiesTotal: total,
      message: this.msg && this.time < this.msgUntil ? this.msg : null,
      score: this.score,
      kills: this.kills,
    };
  }

  /** The deck's rating: S fast + accurate, A good, B moderate, C slow or sloppy. */
  result(difficultyScore = this.tune.score): MadResult {
    const w = this.weapon;
    const accuracy = this.shots > 0 ? this.hits / this.shots : 0;
    const expected = w.id === 'auto' ? 0.5 : 0.8;
    const acc = Math.min(1, accuracy / expected);
    const par = this.level.par * 1000;
    const ratio = this.doneAt > 0 ? this.doneAt / par : 9;
    const cleared = this.phase === 'cleared';
    let rating: Rating = 'C';
    if (cleared) {
      if (acc >= 0.85 && ratio <= 1) rating = 'S';
      else if (acc >= 0.7 && ratio <= 1.3) rating = 'A';
      else if (acc >= 0.5 && ratio <= 1.8) rating = 'B';
    }
    const bonus = cleared ? Math.round(acc * 500) + Math.max(0, Math.round((par - this.doneAt) / 100)) + Math.round(this.hp * 3) : 0;
    return {
      level: this.level.id,
      cleared,
      rating,
      score: Math.round((this.score + bonus) * difficultyScore),
      timeMs: this.doneAt || this.time,
      accuracy,
      kills: this.kills,
      headshots: this.headshots,
      hp: Math.round(this.hp),
      shots: this.shots,
    };
  }
}
