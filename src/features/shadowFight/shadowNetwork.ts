import { Peer, type DataConnection } from 'peerjs';
import type { CombatGesture, FighterAction } from './types';

export interface RemoteFighterPacket {
  x: number;
  y: number;
  facing: 1 | -1;
  action: FighterAction;
  punchHand: 'left' | 'right' | null;
  isBlocking: boolean;
  isDodging: boolean;
  dodgeType: 'squat' | 'slip' | null;
  armExtension: number;
  hp: number;
  combo: number;
  timestamp: number;
}

export interface RemoteStrikePacket {
  strikeId: string;
  gesture: 'jab' | 'punch';
  punchHand: 'left' | 'right';
  x: number;
  y: number;
  timestamp: number;
}

export interface RemoteHitResultPacket {
  strikeId: string;
  result: 'hit' | 'crit' | 'block' | 'dodge';
  damage: number;
  newHp: number;
  timestamp: number;
}

export interface RemoteMatchEvent {
  type: 'ready' | 'start' | 'round_over' | 'rematch' | 'leave';
  seed?: number;
  winner?: 0 | 1;
  name?: string;
}

export type NetworkMessage =
  | { type: 'sync'; payload: RemoteFighterPacket }
  | { type: 'strike'; payload: RemoteStrikePacket }
  | { type: 'hit_result'; payload: RemoteHitResultPacket }
  | { type: 'event'; payload: RemoteMatchEvent };

export interface ShadowNetworkCallbacks {
  onStatusChange: (status: 'connecting' | 'waiting' | 'connected' | 'disconnected', error?: string) => void;
  onOpponentJoin: (name: string) => void;
  onOpponentReady: (ready: boolean) => void;
  onMatchStart: (seed: number) => void;
  onRemoteState: (state: RemoteFighterPacket) => void;
  onRemoteStrike: (strike: RemoteStrikePacket) => void;
  onRemoteHitResult: (result: RemoteHitResultPacket) => void;
  onRemoteRoundOver: (winner: 0 | 1) => void;
  onRemoteRematch: () => void;
  onOpponentLeave: () => void;
}

const PEER_PREFIX = 'm-rush-sf-';

export class ShadowNetworkRoom {
  readonly roomCode: string;
  readonly playerName: string;
  readonly isHost: boolean;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private broadcast: BroadcastChannel | null = null;
  private callbacks: ShadowNetworkCallbacks;
  private closed = false;
  private lastSentTime = 0;

  constructor(
    roomCode: string,
    playerName: string,
    isHost: boolean,
    callbacks: ShadowNetworkCallbacks
  ) {
    this.roomCode = roomCode.toUpperCase();
    this.playerName = playerName;
    this.isHost = isHost;
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    this.callbacks.onStatusChange(this.isHost ? 'waiting' : 'connecting');

    // 1. Setup local BroadcastChannel (allows instant zero-latency same-device 2-tab testing)
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcast = new BroadcastChannel(`shadow-fight-${this.roomCode}`);
        this.broadcast.onmessage = (e: MessageEvent<NetworkMessage>) => {
          this.handleIncoming(e.data);
        };
      }
    } catch {
      // BroadcastChannel unavailable
    }

    // 2. Setup WebRTC PeerJS connection for internet cross-device multiplayer
    try {
      const peerId = this.isHost
        ? `${PEER_PREFIX}${this.roomCode}`
        : `${PEER_PREFIX}${this.roomCode}-client-${Math.random().toString(36).substring(2, 7)}`;

      const peer = new Peer(peerId, {
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });

      this.peer = peer;

      peer.on('open', () => {
        if (this.closed) {
          peer.destroy();
          return;
        }

        if (!this.isHost) {
          // Client connects to host peer
          const targetHostId = `${PEER_PREFIX}${this.roomCode}`;
          const conn = peer.connect(targetHostId, { reliable: true });
          this.setupDataConnection(conn);
        }
      });

      if (this.isHost) {
        // Host waits for client connection
        peer.on('connection', (conn) => {
          this.setupDataConnection(conn);
        });
      }

      peer.on('error', (err) => {
        console.warn('[ShadowNetwork] PeerJS notice:', err.type, err.message);
        // If peer ID taken on host, fallback is handled via broadcast or client retry
        if (err.type === 'peer-unavailable' && !this.isHost) {
          this.callbacks.onStatusChange('disconnected', 'Room not found. Check the code.');
        }
      });
    } catch (e) {
      console.warn('[ShadowNetwork] WebRTC init error:', e);
    }
  }

  private setupDataConnection(conn: DataConnection): void {
    this.conn = conn;

    conn.on('open', () => {
      this.callbacks.onStatusChange('connected');
      // Greet opponent
      this.sendEvent({ type: 'ready', name: this.playerName });
    });

    conn.on('data', (data) => {
      this.handleIncoming(data as NetworkMessage);
    });

    conn.on('close', () => {
      this.callbacks.onOpponentLeave();
      this.callbacks.onStatusChange('disconnected', 'Opponent disconnected.');
    });

    conn.on('error', () => {
      this.callbacks.onStatusChange('disconnected', 'Connection lost.');
    });
  }

  private handleIncoming(msg: NetworkMessage): void {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'sync':
        this.callbacks.onRemoteState(msg.payload);
        break;
      case 'strike':
        this.callbacks.onRemoteStrike(msg.payload);
        break;
      case 'hit_result':
        this.callbacks.onRemoteHitResult(msg.payload);
        break;
      case 'event': {
        const ev = msg.payload;
        if (ev.type === 'ready') {
          if (ev.name) this.callbacks.onOpponentJoin(ev.name);
          this.callbacks.onOpponentReady(true);
        } else if (ev.type === 'start' && ev.seed !== undefined) {
          this.callbacks.onMatchStart(ev.seed);
        } else if (ev.type === 'round_over' && ev.winner !== undefined) {
          this.callbacks.onRemoteRoundOver(ev.winner);
        } else if (ev.type === 'rematch') {
          this.callbacks.onRemoteRematch();
        } else if (ev.type === 'leave') {
          this.callbacks.onOpponentLeave();
          this.callbacks.onStatusChange('disconnected', 'Opponent left the room.');
        }
        break;
      }
    }
  }

  send(msg: NetworkMessage): void {
    if (this.closed) return;

    // Send via WebRTC DataConnection
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(msg);
      } catch {
        // Fallback to broadcast
      }
    }

    // Also broadcast for same-device local testing
    if (this.broadcast) {
      try {
        this.broadcast.postMessage(msg);
      } catch {
        // Ignore
      }
    }
  }

  sendSync(packet: RemoteFighterPacket, now: number): void {
    // Throttle high frequency sync to ~30Hz (every 33ms)
    if (now - this.lastSentTime < 30) return;
    this.lastSentTime = now;
    this.send({ type: 'sync', payload: packet });
  }

  sendStrike(strike: RemoteStrikePacket): void {
    this.send({ type: 'strike', payload: strike });
  }

  sendHitResult(result: RemoteHitResultPacket): void {
    this.send({ type: 'hit_result', payload: result });
  }

  sendEvent(event: RemoteMatchEvent): void {
    this.send({ type: 'event', payload: event });
  }

  leave(): void {
    this.closed = true;
    this.sendEvent({ type: 'leave' });

    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    if (this.broadcast) {
      this.broadcast.close();
      this.broadcast = null;
    }
    this.callbacks.onStatusChange('disconnected');
  }
}
