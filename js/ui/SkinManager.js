/**
 * SkinManager.js — 皮肤管理器
 * 管理主题切换，通过 CSS 变量驱动全局 UI。
 * 预留未来扩展：cyberpunk, anime, sakura 等皮肤。
 */

const SKINS = {
    'default-apple': {
        'bg-main': '#f4f5f7',
        'bg-panel': 'rgba(255,255,255,0.72)',
        'backdrop-blur': 'blur(24px)',
        'text-primary': '#1d1d1f',
        'text-secondary': '#86868b',
        'border-panel': '1px solid rgba(255,255,255,0.6)',
        'card-width': '100px',
        'card-height': '140px',
        'card-bg': 'rgba(255,255,255,0.75)',
        'card-border': '1px solid rgba(0,0,0,0.08)',
        'card-shadow': '0 8px 32px rgba(0,0,0,0.08)',
        'card-color': '#1d1d1f',
        'card-hover-lift': '-12px',
        'card-selected-lift': '-28px',
        'card-selected-glow': 'rgba(255,204,0,0.6)',
        'color-confirm': '#34c759',
        'color-cancel': '#ff3b30',
        'color-primary': '#007aff',
        'color-hp': '#ff3b30',
        'color-shield': '#007aff',
        'suit-red': '#dc2626',
        'suit-black': '#1d1d1f',
        'bento-radius': '24px',
        'bento-padding': '18px',
        'bento-max-w': '220px',
    },
    'dark': {
        'bg-main': '#1a1a2e',
        'bg-panel': 'rgba(30,30,50,0.82)',
        'backdrop-blur': 'blur(24px)',
        'text-primary': '#eaeaea',
        'text-secondary': '#a0a0b0',
        'border-panel': '1px solid rgba(255,255,255,0.08)',
        'card-width': '100px',
        'card-height': '140px',
        'card-bg': 'rgba(40,40,60,0.85)',
        'card-border': '1px solid rgba(255,255,255,0.06)',
        'card-shadow': '0 8px 32px rgba(0,0,0,0.3)',
        'card-color': '#eaeaea',
        'card-hover-lift': '-12px',
        'card-selected-lift': '-28px',
        'card-selected-glow': 'rgba(255,204,0,0.5)',
        'color-confirm': '#30d158',
        'color-cancel': '#ff453a',
        'color-primary': '#0a84ff',
        'color-hp': '#ff453a',
        'color-shield': '#0a84ff',
        'suit-red': '#ff6b6b',
        'suit-black': '#eaeaea',
        'bento-radius': '24px',
        'bento-padding': '18px',
        'bento-max-w': '220px',
    },
};

class SkinManager {
    constructor() {
        const saved = (typeof localStorage !== 'undefined') ? localStorage.getItem('pokeWarSkin') : null;
        this.currentSkin = saved || 'default-apple';
        this._apply(SKINS[this.currentSkin] || SKINS['default-apple']);
    }

    /** 切换皮肤 */
    setSkin(name) {
        if (!SKINS[name]) { console.warn(`[Skin] 未知皮肤: ${name}`); return; }
        this.currentSkin = name;
        if (typeof localStorage !== 'undefined') localStorage.setItem('pokeWarSkin', name);
        this._apply(SKINS[name]);
    }

    /** 获取当前皮肤名 */
    getSkin() { return this.currentSkin; }

    /** 获取可用皮肤列表 */
    listSkins() { return Object.keys(SKINS); }

    /** 获取当前皮肤配置 (用于 UIManager 引用) */
    getConfig() { return SKINS[this.currentSkin] || SKINS['default-apple']; }

    // ── 内部 ──

    _apply(config) {
        if (typeof document === 'undefined') return; // Node 环境跳过
        const root = document.documentElement;
        for (const [key, value] of Object.entries(config)) {
            root.style.setProperty(`--${key}`, value);
        }
        // data-theme 用于 CSS 选择器回退
        root.setAttribute('data-theme', this.currentSkin === 'dark' ? 'dark' : '');
        console.log(`[Skin] 已应用: ${this.currentSkin}`);
    }
}

// 单例
export const skinManager = new SkinManager();
