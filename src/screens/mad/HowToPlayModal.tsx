import { motion } from 'motion/react';
import { useState } from 'react';
import type { MotionEngine } from '../../features/engine/MotionEngine';
import { madAudio } from '../../features/mad/madAudio';
import { useEngineFrame } from '../../hooks/useEngine';
import './HowToPlayModal.css';

interface HowToPlayModalProps {
  engine: MotionEngine;
  onClose: () => void;
  onStartFight?: () => void;
  initialTab?: 'gestures' | 'keyboard' | 'levels';
}

export function HowToPlayModal({ engine, onClose, onStartFight, initialTab = 'gestures' }: HowToPlayModalProps) {
  const [tab, setTab] = useState<'gestures' | 'keyboard' | 'levels'>(initialTab);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);
  const [punchCount, setPunchCount] = useState(0);

  // Live tester listening to engine frame for punches in the tutorial
  useEngineFrame(engine, (frame) => {
    if (!frame.pose) return;
    const ls = frame.pose[11]; // left shoulder
    const rs = frame.pose[12]; // right shoulder
    const lw = frame.pose[15]; // left wrist
    const rw = frame.pose[16]; // right wrist
    if (!ls || !rs || !lw || !rw) return;

    const sw = Math.hypot(rs.x - ls.x, rs.y - ls.y) || 0.2;
    const reachL = Math.hypot(lw.x - ls.x, lw.y - ls.y) / sw;
    const reachR = Math.hypot(rw.x - rs.x, rw.y - rs.y) / sw;

    const isGuard = lw.y < ls.y + 0.22 * sw && rw.y < rs.y + 0.22 * sw && Math.hypot(lw.x - rw.x, lw.y - rw.y) < 1.0 * sw;
    const isDuck = frame.vertical.phase === 'CONFIRMED' && frame.vertical.gesture === 'CROUCH';

    if (isGuard && !testFeedback) {
      madAudio.punchBlock();
      setTestFeedback('🛡️ HIGH GUARD (BLOCK) DETECTED!');
      setTimeout(() => setTestFeedback(null), 1200);
    } else if (isDuck && !testFeedback) {
      madAudio.dodgeWhoosh();
      setTestFeedback('⚡ DUCK / DODGE DETECTED!');
      setTimeout(() => setTestFeedback(null), 1200);
    } else if ((reachL > 0.75 || reachR > 0.75) && !testFeedback) {
      const side = reachL > reachR ? 'LEFT JAB' : 'RIGHT POWER PUNCH';
      madAudio.punchWhoosh();
      setTestFeedback(`🥊 ${side} DETECTED!`);
      setPunchCount((c) => c + 1);
      setTimeout(() => setTestFeedback(null), 1200);
    }
  });

  const triggerTest = (type: 'jab' | 'punch' | 'block' | 'dodge') => {
    if (type === 'jab') {
      madAudio.punchWhoosh();
      setTestFeedback('🥊 LEFT JAB TEST SUCCESS!');
    } else if (type === 'punch') {
      madAudio.punchWhoosh();
      madAudio.punchHit(false);
      setTestFeedback('🥊 POWER CROSS TEST SUCCESS!');
    } else if (type === 'block') {
      madAudio.punchBlock();
      setTestFeedback('🛡️ BLOCK (HIGH GUARD) TEST SUCCESS!');
    } else if (type === 'dodge') {
      madAudio.dodgeWhoosh();
      setTestFeedback('⚡ DODGE / SLIP TEST SUCCESS!');
    }
    setPunchCount((c) => c + 1);
    setTimeout(() => setTestFeedback(null), 1400);
  };

  return (
    <div className="mad-guide-backdrop" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <motion.div
        className="mad-guide"
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.2 }}
      >
        <div className="mad-guide__header">
          <div>
            <span className="mad-eyebrow">Combat Academy</span>
            <h2 id="guide-title" className="mad-title" style={{ fontSize: '38px', margin: '2px 0 0' }}>
              HOW TO PLAY &amp; TRACKING GUIDE
            </h2>
          </div>
          <button type="button" className="mad-btn mad-btn--ghost mad-btn--small" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <div className="mad-guide__tabs">
          <button
            type="button"
            className={`mad-guide__tab ${tab === 'gestures' ? 'is-active' : ''}`}
            onClick={() => setTab('gestures')}
          >
            🎥 Body &amp; Camera Gestures
          </button>
          <button
            type="button"
            className={`mad-guide__tab ${tab === 'levels' ? 'is-active' : ''}`}
            onClick={() => setTab('levels')}
          >
            🏆 3 Rounds Breakdown (1v1 &amp; 1v3)
          </button>
          <button
            type="button"
            className={`mad-guide__tab ${tab === 'keyboard' ? 'is-active' : ''}`}
            onClick={() => setTab('keyboard')}
          >
            ⌨️ Keyboard &amp; Mouse
          </button>
        </div>

        <div className="mad-guide__content">
          {tab === 'gestures' && (
            <div className="mad-guide__grid">
              <div className="mad-card">
                <div className="mad-card__icon">🥊</div>
                <div className="mad-card__body">
                  <h3>Round 1: Boxing Duel (1v1 Fist Combat)</h3>
                  <p>
                    Fight the opponent in the underground ring with pure fist gestures and zero weapons:
                  </p>
                  <ul style={{ margin: '8px 0', paddingLeft: '18px', fontSize: '13px', lineHeight: 1.6, color: '#e2e8f0' }}>
                    <li><strong>🥊 Left Jab:</strong> Snappy straight extension with your lead/left fist.</li>
                    <li><strong>💥 Power Punch:</strong> Deep straight right cross toward webcam.</li>
                    <li><strong>🛡️ Block:</strong> Hold both hands together in front of your face/chin to block attacks.</li>
                    <li><strong>⚡ Dodge:</strong> Duck down or sway your body left/right to evade incoming punches!</li>
                  </ul>
                  <div className="mad-tester" style={{ flexWrap: 'wrap', gap: '8px' }}>
                    <button type="button" className="mad-btn mad-btn--small" onClick={() => triggerTest('jab')}>
                      Test Jab
                    </button>
                    <button type="button" className="mad-btn mad-btn--small" onClick={() => triggerTest('punch')}>
                      Test Power Punch
                    </button>
                    <button type="button" className="mad-btn mad-btn--small" onClick={() => triggerTest('block')}>
                      Test Block
                    </button>
                    <button type="button" className="mad-btn mad-btn--small" onClick={() => triggerTest('dodge')}>
                      Test Dodge
                    </button>
                    {testFeedback && <span className="mad-tester__badge">{testFeedback}</span>}
                  </div>
                </div>
              </div>

              <div className="mad-card">
                <div className="mad-card__icon">⚔️</div>
                <div className="mad-card__body">
                  <h3>Round 2: Sword Slashing</h3>
                  <p>
                    Swing your arm swiftly <strong>across your body</strong> horizontally or diagonally.
                    The blade slices in the direction of your swing with metal clash sounds.
                  </p>
                </div>
              </div>

              <div className="mad-card">
                <div className="mad-card__icon">🎯</div>
                <div className="mad-card__body">
                  <h3>Round 3: Precision Rifle (1v3)</h3>
                  <p>
                    Point your hands toward the screen to aim. <strong>Smart magnetic aim-assist</strong> locks
                    onto hostile soldiers for effortless precision elimination.
                  </p>
                </div>
              </div>

              <div className="mad-card">
                <div className="mad-card__icon">🛡️</div>
                <div className="mad-card__body">
                  <h3>Take Cover &amp; Peek</h3>
                  <p>
                    <strong>Crouch down</strong> to take cover behind barricades and reload your weapon safely.
                    <strong>Lean left or right</strong> with your torso to peek and return fire.
                  </p>
                </div>
              </div>

              <div className="mad-card">
                <div className="mad-card__icon">🎥</div>
                <div className="mad-card__body">
                  <h3>Switch Camera (TPP / FPP)</h3>
                  <p>
                    <strong>Touch either hand to your temple</strong> (visor touch gesture) or press <b>V</b> to
                    switch between over-the-shoulder Third-Person (TPP) and First-Person (FPP).
                  </p>
                </div>
              </div>

              <div className="mad-card">
                <div className="mad-card__icon">🏃</div>
                <div className="mad-card__body">
                  <h3>Running &amp; Skipping</h3>
                  <p>
                    Jog in place to run forward, or simply click the <strong>&quot;⏩ Skip Run&quot;</strong> button
                    on screen to jump straight into combat!
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === 'levels' && (
            <div className="mad-guide__rounds">
              <div className="mad-round-row">
                <span className="mad-round-badge">Round 1</span>
                <div>
                  <h4>The Underground Ring · 1v1 Boxing Duel</h4>
                  <p>
                    One-on-one combat against an anatomical human CPU boxer inside the ring.
                    Bob and weave, throw punches with fists, and knock him down!
                  </p>
                </div>
              </div>

              <div className="mad-round-row">
                <span className="mad-round-badge">Round 2</span>
                <div>
                  <h4>Dojo Showdown · 1v1 Katana Sword Duel</h4>
                  <p>
                    One-on-one samurai battle in an ancient courtyard. Swing your arm to unleash swift katana strikes
                    and clash blades with the lethal swordmaster.
                  </p>
                </div>
              </div>

              <div className="mad-round-row">
                <span className="mad-round-badge">Round 3</span>
                <div>
                  <h4>Rooftop Stronghold · 1v3 Automatic Rifle Showdown</h4>
                  <p>
                    High-stakes 1 vs 3 tactical combat. Three enemy operatives flank from left, center, and right.
                    Precision aim-assist snaps your crosshair for satisfying rapid elimination!
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === 'keyboard' && (
            <div className="mad-guide__keys">
              <table className="mad-key-table">
                <tbody>
                  <tr>
                    <th>W or Space</th>
                    <td>Jog / Run forward along the street</td>
                  </tr>
                  <tr>
                    <th>A / D or Arrow Keys</th>
                    <td>Lean left / right to peek from behind cover</td>
                  </tr>
                  <tr>
                    <th>S or Left Ctrl</th>
                    <td>Crouch behind cover &amp; reload ammo</td>
                  </tr>
                  <tr>
                    <th>Mouse Movement</th>
                    <td>Aim crosshair across the screen</td>
                  </tr>
                  <tr>
                    <th>Left Click or F</th>
                    <td>Attack: Throw punches / Slash sword / Fire rifle</td>
                  </tr>
                  <tr>
                    <th>V Key</th>
                    <td>Switch between TPP (Third-Person) and FPP (First-Person)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mad-guide__footer">
          <span className="mad-guide__stat">
            Practice punches thrown: <strong>{punchCount}</strong>
          </span>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" className="mad-btn mad-btn--ghost" onClick={onClose}>
              Close Guide
            </button>
            <button type="button" className="mad-btn" onClick={onStartFight}>
              ▶ Start Fight Now
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
