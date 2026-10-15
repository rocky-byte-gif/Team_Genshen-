import { useRef } from 'react';
import { CameraViewport } from '../components/CameraViewport';
import { Icon } from '../components/Icon';
import { Ring } from '../components/Ring';
import { setRingProgress } from '../components/ringProgress';
import type { MotionEngine } from '../features/engine/MotionEngine';
import { useEngineFrame, useMotionUi } from '../hooks/useEngine';
import './SetupScreens.css';

const READY_HOLD_MS = 1300;

interface CameraCheckScreenProps {
  engine: MotionEngine;
  onReady: () => void;
}

type CheckState = 'ok' | 'bad' | 'pending' | 'warn';

export function CameraCheckScreen({ engine, onReady }: CameraCheckScreenProps) {
  const camera = useMotionUi(engine, (s) => s.camera);
  const model = useMotionUi(engine, (s) => s.model);
  const tracking = useMotionUi(engine, (s) => s.tracking);
  const message = useMotionUi(engine, (s) => s.trackingMessage);
  const lowLight = useMotionUi(engine, (s) => s.lowLight);
  const multiple = useMotionUi(engine, (s) => s.multiplePeople);
  const circleRef = useRef<SVGCircleElement>(null);
  const readyFor = useRef(0);
  const advanced = useRef(false);

  useEngineFrame(engine, (frame, dt) => {
    const ok = frame.trackable && frame.quality.status === 'OK' && !engine.ui.get().multiplePeople;
    readyFor.current = ok ? readyFor.current + dt : Math.max(0, readyFor.current - dt * 2);
    setRingProgress(circleRef.current, readyFor.current / READY_HOLD_MS);
    if (!advanced.current && readyFor.current >= READY_HOLD_MS) {
      advanced.current = true;
      onReady();
    }
  });

  const bodyVisible = tracking !== 'NO_BODY' && tracking !== 'PARTIAL';
  const checks: { icon: Parameters<typeof Icon>[0]['name']; label: string; state: CheckState; detail: string }[] = [
    { icon: 'camera', label: 'Camera', state: camera === 'live' ? 'ok' : 'pending', detail: camera === 'live' ? 'working' : 'connecting…' },
    {
      icon: 'chip',
      label: 'Tracking Model',
      state: model === 'ready' ? 'ok' : model === 'error' ? 'bad' : 'pending',
      detail: model === 'ready' ? 'ready' : 'loading…',
    },
    {
      icon: 'person',
      label: 'Body in Frame',
      state: model !== 'ready' ? 'pending' : bodyVisible ? 'ok' : 'bad',
      detail: bodyVisible ? 'tracking you' : 'not detected yet',
    },
    {
      icon: 'ruler',
      label: 'Distance',
      state: !bodyVisible ? 'pending' : tracking === 'TOO_CLOSE' || tracking === 'TOO_FAR' ? 'bad' : 'ok',
      detail: tracking === 'TOO_CLOSE' ? 'too close' : tracking === 'TOO_FAR' ? 'too far' : 'optimal',
    },
    { icon: 'sun', label: 'Lighting', state: lowLight ? 'warn' : 'ok', detail: lowLight ? 'dim — add more light' : 'good' },
    { icon: 'users', label: 'Single Player', state: multiple ? 'bad' : 'ok', detail: multiple ? 'multiple people detected' : 'yes' },
  ];

  const instruction = multiple
    ? 'Ensure only one person is in the frame'
    : model !== 'ready'
      ? 'Loading pose detection…'
      : tracking === 'OK'
        ? 'Great, you are visible! Hold still for a second…'
        : lowLight && !bodyVisible
          ? 'Too dark — turn on a light or face toward a window'
          : message;

  return (
    <main className="screen setup">
      <CameraViewport engine={engine} variant="stage" className="setup__viewport">
        {multiple && (
          <div className="viewport__banner" role="alert">
            <Icon name="users" size={18} /> Only one person should be in the frame — ask others to step aside
          </div>
        )}
      </CameraViewport>

      <aside className="setup__panel">
        <p className="t-label">Step 1 of 4 · Camera Check</p>
        <h1 className="t-headline setup__title">Step into Frame</h1>
        <p className="setup__instruction" aria-live="polite">
          {instruction}
        </p>

        <ul className="checklist">
          {checks.map((c) => (
            <li key={c.label} className={`checklist__item is-${c.state}`}>
              <Icon name={c.icon} size={18} />
              <span className="checklist__label">{c.label}</span>
              <span className="checklist__detail">{c.detail}</span>
              <span className="checklist__state" aria-label={c.state === 'ok' ? 'ready' : 'not ready'}>
                {c.state === 'ok' ? <Icon name="check" size={16} /> : c.state === 'bad' ? <Icon name="cross" size={16} /> : '…'}
              </span>
            </li>
          ))}
        </ul>

        <div className="setup__ready">
          <Ring circleRef={circleRef} size={76} tone="success">
            <Icon name="check" size={24} />
          </Ring>
          <p className="setup__tip">
            Tip: Take 2–3 steps back so the camera sees your full body for jumping and stepping. Visible only from the waist up? No worries — the game adapts to upper body gestures.
          </p>
        </div>
        {bodyVisible && (
          <button type="button" className="btn btn--ghost btn--small" onClick={onReady}>
            Continue anyway
          </button>
        )}
      </aside>
    </main>
  );
}
