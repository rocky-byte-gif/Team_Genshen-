import { motion } from 'motion/react';
import { useState } from 'react';
import { HoldGesture } from '../../components/HoldGesture';
import type { MotionEngine } from '../../features/engine/MotionEngine';
import { LEVELS, type LevelDef } from '../../features/mad/levels';
import type { MadProgress } from '../../features/mad/madProgress';
import { WEAPONS, weaponOf } from '../../features/mad/weapons';
import { useGestureEvents } from '../../hooks/useEngine';
import { WeaponIcon } from './WeaponIcon';

interface CampaignMapProps {
  engine: MotionEngine;
  progress: MadProgress;
  selected: number;
  onSelect: (id: number) => void;
  onDeploy: (id: number) => void;
  onExit: () => void;
}

/** A smooth route through the mission nodes (map percentages as a 0–100 box). */
function routePath(points: readonly { x: number; y: number }[]): string {
  const first = points[0];
  if (!first) return '';
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as { x: number; y: number };
    const b = points[i] as { x: number; y: number };
    const mx = (a.x + b.x) / 2;
    d += ` C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
  }
  return d;
}

/** Index of the last unlocked node along the route, for drawing the cleared stretch. */
function clearedPath(unlocked: number): string {
  return routePath(LEVELS.slice(0, Math.max(1, unlocked)).map((l) => l.map));
}

function formatTime(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The campaign map: eight missions along a war-zone route, one new weapon each. */
export function CampaignMap({ engine, progress, selected, onSelect, onDeploy, onExit }: CampaignMapProps) {
  const [armedAt] = useState(() => performance.now() + 900);
  const level = LEVELS.find((l) => l.id === selected) as LevelDef;
  const weapon = weaponOf(level.weapon);
  const locked = level.id > progress.unlocked;
  const best = progress.best[level.id];
  const step = (dir: -1 | 1) => onSelect(Math.min(progress.unlocked, Math.max(1, selected + dir)));

  // Leaning left / right moves along the route, like in the main menu.
  useGestureEvents(engine, (event) => {
    if (event.phase !== 'start' || event.timestamp < armedAt) return;
    if (event.type === 'LEAN_LEFT') step(-1);
    else if (event.type === 'LEAN_RIGHT') step(1);
  });

  const cleared = Object.keys(progress.best).length;

  return (
    <div className="mad-map">
      <header className="mad-map__head">
        <div>
          <p className="mad-eyebrow">Shadow Protocol · {cleared}/{LEVELS.length} cleared</p>
          <h1 className="mad-title">
            <span>SHADOW</span> PROTOCOL
          </h1>
          <p className="mad-sub">MOVE · PEEK · AIM · COMBAT</p>
        </div>
        <button type="button" className="mad-btn mad-btn--ghost" onClick={onExit}>
          ← Menu
        </button>
      </header>

      <section className="mad-map__stage" aria-label="Mission map">
        <svg className="mad-map__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <pattern id="madgrid" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M5 0H0V5" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.15" />
            </pattern>
            <radialGradient id="madglow" cx="50%" cy="50%" r="60%">
              <stop offset="0" stopColor="rgba(255,60,60,0.16)" />
              <stop offset="1" stopColor="rgba(255,60,60,0)" />
            </radialGradient>
          </defs>
          <rect width="100" height="100" fill="url(#madgrid)" />
          <rect width="100" height="100" fill="url(#madglow)" />
          {[18, 36, 54, 72].map((y, i) => (
            <path key={y} d={`M0 ${y} C 25 ${y - 7 + i * 2}, 60 ${y + 8 - i * 2}, 100 ${y - 3}`} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={routePath(LEVELS.map((l) => l.map))} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" strokeDasharray="1.5 2" vectorEffect="non-scaling-stroke" />
          <path d={clearedPath(progress.unlocked)} fill="none" stroke="#ff2b3a" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="mad-map__route" />
        </svg>

        {LEVELS.map((l) => {
          const isLocked = l.id > progress.unlocked;
          const b = progress.best[l.id];
          return (
            <motion.button
              key={l.id}
              type="button"
              className={`mad-node ${l.id === selected ? 'is-selected' : ''} ${isLocked ? 'is-locked' : ''} ${b ? 'is-cleared' : ''}`}
              style={{ left: `${l.map.x}%`, top: `${l.map.y}%` }}
              onClick={() => (isLocked ? undefined : onSelect(l.id))}
              aria-label={`Mission ${l.id}: ${l.name}${isLocked ? ' (locked)' : ''}`}
              aria-disabled={isLocked}
              whileHover={isLocked ? undefined : { scale: 1.08 }}
              whileTap={isLocked ? undefined : { scale: 0.96 }}
            >
              <span className="mad-node__num">{String(l.id).padStart(2, '0')}</span>
              <span className="mad-node__icon">{isLocked ? <LockGlyph /> : <WeaponIcon id={l.weapon} size={20} />}</span>
              {b && <span className={`mad-node__rating mad-rating--${b.rating}`}>{b.rating}</span>}
              <span className="mad-node__name">{l.name}</span>
            </motion.button>
          );
        })}
      </section>

      <aside className="mad-brief">
        <p className="mad-eyebrow">Mission {String(level.id).padStart(2, '0')} · {level.place}</p>
        <h2 className="mad-brief__title">{level.name}</h2>
        <p className="mad-brief__text">{level.brief}</p>
        <div className="mad-brief__weapon">
          <WeaponIcon id={weapon.id} size={44} />
          <div>
            <strong>{weapon.name}</strong>
            <span>{weapon.gesture}</span>
          </div>
        </div>
        <dl className="mad-brief__stats">
          <div><dt>Run</dt><dd>{level.run} m</dd></div>
          <div><dt>Enemies</dt><dd>{level.enemies.length}</dd></div>
          <div><dt>S-rank par</dt><dd>{formatTime(level.par * 1000)}</dd></div>
          <div><dt>Best</dt><dd>{best ? `${best.rating} · ${best.score.toLocaleString('en-US')}` : '—'}</dd></div>
        </dl>
        {locked ? (
          <p className="mad-brief__locked">Clear mission {level.id - 1} to unlock</p>
        ) : (
          <div className="mad-brief__actions">
            <HoldGesture engine={engine} label="Deploy" onConfirm={() => onDeploy(level.id)} />
            <p className="mad-hint">Lean left / right to pick a mission · jump to deploy</p>
          </div>
        )}
      </aside>

      <footer className="mad-arsenal" aria-label="Weapon progression">
        {WEAPONS.map((w) => {
          const open = w.order <= progress.unlocked;
          return (
            <div key={w.id} className={`mad-slot ${open ? 'is-open' : ''} ${w.order === selected ? 'is-selected' : ''}`}>
              <span className="mad-slot__n">{w.order}</span>
              <WeaponIcon id={w.id} size={26} />
              <span className="mad-slot__name">{open ? w.name : '???'}</span>
            </div>
          );
        })}
      </footer>
    </div>
  );
}

function LockGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
