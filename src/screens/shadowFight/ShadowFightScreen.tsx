import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraViewport } from '../../components/CameraViewport';
import type { MotionEngine } from '../../features/engine/MotionEngine';
import { newRoomCode, normalizeRoomCode } from '../../features/online/DuelRoom';
import { FighterGestureTracker, ShadowBotAI } from '../../features/shadowFight/gestureTracker';
import { ShadowAudio } from '../../features/shadowFight/shadowAudio';
import { ShadowFightRenderer } from '../../features/shadowFight/ShadowFightRenderer';
import {
  ShadowNetworkRoom,
  type RemoteFighterPacket,
  type RemoteHitResultPacket,
  type RemoteStrikePacket,
} from '../../features/shadowFight/shadowNetwork';
import type { FighterState, MatchPhase, NetworkStatus, OnlineRole } from '../../features/shadowFight/types';
import { useEngineFrame } from '../../hooks/useEngine';
import { clamp } from '../../lib/math/geometry';
import './ShadowFightScreen.css';

interface ShadowFightScreenProps {
  engine: MotionEngine;
  onExit: () => void;
}

const ROUND_TIME_SEC = 90;
const ROUNDS_TO_WIN = 2;
const MIN_DISTANCE = 0.22;
const MOVE_SPEED = 0.72; // arena units per second
const JAB_REACH = 0.44;
const PUNCH_REACH = 0.56;

function createFighter(id: 0 | 1, name: string, color: string, facing: 1 | -1, isCpu = false): FighterState {
  return {
    id,
    name,
    color,
    glowColor: color,
    hp: 100,
    maxHp: 100,
    chipHp: 100,
    energy: 100,
    maxEnergy: 100,
    combo: 0,
    bestCombo: 0,
    roundsWon: 0,
    x: id === 0 ? -0.38 : 0.38,
    y: 0,
    targetX: id === 0 ? -0.38 : 0.38,
    facing,
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
    isCpu,
    punchesLanded: 0,
    jabsLanded: 0,
    attacksBlocked: 0,
    attacksDodged: 0,
  };
}

export function ShadowFightScreen({ engine, onExit }: ShadowFightScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ShadowFightRenderer | null>(null);
  const audioRef = useRef<ShadowAudio | null>(null);

  const trackerP1 = useRef(new FighterGestureTracker(0));
  const trackerP2 = useRef(new FighterGestureTracker(1));
  const botP2 = useRef(new ShadowBotAI());

  // Online Multiplayer State
  const [onlineRole, setOnlineRole] = useState<OnlineRole>('local');
  const onlineRoleRef = useRef<OnlineRole>('local');
  onlineRoleRef.current = onlineRole;

  const [showOnlineModal, setShowOnlineModal] = useState(false);
  const [onlineTab, setOnlineTab] = useState<'create' | 'join'>('create');
  const [roomCode, setRoomCode] = useState(() => newRoomCode());
  const [inputCode, setInputCode] = useState('');
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>('offline');
  const [networkNotice, setNetworkNotice] = useState<string | null>(null);
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const netRoom = useRef<ShadowNetworkRoom | null>(null);

  const [phase, setPhase] = useState<MatchPhase>('countdown');
  const phaseRef = useRef<MatchPhase>('countdown');
  phaseRef.current = phase;

  const [round, setRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME_SEC);
  const [banner, setBanner] = useState<{ title: string; sub?: string } | null>({ title: 'ROUND 1', sub: 'FIGHT!' });
  const [isPaused, setIsPaused] = useState(false);
  const [winner, setWinner] = useState<0 | 1 | null>(null);

  const f1Ref = useRef<FighterState>(createFighter(0, 'SHADOW', '#2ee6ff', 1, false));
  const f2Ref = useRef<FighterState>(createFighter(1, 'NINJA', '#ff5a6e', -1, true));

  // Visual state for React HUD
  const [hudP1, setHudP1] = useState({ hp: 100, chipHp: 100, combo: 0, rounds: 0, gesture: '' });
  const [hudP2, setHudP2] = useState({ hp: 100, chipHp: 100, combo: 0, rounds: 0, gesture: '', isCpu: true });

  const lastTimeRef = useRef<number | null>(null);
  const roundTimerAcc = useRef(0);
  const keysRef = useRef<{
    p1: { moveLeft?: boolean; moveRight?: boolean; jab?: boolean; punch?: boolean; block?: boolean; dodgeSquat?: boolean; dodgeSlip?: boolean; kick?: boolean };
    p2: { moveLeft?: boolean; moveRight?: boolean; jab?: boolean; punch?: boolean; block?: boolean; dodgeSquat?: boolean; dodgeSlip?: boolean; kick?: boolean };
  }>({ p1: {}, p2: {} });

  // 1. Initialize audio, canvas renderer, 2-player tracking & keyboard listeners
  useEffect(() => {
    const audio = new ShadowAudio();
    audioRef.current = audio;
    audio.gong();
    audio.startCombatBeat();

    const canvas = canvasRef.current;
    if (canvas) {
      rendererRef.current = new ShadowFightRenderer(canvas);
    }

    // Claim 2-player webcam tracking (splits left & right half for local play)
    const release2P = engine.claimTwoPlayers();

    // Check URL parameters for direct room joining (?shadowRoom=CODE or ?room=CODE)
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('shadowRoom') || params.get('room');
    if (roomParam) {
      const code = normalizeRoomCode(roomParam);
      setInputCode(code);
      setOnlineTab('join');
      setShowOnlineModal(true);
    }

    // Keyboard handlers with dedicated movement & combat gestures
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      // P1 controls (or local player when Host)
      if (k === 'a' || k === 'arrowleft') keysRef.current.p1.moveLeft = true;
      if (k === 'd' || k === 'arrowright') keysRef.current.p1.moveRight = true;
      if (k === 'q') keysRef.current.p1.jab = true;
      if (k === 'w' || k === 'f') keysRef.current.p1.punch = true;
      if (k === 'e' || k === 'shift') keysRef.current.p1.block = true;
      if (k === 's' || k === 'arrowdown') keysRef.current.p1.dodgeSquat = true;
      if (k === ' ') keysRef.current.p1.kick = true;

      // P2 controls (Local P2 or local player when Guest in online duel)
      if (k === 'j') keysRef.current.p2.moveLeft = true;
      if (k === 'l') keysRef.current.p2.moveRight = true;
      if (k === 'u' || k === '7') keysRef.current.p2.jab = true;
      if (k === 'i' || k === '8') keysRef.current.p2.punch = true;
      if (k === 'o' || k === '9') keysRef.current.p2.block = true;
      if (k === 'k' || k === '5') keysRef.current.p2.dodgeSquat = true;
      if (k === 'enter') keysRef.current.p2.kick = true;

      if (k === 'p') setIsPaused((p) => !p);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') keysRef.current.p1.moveLeft = false;
      if (k === 'd' || k === 'arrowright') keysRef.current.p1.moveRight = false;
      if (k === 'q') keysRef.current.p1.jab = false;
      if (k === 'w' || k === 'f') keysRef.current.p1.punch = false;
      if (k === 'e' || k === 'shift') keysRef.current.p1.block = false;
      if (k === 's' || k === 'arrowdown') keysRef.current.p1.dodgeSquat = false;
      if (k === ' ') keysRef.current.p1.kick = false;

      if (k === 'j') keysRef.current.p2.moveLeft = false;
      if (k === 'l') keysRef.current.p2.moveRight = false;
      if (k === 'u' || k === '7') keysRef.current.p2.jab = false;
      if (k === 'i' || k === '8') keysRef.current.p2.punch = false;
      if (k === 'o' || k === '9') keysRef.current.p2.block = false;
      if (k === 'k' || k === '5') keysRef.current.p2.dodgeSquat = false;
      if (k === 'enter') keysRef.current.p2.kick = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Initial countdown banner transition
    const bannerTimer = setTimeout(() => {
      setBanner(null);
      setPhase('fighting');
      phaseRef.current = 'fighting';
    }, 1800);

    return () => {
      clearTimeout(bannerTimer);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      release2P();
      netRoom.current?.leave();
      audio.dispose();
      rendererRef.current?.dispose();
    };
  }, [engine]);

  // Round reset function
  const startNextRound = useCallback((nextRoundNum: number) => {
    f1Ref.current.hp = 100;
    f1Ref.current.chipHp = 100;
    f1Ref.current.action = 'idle';
    f1Ref.current.actionTime = 0;
    f1Ref.current.combo = 0;
    f1Ref.current.targetX = -0.38;
    f1Ref.current.x = -0.38;

    f2Ref.current.hp = 100;
    f2Ref.current.chipHp = 100;
    f2Ref.current.action = 'idle';
    f2Ref.current.actionTime = 0;
    f2Ref.current.combo = 0;
    f2Ref.current.targetX = 0.38;
    f2Ref.current.x = 0.38;

    trackerP1.current.reset();
    trackerP2.current.reset();
    botP2.current.reset(performance.now());

    setRound(nextRoundNum);
    setTimeLeft(ROUND_TIME_SEC);
    setBanner({ title: `ROUND ${nextRoundNum}`, sub: 'FIGHT!' });
    setPhase('countdown');
    phaseRef.current = 'countdown';

    audioRef.current?.gong();

    setTimeout(() => {
      setBanner(null);
      setPhase('fighting');
      phaseRef.current = 'fighting';
    }, 1800);
  }, []);

  // Online Multiplayer Connection Setup
  const setupOnlineRoom = useCallback(
    (codeToUse: string, asHost: boolean) => {
      netRoom.current?.leave();

      const callbacks = {
        onStatusChange: (status: NetworkStatus, error?: string) => {
          setNetworkStatus(status);
          if (error) setNetworkNotice(error);
          else if (status === 'connected') setNetworkNotice(null);
        },
        onOpponentJoin: (name: string) => {
          setOpponentName(name);
          setNetworkNotice(`Opponent ${name} connected!`);
        },
        onOpponentReady: (ready: boolean) => {
          setOpponentReady(ready);
          if (ready && isReady) {
            setShowOnlineModal(false);
            startNextRound(1);
          }
        },
        onMatchStart: (_seed: number) => {
          setShowOnlineModal(false);
          startNextRound(1);
        },
        onRemoteState: (state: RemoteFighterPacket) => {
          // If local client is Host, remote controls Fighter 2. If Guest, remote controls Fighter 1.
          const remote = onlineRoleRef.current === 'host' ? f2Ref.current : f1Ref.current;
          remote.targetX = state.x;
          remote.y = state.y;
          remote.facing = state.facing;
          remote.action = state.action;
          remote.punchHand = state.punchHand;
          remote.isBlocking = state.isBlocking;
          remote.isDodging = state.isDodging;
          remote.dodgeType = state.dodgeType;
          remote.armExtension = state.armExtension;
          remote.hp = state.hp;
          remote.combo = state.combo;
        },
        onRemoteStrike: (strike: RemoteStrikePacket) => {
          const defender = onlineRoleRef.current === 'host' ? f1Ref.current : f2Ref.current;
          const attacker = onlineRoleRef.current === 'host' ? f2Ref.current : f1Ref.current;

          // Defender verifies defense locally for fair hit detection
          const hitX = (defender.x * 0.38 + 0.5) * window.innerWidth;
          const hitY = window.innerHeight * 0.62;

          if (defender.isDodging) {
            audioRef.current?.dodge();
            rendererRef.current?.addHitEffect(hitX, hitY - 40, 'dodge', '⚡ DODGED!', '#ffd24d');
            rendererRef.current?.addAfterimage(defender, performance.now());
            netRoom.current?.sendHitResult({
              strikeId: strike.strikeId,
              result: 'dodge',
              damage: 0,
              newHp: defender.hp,
              timestamp: performance.now(),
            });
          } else if (defender.isBlocking) {
            audioRef.current?.block();
            rendererRef.current?.addHitEffect(hitX, hitY, 'block', '🛡️ BLOCKED!', '#3dffb0');
            rendererRef.current?.triggerShake(4, 150);
            netRoom.current?.sendHitResult({
              strikeId: strike.strikeId,
              result: 'block',
              damage: 0,
              newHp: defender.hp,
              timestamp: performance.now(),
            });
          } else {
            const isPower = strike.gesture === 'punch';
            const baseDmg = isPower ? 22 : 11;
            defender.hp = Math.max(0, defender.hp - baseDmg);
            attacker.combo++;
            defender.combo = 0;
            defender.action = 'hit';
            defender.actionDuration = 220;
            defender.actionTime = 220;

            if (isPower) {
              audioRef.current?.punchHit();
              rendererRef.current?.triggerShake(14, 300);
              rendererRef.current?.addHitEffect(hitX, hitY, 'crit', `💥 -${baseDmg}`, '#ff5a6e');
            } else {
              audioRef.current?.jabHit();
              rendererRef.current?.triggerShake(7, 180);
              rendererRef.current?.addHitEffect(hitX, hitY, 'hit', `🥊 -${baseDmg}`, '#2ee6ff');
            }

            netRoom.current?.sendHitResult({
              strikeId: strike.strikeId,
              result: isPower ? 'crit' : 'hit',
              damage: baseDmg,
              newHp: defender.hp,
              timestamp: performance.now(),
            });

            if (defender.hp <= 0) {
              handleRoundOver(attacker.id);
            }
          }
        },
        onRemoteHitResult: (result: RemoteHitResultPacket) => {
          const defender = onlineRoleRef.current === 'host' ? f2Ref.current : f1Ref.current;
          defender.hp = result.newHp;
        },
        onRemoteRoundOver: (roundWinner: 0 | 1) => {
          handleRoundOver(roundWinner);
        },
        onRemoteRematch: () => {
          setWinner(null);
          startNextRound(1);
        },
        onOpponentLeave: () => {
          setNetworkNotice('Opponent left the match.');
        },
      };

      const room = new ShadowNetworkRoom(codeToUse, asHost ? 'SHADOW' : 'NINJA', asHost, callbacks);
      netRoom.current = room;
      setOnlineRole(asHost ? 'host' : 'guest');
      void room.connect();
    },
    [isReady, startNextRound]
  );

  const handleCreateRoom = () => {
    const code = newRoomCode();
    setRoomCode(code);
    setupOnlineRoom(code, true);
  };

  const handleJoinRoom = () => {
    const code = normalizeRoomCode(inputCode);
    if (code.length < 3) {
      setNetworkNotice('Please enter a valid 4-character room code.');
      return;
    }
    setRoomCode(code);
    setupOnlineRoom(code, false);
  };

  const handleToggleReady = () => {
    const nextReady = !isReady;
    setIsReady(nextReady);
    netRoom.current?.sendEvent({ type: 'ready', name: onlineRole === 'host' ? 'SHADOW' : 'NINJA' });
    if (nextReady && opponentReady) {
      setShowOnlineModal(false);
      if (onlineRole === 'host') {
        const seed = Math.floor(Math.random() * 0xffffff);
        netRoom.current?.sendEvent({ type: 'start', seed });
      }
      startNextRound(1);
    }
  };

  // Main combat engine frame loop
  useEngineFrame(engine, (frame) => {
    const now = frame.time;
    const dt = lastTimeRef.current === null ? 16 : Math.min(100, now - lastTimeRef.current);
    lastTimeRef.current = now;

    if (isPaused) return;

    const renderer = rendererRef.current;
    const audio = audioRef.current;
    const f1 = f1Ref.current;
    const f2 = f2Ref.current;
    const isOnline = onlineRole !== 'local';
    const isHost = onlineRole === 'host';
    const isGuest = onlineRole === 'guest';

    // In local 2P: splits frame. In online 1v1: player uses their whole camera.
    const localPose = isOnline ? frame.pose : frame.players[0] ?? (frame.players.length === 0 && frame.trackable ? frame.pose : null);
    const p2LocalPose = isOnline ? null : frame.players[1] ?? null;

    f1.livePose = isGuest ? null : localPose;
    f2.livePose = isGuest ? localPose : p2LocalPose;
    f2.isCpu = !isOnline && !p2LocalPose && !Object.values(keysRef.current.p2).some(Boolean);

    // 1. Process Local Player 1 Input (or local player when Host)
    let in1 = trackerP1.current.update(isGuest ? null : localPose, now, dt, keysRef.current.p1);
    if (!isGuest) {
      f1.isBlocking = in1.isBlocking;
      f1.isDodging = in1.isDodging;
      f1.dodgeType = in1.dodgeType;
      f1.armExtension = in1.armExtension;
      f1.bodySquatY = in1.bodySquatY;
      f1.bodySlipX = in1.bodySlipX;
      f1.activeGesture = in1.gesture;
    }

    // 2. Process Player 2 Input (Webcam / Keyboard / AI bot / Online Remote)
    let in2 = {
      gesture: f2.activeGesture,
      punchHand: f2.punchHand,
      isBlocking: f2.isBlocking,
      isDodging: f2.isDodging,
      dodgeType: f2.dodgeType,
      moveX: 0,
    };

    if (isGuest) {
      // Local client is Guest (controlling Fighter 2)
      const guestRes = trackerP2.current.update(localPose, now, dt, keysRef.current.p2);
      f2.isBlocking = guestRes.isBlocking;
      f2.isDodging = guestRes.isDodging;
      f2.dodgeType = guestRes.dodgeType;
      f2.armExtension = guestRes.armExtension;
      f2.bodySquatY = guestRes.bodySquatY;
      f2.bodySlipX = guestRes.bodySlipX;
      f2.activeGesture = guestRes.gesture;
      in2 = guestRes;
    } else if (f2.isCpu && !isOnline) {
      in2 = botP2.current.update(f2, f1, now, dt);
      f2.isBlocking = in2.isBlocking;
      f2.isDodging = in2.isDodging;
      f2.dodgeType = in2.dodgeType;
      f2.activeGesture = in2.gesture;
    } else if (!isOnline) {
      const p2Res = trackerP2.current.update(p2LocalPose, now, dt, keysRef.current.p2);
      f2.armExtension = p2Res.armExtension;
      f2.bodySquatY = p2Res.bodySquatY;
      f2.bodySlipX = p2Res.bodySlipX;
      f2.isBlocking = p2Res.isBlocking;
      f2.isDodging = p2Res.isDodging;
      f2.dodgeType = p2Res.dodgeType;
      f2.activeGesture = p2Res.gesture;
      in2 = p2Res;
    }

    // 3. Precise, Smooth, Jitter-Free Movement Update
    if (!isGuest && in1.moveX !== 0 && f1.action !== 'hit' && f1.action !== 'ko') {
      f1.targetX = clamp(f1.targetX + in1.moveX * MOVE_SPEED * (dt / 1000), -0.82, 0.82);
    }
    // Smooth position interpolation (instant responsiveness, zero lag, no sliding)
    f1.x += (f1.targetX - f1.x) * (1 - Math.exp(-dt / 40));

    if ((!isOnline || isGuest) && in2.moveX !== 0 && f2.action !== 'hit' && f2.action !== 'ko') {
      f2.targetX = clamp(f2.targetX + in2.moveX * MOVE_SPEED * (dt / 1000), -0.82, 0.82);
    }
    f2.x += (f2.targetX - f2.x) * (1 - Math.exp(-dt / 40));

    // Dynamic Facing Direction: Both players always face each other accurately while moving
    if (f1.x < f2.x) {
      f1.facing = 1;
      f2.facing = -1;
    } else if (f1.x > f2.x) {
      f1.facing = -1;
      f2.facing = 1;
    }

    // Collision Separation: Keep fighters from clipping or phasing through each other
    const currentDist = Math.abs(f1.x - f2.x);
    if (currentDist < MIN_DISTANCE) {
      const overlap = (MIN_DISTANCE - currentDist) * 0.5;
      if (f1.x <= f2.x) {
        f1.x = clamp(f1.x - overlap, -0.85, 0.85);
        f2.x = clamp(f2.x + overlap, -0.85, 0.85);
      } else {
        f1.x = clamp(f1.x + overlap, -0.85, 0.85);
        f2.x = clamp(f2.x - overlap, -0.85, 0.85);
      }
      f1.targetX = f1.x;
      f2.targetX = f2.x;
    }

    // Broadcast local state across network in Online Duel
    if (isOnline && netRoom.current) {
      const localFighter = isHost ? f1 : f2;
      netRoom.current.sendSync(
        {
          x: localFighter.x,
          y: localFighter.y,
          facing: localFighter.facing,
          action: localFighter.action,
          punchHand: localFighter.punchHand,
          isBlocking: localFighter.isBlocking,
          isDodging: localFighter.isDodging,
          dodgeType: localFighter.dodgeType,
          armExtension: localFighter.armExtension,
          hp: localFighter.hp,
          combo: localFighter.combo,
          timestamp: now,
        },
        now
      );
    }

    // 4. Action State Machine (Cooldowns & Animation Times)
    const updateFighterAction = (f: FighterState, gest: FighterState['activeGesture'], hand: 'left' | 'right' | null) => {
      if (f.actionTime > 0) {
        f.actionTime -= dt;
        if (f.actionTime <= 0) {
          f.action = 'idle';
          f.actionDuration = 0;
        }
      }

      if (f.hp <= 0) {
        f.action = 'ko';
        return;
      }

      if (f.action === 'idle' || f.action === 'block' || f.action === 'dodge') {
        if (f.isBlocking) {
          f.action = 'block';
        } else if (f.isDodging) {
          f.action = 'dodge';
          if (renderer && Math.random() < 0.25) {
            renderer.addAfterimage(f, now);
          }
        } else if (gest === 'punch') {
          f.action = 'punch';
          f.punchHand = hand ?? 'right';
          f.actionDuration = 320;
          f.actionTime = 320;
          // Step forward during strike for accurate attack physics
          f.targetX = clamp(f.targetX + f.facing * 0.08, -0.85, 0.85);
        } else if (gest === 'jab') {
          f.action = 'jab';
          f.punchHand = hand ?? 'left';
          f.actionDuration = 220;
          f.actionTime = 220;
          f.targetX = clamp(f.targetX + f.facing * 0.04, -0.85, 0.85);
        } else {
          f.action = 'idle';
        }
      }
    };

    if (!isGuest) updateFighterAction(f1, in1.gesture, in1.punchHand);
    if (isGuest || !isOnline) updateFighterAction(f2, in2.gesture, in2.punchHand);

    // 5. Accurate Hit Detection Matching Actual Positions & Reach
    if (phaseRef.current === 'fighting') {
      const resolveAttack = (attacker: FighterState, defender: FighterState) => {
        const isStrikeFrame =
          (attacker.action === 'jab' || attacker.action === 'punch') &&
          attacker.actionTime < attacker.actionDuration * 0.65 &&
          attacker.actionTime > attacker.actionDuration * 0.35;

        if (isStrikeFrame && attacker.activeGesture) {
          attacker.activeGesture = null; // consume trigger once

          // Check physical distance and facing direction
          const dist = Math.abs(attacker.x - defender.x);
          const isFacingDefender = (defender.x - attacker.x) * attacker.facing > 0;
          const reach = attacker.action === 'punch' ? PUNCH_REACH : JAB_REACH;

          // If in online duel and attacking opponent: send strike packet
          if (isOnline && netRoom.current) {
            const isLocalAttacker = (isHost && attacker.id === 0) || (isGuest && attacker.id === 1);
            if (isLocalAttacker) {
              netRoom.current.sendStrike({
                strikeId: `${attacker.id}-${now}`,
                gesture: attacker.action as 'jab' | 'punch',
                punchHand: attacker.punchHand ?? 'right',
                x: attacker.x,
                y: attacker.y,
                timestamp: now,
              });
            }
          }

          // In local duel (or Host processing local attack): verify distance
          if (!isFacingDefender || dist > reach) {
            // Whiff in air: out of range
            audio?.whoosh();
            return;
          }

          const hitX = (defender.x * 0.38 + 0.5) * window.innerWidth;
          const hitY = window.innerHeight * 0.62;

          if (defender.isDodging) {
            // Squat duck or slip evasion
            audio?.dodge();
            renderer?.addHitEffect(hitX, hitY - 40, 'dodge', '⚡ DODGED!', '#ffd24d');
            renderer?.addAfterimage(defender, now);
            defender.attacksDodged++;
          } else if (defender.isBlocking) {
            // High guard: 0 damage!
            audio?.block();
            renderer?.addHitEffect(hitX, hitY, 'block', '🛡️ BLOCKED!', '#3dffb0');
            renderer?.triggerShake(4, 150);
            defender.attacksBlocked++;
          } else {
            // Solid Hit!
            const isPower = attacker.action === 'punch';
            const isCounter = defender.action === 'punch' || defender.action === 'jab';
            const baseDmg = isPower ? 22 : 11;
            const dmg = isCounter ? Math.round(baseDmg * 1.5) : baseDmg;

            defender.hp = Math.max(0, defender.hp - dmg);
            attacker.combo++;
            attacker.bestCombo = Math.max(attacker.bestCombo, attacker.combo);
            defender.combo = 0;
            defender.action = 'hit';
            defender.actionDuration = isPower ? 260 : 180;
            defender.actionTime = defender.actionDuration;

            if (isPower) {
              attacker.punchesLanded++;
              audio?.punchHit();
              renderer?.triggerShake(14, 300);
              renderer?.addHitEffect(hitX, hitY, 'crit', isCounter ? `💥 CRITICAL -${dmg}` : `💥 -${dmg}`, '#ff5a6e');
            } else {
              attacker.jabsLanded++;
              audio?.jabHit();
              renderer?.triggerShake(7, 180);
              renderer?.addHitEffect(hitX, hitY, 'hit', `🥊 -${dmg}`, '#2ee6ff');
            }

            if (defender.hp <= 0) {
              handleRoundOver(attacker.id);
            }
          }
        }
      };

      if (!isOnline) {
        resolveAttack(f1, f2);
        resolveAttack(f2, f1);
      } else if (isHost) {
        resolveAttack(f1, f2);
      } else if (isGuest) {
        resolveAttack(f2, f1);
      }

      // Round Timer Tick
      roundTimerAcc.current += dt;
      if (roundTimerAcc.current >= 1000) {
        roundTimerAcc.current -= 1000;
        setTimeLeft((t) => {
          if (t <= 1) {
            const roundWinner = f1.hp >= f2.hp ? 0 : 1;
            handleRoundOver(roundWinner);
            return 0;
          }
          return t - 1;
        });
      }
    }

    // 6. Smooth HP chip damage bars
    const chipSpeed = 0.08;
    f1.chipHp += (f1.hp - f1.chipHp) * chipSpeed;
    f2.chipHp += (f2.hp - f2.chipHp) * chipSpeed;

    // 7. Update HUD state for React
    setHudP1({
      hp: f1.hp,
      chipHp: f1.chipHp,
      combo: f1.combo,
      rounds: f1.roundsWon,
      gesture: f1.action === 'block' ? '🛡️ BLOCK' : f1.action === 'dodge' ? '⚡ DODGE' : f1.action === 'punch' ? '💥 PUNCH' : f1.action === 'jab' ? '🥊 JAB' : '',
    });

    setHudP2({
      hp: f2.hp,
      chipHp: f2.chipHp,
      combo: f2.combo,
      rounds: f2.roundsWon,
      gesture: f2.action === 'block' ? '🛡️ BLOCK' : f2.action === 'dodge' ? '⚡ DODGE' : f2.action === 'punch' ? '💥 PUNCH' : f2.action === 'jab' ? '🥊 JAB' : '',
      isCpu: f2.isCpu && !isOnline,
    });

    // 8. Render 2D Canvas Scene
    renderer?.render(f1, f2, now, dt);
  });

  const handleRoundOver = (roundWinner: 0 | 1) => {
    phaseRef.current = 'round-end';
    setPhase('round-end');

    audioRef.current?.ko();
    rendererRef.current?.triggerShake(22, 500);

    const winnerObj = roundWinner === 0 ? f1Ref.current : f2Ref.current;
    winnerObj.roundsWon++;

    if (onlineRoleRef.current === 'host') {
      netRoom.current?.sendEvent({ type: 'round_over', winner: roundWinner });
    }

    setBanner({
      title: 'KNOCKOUT!',
      sub: `${winnerObj.name} WINS ROUND ${round}!`,
    });

    if (winnerObj.roundsWon >= ROUNDS_TO_WIN) {
      setTimeout(() => {
        setWinner(roundWinner);
        setPhase('match-end');
        phaseRef.current = 'match-end';
      }, 2400);
    } else {
      setTimeout(() => {
        startNextRound(round + 1);
      }, 2600);
    }
  };

  const handleRematch = () => {
    f1Ref.current = createFighter(0, 'SHADOW', '#2ee6ff', 1, false);
    f2Ref.current = createFighter(1, 'NINJA', '#ff5a6e', -1, onlineRole === 'local');
    setWinner(null);
    if (onlineRole !== 'local') {
      netRoom.current?.sendEvent({ type: 'rematch' });
    }
    startNextRound(1);
  };

  const copyInviteLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?shadowRoom=${roomCode}`;
    void navigator.clipboard?.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  return (
    <div className="shadow-fight">
      {/* 2D Canvas Arena */}
      <canvas ref={canvasRef} className="shadow-fight__canvas" />

      {/* Disconnect Toast Alert */}
      {networkNotice && (
        <div className="shadow-fight__disconnect-toast">
          {networkNotice}
        </div>
      )}

      {/* Top Combat HUD (Matching Shadow Fight 2 Screenshot!) */}
      <header className="shadow-fight__top-hud">
        {/* Player 1 (Shadow) on Left */}
        <div className="shadow-fight__fighter-card shadow-fight__fighter-card--p1">
          <div className="shadow-fight__avatar shadow-fight__avatar--p1">
            <div className="shadow-fight__avatar-inner">
              <span className="shadow-fight__avatar-eye" />
            </div>
          </div>
          <div className="shadow-fight__bar-group">
            <div className="shadow-fight__meta">
              <span className="shadow-fight__name">
                {onlineRole === 'guest' ? 'SHADOW (OPPONENT)' : 'SHADOW (P1)'}
              </span>
              <div className="shadow-fight__round-dots">
                {Array.from({ length: ROUNDS_TO_WIN }).map((_, i) => (
                  <span
                    key={i}
                    className={`shadow-fight__dot ${i < hudP1.rounds ? 'is-won' : ''}`}
                  />
                ))}
              </div>
            </div>
            <div className="shadow-fight__hp-bar shadow-fight__hp-bar--p1">
              <div
                className="shadow-fight__hp-chip"
                style={{ width: `${hudP1.chipHp}%` }}
              />
              <div
                className="shadow-fight__hp-fill shadow-fight__hp-fill--p1"
                style={{ width: `${hudP1.hp}%` }}
              />
            </div>
            {hudP1.combo >= 2 && (
              <span className="shadow-fight__combo shadow-fight__combo--p1">
                {hudP1.combo}x COMBO!
              </span>
            )}
          </div>
        </div>

        {/* Center Round, Timer & Mode Indicator */}
        <div className="shadow-fight__center">
          <div className="shadow-fight__round-badge">ROUND {round}</div>
          <div className="shadow-fight__timer-box">
            <span className={`shadow-fight__timer ${timeLeft <= 10 ? 'is-urgent' : ''}`}>
              {String(timeLeft).padStart(2, '0')}
            </span>
          </div>
          <button
            type="button"
            className="shadow-fight__pause-btn"
            onClick={() => setIsPaused((p) => !p)}
            title="Pause"
          >
            {isPaused ? '▶' : '⏸'}
          </button>
          <button
            type="button"
            className="shadow-fight__mode-tag"
            onClick={() => setShowOnlineModal(true)}
            title="Online 2-Player Duels"
          >
            {onlineRole === 'local' ? '🌐 Play Online' : `🌐 Room: ${roomCode}`}
          </button>
        </div>

        {/* Player 2 (Ninja / Rival) on Right */}
        <div className="shadow-fight__fighter-card shadow-fight__fighter-card--p2">
          <div className="shadow-fight__bar-group">
            <div className="shadow-fight__meta shadow-fight__meta--p2">
              <div className="shadow-fight__round-dots">
                {Array.from({ length: ROUNDS_TO_WIN }).map((_, i) => (
                  <span
                    key={i}
                    className={`shadow-fight__dot ${i < hudP2.rounds ? 'is-won' : ''}`}
                  />
                ))}
              </div>
              <span className="shadow-fight__name">
                {onlineRole === 'guest'
                  ? 'NINJA (YOU)'
                  : onlineRole === 'host'
                    ? opponentName ? `NINJA (${opponentName})` : 'NINJA (GUEST)'
                    : hudP2.isCpu
                      ? 'NINJA (CPU)'
                      : 'NINJA (P2)'}
              </span>
            </div>
            <div className="shadow-fight__hp-bar shadow-fight__hp-bar--p2">
              <div
                className="shadow-fight__hp-chip"
                style={{ width: `${hudP2.chipHp}%` }}
              />
              <div
                className="shadow-fight__hp-fill shadow-fight__hp-fill--p2"
                style={{ width: `${hudP2.hp}%` }}
              />
            </div>
            {hudP2.combo >= 2 && (
              <span className="shadow-fight__combo shadow-fight__combo--p2">
                {hudP2.combo}x COMBO!
              </span>
            )}
          </div>
          <div className="shadow-fight__avatar shadow-fight__avatar--p2">
            <div className="shadow-fight__avatar-inner">
              <span className="shadow-fight__avatar-eye shadow-fight__avatar-eye--p2" />
            </div>
          </div>
        </div>
      </header>

      {/* Dramatic Round Announcement Banner ("ROUND 1 - FIGHT!", "K.O.!") */}
      {banner && (
        <div className="shadow-fight__banner">
          <h2 className="shadow-fight__banner-title">{banner.title}</h2>
          {banner.sub && <p className="shadow-fight__banner-sub">{banner.sub}</p>}
        </div>
      )}

      {/* Floating Picture-In-Picture Camera Preview in bottom left */}
      <div className="shadow-fight__pip-container">
        <CameraViewport
          engine={engine}
          variant="panel"
          hud={false}
          className="shadow-fight__pip-camera"
        />
        <div className="shadow-fight__pip-badges">
          <span className={`shadow-fight__gesture-tag ${hudP1.gesture ? 'is-active' : ''}`}>
            P1: {hudP1.gesture || 'READY'}
          </span>
          <span className={`shadow-fight__gesture-tag ${hudP2.gesture ? 'is-active' : ''}`}>
            P2: {hudP2.gesture || (hudP2.isCpu ? 'AI BOT' : 'READY')}
          </span>
        </div>
      </div>

      {/* Interactive Controls Legend Bar at Bottom */}
      <footer className="shadow-fight__footer-bar">
        <div className="shadow-fight__guide-pill">
          <span className="shadow-fight__pill-icon">🥊</span>
          <span><strong>Lead Jab:</strong> Quick forward snap (Q)</span>
        </div>
        <div className="shadow-fight__guide-pill">
          <span className="shadow-fight__pill-icon">💥</span>
          <span><strong>Power Punch:</strong> Full thrust cross (W / F)</span>
        </div>
        <div className="shadow-fight__guide-pill">
          <span className="shadow-fight__pill-icon">🛡️</span>
          <span><strong>High Guard:</strong> Hands up & close (Shift)</span>
        </div>
        <div className="shadow-fight__guide-pill">
          <span className="shadow-fight__pill-icon">⚡</span>
          <span><strong>Dodge:</strong> Squat duck or slip (S / A / D)</span>
        </div>
      </footer>

      {/* Online 1v1 Multiplayer Modal */}
      {showOnlineModal && (
        <div className="shadow-fight__online-modal">
          <div className="shadow-fight__modal-card">
            <h2 className="shadow-fight__modal-title">ONLINE 1v1 DUEL</h2>
            <p className="shadow-fight__modal-sub">
              Play against a friend in real time using separate devices
            </p>

            <div className="shadow-fight__room-tabs">
              <button
                type="button"
                className={`shadow-fight__tab-btn ${onlineTab === 'create' ? 'is-active' : ''}`}
                onClick={() => setOnlineTab('create')}
              >
                Create Room
              </button>
              <button
                type="button"
                className={`shadow-fight__tab-btn ${onlineTab === 'join' ? 'is-active' : ''}`}
                onClick={() => setOnlineTab('join')}
              >
                Join by Code
              </button>
            </div>

            {onlineTab === 'create' ? (
              <div>
                <div className="shadow-fight__code-box">
                  <span className="t-label">Share this room code with your opponent</span>
                  <div className="shadow-fight__code-big">{roomCode}</div>
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    onClick={copyInviteLink}
                  >
                    {copiedLink ? 'Link Copied! ✓' : 'Copy Invite Link'}
                  </button>
                </div>

                {networkStatus === 'connected' ? (
                  <div className="shadow-fight__connected-box">
                    <span>Opponent connected! Click below when ready:</span>
                  </div>
                ) : (
                  <p className="lobby__hint">Waiting for opponent to connect…</p>
                )}

                <div className="shadow-fight__actions">
                  {networkStatus !== 'connected' && (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={handleCreateRoom}
                    >
                      {networkStatus === 'waiting' ? 'Waiting…' : 'Host Room'}
                    </button>
                  )}
                  {networkStatus === 'connected' && (
                    <button
                      type="button"
                      className={`btn ${isReady ? 'btn--ghost' : 'btn--primary'}`}
                      onClick={handleToggleReady}
                    >
                      {isReady ? 'Ready ✓ (Waiting)' : "I'm Ready!"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setShowOnlineModal(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="shadow-fight__input-row">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="CODE"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    className="shadow-fight__room-input"
                  />
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={handleJoinRoom}
                  >
                    Join
                  </button>
                </div>

                {networkStatus === 'connected' && (
                  <div className="shadow-fight__connected-box">
                    <span>Connected to room {roomCode}! Click Ready to begin:</span>
                  </div>
                )}

                <div className="shadow-fight__actions">
                  {networkStatus === 'connected' && (
                    <button
                      type="button"
                      className={`btn ${isReady ? 'btn--ghost' : 'btn--primary'}`}
                      onClick={handleToggleReady}
                    >
                      {isReady ? 'Ready ✓ (Waiting for Host)' : "I'm Ready!"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setShowOnlineModal(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Match Over Victory Modal */}
      {phase === 'match-end' && (
        <div className="shadow-fight__victory-overlay">
          <div className="shadow-fight__victory-card">
            <span className="shadow-fight__trophy">🏆</span>
            <h1 className="shadow-fight__victory-title">
              {winner === 0 ? 'SHADOW VICTORY!' : 'NINJA VICTORY!'}
            </h1>
            <p className="shadow-fight__victory-sub">
              {winner === 0 ? 'Player 1 triumphs in the shadow arena' : 'Rival ninja claims victory'}
            </p>

            <div className="shadow-fight__stats-grid">
              <div className="shadow-fight__stat-col">
                <span className="t-label">SHADOW (P1)</span>
                <strong>{f1Ref.current.punchesLanded + f1Ref.current.jabsLanded} Strikes</strong>
                <span>{f1Ref.current.attacksBlocked} Blocks · {f1Ref.current.attacksDodged} Dodges</span>
              </div>
              <div className="shadow-fight__stat-col">
                <span className="t-label">NINJA (P2)</span>
                <strong>{f2Ref.current.punchesLanded + f2Ref.current.jabsLanded} Strikes</strong>
                <span>{f2Ref.current.attacksBlocked} Blocks · {f2Ref.current.attacksDodged} Dodges</span>
              </div>
            </div>

            <div className="shadow-fight__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleRematch}
              >
                Rematch
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={onExit}
              >
                Back to Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
