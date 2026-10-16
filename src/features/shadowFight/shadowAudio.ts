/**
 * Synthesizes punch, jab, block, dodge, gong, and KO audio effects
 * for 2D Shadow Fighter using Web Audio API (zero external assets needed).
 */
export class ShadowAudio {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private isMuted = false;
  private musicInterval: number | null = null;
  private beatStep = 0;

  constructor() {
    // Lazy initialized on first user interaction or start
  }

  private ctx(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : 0.7;
      this.masterGain.connect(this.audioCtx.destination);

      this.musicGain = this.audioCtx.createGain();
      this.musicGain.gain.value = 0.22;
      this.musicGain.connect(this.masterGain);
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 0.7, this.audioCtx.currentTime);
    }
  }

  private burst({
    dur,
    gain = 0.5,
    freq = 1000,
    to,
    type = 'bandpass',
    q = 1.0,
    delay = 0,
  }: {
    dur: number;
    gain?: number;
    freq?: number;
    to?: number;
    type?: BiquadFilterType;
    q?: number;
    delay?: number;
  }): void {
    if (this.isMuted) return;
    try {
      const a = this.ctx();
      const t = a.currentTime + delay;
      const bufferSize = Math.max(256, Math.floor(a.sampleRate * dur));
      const buffer = a.createBuffer(1, bufferSize, a.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = a.createBufferSource();
      noise.buffer = buffer;

      const filter = a.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(freq, t);
      if (to !== undefined) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
      }
      filter.Q.value = q;

      const g = a.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);

      noise.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain ?? a.destination);

      noise.start(t);
      noise.stop(t + dur);
    } catch {
      // AudioContext unavailable
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.3, toFreq?: number, delay = 0): void {
    if (this.isMuted) return;
    try {
      const a = this.ctx();
      const t = a.currentTime + delay;
      const osc = a.createOscillator();
      const g = a.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (toFreq !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), t + dur);
      }

      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.connect(g);
      g.connect(this.masterGain ?? a.destination);

      osc.start(t);
      osc.stop(t + dur);
    } catch {
      // AudioContext unavailable
    }
  }

  /** Quick snappy lead jab impact */
  jabHit(): void {
    this.burst({ dur: 0.1, gain: 0.6, freq: 1900, to: 380, type: 'bandpass', q: 2.2 });
    this.tone(160, 0.1, 'sine', 0.5, 60);
  }

  /** Heavy power punch impact */
  punchHit(): void {
    this.burst({ dur: 0.18, gain: 0.85, freq: 1200, to: 220, type: 'bandpass', q: 1.5 });
    this.tone(130, 0.22, 'triangle', 0.8, 38);
    this.burst({ dur: 0.14, gain: 0.45, freq: 3400, to: 600, type: 'highpass', delay: 0.02 });
  }

  /** Whiff whoosh through air */
  whoosh(): void {
    this.burst({ dur: 0.15, gain: 0.38, freq: 1600, to: 350, type: 'bandpass', q: 1.8 });
    this.tone(280, 0.12, 'sine', 0.25, 120);
  }

  /** High guard block: metallic shield barrier deflection chime */
  block(): void {
    this.tone(880, 0.16, 'triangle', 0.55, 620);
    this.tone(1320, 0.12, 'sine', 0.4, 980);
    this.burst({ dur: 0.12, gain: 0.5, freq: 4200, to: 1200, type: 'bandpass', q: 3.2 });
  }

  /** Squat or slip dodge: air rushing past */
  dodge(): void {
    this.burst({ dur: 0.22, gain: 0.45, freq: 2400, to: 280, type: 'bandpass', q: 1.8 });
    this.tone(420, 0.16, 'sine', 0.28, 180);
  }

  /** Round start gong / bell */
  gong(): void {
    const freqs = [220, 440, 587, 880];
    freqs.forEach((f, i) => {
      this.tone(f, 1.8, 'sine', 0.45 / (i + 1), undefined, i * 0.015);
    });
    this.burst({ dur: 0.4, gain: 0.3, freq: 3200, to: 800, type: 'highpass' });
  }

  /** Knockout impact boom */
  ko(): void {
    this.burst({ dur: 1.2, gain: 1.0, freq: 1800, to: 60, type: 'lowpass' });
    this.tone(110, 0.8, 'triangle', 0.9, 25);
    this.burst({ dur: 0.6, gain: 0.6, freq: 4500, to: 400, type: 'highpass', delay: 0.05 });
  }

  /** Start ambient synth combat pulse */
  startCombatBeat(): void {
    if (this.musicInterval !== null) return;
    this.beatStep = 0;
    this.musicInterval = window.setInterval(() => {
      if (this.isMuted) return;
      const step = this.beatStep % 8;
      this.beatStep++;
      // Deep pulse kick on 0 and 4
      if (step === 0 || step === 4) {
        this.tone(65, 0.18, 'sine', 0.35, 32);
      }
      // Synth percussion hi-hat on 2 and 6
      if (step === 2 || step === 6) {
        this.burst({ dur: 0.05, gain: 0.12, freq: 7000, type: 'highpass' });
      }
      // Atmospheric bass pluck on 0, 3, 6
      if (step === 0 || step === 3 || step === 6) {
        const notes = [130.81, 146.83, 164.81, 110.0]; // C3, D3, E3, A2
        const n = notes[(this.beatStep >> 3) % notes.length] ?? 110;
        this.tone(n, 0.25, 'sawtooth', 0.16, n * 0.85);
      }
    }, 250); // 120 BPM sixteenth notes
  }

  stopCombatBeat(): void {
    if (this.musicInterval !== null) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  dispose(): void {
    this.stopCombatBeat();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}
