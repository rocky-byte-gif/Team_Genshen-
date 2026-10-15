import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import './SetupScreens.css';

interface PermissionScreenProps {
  onRequestAgain?: () => void;
  onPlayKeyboard?: () => void;
  onBack?: () => void;
}

export function PermissionScreen({ onRequestAgain, onPlayKeyboard, onBack }: PermissionScreenProps) {
  const [permState, setPermState] = useState<PermissionState | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (!navigator.permissions?.query) return;
    let active = true;
    navigator.permissions
      .query({ name: 'camera' as PermissionName })
      .then((status) => {
        if (!active) return;
        setPermState(status.state);
        status.onchange = () => {
          if (!active) return;
          setPermState(status.state);
          if (status.state === 'granted') onRequestAgain?.();
        };
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [onRequestAgain]);

  return (
    <main className="screen center-screen">
      <div className="notice">
        <motion.div
          className={`notice__icon ${permState === 'denied' ? 'notice__icon--error' : ''}`}
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Icon name="camera" size={40} />
          {permState === 'denied' && (
            <span className="notice__badge">
              <Icon name="cross" size={14} />
            </span>
          )}
        </motion.div>

        <h1 className="t-headline">
          {permState === 'denied' ? 'Camera Access Blocked' : 'Allow Camera Access'}
        </h1>

        <p className="notice__text">
          {permState === 'denied'
            ? 'Your browser has blocked camera access for this page. You can unblock it in the address bar or jump straight in with keyboard & mouse.'
            : 'The camera tracks your body movements. If you do not have a working webcam or prefer not to use it, you can jump straight into the action with keyboard & mouse!'}
        </p>

        {permState !== 'denied' && (
          <p className="t-label notice__wait">
            <span className="spinner" aria-hidden="true" /> Waiting for browser permission…
          </p>
        )}

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
                letterSpacing: '0.04em',
              }}
            >
              🎮 Play Now with Keyboard &amp; Mouse
            </button>
          )}

          <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'center' }}>
            {onRequestAgain && (
              <button type="button" className="btn btn--ghost" onClick={onRequestAgain}>
                🎥 Retry Camera
              </button>
            )}
            <button
              type="button"
              className="btn btn--ghost"
              aria-expanded={showGuide}
              onClick={() => setShowGuide((v) => !v)}
            >
              {showGuide ? 'Hide Help' : 'Camera Help'}
            </button>
            {onBack && (
              <button type="button" className="btn btn--ghost" onClick={onBack}>
                Menu
              </button>
            )}
          </div>
        </div>

        <div className="notice__address-tip">
          <div className="notice__tip-header">
            <strong>👆 To use your camera: Look at the top address bar</strong>
          </div>
          <ol className="notice__tip-steps">
            <li>
              Click the <b>🎥 camera icon</b> (or <b>tune / site settings icon</b>) directly to the left of <code>localhost:5173</code>.
            </li>
            <li>
              Change Camera from <em>Block</em> to <b>Allow</b> (or choose <em>Always allow localhost:5173 to access your camera</em>).
            </li>
            <li>Click <b>Done</b>, then click <b>Retry Camera</b> above.</li>
          </ol>
        </div>

        <AnimatePresence initial={false}>
          {showGuide && (
            <motion.div
              className="notice__fixes notice__guide"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <p><b>1. Chrome Browser Settings:</b></p>
              <ul>
                <li>Click the camera icon or sliders icon next to the URL in the address bar and set Camera to <b>Always Allow</b>.</li>
                <li>Or visit <code>chrome://settings/content/camera</code> and ensure <code>http://localhost:5173</code> is allowed.</li>
              </ul>

              <p><b>2. Windows 11 Privacy Settings:</b></p>
              <ul>
                <li>Press <b>Windows Key</b>, type <b>Camera Privacy Settings</b>, and press Enter.</li>
                <li>Ensure <b>Camera access</b> is switched <b>ON</b>.</li>
                <li>Scroll down and ensure <b>Let apps access your camera</b> and <b>Let desktop apps access your camera</b> are both <b>ON</b> (including Google Chrome).</li>
              </ul>

              <p><b>3. Physical Shutter &amp; Lenovo Vantage:</b></p>
              <ul>
                <li>Check the physical slider switch located directly above your laptop camera lens. If you see a small orange/red dot, slide it open.</li>
                <li>If Lenovo Vantage is installed, open it and ensure <b>Camera Privacy Mode</b> is toggled <b>OFF</b> (or press your camera hotkey like <code>F9</code>).</li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
