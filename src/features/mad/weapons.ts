/**
 * MAD MOVIMIENTO — the eight weapons from the concept deck, in unlock order.
 * Every weapon has its own body gesture ("Weapon-specific gestures" slide).
 */
export type WeaponId = 'boxing' | 'sword' | 'auto' | 'deagle' | 'rifle' | 'sniper' | 'bomb' | 'rocket' | 'knife' | 'pistol';

/** How the weapon is fired with the body (see madInput.ts). */
export type FireStyle = 'punch' | 'slash' | 'flick' | 'hold' | 'scope' | 'throw' | 'push';

export interface WeaponDef {
  id: WeaponId;
  /** 1-based unlock order. */
  order: number;
  name: string;
  style: FireStyle;
  /** Short gesture name, as in the deck. */
  gesture: string;
  /** One line telling the player what to do. */
  how: string;
  /** Damage of one hit. Enemy health is expressed in "hits to kill" × this. */
  damage: number;
  /** Explosion radius in screen units (0 = single target). Screen units: 1 = half of the screen height. */
  splash: number;
  cooldownMs: number;
  /** Rounds per magazine, 0 = unlimited. */
  mag: number;
  reloadMs: number;
  /** Random aim error in screen units. */
  spread: number;
  /** Kick of the weapon model / camera. */
  recoil: number;
  /** Camera field of view while aiming (degrees). */
  fov: number;
  /** Headshot damage multiplier. */
  head: number;
}

export const WEAPONS: readonly WeaponDef[] = [
  { id: 'boxing', order: 1, name: 'Boxing Gloves', style: 'punch', gesture: 'Punch forward (Left / Right)', how: 'Throw punches with either fist to strike the opponent', damage: 45, splash: 0, cooldownMs: 220, mag: 0, reloadMs: 0, spread: 0, recoil: 0.1, fov: 62, head: 1.5 },
  { id: 'sword', order: 2, name: 'Katana Blade', style: 'slash', gesture: 'Slash with arm', how: 'Swing your arm swiftly to strike with the blade', damage: 65, splash: 0, cooldownMs: 340, mag: 0, reloadMs: 0, spread: 0, recoil: 0.2, fov: 62, head: 1.8 },
  { id: 'auto', order: 3, name: 'Automatic Rifle', style: 'hold', gesture: 'Aim & hold to fire', how: 'Hold hands up and aim — smart auto-assist makes precision tracking effortless', damage: 25, splash: 0, cooldownMs: 95, mag: 60, reloadMs: 1400, spread: 0.015, recoil: 0.2, fov: 62, head: 2 },
  { id: 'deagle', order: 4, name: 'Desert Eagle', style: 'flick', gesture: 'Finger gun & flick', how: 'Point a finger gun, flick your wrist up to fire', damage: 70, splash: 0, cooldownMs: 620, mag: 7, reloadMs: 1100, spread: 0.01, recoil: 1, fov: 62, head: 2 },
  { id: 'rifle', order: 5, name: 'Tactical Rifle', style: 'hold', gesture: 'Two-hand shoulder pose', how: 'Bring both hands together at your shoulder to fire', damage: 40, splash: 0, cooldownMs: 430, mag: 24, reloadMs: 1200, spread: 0.01, recoil: 0.6, fov: 58, head: 2 },
  { id: 'sniper', order: 6, name: 'Sniper', style: 'scope', gesture: 'Hold steady, then shoot', how: 'Raise a hand to your eye and hold still until the scope locks', damage: 160, splash: 0, cooldownMs: 1000, mag: 5, reloadMs: 1500, spread: 0, recoil: 1.2, fov: 24, head: 2 },
  { id: 'bomb', order: 7, name: 'Bomb', style: 'throw', gesture: 'Overarm throw', how: 'Raise a hand above your head, then throw it down hard', damage: 90, splash: 0.34, cooldownMs: 1200, mag: 6, reloadMs: 1200, spread: 0.02, recoil: 0.3, fov: 62, head: 1 },
  { id: 'rocket', order: 8, name: 'Rocket Launcher', style: 'push', gesture: 'Shoulder & push', how: 'Rest a hand on your shoulder until loaded, then push it forward', damage: 130, splash: 0.42, cooldownMs: 1700, mag: 4, reloadMs: 1800, spread: 0.015, recoil: 1.4, fov: 60, head: 1 },
  { id: 'knife', order: 9, name: 'Knife', style: 'slash', gesture: 'Slash with arm', how: 'Swing your arm fast across the screen', damage: 60, splash: 0, cooldownMs: 380, mag: 0, reloadMs: 0, spread: 0, recoil: 0.2, fov: 62, head: 1 },
  { id: 'pistol', order: 10, name: 'Pistol', style: 'flick', gesture: 'Finger gun & flick', how: 'Point a finger gun, flick your wrist up to fire', damage: 34, splash: 0, cooldownMs: 320, mag: 10, reloadMs: 900, spread: 0.012, recoil: 0.5, fov: 62, head: 2 },
];

export function weaponOf(id: WeaponId): WeaponDef {
  return WEAPONS.find((w) => w.id === id) ?? (WEAPONS[0] as WeaponDef);
}
