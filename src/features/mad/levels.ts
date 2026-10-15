import type { WeaponId } from './weapons';

/** Look of a mission: sky, light and fog. */
export type ThemeId = 'dusk' | 'noon' | 'overcast' | 'golden' | 'night' | 'dawn' | 'inferno' | 'storm';

export type CoverKind = 'barrier' | 'crate' | 'wall';

export interface EnemySpec {
  /** Lane across the street: -1 left, 0 centre, 1 right. */
  lane: -1 | 0 | 1;
  /** Hits (with this mission's weapon) to kill. */
  hits: number;
  /** When it first pops up, ms after the fight starts. */
  at: number;
  /** Time between volleys, ms. */
  every: number;
  /** Damage of a volley that reaches the player. */
  dmg: number;
  cover: CoverKind;
  /** Only visible while the player peeks to this side (flanking enemy). */
  hideSide?: -1 | 1;
  /** Heavy trooper: bigger and red-eyed. */
  heavy?: boolean;
  /** Extra sideways offset in metres. */
  dx?: number;
}

export interface LevelDef {
  id: number;
  name: string;
  place: string;
  weapon: WeaponId;
  theme: ThemeId;
  /** Metres to run to the combat spot. */
  run: number;
  /** Distance from the combat spot to the enemies, metres. */
  range: number;
  /** Par time in seconds (run + fight) for an S rating. */
  par: number;
  brief: string;
  enemies: EnemySpec[];
  /** Map position, percent of the map. */
  map: { x: number; y: number };
}

const e = (lane: EnemySpec['lane'], at: number, hits: number, every: number, dmg: number, cover: CoverKind = 'barrier', extra: Partial<EnemySpec> = {}): EnemySpec => ({ lane, at, hits, every, dmg, cover, ...extra });

/** The campaign: one new weapon per mission (the deck's "Weapon progression"). */
export const LEVELS: readonly LevelDef[] = [
  {
    id: 1, name: 'Checkpoint Alpha', place: 'Border crossing', weapon: 'knife', theme: 'dusk', run: 40, range: 8, par: 55,
    brief: 'Sneak up on the guard post. They are close — use the blade.',
    map: { x: 9, y: 74 },
    enemies: [e(-1, 400, 1, 3800, 7, 'crate'), e(0, 1600, 1, 3600, 7, 'barrier'), e(1, 2800, 1, 3800, 7, 'crate')],
  },
  {
    id: 2, name: 'Dead Street', place: 'Abandoned downtown', weapon: 'pistol', theme: 'noon', run: 50, range: 14, par: 70,
    brief: 'Open street, light resistance. Flick to fire, crouch to reload.',
    map: { x: 22, y: 42 },
    enemies: [e(-1, 400, 3, 3400, 8, 'barrier'), e(1, 1400, 3, 3400, 8, 'barrier'), e(0, 2600, 3, 3200, 9, 'crate'), e(-1, 4200, 3, 3200, 9, 'crate')],
  },
  {
    id: 3, name: 'Warehouse Row', place: 'Industrial district', weapon: 'deagle', theme: 'overcast', run: 55, range: 16, par: 80,
    brief: 'Hard-hitting, slow to fire. One flanker is hidden — lean to find him.',
    map: { x: 36, y: 68 },
    enemies: [e(-1, 400, 2, 3200, 9, 'crate'), e(0, 1400, 2, 3000, 10, 'barrier'), e(1, 2400, 2, 3200, 9, 'crate'), e(1, 3800, 2, 3000, 10, 'wall', { hideSide: 1, dx: 2.2 })],
  },
  {
    id: 4, name: 'Rooftop Run', place: 'Old harbour', weapon: 'rifle', theme: 'golden', run: 60, range: 20, par: 90,
    brief: 'Steady, accurate fire from the shoulder. Watch for volley markers.',
    map: { x: 50, y: 35 },
    enemies: [e(-1, 300, 3, 3000, 10, 'barrier'), e(0, 1200, 3, 2900, 10, 'crate'), e(1, 2100, 3, 3000, 10, 'barrier'), e(-1, 3600, 3, 2800, 11, 'wall', { hideSide: -1, dx: -2.4 }), e(1, 4800, 3, 2800, 11, 'crate')],
  },
  {
    id: 5, name: 'Night Raid', place: 'Fuel depot', weapon: 'auto', theme: 'night', run: 65, range: 18, par: 95,
    brief: 'Many targets. Hold the trigger pose and sweep — but mind your magazine.',
    map: { x: 63, y: 66 },
    enemies: [e(-1, 300, 4, 2800, 10, 'crate'), e(0, 900, 4, 2800, 11, 'barrier'), e(1, 1500, 4, 2800, 10, 'crate'), e(-1, 3200, 4, 2600, 11, 'barrier'), e(0, 3800, 5, 2600, 12, 'wall'), e(1, 4400, 4, 2600, 11, 'barrier')],
  },
  {
    id: 6, name: 'Sniper Alley', place: 'Mountain pass', weapon: 'sniper', theme: 'dawn', run: 70, range: 42, par: 105,
    brief: 'Far targets. Hold steady until the scope locks — then the shot is yours.',
    map: { x: 74, y: 30 },
    enemies: [e(-1, 400, 1, 4200, 14, 'wall', { dx: -1 }), e(1, 1800, 1, 4000, 14, 'wall', { dx: 1 }), e(0, 3200, 1, 4000, 15, 'wall'), e(-1, 4800, 1, 3800, 15, 'wall', { dx: 2 }), e(1, 6000, 2, 3800, 16, 'wall', { heavy: true })],
  },
  {
    id: 7, name: 'Fire Zone', place: 'Burning refinery', weapon: 'bomb', theme: 'inferno', run: 75, range: 22, par: 115,
    brief: 'They are dug in behind cover. Throw bombs — blasts hit everyone nearby.',
    map: { x: 85, y: 62 },
    enemies: [e(-1, 300, 2, 3000, 12, 'barrier', { dx: -0.6 }), e(-1, 500, 2, 3000, 12, 'crate', { dx: 1.2 }), e(0, 1600, 2, 2800, 12, 'barrier'), e(1, 2400, 2, 2800, 13, 'crate', { dx: -1.2 }), e(1, 2600, 2, 2800, 13, 'barrier', { dx: 0.8 }), e(0, 4200, 3, 2800, 14, 'wall', { heavy: true })],
  },
  {
    id: 8, name: 'Last Stand', place: 'Enemy stronghold', weapon: 'rocket', theme: 'storm', run: 80, range: 24, par: 130,
    brief: 'The final push. Load a rocket on your shoulder and push it into the heavies.',
    map: { x: 93, y: 24 },
    enemies: [e(-1, 300, 1, 2800, 13, 'barrier'), e(0, 700, 1, 2800, 13, 'crate'), e(1, 1100, 1, 2800, 13, 'barrier'), e(-1, 3000, 2, 2600, 15, 'wall', { heavy: true }), e(1, 3600, 2, 2600, 15, 'wall', { heavy: true }), e(0, 5200, 3, 2400, 16, 'wall', { heavy: true })],
  },
];

export function levelOf(id: number): LevelDef {
  return LEVELS.find((l) => l.id === id) ?? (LEVELS[0] as LevelDef);
}
