/**
 * main.js — PokeWar V4 客户端入口
 */
import { app } from './app.js';
import { initLobby } from './ui/lobbyUI.js';
import { initUI } from './ui/UIManager.js';
import { audioManager } from './audioManager.js';
import { initTheme } from './state.js';

function boot() {
  console.log('🐾 PokeWar V5 — scene-layer + chat-layer isolation');

  // 音频解锁
  const unlock = () => { audioManager.unlock(); };
  document.addEventListener('click', unlock, { once: true });
  document.addEventListener('touchstart', unlock, { once: true });

  // 初始化大厅
  try { initLobby(); } catch (e) { console.error('[Main] Lobby init:', e); }

  // 初始化游戏 UI
  try { initUI(); } catch (e) { console.error('[Main] Game UI init:', e); }

  // 恢复主题
  initTheme();

  // ★ 单机练习按钮
  initBotPractice();

  console.log('[Main] V5 启动完成 ✓');
}

/** 🤖 单机练习: 本地实例化 boardgame.io client + 3 Bot */
function initBotPractice() {
  const btn = document.getElementById('btn-bot-practice');
  if (!btn) {
    // 动态注入按钮到 lobby-grid
    const grid = document.querySelector('.lobby-grid');
    if (grid) {
      const card = document.createElement('div');
      card.className = 'bento-card';
      card.id = 'card-bot-practice';
      card.innerHTML = `
        <i data-lucide=\"bot\" class=\"bento-icon-lg\"></i>
        <h3>🤖 单机练习</h3>
        <p>本地 1v3 Bot 对战</p>
        <button class=\"btn btn-primary\" id=\"btn-bot-practice\">开始练习</button>
      `;
      grid.appendChild(card);
      lucide.createIcons();
    }
  }
  // 延迟绑定事件
  setTimeout(() => {
    document.getElementById('btn-bot-practice')?.addEventListener('click', async () => {
      audioManager.play('click');
      try {
        await app.createRoom(4); // 4 players: 1 human + 3 bots
        app.connectGame();
        const { showPage } = await import('./ui/UIManager.js');
        showPage('game');
        import('./ui/toast.js').then(m => m.Toast.show('🤖 单机练习模式 (1v3 Bot)', 'success'));
      } catch (e) {
        import('./ui/toast.js').then(m => m.Toast.show('练习模式启动失败: ' + e.message, 'error'));
      }
    });
  }, 500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
