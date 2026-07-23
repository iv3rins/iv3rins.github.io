/**
 * 全局状态管理 — 单例 G 对象
 */

export const G = {
    p2p: null,
    isHost: false,
    playerName: '',
    roomCode: '',
    myPlayerId: -1,
    gameEngine: null,          // 仅房主
    peerToPlayer: {},          // peerId → playerIndex (房主)
    playerToPeer: {},          // playerIndex → peerId (房主)
    engineToLobby: {},         // engineIndex → lobbyIndex (房主)
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
    playerAvatars: {},           // playerIndex → emoji（由房主维护，LOBBY_STATE/SYNC_STATE 广播）
    gameStarted: false,
    _pendingClear: false,
    firstPlayDone: false,  // ★ 新手指引开关
};
