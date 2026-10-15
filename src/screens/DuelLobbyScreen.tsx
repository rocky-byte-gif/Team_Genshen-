import { useEffect, useState } from 'react';
import { CameraViewport } from '../components/CameraViewport';
import { HoldGesture } from '../components/HoldGesture';
import { Icon } from '../components/Icon';
import type { MotionEngine } from '../features/engine/MotionEngine';
import { normalizeRoomCode, type DuelRoom } from '../features/online/DuelRoom';
import { useStore } from '../lib/store';
import './DuelLobbyScreen.css';

interface DuelLobbyScreenProps {
  engine: MotionEngine;
  room: DuelRoom | null;
  /** Code from an invite link (?room=CODE). */
  initialCode?: string;
  onCreate: () => void;
  onJoin: (code: string) => void;
  /** Quick match: waiting for a random opponent. */
  searching: boolean;
  /** Last quick-match problem, if any. */
  notice?: string | null;
  onQuick: () => void;
  onCancelQuick: () => void;
  onLeave: () => void;
  onStart: (seed: number) => void;
}

function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}?room=${code}`;
}

function RoomView({ engine, room, onLeave, onStart }: { engine: MotionEngine; room: DuelRoom; onLeave: () => void; onStart: (seed: number) => void }) {
  const [copied, setCopied] = useState(false);
  const status = useStore(room.ui, (s) => s.status);
  const players = useStore(room.ui, (s) => s.players);
  const seed = useStore(room.ui, (s) => s.seed);
  const error = useStore(room.ui, (s) => s.error);
  const me = players.find((p) => p.id === room.me.id);
  const opponent = players.find((p) => p.id !== room.me.id);

  useEffect(() => {
    if (status === 'starting' && seed !== null) onStart(seed);
  }, [status, seed, onStart]);

  if (status === 'error') {
    return (
      <div className="lobby__card">
        <p className="lobby__error">{error}</p>
        <button type="button" className="btn btn--ghost" onClick={onLeave}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="lobby__card">
      <p className="t-label">Room code — share it with your opponent</p>
      <p className="lobby__code" aria-live="polite">
        {room.code}
      </p>
      <button
        type="button"
        className="btn btn--ghost btn--small"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(inviteLink(room.code))
            .then(() => setCopied(true))
            .catch(() => undefined);
        }}
      >
        {copied ? 'Link copied — send it to your opponent' : 'Copy invite link'}
      </button>
      {status === 'connecting' && <p className="lobby__hint">Connecting…</p>}
      <ul className="lobby__players">
        {[me ?? { ...room.me }, opponent].map((p, i) => (
          <li key={p?.id ?? `empty-${i}`} className={p?.ready ? 'is-ready' : ''}>
            <span className="lobby__dot" />
            <span className="lobby__name">{p ? `${p.name}${p.id === room.me.id ? ' (you)' : ''}` : 'Waiting for opponent…'}</span>
            <span className="lobby__state">{p ? (p.ready ? 'ready' : 'not ready') : ''}</span>
          </li>
        ))}
      </ul>
      {status === 'lobby' && (
        <div className="lobby__actions">
          {me?.ready ? (
            <button type="button" className="btn btn--ghost" onClick={() => void room.setReady(false)}>
              Cancel ready
            </button>
          ) : (
            <HoldGesture engine={engine} label="I'm Ready" onConfirm={() => void room.setReady(true)} />
          )}
          <p className="lobby__hint">
            {opponent ? 'Game starts when both players are ready.' : 'Have your opponent open MOTION//RUSH → Online Duel → "Join by code".'}
          </p>
        </div>
      )}
      <button type="button" className="btn btn--link" onClick={onLeave}>
        Leave room
      </button>
    </div>
  );
}

/** Online duel lobby: create a room or join one by its 4-letter code. */
export function DuelLobbyScreen({ engine, room, initialCode = '', searching, notice = null, onCreate, onJoin, onQuick, onCancelQuick, onLeave, onStart }: DuelLobbyScreenProps) {
  const [code, setCode] = useState(() => normalizeRoomCode(initialCode));

  useEffect(() => {
    engine.setExpected(null);
  }, [engine]);

  return (
    <main className="screen lobby">
      <aside className="lobby__side">
        <CameraViewport engine={engine} variant="pip" hud={false} />
        <p className="lobby__hint">Both players race the same course simultaneously. You see your opponent running in the adjacent lane — the higher score wins.</p>
      </aside>
      <section className="lobby__main">
        <p className="t-label">Online Duel</p>
        <h1 className="t-headline">1v1 Race</h1>
        {room ? (
          <RoomView engine={engine} room={room} onLeave={onLeave} onStart={onStart} />
        ) : searching ? (
          <div className="lobby__card">
            <p className="lobby__searching">Finding an opponent…</p>
            <p className="lobby__hint">As soon as another player clicks "Quick Match", you will be placed in a room together.</p>
            <button type="button" className="btn btn--ghost" onClick={onCancelQuick}>
              Cancel Search
            </button>
          </div>
        ) : (
          <div className="lobby__card">
            {notice && <p className="lobby__error">{notice}</p>}
            <button type="button" className="btn btn--primary" onClick={onQuick}>
              <Icon name="bolt" size={18} /> Quick Match — random opponent
            </button>
            <button type="button" className="btn btn--ghost" onClick={onCreate}>
              <Icon name="users" size={18} /> Create Room for a friend
            </button>
            <form
              className="lobby__join"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.length === 4) onJoin(code);
              }}
            >
              <input
                className="nick__input lobby__code-input"
                value={code}
                onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
                placeholder="CODE"
                aria-label="Room code"
                inputMode="text"
                autoCapitalize="characters"
              />
              <button type="submit" className="btn btn--ghost" disabled={code.length !== 4}>
                Join by code
              </button>
            </form>
            <button type="button" className="btn btn--link" onClick={onLeave}>
              Back to modes
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
