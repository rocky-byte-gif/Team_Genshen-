import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CameraViewport } from '../components/CameraViewport';
import { Icon } from '../components/Icon';
import { Ring } from '../components/Ring';
import { setRingProgress } from '../components/ringProgress';
import type { MotionEngine } from '../features/engine/MotionEngine';
import { CALIBRATION_MESSAGES, Calibrator, type Baseline, type CalibrationIssue } from '../features/gestures/calibration';
import { useEngineFrame } from '../hooks/useEngine';
import { sfx } from '../lib/audio/sfx';
import './SetupScreens.css';

interface CalibrationScreenProps {
  engine: MotionEngine;
  onDone: () => void;
}

export function CalibrationScreen({ engine, onDone }: CalibrationScreenProps) {
  const calibrator = useMemo(() => new Calibrator(), []);
  const [issue, setIssue] = useState<CalibrationIssue | null>(null);
  const [result, setResult] = useState<Baseline | null>(null);
  const circleRef = useRef<SVGCircleElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const issueRef = useRef<CalibrationIssue | null>(null);

  useEffect(() => {
    engine.setExpected(null);
    engine.setBaseline(null);
  }, [engine]);

  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(onDone, 1400);
    return () => window.clearTimeout(timer);
  }, [result, onDone]);

  useEngineFrame(engine, (frame) => {
    if (result || !frame.inferred) return;
    const usable = frame.trackable && (frame.quality.status === 'OK' || frame.quality.status === 'OFF_CENTER');
    const status = calibrator.push(frame.features, usable, frame.time);
    setRingProgress(circleRef.current, status.progress);
    if (pctRef.current) pctRef.current.textContent = `${Math.round(status.progress * 100)}%`;
    if (status.issue !== issueRef.current) {
      issueRef.current = status.issue;
      setIssue(status.issue);
    }
    if (status.done && calibrator.baseline) {
      engine.setBaseline(calibrator.baseline);
      setResult(calibrator.baseline);
      sfx.play('confirm');
    }
  });

  return (
    <main className="screen setup">
      <CameraViewport engine={engine} variant="stage" className="setup__viewport">
        <div className={`calib-silhouette ${result ? 'is-done' : ''}`} aria-hidden="true">
          <svg viewBox="0 0 100 160">
            <circle cx="50" cy="22" r="11" />
            <path d="M28 48 Q50 40 72 48 L76 100 M24 100 L28 48 M72 48 L64 100 L36 100 L28 48 M40 100 L38 150 M60 100 L62 150" />
          </svg>
        </div>
      </CameraViewport>

      <aside className="setup__panel">
        <p className="t-label">Step 2 of 4 · Calibration</p>
        <h1 className="t-headline setup__title">Stand Still</h1>
        <p className="setup__instruction">Arms at your sides, face the camera. We will register your neutral stance — all gestures are measured from it.</p>

        <div className="calib-ring">
          <Ring circleRef={circleRef} size={148} tone={result ? 'success' : 'cyan'}>
            {result ? <Icon name="check" size={40} /> : <span ref={pctRef} className="t-hud">0%</span>}
          </Ring>
        </div>

        <AnimatePresence mode="wait">
          {result ? (
            <motion.div key="done" className="calib-result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <p className="calib-result__title">Calibration Complete</p>
              <p className="calib-result__mode">
                {result.mode === 'full'
                  ? 'Controls: Full body — real jumps, side steps, and squats'
                  : 'Controls: Seated — arms up, torso leans. For jumps, step back so your hips are visible'}
              </p>
            </motion.div>
          ) : (
            <motion.p
              key={issue ?? 'ok'}
              className={`calib-issue ${issue ? 'is-warn' : ''}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              aria-live="polite"
            >
              {issue ? CALIBRATION_MESSAGES[issue] : 'Great, hold still…'}
            </motion.p>
          )}
        </AnimatePresence>
      </aside>
    </main>
  );
}
