export type CameraErrorKind =
  | 'denied'
  | 'not-found'
  | 'in-use'
  | 'insecure'
  | 'unsupported'
  | 'ended'
  | 'model'
  | 'unknown';

export class CameraError extends Error {
  readonly kind: CameraErrorKind;

  constructor(kind: CameraErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'CameraError';
    this.kind = kind;
  }
}

/** Maps getUserMedia DOMException names (incl. legacy aliases) to a user-facing kind. */
export function classifyCameraError(error: unknown): CameraErrorKind {
  if (error instanceof CameraError) return error.kind;
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'not-found';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'in-use';
    case 'SecurityError':
      return 'insecure';
    default:
      return 'unknown';
  }
}

export interface CameraErrorCopy {
  title: string;
  message: string;
  fixes: string[];
}

export const CAMERA_ERROR_COPY: Record<CameraErrorKind, CameraErrorCopy> = {
  denied: {
    title: 'No Camera Access',
    message: 'The browser blocked access to the camera. Without it, the game cannot track your movements.',
    fixes: [
      'Click the camera or lock icon in your browser address bar',
      'Select "Allow" for camera access',
      'Click "Try Again"',
    ],
  },
  'not-found': {
    title: 'Camera Not Found',
    message: 'No connected camera was found on this device.',
    fixes: [
      'Connect a webcam or open the game on a device with a camera',
      'Make sure the camera is not covered or switched off',
      'Click "Try Again"',
    ],
  },
  'in-use': {
    title: 'Camera In Use',
    message: 'It looks like another app or tab is currently using your camera.',
    fixes: ['Close Zoom, Teams, OBS, or other tabs using the camera', 'Click "Try Again"'],
  },
  insecure: {
    title: 'Secure Connection Required',
    message: 'Browsers only allow camera access over HTTPS or on localhost.',
    fixes: ['Open the site using https://', 'For local testing, use http://localhost'],
  },
  unsupported: {
    title: 'Browser Does Not Support Camera',
    message: 'This browser does not support web camera access.',
    fixes: ['Open the game in an updated Chrome, Edge, Safari, or Firefox'],
  },
  ended: {
    title: 'Camera Disconnected',
    message: 'The video stream stopped — the camera was unplugged or taken by another app.',
    fixes: ['Check your camera connection', 'Click "Try Again"'],
  },
  model: {
    title: 'Failed to Load Pose Model',
    message: 'The pose tracking model could not be loaded. Reloading usually helps.',
    fixes: ['Check your internet connection', 'Click "Try Again" or refresh the page'],
  },
  unknown: {
    title: 'Camera Unavailable',
    message: 'Unable to access the camera video feed.',
    fixes: ['Check your browser camera permissions', 'Close other apps using the camera', 'Refresh the page'],
  },
};
