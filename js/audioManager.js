/**
 * AudioManager — 音效管理器
 * 轻柔 UI 音效，cloneNode 支持连续快速播放
 */
const URLS = {
    draw: 'https://actions.google.com/sounds/v1/water/wood_block_drop.ogg',
    attack: 'https://actions.google.com/sounds/v1/foley/whoosh_heavy.ogg',
    heal: 'https://actions.google.com/sounds/v1/bells/toll_cluster.ogg',
    error: 'https://actions.google.com/sounds/v1/ui/navigation_cancel.ogg',
};

const _cache = {};

function _getAudio(name) {
    if (!_cache[name]) {
        const url = URLS[name];
        if (!url) return null;
        _cache[name] = new Audio(url);
        _cache[name].volume = 0.35;
    }
    const clone = _cache[name].cloneNode(true);
    clone.volume = _cache[name].volume;
    return clone;
}

export const AudioManager = {
    play(name) {
        try {
            const audio = _getAudio(name);
            if (audio) audio.play().catch(() => {});
        } catch (e) { /* silent */ }
    }
};
