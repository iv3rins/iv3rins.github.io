/**
 * AudioManager — 音效管理器
 * 用法: AudioManager.play('attack')  // 'attack'|'heal'|'shield'|'draw'|'error'|'click'
 * 使用 Google 开源占位音频，cloneNode 支持连续快速播放
 */

const URLS = {
    draw:   'https://actions.google.com/sounds/v1/weapons/fast_knife_swoosh.ogg',
    attack: 'https://actions.google.com/sounds/v1/impacts/crash.ogg',
    heal:   'https://actions.google.com/sounds/v1/cartoon/magic_chime.ogg',
    error:  'https://actions.google.com/sounds/v1/alarms/beep_short.ogg',
};

const _cache = {};

function _getAudio(name) {
    if (!_cache[name]) {
        const url = URLS[name];
        if (!url) return null;
        _cache[name] = new Audio(url);
        _cache[name].volume = 0.4;
    }
    // cloneNode 支持短时间内连续播放（如连续摸 5 张牌）
    const clone = _cache[name].cloneNode(true);
    clone.volume = _cache[name].volume;
    return clone;
}

export const AudioManager = {
    play(name) {
        try {
            const audio = _getAudio(name);
            if (audio) {
                audio.play().catch(() => {}); // 静默降级（浏览器自动播放策略）
            }
        } catch (e) { /* 静默降级 */ }
    }
};
