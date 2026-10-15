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
    id: 1, name: 'The Underground Ring', place: 'Boxing Arena', weapon: 'boxing', theme: 'golden', run: 35, range: 6, par: 50,
    brief: 'Round 1: Step into the ring against a CPU boxer. Throw left and right punches with your fists to knock him out.',
    map: { x: 9, y: 74 },
    enemies: [e(0, 300, 5, 2800, 10, 'barrier')],
  },
  {
    id: 2, name: 'Dojo Showdown', place: 'Ancient Courtyard', weapon: 'sword', theme: 'dusk', run: 40, range: 7, par: 60,
    brief: 'Round 2: A lethal swordmaster awaits in single combat. Swing your arm to slash and parry with your blade.',
    map: { x: 22, y: 42 },
    enemies: [e(0, 300, 6, 2600, 12, 'barrier')],
  },
  {
    id: 3, name: 'Rooftop Stronghold', place: 'Industrial Outpost', weapon: 'auto', theme: 'night', run: 45, range: 16, par: 70,
    brief: 'Round 3: Automatic rifle combat. Smart aim-assist tracks your target for effortless precision elimination.',
    map: { x: 36, y: 68 },
    enemies: [e(0, 300, 7, 2400, 12, 'barrier'), e(1, 2400, 5, 2500, 12, 'crate')],
  },
  {
    id: 4, name: 'Desert Crossing', place: 'Border district', weapon: 'deagle', theme: 'overcast', run: 55, range: 16, par: 80,
    brief: 'Hard-hitting Desert Eagle. Flick your wrist to fire with high stopping power.',
    map: { x: 50, y: 35 },
    enemies: [e(-1, 400, 2, 3200, 9, 'crate'), e(0, 1400, 2, 3000, 10, 'barrier'), e(1, 2400, 2, 3200, 9, 'crate')],
  },
  {
    id: 5, name: 'Tactical Assault', place: 'Harbour front', weapon: 'rifle', theme: 'noon', run: 60, range: 20, par: 90,
    brief: 'Rifle marksmanship from the shoulder. Watch for volley markers and return fire.',
    map: { x: 63, y: 66 },
    enemies: [e(-1, 300, 3, 3000, 10, 'barrier'), e(0, 1200, 3, 2900, 10, 'crate'), e(1, 2100, 3, 3000, 10, 'barrier')],
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
