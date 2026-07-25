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

  // ═══════════════════════════════════════════
  // ★ 修复 2: 音频自动播放策略解锁
  //
  //   浏览器要求: 任何 Audio.play() 必须在"用户手势"中或之后执行。
  //   解决方案:
  //     1. 监听首次 click / touchstart / keydown
  //     2. 调用 audioManager.unlock() 解锁 HTMLAudioElement + AudioContext
  //     3. 解锁前的声音自动排队，解锁后一次性放出
  //     4. 使用 { once: true } 确保事件监听器只触发一次 → 自动销毁
  // ═══════════════════════════════════════════
  const unlockOnInteraction = () => {
    audioManager.unlock();
  };
  // ★ 使用 { once: true } 替代手动 removeEventListener，更干净
  document.addEventListener('click',      unlockOnInteraction, { once: true });
  document.addEventListener('touchstart', unlockOnInteraction, { once: true });
  document.addEventListener('keydown',    unlockOnInteraction, { once: true });

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
