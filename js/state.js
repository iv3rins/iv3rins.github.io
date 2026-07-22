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
    timerTimeout: null,
    roundCount: 0,
    maxPlayers: 12,
    avatars: ['🐱', '🐶', '🐰', '🐻', '🦊', '🐼', '🐧', '🦁', '🐸', '🐨', '🐯', '🐷'],
    gameStarted: false,
    _pendingClear: false,
};
