import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { CameraViewport } from '../../components/CameraViewport';
import { HoldGesture } from '../../components/HoldGesture';
import { Icon } from '../../components/Icon';
import { NicknameField } from '../../components/NicknameField';
import type { MotionEngine } from '../../features/engine/MotionEngine';
import type { SessionResult } from '../../features/gameplay/types';
import { motionMeta, type ControlScheme } from '../../features/gestures/types';
import { difficultyOf } from '../../features/modes/difficulty';
import { supportsDifficulty, type GameModeDef } from '../../features/modes/modes';
import type { DuelRoom } from '../../features/online/DuelRoom';
import { submitScore } from '../../features/online/globalLeaderboard';
import { computeSessionStats, type MoveStats } from '../../features/results/sessionStats';
import { useStore } from '../../lib/store';
import type { Profile, RecordedSession } from '../../lib/storage';
import { ONLINE_ENABLED } from '../../lib/supabase';
import { RollingNumber } from '../game/RollingNumber';
import { MoveBars } from './MoveBars';
import { ScoreTimeline } from './ScoreTimeline';
import './ResultsScreen.css';

interface ResultsScreenProps {
  engine: MotionEngine;
  result: SessionResult;
  mode: GameModeDef;
  recorded: RecordedSession | null;
  profile: Profile;
  duel: DuelRoom | null;
  onProfile: (profile: Profile) => void;
  onPlayAgain: () => void;
  onModes: () => void;
  onRecalibrate: () => void;
  onLeaderboard: () => void;
}

const seconds = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`;

/** Error mode in four words: how every move is judged (the same labels as the in-game hint). */
const VERDICTS = [
  { tone: 'correct', label: 'Clear', text: 'movement cleared' },
  { tone: 'near', label: 'Almost', text: 'not enough amplitude — the meter shows how much' },
  { tone: 'wrong', label: 'Fix', text: 'technique error — hint indicates body part and direction' },
  { tone: 'other', label: 'Wrong Move', text: 'performed another gesture — hint will remind you of the right one' },
] as const;

function MoveCard({ title, move, tone, scheme }: { title: string; move: MoveStats | null; tone: 'good' | 'work'; scheme: ControlScheme }) {
  if (!move) return null;
  const meta = motionMeta(move.motion, scheme);
  return (
    <div className={`move-card move-card--${tone}`}>
      <span className="t-label">{title}</span>
      <span className="move-card__name">
        {meta.arrow && <Icon name={meta.arrow} size={18} />}
        {meta.title}
      </span>
      <span className="move-card__detail">
        {Math.round(move.accuracy * 100)}% · {move.cleared} of {move.attempts}
        {move.avgLeadMs !== null && ` · in position in ${(move.avgLeadMs / 1000).toFixed(1)}s`}
      </span>
      {tone === 'work' && <span className="move-card__tip">{meta.cue}</span>}
    </div>
  );
}

/** idle = the request is on its way (it starts as soon as there is a nickname). */
type SubmitState = 'idle' | 'sent' | 'failed';
/** What the global leaderboard needs from a finished run (runner or dance). */
interface RankedRun {
  mode: string;
  score: number;
  bestCombo: number;
  scheme: ControlScheme;
}

/** Results already sent (guards against double effects and remounts). */
const submitted = new WeakSet<RankedRun>();

/** Sends a ranked run to the global leaderboard (asks for a nickname first). */
export function GlobalSubmit({ result, accuracy, profile, onProfile, onLeaderboard }: { result: RankedRun; accuracy: number; profile: Profile; onProfile: (p: Profile) => void; onLeaderboard: () => void }) {
  const [state, setState] = useState<SubmitState>(() => (submitted.has(result) ? 'sent' : 'idle'));
  const name = profile.nickname;

  useEffect(() => {
    if (!ONLINE_ENABLED || name.length < 2 || submitted.has(result)) return;
    submitted.add(result);
    void submitScore({ name, mode: result.mode, score: result.score, accuracy, bestCombo: result.bestCombo, scheme: result.scheme }).then((ok) =>
      setState(ok ? 'sent' : 'failed'),
    );
  }, [name, result, accuracy]);

  if (!ONLINE_ENABLED) return <p className="board__note">Global leaderboard not connected — result saved locally on this device.</p>;
  if (name.length < 2) {
    return (
      <div className="global-submit">
        <p className="board__note">Enter a nickname — and your result will appear on the global leaderboard.</p>
        <NicknameField value={name} onSaved={(nickname) => onProfile({ ...profile, nickname })} compact />
      </div>
    );
  }
  return (
    <p className="board__note">
      {state === 'idle' && 'Submitting to global leaderboard…'}
      {state === 'sent' && (
        <>
          Result for <strong>{name}</strong> submitted to global leaderboard.{' '}
          <button type="button" className="btn btn--link" onClick={onLeaderboard}>
            View
          </button>
        </>
      )}
      {state === 'failed' && 'Failed to submit result — check your internet connection.'}
    </p>
  );
}

/** Online duel verdict: waits for the opponent's final state. */
function DuelVerdict({ room, score }: { room: DuelRoom; score: number }) {
  const opponent = useStore(room.ui, (s) => s.opponent);
  const players = useStore(room.ui, (s) => s.players);
  const left = !players.some((p) => p.id !== room.me.id);

  // The opponent may still be running (or may have missed a packet): keep re-sending our final state.
  useEffect(() => {
    room.resendLast();
    const timer = window.setInterval(() => room.resendLast(), 1500);
    return () => window.clearInterval(timer);
  }, [room]);

  const theirs = opponent?.score ?? 0;
  let verdict: string;
  let tone: 'win' | 'lose' | 'wait';
  if (opponent?.finished) {
    verdict = score > theirs ? 'Victory!' : score < theirs ? 'Defeat' : 'Draw';
    tone = score >= theirs ? 'win' : 'lose';
  } else if (left) {
    verdict = 'Opponent left — victory is yours';
    tone = 'win';
  } else {
    verdict = 'Opponent still running…';
    tone = 'wait';
  }

  return (
    <div className={`duel-verdict duel-verdict--${tone}`} role="status">
      <span className="t-label">Online Duel · Room {room.code}</span>
      <strong className="duel-verdict__title">{verdict}</strong>
      <span className="duel-verdict__scores">
        You: <b>{score.toLocaleString('en-US')}</b> · {room.opponentName}: <b>{theirs.toLocaleString('en-US')}</b>
        {opponent?.finished && opponent.accuracy !== null && ` (${Math.round(opponent.accuracy * 100)}%)`}
      </span>
    </div>
  );
}

export function ResultsScreen({ engine, result, mode, recorded, profile, duel, onProfile, onPlayAgain, onModes, onRecalibrate, onLeaderboard }: ResultsScreenProps) {
  const stats = useMemo(() => computeSessionStats(result), [result]);
  const accuracy = Math.round(stats.accuracy * 100);
  const board = recorded?.profile.leaderboards[result.mode] ?? [];

  useEffect(() => {
    engine.setExpected(null);
  }, [engine]);

  const tiles = [
    { label: 'Best Combo', value: String(result.bestCombo) },
    { label: 'Gestures Detected', value: String(result.gesturesDetected) },
    { label: 'Session Time', value: seconds(result.durationMs) },
    { label: 'Perfect Timing', value: `${stats.perfect} of ${stats.total}` },
    {
      label: 'Lead Time Before Obstacle',
      value: stats.avgLeadMs === null ? '—' : `${(stats.avgLeadMs / 1000).toFixed(1)}s`,
    },
    { label: 'Orbs Collected', value: `${result.orbsCollected} of ${result.orbsTotal}` },
  ];

  // With the difficulty a run may start with one life even in a five-life mode.
  const headline = result.outcome === 'complete' ? 'Track Cleared' : (result.lives ?? mode.energy) === 1 ? 'Game Over' : 'Out of Energy';
  const level = result.difficulty && supportsDifficulty(mode) ? difficultyOf(result.difficulty).title : null;
  // A human sentence first — numbers come after.
  const verdict =
    accuracy >= 90
      ? 'Spectacular! Your body responded with perfect precision.'
      : accuracy >= 70
        ? 'Great run! Just a bit more practice and it will be flawless.'
        : accuracy >= 40
          ? 'Good start! Check below for what worked well and what to improve.'
          : 'Great warm-up! Review the tips below and try again.';

  return (
    <main className="screen results">
      <header className="results__hero">
        <div className="results__headline">
          <p className="t-label">
            {mode.title}
            {level && ` · ${level}`} · {headline}
          </p>
          <motion.div
            className="results__score"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <RollingNumber value={result.score} duration={1.2} />
          </motion.div>
          <p className="results__score-caption">
            points
            {recorded?.isNewBest && <span className="badge badge--success">New High Score</span>}
            {recorded?.rank && !recorded.isNewBest && <span className="badge">#{recorded.rank} in personal records</span>}
          </p>
          <p className="results__verdict">{verdict}</p>
          {duel && <DuelVerdict room={duel} score={result.score} />}
        </div>
        <div className="results__actions">
          <CameraViewport engine={engine} variant="pip" hud={false} trail={false} />
          <div className="results__buttons">
            <HoldGesture engine={engine} label={duel ? 'Rematch' : 'Play Again'} onConfirm={onPlayAgain} />
            <div className="results__links">
              <button type="button" className="btn btn--ghost btn--small" onClick={onModes}>
                Menu
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={onLeaderboard}>
                Leaderboard
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={onRecalibrate}>
                Recalibrate
              </button>
            </div>
          </div>
        </div>
      </header>

      <section className="results__grid">
        <div className="tile tile--hero">
          <span className="t-label">Movement Accuracy</span>
          <span className="tile__hero-value">{accuracy}%</span>
          <span className="tile__sub">
            {stats.cleared} of {stats.total} obstacles cleared with correct movement
          </span>
          <span className="tile__meter" aria-hidden="true">
            <span style={{ width: `${accuracy}%` }} />
          </span>
        </div>
        {tiles.map((t) => (
          <div key={t.label} className="tile">
            <span className="t-label">{t.label}</span>
            <span className="tile__value">{t.value}</span>
          </div>
        ))}
      </section>

      <section className="results__row">
        <div className="panel">
          <div className="move-cards">
            {/* A "best move" at 0% would be a false compliment. */}
            <MoveCard title="Best Movement" move={stats.strongest && stats.strongest.accuracy > 0 ? stats.strongest : null} tone="good" scheme={result.scheme} />
            <MoveCard title="Needs Practice" move={stats.needsWork} tone="work" scheme={result.scheme} />
          </div>
          <MoveBars moves={stats.perMove} scheme={result.scheme} />
        </div>

        <div className="panel">
          <p className="t-label">Diagnosis Mode</p>
          <h2 className="panel__title">What the System Detected</h2>
          <p className="panel__lead">
            Hints shown: <strong>{stats.hintsShown}</strong> · Corrected after hint:{' '}
            <strong>{stats.errorsCorrected}</strong>
          </p>
          {stats.topMistakes.length > 0 ? (
            <ol className="mistakes">
              {stats.topMistakes.map((m) => (
                <li key={`${m.ruleId}${m.message}`}>
                  <span className="mistakes__count">×{m.count}</span>
                  <span>{m.message}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="panel__empty">Flawless run — all movements registered perfectly.</p>
          )}
          <ul className="verdicts" aria-label="How the system grades movement">
            {VERDICTS.map((v) => (
              <li key={v.tone} data-tone={v.tone}>
                <b>{v.label}</b>
                <span>{v.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="results__row">
        <div className="panel panel--chart">
          <ScoreTimeline result={result} />
        </div>
        {mode.ranked && (
          <div className="panel">
            <p className="t-label">High Scores · {mode.title}</p>
            {board.length > 0 && (
              <ol className="board">
                {board.map((e, i) => (
                  <li key={`${e.date}${i}`} className={recorded?.rank === i + 1 ? 'is-current' : ''}>
                    <span className="board__rank">{i + 1}</span>
                    <span className="board__score">{e.score.toLocaleString('en-US')}</span>
                    <span className="board__meta">
                      {Math.round(e.accuracy * 100)}% · Combo {e.bestCombo}
                    </span>
                    <span className="board__date">
                      {new Date(e.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <GlobalSubmit result={result} accuracy={stats.accuracy} profile={profile} onProfile={onProfile} onLeaderboard={onLeaderboard} />
          </div>
        )}
      </section>
    </main>
  );
}
