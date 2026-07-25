/**
 * AudioManager — 音频管理器 v2.0
 *
 * ★ 修复: Google Actions 音效 URL 已失效 → 改用 Web Audio API 合成
 *         所有音效在浏览器本地生成，无网络依赖，零延迟。
 *
 * 解锁机制:
 *   首次用户交互前所有 play() 排队，unlock() 后一次性刷新。
 *   AudioContext 在 unlock 时创建（利用用户手势激活）。
 *
 * 用法:
 *   audioManager.play('click');
 *   audioManager.unlock();  // 首次交互时调用
 */
class AudioManager {
  constructor() {
    this._unlocked = false;
    this._pendingQueue = [];
    this._maxQueue = 20;
    /** @type {AudioContext|null} */
    this._ctx = null;
  }

  // ═══ 解锁 ═══

  unlock() {
    if (this._unlocked) return;
    console.log('[Audio] 正在解锁...');

    try {
      // ★ 在用户手势中创建 AudioContext（最可靠的解锁方式）
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this._ctx.state === 'suspended') {
        this._ctx.resume().then(() => {
          console.log('[Audio] AudioContext 状态:', this._ctx.state);
        });
      }
    } catch (e) {
      console.warn('[Audio] AudioContext 创建失败:', e.message);
    }

    this._unlocked = true;
    console.log('[Audio] 已解锁, 排队:', this._pendingQueue.length);
    this._flushQueue();
  }

  _flushQueue() {
    const queue = [...this._pendingQueue];
    this._pendingQueue = [];
    for (const name of queue) this._playImmediate(name);
  }

  // ═══ 公开 API ═══

  play(name) {
    if (!this._unlocked) {
      if (this._pendingQueue.length < this._maxQueue) this._pendingQueue.push(name);
      return;
    }
    this._playImmediate(name);
  }

  // ═══ 内部: Web Audio API 合成 ═══

  _playImmediate(name) {
    if (!this._ctx) return;

    // ★ 确保 AudioContext 处于运行状态
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }

    try {
      switch (name) {
        case 'click':   this._synthClick(); break;
        case 'select':  this._synthSelect(); break;
        case 'attack':  this._synthAttack(); break;
        case 'shield':  this._synthShield(); break;
        case 'heal':    this._synthHeal(); break;
        case 'draw':    this._synthDraw(); break;
        case 'joker':   this._synthJoker(); break;
        case 'error':   this._synthError(); break;
        default: break;
      }
    } catch (e) {
      // 静默失败
    }
  }

  // ── 音效合成器 ──

  /** 通用: 播放一段短音 */
  _tone(freq, duration, type = 'sine', volume = 0.15) {
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, this._ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + duration);
    osc.connect(gain).connect(this._ctx.destination);
    osc.start();
    osc.stop(this._ctx.currentTime + duration);
  }

  /** 噪声: 短促冲击 */
  _noise(duration, volume = 0.08) {
    const bufferSize = Math.floor(this._ctx.sampleRate * duration);
    const buffer = this._ctx.createBuffer(1, bufferSize, this._ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const src = this._ctx.createBufferSource();
    const gain = this._ctx.createGain();
    src.buffer = buffer;
    gain.gain.setValueAtTime(volume, this._ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + duration);
    src.connect(gain).connect(this._ctx.destination);
    src.start();
  }

  _synthClick()  { this._tone(800, 0.06, 'sine', 0.12); }
  _synthSelect() { this._tone(600, 0.08, 'sine', 0.1); }
  _synthDraw()   { this._tone(1000, 0.05, 'triangle', 0.08); }

  _synthAttack() {
    this._noise(0.15, 0.12);
    this._tone(200, 0.2, 'sawtooth', 0.06);
  }

  _synthShield() {
    this._tone(1200, 0.06, 'sine', 0.1);
    setTimeout(() => this._tone(1600, 0.06, 'sine', 0.08), 50);
  }

  _synthHeal() {
    this._tone(523, 0.12, 'sine', 0.1);
    setTimeout(() => this._tone(659, 0.12, 'sine', 0.08), 100);
    setTimeout(() => this._tone(784, 0.15, 'sine', 0.06), 200);
  }

  _synthJoker() {
    this._tone(300, 0.1, 'square', 0.06);
    setTimeout(() => this._tone(600, 0.1, 'square', 0.06), 80);
    setTimeout(() => this._tone(900, 0.15, 'square', 0.05), 160);
  }

  _synthError() {
    this._tone(200, 0.15, 'sawtooth', 0.08);
    this._tone(150, 0.2, 'square', 0.05);
  }
}

export const audioManager = new AudioManager();
