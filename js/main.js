/**
 * main.js — PokeWar V4 客户端入口
 */
import { app } from './app.js';
import { initLobby } from './ui/lobbyUI.js';
import { initUI } from './ui/UIManager.js';
import { audioManager } from './audioManager.js';
import { initTheme } from './state.js';

function boot() {
  console.log('🐾 PokeWar V4 — Bento Grid + SQLite');

  // 音频解锁
  const unlock = () => { audioManager.unlock(); };
  document.addEventListener('click', unlock, { once: true });
  document.addEventListener('touchstart', unlock, { once: true });

  // 初始化大厅
  try { initLobby(); } catch (e) { console.error('[Main] Lobby init:', e); }

  // 初始化游戏 UI
  try { initUI(); } catch (e) { console.error('[Main] Game UI init:', e); }

  // 恢复主题 — 统一通过 initTheme()
  initTheme();

  console.log('[Main] V4 启动完成 ✓');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
