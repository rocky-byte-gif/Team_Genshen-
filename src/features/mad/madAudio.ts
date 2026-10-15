import { sfx } from '../../lib/audio/sfx';
import type { WeaponId } from './weapons';

/** Procedural combat sound (Web Audio, no files): gunshots, blasts, hits. Shares the game's master volume and mute. */
class MadAudio {
  private noise: AudioBuffer | null = null;

  private ctx(): { ctx: AudioContext; master: GainNode } | null {
    const a = sfx.audio();
    return a && a.ctx.state === 'running' ? a : null;
  }

  private noiseBuf(ctx: AudioContext): AudioBuffer {
    if (!this.noise) {
      const len = Math.floor(ctx.sampleRate * 1.2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    return this.noise;
  }

  /** A burst of filtered noise with an exponential decay. */
  private burst(opts: { dur: number; gain: number; freq: number; to?: number; type?: BiquadFilterType; q?: number; delay?: number }): void {
    const a = this.ctx();
    if (!a) return;
    const { ctx, master } = a;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf(ctx);
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'lowpass';
    f.Q.value = opts.q ?? 0.8;
    f.frequency.setValueAtTime(opts.freq, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + opts.dur + 0.05);
  }

  private thump(freq: number, to: number, dur: number, gain: number, delay = 0): void {
    const a = this.ctx();
    if (!a) return;
    const { ctx, master } = a;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shot(w: WeaponId): void {
    switch (w) {
      case 'knife':
        this.burst({ dur: 0.18, gain: 0.35, freq: 5200, to: 900, type: 'bandpass', q: 1.2 });
        break;
      case 'pistol':
        this.burst({ dur: 0.16, gain: 0.7, freq: 4200, to: 600 });
        this.thump(180, 60, 0.12, 0.5);
        break;
      case 'deagle':
        this.burst({ dur: 0.3, gain: 0.95, freq: 3600, to: 260 });
        this.thump(130, 38, 0.26, 0.85);
        break;
      case 'rifle':
        this.burst({ dur: 0.22, gain: 0.8, freq: 3800, to: 420 });
        this.thump(150, 45, 0.18, 0.6);
        break;
      case 'auto':
        this.burst({ dur: 0.09, gain: 0.5, freq: 4600, to: 700 });
        this.thump(210, 80, 0.07, 0.3);
        break;
      case 'sniper':
        this.burst({ dur: 0.7, gain: 1, freq: 3000, to: 140 });
        this.thump(110, 30, 0.45, 1);
        this.burst({ dur: 0.9, gain: 0.25, freq: 900, to: 200, delay: 0.12 });
        break;
      case 'bomb':
        this.burst({ dur: 0.12, gain: 0.3, freq: 2500, to: 600, type: 'bandpass' });
        break;
      case 'rocket':
        this.burst({ dur: 0.9, gain: 0.75, freq: 2200, to: 180, type: 'bandpass', q: 0.6 });
        this.thump(90, 40, 0.5, 0.6);
        break;
    }
  }

  explosion(delay = 0): void {
    this.burst({ dur: 1.0, gain: 1, freq: 2400, to: 90, delay });
    this.thump(95, 28, 0.7, 1, delay);
    this.burst({ dur: 0.5, gain: 0.4, freq: 6000, to: 800, type: 'highpass', delay });
  }

  hit(head: boolean): void {
    this.burst({ dur: 0.08, gain: head ? 0.6 : 0.4, freq: head ? 2400 : 1200, to: 400, type: 'bandpass', q: 2 });
    this.thump(head ? 320 : 200, 90, 0.08, 0.35);
  }

  /** An enemy volley: a short rattle from far away. */
  volley(blocked: boolean): void {
    for (let i = 0; i < 3; i++) this.burst({ dur: 0.1, gain: blocked ? 0.22 : 0.35, freq: 3000, to: 500, delay: i * 0.07 });
    if (blocked) this.burst({ dur: 0.12, gain: 0.3, freq: 1800, to: 300, type: 'bandpass', delay: 0.05 });
  }

  hurt(): void {
    this.thump(120, 45, 0.28, 0.8);
    this.burst({ dur: 0.2, gain: 0.35, freq: 500, to: 120 });
  }

  dry(): void {
    this.burst({ dur: 0.03, gain: 0.35, freq: 5000, type: 'highpass' });
  }

  reload(): void {
    this.burst({ dur: 0.05, gain: 0.35, freq: 4200, type: 'bandpass', q: 3 });
    this.burst({ dur: 0.06, gain: 0.4, freq: 2600, type: 'bandpass', q: 3, delay: 0.14 });
  }
}

export const madAudio = new MadAudio();
