import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { CameraViewport } from '../../components/CameraViewport';
import { HoldGesture } from '../../components/HoldGesture';
import type { MotionEngine } from '../../features/engine/MotionEngine';
import { levelOf, LEVELS } from '../../features/mad/levels';
import { MadGame, type FxEvent, type MadHud, type MadResult, type MadTune } from '../../features/mad/MadGame';
import { madAudio } from '../../features/mad/madAudio';
import { MadInput, NEUTRAL_CONTROLS, type KeyState, type MadControls } from '../../features/mad/madInput';
import { loadMadProgress, recordMission, type MadProgress, type RecordedMission } from '../../features/mad/madProgress';
import { MadScene } from '../../features/mad/MadScene';
import { weaponOf, WEAPONS } from '../../features/mad/weapons';
import { difficultyOf, type Difficulty } from '../../features/modes/difficulty';
import { useEngineFrame } from '../../hooks/useEngine';
import { sfx } from '../../lib/audio/sfx';
import { CampaignMap } from './CampaignMap';
import { WeaponIcon } from './WeaponIcon';
import './MadScreen.css';

type Stage = 'map' | 'briefing' | 'countdown' | 'playing' | 'done';

interface Session {
  runId: number;
  levelId: number;
  game: MadGame;
  input: MadInput;
}

interface MadScreenProps {
  engine: MotionEngine;
  difficulty: Difficulty;
  /** Called once per finished mission (achievements, local stats). */
  onRecord: (result: MadResult) => void;
  onExit: () => void;
}

const DAMAGE: Record<Difficulty, number> = { easy: 0.7, normal: 1, hard: 1.25, expert: 1.5 };
const COUNTDOWN_STEP_MS = 700;

const KEYS_IDLE: KeyState = { run: false, left: false, right: false, crouch: false, hold: false, aim: { x: 0, y: 0 }, fire: false, charge: false, cameraToggle: false };

function mmss(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function MadScreen({ engine, difficulty, onRecord, onExit }: MadScreenProps) {
  const [progress, setProgress] = useState<MadProgress>(() => loadMadProgress());
  const [selected, setSelected] = useState(() => Math.min(loadMadProgress().unlocked, LEVELS.length));
  const [stage, setStageState] = useState<Stage>('map');
  const [session, setSession] = useState<Session | null>(null);
  const [hud, setHud] = useState<MadHud | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [result, setResult] = useState<{ r: MadResult; rec: RecordedMission } | null>(null);
  const [cameraMode, setCameraMode] = useState<'fpp' | 'tpp'>('fpp');
  const [cameraToast, setCameraToast] = useState<string | null>(null);

  const stageRef = useRef<Stage>('map');
  const sessionRef = useRef<Session | null>(null);
  const progressRef = useRef(progress);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<MadScene | null>(null);
  const crossRef = useRef<HTMLDivElement>(null);
  const hurtRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);
  const seenSince = useRef<number | null>(null);
  const countdownAt = useRef(0);
  const countdownRef = useRef<number | null>(null);
  const hudKey = useRef('');
  const keys = useRef<{ active: boolean; state: KeyState }>({ active: false, state: { ...KEYS_IDLE, aim: { x: 0, y: 0 } } });
  const lastControls = useRef<MadControls>(NEUTRAL_CONTROLS);
  const toastTimer = useRef<number | null>(null);

  const setStage = useCallback((s: Stage) => {
    stageRef.current = s;
    setStageState(s);
  }, []);

  const toggleCamera = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const mode = scene.toggleCameraMode();
    setCameraMode(mode);
    madAudio.cameraSwitch();
    setCameraToast(mode === 'tpp' ? 'Third Person View (TPP)' : 'First Person View (FPP)');
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setCameraToast(null), 2500);
  }, []);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // Start a mission: a fresh game, a fresh WebGL canvas (see the key on <canvas>).
  const deploy = useCallback(
    (levelId: number) => {
      const level = levelOf(levelId);
      const tune: MadTune = { damage: DAMAGE[difficulty], score: difficultyOf(difficulty).score };
      const input = new MadInput();
      input.style = weaponOf(level.weapon).style;
      const next: Session = { runId: (sessionRef.current?.runId ?? 0) + 1, levelId, game: new MadGame(level, tune), input };
      sessionRef.current = next;
      setSession(next);
      setSelected(levelId);
      setResult(null);
      setHud(next.game.hud());
      hudKey.current = '';
      seenSince.current = null;
      setCountdown(null);
      setCameraMode('fpp');
      setStage('briefing');
    },
    [difficulty, setStage],
  );

  const toMap = useCallback(() => {
    sessionRef.current = null;
    setSession(null);
    setHud(null);
    setCountdown(null);
    setStage('map');
  }, [setStage]);

  // The 3D scene lives as long as the session.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !session) return;
    const level = levelOf(session.levelId);
    let scene: MadScene;
    try {
      scene = new MadScene(canvas, level, weaponOf(level.weapon), engine.frame.renderLevel);
    } catch (error) {
      console.error('WebGL scene failed to start', error);
      return;
    }
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      if (sceneRef.current === scene) sceneRef.current = null;
    };
  }, [session, engine]);

  // Keyboard and mouse stand in for the camera (testing, accessibility).
  useEffect(() => {
    const k = keys.current;
    const map = (e: KeyboardEvent, down: boolean) => {
      const s = k.state;
      let hit = true;
      switch (e.code) {
        case 'KeyW': case 'Space': s.run = down; break;
        case 'KeyA': case 'ArrowLeft': s.left = down; break;
        case 'KeyD': case 'ArrowRight': s.right = down; break;
        case 'KeyS': case 'ControlLeft': s.crouch = down; break;
        case 'ShiftLeft': s.hold = down; break;
        case 'KeyE': s.charge = down; break;
        case 'KeyF': s.fire = down; break;
        case 'KeyV': s.cameraToggle = down; break;
        default: hit = false;
      }
      if (hit && stageRef.current !== 'map') {
        k.active = true;
        e.preventDefault();
      }
    };
    const kd = (e: KeyboardEvent) => map(e, true);
    const ku = (e: KeyboardEvent) => map(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []);

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    keys.current.state.aim = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) };
  };
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (stageRef.current !== 'playing') return;
    onPointerMove(e);
    keys.current.active = true;
    keys.current.state.fire = true;
  };
  const onPointerUp = () => {
    keys.current.state.fire = false;
  };

  const finish = (s: Session) => {
    stageRef.current = 'done';
    const r = s.game.result();
    const rec = recordMission(r, progressRef.current);
    setProgress(rec.progress);
    setResult({ r, rec });
    onRecord(r);
    setStage('done');
  };

  const playFx = (fx: readonly FxEvent[], weaponId: string) => {
    for (const f of fx) {
      switch (f.t) {
        case 'shot':
          if (weaponId === 'boxing') {
            madAudio.punchWhoosh();
          } else if (weaponId === 'sword') {
            madAudio.swordSwoosh();
          } else {
            madAudio.shot(f.weapon);
          }
          break;
        case 'hit':
          if (weaponId === 'boxing') {
            madAudio.punchHit(f.head);
          } else if (weaponId === 'sword') {
            madAudio.swordClash();
          } else {
            madAudio.hit(f.head);
          }
          break;
        case 'kill':
          if (weaponId === 'boxing') {
            madAudio.punchHit(true);
          } else if (weaponId === 'sword') {
            madAudio.swordClash();
          } else {
            madAudio.hit(true);
          }
          break;
        case 'explosion': madAudio.explosion(weaponId === 'bomb' ? 0.25 : 0.05); break;
        case 'volley': madAudio.volley(f.blocked); break;
        case 'hurt': madAudio.hurt(); break;
        case 'dry': madAudio.dry(); break;
        case 'reload': madAudio.reload(); break;
        default: break;
      }
    }
  };

  useEngineFrame(engine, (frame, dt) => {
    const s = sessionRef.current;
    if (!s) return;
    const st = stageRef.current;
    const now = frame.time;
    const scene = sceneRef.current;
    const level = levelOf(s.levelId);
    const weapon = weaponOf(level.weapon);
    const kb = keys.current.active ? keys.current.state : null;

    if (st === 'briefing') {
      // Starts automatically when trackable or after keypress / user in frame.
      const seen = frame.trackable || (frame.trackable && frame.pose !== null) || kb !== null;
      seenSince.current = seen ? (seenSince.current ?? now) : null;
      if (seenSince.current !== null && now - seenSince.current > 1000) {
        countdownAt.current = now;
        countdownRef.current = 3;
        setCountdown(3);
        setStage('countdown');
        sfx.play('tick');
      }
    } else if (st === 'countdown') {
      const left = 3 - Math.floor((now - countdownAt.current) / COUNTDOWN_STEP_MS);
      if (left <= 0) {
        countdownRef.current = null;
        setCountdown(null);
        s.input.reset();
        setStage('playing');
        sfx.play('go');
      } else if (left !== countdownRef.current) {
        countdownRef.current = left;
        setCountdown(left);
        sfx.play('tick');
      }
    }

    const live = stageRef.current === 'playing';
    const controls = stageRef.current === 'done' ? { ...NEUTRAL_CONTROLS, aim: lastControls.current.aim } : s.input.update(frame, dt, kb);
    lastControls.current = controls;

    if (controls.cameraToggle && scene) {
      const mode = scene.toggleCameraMode();
      setCameraMode(mode);
      madAudio.cameraSwitch();
      setCameraToast(mode === 'tpp' ? 'Third Person View (TPP)' : 'First Person View (FPP)');
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setCameraToast(null), 2500);
    }

    const aspect = scene?.aspect ?? 16 / 9;
    if (live && scene) {
      const sounds = s.game.update(controls, dt, aspect, scene.targets);
      for (const snd of sounds) sfx.play(snd);
    }
    const fx = s.game.drainFx();
    playFx(fx, weapon.id);
    scene?.render(s.game, controls, dt, frame.renderLevel, fx);

    // Crosshair, damage flash and speed bar are written straight to the DOM.
    const cross = crossRef.current;
    if (cross) {
      const show = live && s.game.phase !== 'run';
      cross.style.opacity = show ? '1' : '0';
      cross.style.left = `${(controls.aim.x * 0.5 + 0.5) * 100}%`;
      cross.style.top = `${(0.5 - controls.aim.y * 0.5) * 100}%`;
      cross.style.setProperty('--charge', String(controls.charge));
      cross.dataset.scope = weapon.style === 'scope' && controls.charge > 0.04 ? '1' : '0';
      cross.dataset.armed = controls.held || controls.charge >= 0.99 ? '1' : '0';
    }
    if (hurtRef.current) hurtRef.current.style.opacity = String(Math.min(1, s.game.hurt));
    if (speedRef.current) speedRef.current.style.transform = `scaleX(${Math.min(1, s.game.speed)})`;

    const next = s.game.hud();
    const key = JSON.stringify({ ...next, timeMs: Math.floor(next.timeMs / 1000) });
    if (key !== hudKey.current) {
      hudKey.current = key;
      setHud(next);
    }
    if (live && s.game.done) finish(s);
  });

  const level = session ? levelOf(session.levelId) : null;
  const weapon = level ? weaponOf(level.weapon) : null;
  const inMission = stage !== 'map' && session && level && weapon;
  const nextId = level && result?.r.cleared && level.id < LEVELS.length ? level.id + 1 : null;
  const unlockedWeapon = result?.rec.unlockedLevel ? WEAPONS.find((w) => w.order === result.rec.unlockedLevel) : null;

  return (
    <main className={`mad mad--${stage}`} style={{ '--accent': '#ff2b3a' } as CSSProperties} onPointerMove={onPointerMove} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      {session && <canvas key={session.runId} ref={canvasRef} className="mad__canvas" aria-hidden="true" />}

      {stage === 'map' && <CampaignMap engine={engine} progress={progress} selected={selected} onSelect={setSelected} onDeploy={deploy} onExit={onExit} />}

      {inMission && hud && (
        <div className="mad__hud" aria-live="polite">
          <div ref={hurtRef} className="mad__hurt" />
          <div className="mad__top">
            <div className="mad__mission">
              <span className="mad-eyebrow">M{String(level.id).padStart(2, '0')} · {level.name}</span>
              <strong>{hud.objective}</strong>
              <div className="mad__bar"><i style={{ transform: `scaleX(${Math.min(1, Math.max(0, hud.progress))})` }} /></div>
            </div>
            <div className="mad__right">
              <button
                type="button"
                className="mad-cam-toggle"
                onClick={toggleCamera}
                title="Switch between FPP and TPP (Gesture: Touch temple or raise hands overhead / Key: V)"
              >
                🎥 {cameraMode.toUpperCase()}
              </button>
              <div className="mad__stat"><span>Time</span><strong>{mmss(hud.timeMs)}</strong></div>
              <div className="mad__stat"><span>Score</span><strong>{hud.score.toLocaleString('en-US')}</strong></div>
              <button type="button" className="mad-btn mad-btn--ghost mad-btn--small" onClick={toMap}>✕ Abort</button>
            </div>
          </div>

          <AnimatePresence>
            {cameraToast && (
              <motion.div
                key={cameraToast}
                className="mad__cam-toast"
                initial={{ opacity: 0, y: -16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <span>🎥 {cameraToast}</span>
                <small>Gesture: Touch temple or hands up · Key: V</small>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {stage === 'playing' && hud.message && (
              <motion.p key={hud.message.text} className="mad__msg" data-tone={hud.message.tone} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                {hud.message.text}
              </motion.p>
            )}
          </AnimatePresence>

          <div ref={crossRef} className="mad__cross" aria-hidden="true">
            <span className="mad__cross-ring" />
            <span className="mad__cross-dot" />
          </div>

          <div className="mad__bottom">
            <div className="mad__hp" role="img" aria-label={`Health ${hud.hp}`}>
              <span>HP</span>
              <div><i style={{ transform: `scaleX(${hud.hp / 100})` }} data-low={hud.hp < 35 ? '1' : '0'} /></div>
              <strong>{hud.hp}</strong>
            </div>
            <div className="mad__weapon">
              <WeaponIcon id={weapon.id} size={34} />
              <div>
                <strong>{weapon.name}</strong>
                <span>{weapon.gesture}</span>
              </div>
              <div className="mad__ammo" data-empty={hud.mag > 0 && hud.ammo === 0 ? '1' : '0'}>
                {hud.mag > 0 ? (
                  <>
                    <b>{hud.ammo}</b>
                    <small>/ {hud.mag}</small>
                  </>
                ) : (
                  <b>∞</b>
                )}
                {hud.reload > 0 && <i className="mad__reload" style={{ transform: `scaleX(${hud.reload})` }} />}
              </div>
            </div>
            <div className="mad__enemies">
              <span>Hostiles</span>
              <strong>{hud.enemiesLeft}</strong>
            </div>
          </div>
          {hud.phase === 'run' && (
            <div className="mad__sprint" aria-hidden="true">
              <span>Jog in place</span>
              <div><i ref={speedRef} /></div>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {stage === 'briefing' && level && weapon && (
          <motion.div key="briefing" className="mad__overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="mad-eyebrow">Mission {String(level.id).padStart(2, '0')} · {level.place}</p>
            <h2 className="mad-title mad-title--big">{level.name}</h2>
            <p className="mad__lead">{level.brief}</p>
            <ol className="mad__steps">
              <li><b>1</b><span><strong>RUN</strong> Jog in place to move forward</span></li>
              <li><b>2</b><span><strong>COVER</strong> Lean to peek, crouch to take cover &amp; reload</span></li>
              <li><b>3</b><span><strong>{weapon.name.toUpperCase()}</strong> {weapon.how}</span></li>
            </ol>
            <div className="mad__weapon-card"><WeaponIcon id={weapon.id} size={56} /><span>{weapon.gesture}</span></div>
            <div style={{ margin: '14px 0 6px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                type="button"
                className="mad-btn"
                style={{ fontSize: '18px', padding: '12px 28px' }}
                onClick={() => {
                  countdownAt.current = performance.now();
                  countdownRef.current = 3;
                  setCountdown(3);
                  setStage('countdown');
                  sfx.play('tick');
                }}
              >
                ▶ Start Mission
              </button>
            </div>
            <p className="mad-hint">Step into the frame — the mission starts by itself · Camera: Touch temple gesture or press V (TPP/FPP) · Keyboard: W run · A/D peek · S crouch · mouse + click</p>
          </motion.div>
        )}
        {countdown !== null && (
          <motion.span key={countdown} className="mad__countdown" initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
            {countdown}
          </motion.span>
        )}
      </AnimatePresence>

      {stage === 'done' && result && level && (
        <motion.div className="mad__overlay mad__overlay--result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <p className="mad-eyebrow">{level.name}</p>
          <h2 className="mad-title mad-title--big">{result.r.cleared ? 'Mission cleared' : 'Mission failed'}</h2>
          {result.r.cleared ? (
            <div className={`mad__rating mad-rating--${result.r.rating}`} aria-label={`Rating ${result.r.rating}`}>{result.r.rating}</div>
          ) : (
            <p className="mad__lead">You went down. Crouch behind cover when the red ▼ appears.</p>
          )}
          <dl className="mad__results">
            <div><dt>Score</dt><dd>{result.r.score.toLocaleString('en-US')}</dd></div>
            <div><dt>Time</dt><dd>{mmss(result.r.timeMs)}</dd></div>
            <div><dt>Accuracy</dt><dd>{Math.round(result.r.accuracy * 100)}%</dd></div>
            <div><dt>Kills</dt><dd>{result.r.kills}{result.r.headshots > 0 ? ` (${result.r.headshots} HS)` : ''}</dd></div>
            <div><dt>Health</dt><dd>{result.r.hp}</dd></div>
          </dl>
          {result.rec.newBest && result.r.cleared && <span className="mad-chip">New best</span>}
          {unlockedWeapon && (
            <div className="mad__unlock">
              <span>New weapon unlocked</span>
              <WeaponIcon id={unlockedWeapon.id} size={44} />
              <strong>{unlockedWeapon.name}</strong>
              <small>{unlockedWeapon.gesture}</small>
            </div>
          )}
          <div className="mad__actions">
            {nextId ? <HoldGesture engine={engine} label="Next mission" onConfirm={() => deploy(nextId)} /> : <HoldGesture engine={engine} label={result.r.cleared ? 'Back to map' : 'Retry'} onConfirm={() => (result.r.cleared ? toMap() : deploy(level.id))} />}
            <button type="button" className="mad-btn" onClick={() => deploy(level.id)}>Retry</button>
            <button type="button" className="mad-btn mad-btn--ghost" onClick={toMap}>Map</button>
          </div>
        </motion.div>
      )}

      <div className="mad__pip">
        <CameraViewport engine={engine} variant="pip" hud={false} trail={false} />
      </div>
    </main>
  );
}
