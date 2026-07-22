/**
 * AudioManager — 音效管理器
 *
 * 用法: AudioManager.play('attack')  // 'attack'|'heal'|'shield'|'draw'|'error'|'click'
 *
 * 音效文件：请在 /assets/audio/ 下放置对应 .mp3 文件，
 * 或替换为免费 CDN 链接。当前使用 Web Audio API 生成简单合成音效作为 fallback。
 */
export const AudioManager = {
    _ctx: null,
    _cache: {},

    _ensureCtx() {
        if (!this._ctx) {
            this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this._ctx;
    },

    _beep(freq, duration, type = 'sine', vol = 0.15) {
        try {
            const ctx = this._ensureCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(vol, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        } catch (e) { /* 静默降级 */ }
    },

    play(name) {
        switch (name) {
            case 'attack':
                this._beep(220, 0.12, 'sawtooth', 0.12);
                setTimeout(() => this._beep(160, 0.15, 'sawtooth', 0.1), 80);
                break;
            case 'heal':
                this._beep(523, 0.15, 'sine', 0.1);
                setTimeout(() => this._beep(659, 0.15, 'sine', 0.1), 100);
                setTimeout(() => this._beep(784, 0.2, 'sine', 0.1), 200);
                break;
            case 'shield':
                this._beep(440, 0.12, 'triangle', 0.1);
                setTimeout(() => this._beep(660, 0.15, 'triangle', 0.1), 80);
                break;
            case 'draw':
                this._beep(880, 0.08, 'sine', 0.08);
                break;
            case 'error':
                this._beep(180, 0.2, 'square', 0.08);
                setTimeout(() => this._beep(140, 0.25, 'square', 0.08), 120);
                break;
            case 'click':
                this._beep(1200, 0.05, 'sine', 0.05);
                break;
            default:
                this._beep(800, 0.08, 'sine', 0.06);
        }
    }
};
