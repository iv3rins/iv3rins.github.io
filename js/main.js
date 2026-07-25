/**
 * main.js — 《扑克战争》客户端入口
 *
 * 架构：MVC 严格分离
 *   Model:  game.js (boardgame.io 状态机)
 *   Controller: js/app.js (客户端连接 + 动作发送)
 *   View:   js/ui/UIManager.js + js/ui/gameUI.js
 *
 * 启动后：初始化 UI → 等待用户操作 → app.js 连接服务器
 */
import { app } from './app.js';
import { initUI } from './ui/UIManager.js';
import { audioManager } from './audioManager.js';

// ═══════════════════════════════════════
// 启动
// ═══════════════════════════════════════

function boot() {
  console.log('🐾 扑克战争 (PokeWar) v3.0 — boardgame.io 架构');
  console.log('[Main] 初始化 UI...');

  // 初次用户交互解锁音频
  const unlockAudio = () => {
    const s = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    s.volume = 0;
    s.play().then(() => s.remove()).catch(() => {});
    document.removeEventListener('click', unlockAudio);
    document.removeEventListener('keydown', unlockAudio);
  };
  document.addEventListener('click', unlockAudio, { once: true });
  document.addEventListener('keydown', unlockAudio, { once: true });

  // 初始化 UI
  try {
    initUI();
  } catch (e) {
    console.error('[Main] UI 初始化失败:', e);
  }

  console.log('[Main] 启动完成 ✓');
}

// DOM 就绪后启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
