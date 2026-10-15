import { motion } from 'motion/react';
import { Icon } from '../components/Icon';
import './SetupScreens.css';

export function PermissionScreen() {
  return (
    <main className="screen center-screen">
      <div className="notice">
        <motion.div
          className="notice__icon"
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Icon name="camera" size={40} />
        </motion.div>
        <h1 className="t-headline">Allow Camera Access</h1>
        <p className="notice__text">
          The camera is needed to track your body posture. Processing happens entirely within your browser — video is never
          recorded or sent anywhere.
        </p>
        <p className="t-label notice__wait">
          <span className="spinner" aria-hidden="true" /> Waiting for browser permission…
        </p>
      </div>
    </main>
  );
}
