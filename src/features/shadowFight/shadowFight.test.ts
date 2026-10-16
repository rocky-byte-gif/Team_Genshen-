import { describe, expect, it } from 'vitest';
import { getMode } from '../modes/modes';
import { createPose, LM, type Pose } from '../tracking/landmarks';
import { FighterGestureTracker, ShadowBotAI } from './gestureTracker';
import type { FighterState } from './types';

function mockFighter(id: 0 | 1): FighterState {
  return {
    id,
    name: id === 0 ? 'SHADOW' : 'NINJA',
    color: id === 0 ? '#2ee6ff' : '#ff5a6e',
    glowColor: id === 0 ? '#2ee6ff' : '#ff5a6e',
    hp: 100,
    maxHp: 100,
    chipHp: 100,
    energy: 100,
    maxEnergy: 100,
    combo: 0,
    bestCombo: 0,
    roundsWon: 0,
    x: id === 0 ? -0.4 : 0.4,
    y: 0,
    targetX: id === 0 ? -0.4 : 0.4,
    facing: id === 0 ? 1 : -1,
    action: 'idle',
    actionTime: 0,
    actionDuration: 0,
    isBlocking: false,
    isDodging: false,
    dodgeType: null,
    punchHand: null,
    activeGesture: null,
    livePose: null,
    armExtension: 0,
    bodySquatY: 0,
    bodySlipX: 0,
    isCpu: false,
    punchesLanded: 0,
    jabsLanded: 0,
    attacksBlocked: 0,
    attacksDodged: 0,
  };
}

describe('Shadow Fighter Mode Registration', () => {
  it('registers shadow-fight mode with correct 2-player configuration', () => {
    const mode = getMode('shadow-fight');
    expect(mode).toBeDefined();
    expect(mode.id).toBe('shadow-fight');
    expect(mode.kind).toBe('shadow');
    expect(mode.players).toBe(2);
    expect(mode.title).toBe('Shadow Fighter');
  });
});

describe('FighterGestureTracker', () => {
  it('detects keyboard block, squat dodge, slip dodge, jab, and punch', () => {
    const tracker = new FighterGestureTracker(0);

    // Block
    const blockRes = tracker.update(null, 1000, 16, { block: true });
    expect(blockRes.isBlocking).toBe(true);
    expect(blockRes.gesture).toBe('block');

    // Squat Dodge
    const squatRes = tracker.update(null, 1100, 16, { dodgeSquat: true });
    expect(squatRes.isDodging).toBe(true);
    expect(squatRes.dodgeType).toBe('squat');

    // Slip Dodge
    const slipRes = tracker.update(null, 1200, 16, { dodgeSlip: true });
    expect(slipRes.isDodging).toBe(true);
    expect(slipRes.dodgeType).toBe('slip');

    // Quick Jab
    const jabRes = tracker.update(null, 1300, 16, { jab: true });
    expect(jabRes.gesture).toBe('jab');
    expect(jabRes.punchHand).toBe('left');

    // Power Punch
    const punchRes = tracker.update(null, 1600, 16, { punch: true });
    expect(punchRes.gesture).toBe('punch');
    expect(punchRes.punchHand).toBe('right');
  });

  it('detects high guard block from landmark poses when hands are raised together', () => {
    const tracker = new FighterGestureTracker(0);
    const pose: Pose = createPose();

    // Set shoulders
    pose[LM.LEFT_SHOULDER] = { x: 0.4, y: 0.4, z: 0, v: 0.9 };
    pose[LM.RIGHT_SHOULDER] = { x: 0.6, y: 0.4, z: 0, v: 0.9 };

    // Hands raised close near chin/neck (above mid-chest)
    pose[LM.LEFT_WRIST] = { x: 0.46, y: 0.35, z: 0, v: 0.9 };
    pose[LM.RIGHT_WRIST] = { x: 0.54, y: 0.35, z: 0, v: 0.9 };

    const res = tracker.update(pose, 1000, 16, {});
    expect(res.isBlocking).toBe(true);
    expect(res.gesture).toBe('block');
  });

  it('detects squat ducking when shoulders drop significantly below baseline', () => {
    const tracker = new FighterGestureTracker(0);
    const pose: Pose = createPose();

    // Baseline frame: standing upright
    pose[LM.LEFT_SHOULDER] = { x: 0.4, y: 0.4, z: 0, v: 0.9 };
    pose[LM.RIGHT_SHOULDER] = { x: 0.6, y: 0.4, z: 0, v: 0.9 };
    pose[LM.LEFT_WRIST] = { x: 0.3, y: 0.6, z: 0, v: 0.9 };
    pose[LM.RIGHT_WRIST] = { x: 0.7, y: 0.6, z: 0, v: 0.9 };
    tracker.update(pose, 1000, 16, {});

    // Squat frame: shoulders lowered down significantly (y increases in screen space)
    pose[LM.LEFT_SHOULDER] = { x: 0.4, y: 0.47, z: 0, v: 0.9 };
    pose[LM.RIGHT_SHOULDER] = { x: 0.6, y: 0.47, z: 0, v: 0.9 };

    const res = tracker.update(pose, 1050, 50, {});
    expect(res.isDodging).toBe(true);
    expect(res.dodgeType).toBe('squat');
  });
});

describe('ShadowBotAI', () => {
  it('reacts defensively when opponent attacks', () => {
    const bot = new ShadowBotAI();
    bot.reset(1000);

    const fBot = mockFighter(1);
    const fPlayer = mockFighter(0);
    fPlayer.action = 'punch'; // Player is throwing a punch

    let reacted = false;
    // Over multiple trials, bot should trigger defensive reaction (block or duck)
    for (let t = 1000; t < 1200; t += 20) {
      const res = bot.update(fBot, fPlayer, t, 20);
      if (res.isBlocking || res.isDodging) {
        reacted = true;
        break;
      }
    }
    expect(reacted).toBe(true);
  });
});
