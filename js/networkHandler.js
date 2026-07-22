/**
 * networkHandler — 房主与客户端消息路由
 *
 * Bug Fix:
 *   - CHAT 转发统一在 handleHostMessage 处理（不再由 P2PManager 自动广播）
 *   - 房主收到客户端 CHAT → 本地渲染 → 单次广播给其他客户端（排除发送者）
 */

import { G } from './state.js';
import { addChat, addSystemChat, addGameChat } from './ui/chatUI.js';
import { renderWaitingLobby } from './ui/lobbyUI.js';
import { renderState, setProcessPlayCard } from './ui/gameUI.js';
import { GameEngine } from './engine/GameEngine.js';
import { Toast } from './ui/toast.js';

// ═══ 房主消息处理 ═══

export function handleHostMessage(data, senderId) {
    switch (data.type) {
        case 'JOIN_REQ': {
            const idx = G.peerToPlayer[senderId];
            if (idx !== undefined) {
                let name = data.payload.playerName;
                const avatar = data.payload.avatar || '🐱';
                const existingNames = Object.values(G.playerNames);
                if (existingNames.includes(name)) {
                    let suffix = 2;
                    while (existingNames.includes(name + '(' + suffix + ')')) suffix++;
                    name = name + '(' + suffix + ')';
                }
                G.playerNames[idx] = name;
                G.playerAvatars[idx] = avatar;
                G.playerReady[idx] = false;
                renderWaitingLobby();
                broadcastLobbyState();
                addSystemChat(name + ' 加入了房间！');
            }
            break;
        }
        case 'READY':
        case 'TOGGLE_READY': {
            const idx = G.peerToPlayer[senderId];
            if (idx !== undefined) {
                G.playerReady[idx] = data.type === 'READY' ? data.payload.ready : !G.playerReady[idx];
                renderWaitingLobby();
                broadcastLobbyState();
            }
            break;
        }
        case 'PLAY_CARD': {
            if (!G.gameEngine) break;
            const lobbyIdx = G.peerToPlayer[senderId];
            if (lobbyIdx === undefined) break;
            const engineIdx = Object.keys(G.engineToLobby).find(k => G.engineToLobby[k] === lobbyIdx);
            if (engineIdx === undefined) break;
            try {
                processPlayCard(parseInt(engineIdx), data.payload);
            } catch (err) {
                G.p2p.sendTo(senderId, { type: 'ERROR', payload: { message: err.message } });
            }
            break;
        }
        case 'CHAT': {
            // Bug Fix: 房主本地渲染 + 单次广播给其他客户端（排除发送者）
            addChat(data.payload.senderId, data.payload.senderName, data.payload.text);
            // 广播给所有其他客户端（排除发送者 peerId）
            Object.entries(G.peerToPlayer).forEach(([peerId, lobbyIdx]) => {
                if (peerId !== senderId && G.playerToPeer[lobbyIdx] && lobbyIdx !== 0) {
                    G.p2p.sendTo(peerId, data);
                }
            });
            break;
        }
    }
}

// ═══ 客户端消息处理 ═══

export function handleClientMessage(data, senderId) {
    switch (data.type) {
        case 'LOBBY_STATE': {
            const s = data.payload;
            G.playerNames = s.playerNames;
            G.playerReady = s.playerReady;
            G.playerAvatars = s.playerAvatars || {};
            G.myPlayerId = s.myPlayerId;
            G.roomCode = s.roomCode;
            document.getElementById('display-room-code').textContent = s.roomCode;
            renderWaitingLobby();
            break;
        }
        case 'GAME_START': {
            G.gameStarted = true;
            G.myPlayerId = data.payload.enginePlayerId;
            showPage('game');
            addGameChat('system', '🎮 游戏开始！爪爪对决！🐾');
            break;
        }
        case 'SYNC_STATE': {
            G.currentState = data.payload;
            renderState(data.payload);
            break;
        }
        case 'CHAT': {
            // Bug Fix: 客户端只本地渲染，不做中转
            addChat(data.payload.senderId, data.payload.senderName, data.payload.text);
            break;
        }
        case 'GAME_OVER': {
            showResultPage(data.payload);
            break;
        }
        case 'ERROR': {
            Toast.show('操作失败: ' + data.payload.message, 'error');
            break;
        }
    }
}

// ═══ 辅助函数 ═══

export function showPage(pageId) {
    document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
    const el = document.getElementById('page-' + pageId);
    if (el) el.classList.add('active');
}

export function broadcastLobbyState() {
    if (!G.isHost) return;
    Object.entries(G.playerToPeer).forEach(([idxStr, peerId]) => {
        const idx = parseInt(idxStr);
        if (idx === 0) return;
        G.p2p.sendTo(peerId, {
            type: 'LOBBY_STATE',
            payload: {
                roomCode: G.roomCode,
                playerNames: G.playerNames,
                playerReady: G.playerReady,
                playerAvatars: G.playerAvatars,
                myPlayerId: idx,
            }
        });
    });
}

export function broadcastSyncState() {
    if (!G.gameEngine) return;
    Object.entries(G.playerToPeer).forEach(([lobbyIdxStr, peerId]) => {
        const lobbyIdx = parseInt(lobbyIdxStr);
        if (lobbyIdx === 0) return;
        const engineIdx = Object.keys(G.engineToLobby).find(k => G.engineToLobby[k] === lobbyIdx);
        G.p2p.sendTo(peerId, { type: 'SYNC_STATE', payload: serializeState(G.gameEngine, parseInt(engineIdx)) });
    });
    const hostState = serializeState(G.gameEngine, 0);
    G.currentState = hostState;
    renderState(hostState);
}

export function broadcastGameOver() {
    const engine = G.gameEngine;
    const winner = engine.winner;
    const payload = {
        winner: winner ? winner.name : '平局',
        rounds: G.roundCount,
        survivors: engine.players.filter(p => !p.isEliminated).length,
    };
    G.p2p.sendMessage({ type: 'GAME_OVER', payload });
    showResultPage(payload);
}

export function serializeState(engine, forEngineId) {
    return {
        players: engine.players.map((p, i) => ({
            id: p.id,
            name: p.name || ('玩家' + (p.id + 1)),
            characters: p.characters.map(c => ({
                rank: c.rank, suit: c.suit, maxHp: c.maxHp,
                hp: c.hp, shield: c.shield, isDead: c.isDead,
            })),
            activeCharIndex: p.activeCharIndex,
            handCount: p.hand.length,
            isEliminated: p.isEliminated,
            hand: (i === forEngineId) ? p.hand.map(c => ({
                suit: c.suit, rank: c.rank, isJoker: c.isJoker, value: c.value,
            })) : null,
        })),
        currentPlayerIndex: engine.currentPlayerIndex,
        deckCount: engine.deck.length,
        isGameOver: engine.isGameOver,
        winner: engine.winner ? { id: engine.winner.id, name: engine.winner.name } : null,
        myPlayerId: forEngineId,
        roundCount: G.roundCount,
        playerAvatars: G.playerAvatars,
    };
}

// ═══ 出牌结算 ═══

export function processPlayCard(attackerIdx, payload) {
    const engine = G.gameEngine;
    const attacker = engine.players[attackerIdx];
    if (!attacker) throw new Error('无效的攻击者');
    if (engine.currentPlayerIndex !== attackerIdx) throw new Error('不是你的回合');

    const sorted = [...payload.cardIndices].sort((a, b) => b - a);
    const cards = sorted.map(i => attacker.hand[i]).filter(Boolean);
    if (cards.length !== payload.cardIndices.length) throw new Error('手牌索引无效');

    const nonJokers = cards.filter(c => !c.isJoker);
    const isClub = nonJokers.length > 0 && nonJokers.every(c => c.suit === '♣');

    if (cards.some(c => c.isJoker)) {
        const target = engine.players[payload.targetPlayerId];
        if (!target) throw new Error('Joker 需要指定目标');
        engine.playJoker(attacker, target, target.activeCharIndex, cards);
        addGameChat('system', attacker.name + ' 使用了 Joker！');
    } else if (isClub) {
        engine.playShield(attacker, cards, payload.aSuit || null);
        addGameChat('system', attacker.name + ' 获得了护盾！🛡️');
    } else {
        const target = engine.players[payload.targetPlayerId];
        if (!target) throw new Error('无效的目标');
        engine.playAttack(attacker, target, cards, payload.aSuit || null);
        addGameChat('system', attacker.name + ' 攻击了 ' + target.name + '！');
    }

    G.roundCount++;
    if (!engine.isGameOver) engine.nextTurn();
    broadcastSyncState();
    if (engine.isGameOver) broadcastGameOver();
}

export function showResultPage(payload) {
    showPage('result');
    document.getElementById('stat-winner').textContent = payload.winner;
    document.getElementById('stat-rounds').textContent = payload.rounds + ' 回合';
    document.getElementById('stat-survivors').textContent = payload.survivors + ' 人';
}
