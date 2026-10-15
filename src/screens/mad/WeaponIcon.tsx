import type { WeaponId } from '../../features/mad/weapons';

/** Flat weapon silhouettes (the deck's weapon icons), drawn on a 64×32 grid. */
const SHAPES: Record<WeaponId, string> = {
  knife: 'M6 22 L40 10 L50 12 L42 18 L14 26 Z M4 22 L14 26 L12 29 L3 25 Z',
  pistol: 'M12 10 H44 V16 H30 L28 28 H20 L22 16 H12 Z',
  deagle: 'M8 9 H50 V16 H34 L32 28 H24 L26 16 H8 Z M50 10 H56 V14 H50 Z',
  rifle: 'M2 14 H18 L24 11 H44 V14 H62 V17 H44 V19 H34 L32 28 H27 L28 19 H18 L12 26 H5 L9 14 Z',
  auto: 'M6 12 H44 V17 H50 V20 H30 L29 29 H24 L26 20 H14 L10 27 H5 L8 17 H6 Z M44 13 H58 V16 H44 Z',
  sniper: 'M2 17 H20 L24 14 H30 V11 H38 V14 H44 V16 H62 V18 H44 V20 H26 L22 28 H16 L19 20 H2 Z',
  bomb: 'M24 12 A10 11 0 1 0 24 34 A10 11 0 1 0 24 12 Z M22 8 H30 V12 H22 Z M30 9 L38 6 L39 9 L31 12 Z',
  rocket: 'M2 13 H46 L58 10 V22 L46 19 H2 Z M20 19 H28 L26 28 H20 Z',
};

export function WeaponIcon({ id, size = 48, className }: { id: WeaponId; size?: number; className?: string }) {
  return (
    <svg className={className} width={size * 2} height={size} viewBox="0 0 64 32" aria-hidden="true" fill="currentColor">
      <path d={SHAPES[id]} />
    </svg>
  );
}
