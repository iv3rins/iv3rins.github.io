/**
 * PokeWar AudioManager — Web Audio API 合成音效
 * 无网络依赖，全程本地合成；首次用户交互后解锁。
 */
type SoundName =
  | 'click' | 'select' | 'attack' | 'shield' | 'heal'
  | 'draw' | 'joker' | 'error' | 'starter' | 'win' | 'lose'
  | 'ready' | 'reconnect';

class AudioManager {
  #ctx: AudioContext | null = null;
  #unlocked = false;
  #queue: SoundName[] = [];
  readonly #maxQueue = 20;

  unlock(): void {
    if (this.#unlocked) return;
    try {
      this.#ctx = new AudioContext();
      if (this.#ctx.state === 'suspended') {
        void this.#ctx.resume();
      }
    } catch { /* silently fail */ }
    this.#unlocked = true;
    this.#flushQueue();
  }

  play(name: SoundName): void {
    if (!this.#unlocked) {
      if (this.#queue.length < this.#maxQueue) this.#queue.push(name);
      return;
    }
    this.#playNow(name);
  }

  #flushQueue(): void {
    const q = [...this.#queue];
    this.#queue = [];
    for (const name of q) this.#playNow(name);
  }

  #playNow(name: SoundName): void {
    if (!this.#ctx) return;
    if (this.#ctx.state === 'suspended') void this.#ctx.resume();
    try {
      switch (name) {
        case 'click':     this.#tone(800, 0.06, 'sine', 0.10); break;
        case 'select':    this.#tone(600, 0.08, 'sine', 0.09); break;
        case 'draw':      this.#tone(1000, 0.05, 'triangle', 0.07); break;
        case 'ready':     this.#tone(880, 0.10, 'sine', 0.10); break;
        case 'attack':
          this.#noise(0.15, 0.10);
          this.#tone(200, 0.20, 'sawtooth', 0.05);
          break;
        case 'shield':
          this.#tone(1200, 0.06, 'sine', 0.09);
          setTimeout(() => this.#tone(1600, 0.06, 'sine', 0.07), 50);
          break;
        case 'heal':
          this.#tone(523, 0.12, 'sine', 0.09);
          setTimeout(() => this.#tone(659, 0.12, 'sine', 0.07), 100);
          setTimeout(() => this.#tone(784, 0.15, 'sine', 0.05), 200);
          break;
        case 'joker':
          this.#tone(300, 0.10, 'square', 0.05);
          setTimeout(() => this.#tone(600, 0.10, 'square', 0.05), 80);
          setTimeout(() => this.#tone(900, 0.15, 'square', 0.04), 160);
          break;
        case 'starter':
          this.#tone(440, 0.12, 'sine', 0.10);
          setTimeout(() => this.#tone(660, 0.12, 'sine', 0.08), 120);
          break;
        case 'win':
          this.#tone(523, 0.14, 'sine', 0.09);
          setTimeout(() => this.#tone(659, 0.14, 'sine', 0.08), 120);
          setTimeout(() => this.#tone(784, 0.20, 'sine', 0.07), 260);
          break;
        case 'lose':
          this.#tone(400, 0.15, 'sawtooth', 0.07);
          setTimeout(() => this.#tone(300, 0.20, 'sawtooth', 0.06), 150);
          break;
        case 'reconnect':
          this.#tone(660, 0.10, 'sine', 0.09);
          setTimeout(() => this.#tone(880, 0.15, 'sine', 0.07), 100);
          break;
        case 'error':
          this.#tone(200, 0.15, 'sawtooth', 0.07);
          this.#tone(150, 0.20, 'square', 0.04);
          break;
      }
    } catch { /* silently fail */ }
  }

  #tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12): void {
    if (!this.#ctx) return;
    const osc = this.#ctx.createOscillator();
    const gain = this.#ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, this.#ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.#ctx.currentTime + dur);
    osc.connect(gain).connect(this.#ctx.destination);
    osc.start();
    osc.stop(this.#ctx.currentTime + dur);
  }

  #noise(dur: number, vol = 0.08): void {
    if (!this.#ctx) return;
    const size = Math.floor(this.#ctx.sampleRate * dur);
    const buf = this.#ctx.createBuffer(1, size, this.#ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < size; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / size, 2);
    }
    const src = this.#ctx.createBufferSource();
    const gain = this.#ctx.createGain();
    src.buffer = buf;
    gain.gain.setValueAtTime(vol, this.#ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.#ctx.currentTime + dur);
    src.connect(gain).connect(this.#ctx.destination);
    src.start();
  }
}

export const audio = new AudioManager();
