/**
 * 全局状态管理 — 单例 G 对象 (WS 权威服务器架构)
 */
export const G = {
    ws: null,                  // ★ WSClient 实例 (替代 p2p)
    isHost: false,
    playerName: '',
    roomCode: '',
    myPlayerId: -1,
    gameEngine: null,          // ★ 仅服务器端使用
    playerNames: {},           // playerIndex → name
    playerReady: {},           // playerIndex → bool
    currentState: null,
    selectedTargetId: -1,
    selectedCardIndices: [],
    // ★ 万化合体状态（弹窗确认后暂存，出牌时随 payload 发送）
    declaredSuit: null,   // 玩家选定的最终浸染花色
    aValue: 1,            // 玩家给 A 赋予的点数（1~13）
    timerTimeout: null,
    roundCount: 0,
    maxPlayers: 12,
    avatars: ['🐱', '🐶', '🐰', '🐻', '🦊', '🐼', '🐧', '🦁', '🐸', '🐨', '🐯', '🐷'],
    myAvatar: '🐱',              // 玩家自选头像
    playerAvatars: {},           // playerIndex → emoji
    gameStarted: false,
    _pendingClear: false,
};
