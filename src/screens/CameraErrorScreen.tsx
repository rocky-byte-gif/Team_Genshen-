import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { CAMERA_ERROR_COPY, type CameraErrorKind } from '../features/camera/cameraErrors';
import './SetupScreens.css';

interface CameraErrorScreenProps {
  kind: CameraErrorKind;
  onRetry: () => void;
  onPlayKeyboard?: () => void;
}

export function CameraErrorScreen({ kind, onRetry, onPlayKeyboard }: CameraErrorScreenProps) {
  const [showFix, setShowFix] = useState(false);
  const copy = CAMERA_ERROR_COPY[kind];

  return (
    <main className="screen center-screen">
      <div className="notice notice--error" role="alert">
        <div className="notice__icon notice__icon--error">
          <Icon name="camera" size={40} />
          <span className="notice__badge">
            <Icon name="cross" size={14} />
          </span>
        </div>
        <p className="t-label notice__eyebrow">Camera not available</p>
        <h1 className="t-headline">{copy.title}</h1>
        <p className="notice__text">{copy.message}</p>
        <div className="notice__actions" style={{ flexDirection: 'column', width: '100%', maxWidth: '420px', gap: '10px' }}>
          {onPlayKeyboard && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={onPlayKeyboard}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #00f0ff, #0072ff)',
                color: '#060a12',
                fontWeight: 700,
                fontSize: '17px',
                padding: '14px 24px',
                boxShadow: '0 0 28px rgba(0, 240, 255, 0.4)',
                border: 'none',
              }}
            >
              🎮 Play with Keyboard &amp; Mouse
            </button>
          )}
          <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'center' }}>
            <button type="button" className="btn btn--ghost" onClick={onRetry}>
              Try camera again
            </button>
            <button type="button" className="btn btn--ghost" aria-expanded={showFix} onClick={() => setShowFix((v) => !v)}>
              How to fix
            </button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {showFix && (
            <motion.ol
              className="notice__fixes"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {copy.fixes.map((fix) => (
                <li key={fix}>{fix}</li>
              ))}
            </motion.ol>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
