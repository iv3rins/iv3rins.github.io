/**
 * 全局状态管理 — 单例 G 对象 (boardgame.io 权威服务器架构)
 * 注意: 游戏核心状态现在由 boardgame.io Client (app.js) 管理。
 * 此文件仅保留大厅/UI 辅助状态。
 */

/** 统一主题入口 — 所有模块必须通过此函数切换主题 */
export function setTheme(isDark) {
  document.documentElement.classList.toggle('dark-theme', isDark);
  if (isDark) document.body.classList.add('dark-mode');
  else document.body.classList.remove('dark-mode');
  localStorage.setItem('pokeWarDarkMode', isDark ? '1' : '0');
}

/** 初始化主题：从 localStorage 恢复 */
export function initTheme() {
  const isDark = localStorage.getItem('pokeWarDarkMode') === '1';
  setTheme(isDark);
}

export const G = {
    isHost: false,
    playerName: '',
    roomCode: '',
    myPlayerId: -1,
    playerNames: {},           // playerIndex → name
    playerReady: {},           // playerIndex → bool
    currentState: null,
    selectedTargetId: -1,
    selectedCardIndices: [],
    declaredSuit: null,
    aValue: 1,
    timerTimeout: null,
    roundCount: 0,
    maxPlayers: 12,
    avatars: ['🐱', '🐶', '🐰', '🐻', '🦊', '🐼', '🐧', '🦁', '🐸', '🐨', '🐯', '🐷'],
    myAvatar: '🐱',
    playerAvatars: {},         // playerIndex → emoji
    gameStarted: false,
    _pendingClear: false,
};
