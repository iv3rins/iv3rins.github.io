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
import { renderState, setProcessPlayCard, injectBroadcastSyncState } from './ui/gameUI.js';
import { GameEngine } from './engine/GameEngine.js';
import { Toast } from './ui/toast.js';

// ═══ 房主消息处理 ═══

export function handleHostMessage(data, senderId) {
    switch (data.type) {
        case 'JOIN_REQ': {
            let idx = G.peerToPlayer[senderId];
            // ★ 修复竞态：如果 onPlayerJoin 还没触发，手动创建映射
            if (idx === undefined) {
                const used = Object.values(G.peerToPlayer);
                idx = 1;
                while (used.includes(idx)) idx++;
                if (idx >= G.maxPlayers) { console.warn('[P2P] 房间已满，拒绝加入'); return; }
                G.peerToPlayer[senderId] = idx;
                G.playerToPeer[idx] = senderId;
                console.log('%c[P2P] JOIN_REQ 比 open 先到，自动分配槽位:', 'color:#f39c12', idx);
            }
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
        // ★ Bug4: 选将
        case 'SELECT_STARTER': {
            if (!G.gameEngine) break;
            const lobbyIdx = G.peerToPlayer[senderId];
            if (lobbyIdx === undefined) break;
            const engineIdx = Object.keys(G.engineToLobby).find(k => G.engineToLobby[k] === lobbyIdx);
            if (engineIdx === undefined) break;
            const result = G.gameEngine.selectStarter(parseInt(engineIdx), data.payload.charIndex);
            if (!result.ok) {
                G.p2p.sendTo(senderId, { type: 'ERROR', payload: { message: result.error } });
            } else {
                broadcastSyncState();
            }
            break;
        }
        // ★ Bug3: Joker 救援
        case 'JOKER_RESCUE': {
            if (!G.gameEngine) break;
            const lobbyIdx = G.peerToPlayer[senderId];
            if (lobbyIdx === undefined) break;
            const engineIdx = Object.keys(G.engineToLobby).find(k => G.engineToLobby[k] === lobbyIdx);
            if (engineIdx === undefined) break;
            const result = G.gameEngine.rescueWithJoker(parseInt(engineIdx), data.payload.jokerCardIdx);
            if (!result.ok) {
                G.p2p.sendTo(senderId, { type: 'ERROR', payload: { message: result.error } });
            } else {
                broadcastGameChat(result.rescuerName + ' 用 Joker 救回了 ' + result.rescuedName + '！💊');
                broadcastSyncState();
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
        case 'PING': break; // ★ 心跳保活，忽略
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
    // 1. 广播给所有客户端
    Object.entries(G.playerToPeer).forEach(([lobbyIdxStr, peerId]) => {
        const lobbyIdx = parseInt(lobbyIdxStr);
        if (lobbyIdx === 0) return;
        const engineIdx = Object.keys(G.engineToLobby).find(k => G.engineToLobby[k] === lobbyIdx);
        if (engineIdx !== undefined) {
            G.p2p.sendTo(peerId, { type: 'SYNC_STATE', payload: serializeState(G.gameEngine, parseInt(engineIdx)) });
        }
    });
    // 2. ★ 房主本地状态始终刷新
    G.currentState = serializeState(G.gameEngine, 0);
    console.log('[broadcastSyncState] phase:', G.currentState.phase, 'hand:', G.currentState.players[0]?.hand?.length, 'starterSelected:', G.currentState.players[0]?.starterSelected);
    renderState(G.currentState);
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
                hp: c.hp, shield: c.shield, isDead: c.isDead, isDying: c.isDying,
                lives: c.lives, maxLives: c.maxLives,
            })),
            activeCharIndex: p.activeCharIndex,
            starterSelected: p.starterSelected,
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
        lastAction: engine.lastAction || null,
        // ★ Bug3+4: 阶段信息
        phase: engine.phase,
        dyingInfo: engine.dyingInfo,
    };
}

// ★ 广播战斗日志：本地渲染 + 发送给所有客户端
function broadcastGameChat(text) {
    addGameChat('system', text);
    // 广播给所有客户端
    const msg = { type: 'CHAT', payload: { senderId: 'system', senderName: '⚔️ 战斗', text } };
    Object.entries(G.playerToPeer).forEach(([lobbyIdxStr, peerId]) => {
        if (parseInt(lobbyIdxStr) === 0) return;
        G.p2p.sendTo(peerId, msg);
    });
}

// ═══ 出牌结算 ═══

export function processPlayCard(attackerIdx, payload) {
    const engine = G.gameEngine;
    const attacker = engine.players[attackerIdx];
    if (!attacker) throw new Error('无效的攻击者');

    // ★ Bug3/4: 非 PLAYING 阶段禁止普通出牌（Joker 救援除外，走 JOKER_RESCUE）
    if (engine.phase !== 'PLAYING') throw new Error('当前阶段不能出牌');

    const sorted = [...payload.cardIndices].sort((a, b) => b - a);
    const cards = sorted.map(i => attacker.hand[i]).filter(Boolean);
    if (cards.length !== payload.cardIndices.length) throw new Error('手牌索引无效');

    const isPureJoker = cards.length > 0 && cards.every(c => c.isJoker);

    // Joker 允许插队（不在自己回合也能救人），普通出牌必须是自己回合
    if (!isPureJoker && engine.currentPlayerIndex !== attackerIdx) {
        throw new Error('不是你的回合');
    }

    const nonJokers = cards.filter(c => !c.isJoker);
    const hasA = cards.some(c => c.rank === 'A' && !c.isJoker);
    // ★ 浸染机制：declaredSuit + aValue 由前端弹窗传入
    const declaredSuit = payload.declaredSuit || payload.aSuit || null;
    const aValue = hasA ? (payload.aValue || 1) : null;
    const isPureClubNoA = (nonJokers.length > 0 && nonJokers.every(c => c.suit === '♣') && !hasA);
    const isClub = isPureClubNoA || (hasA && declaredSuit === '♣');

    if (cards.some(c => c.isJoker)) {
        const target = engine.players[payload.targetPlayerId];
        if (!target) throw new Error('Joker 需要指定目标');
        engine.playJoker(attacker, target, target.activeCharIndex, cards);
        broadcastGameChat(attacker.name + ' 使用了 Joker！');
    } else if (isClub) {
        console.log('[processPlayCard] ♣ 护盾路由 — attacker:', attacker.name, 'declaredSuit:', declaredSuit, 'aValue:', aValue, 'cards:', cards.map(c=>c.suit+c.rank));
        engine.playShield(attacker, cards, declaredSuit, aValue);
        broadcastGameChat(attacker.name + ' 获得了护盾！🛡️');
    } else {
        console.log('[processPlayCard] ⚔ 攻击路由 — attacker:', attacker.name, 'target:', engine.players[payload.targetPlayerId]?.name, 'declaredSuit:', declaredSuit, 'aValue:', aValue);
        const target = engine.players[payload.targetPlayerId];
        if (!target) throw new Error('无效的目标');
        engine.playAttack(attacker, target, cards, declaredSuit, aValue);
        broadcastGameChat(attacker.name + ' 攻击了 ' + target.name + '！');
    }

    G.roundCount++;

    // ★ Bug3: 濒死时不推进回合，启动 10 秒救援倒计时
    if (engine.phase === 'WAITING_FOR_JOKER') {
        broadcastGameChat('⚠️ ' + (engine.players[engine.dyingInfo.playerId].name || '玩家') + ' 濒死！等待 Joker 救援...');
        broadcastSyncState();
        // 10 秒后自动死亡
        setTimeout(() => {
            if (G.gameEngine && G.gameEngine.phase === 'WAITING_FOR_JOKER') {
                const result = G.gameEngine.resolveDying();
                if (result.ok) {
                    broadcastGameChat('💀 无人救援，' + (engine.players[result.playerId].name || '玩家') + ' 的角色阵亡了...');
                    if (!G.gameEngine.isGameOver) G.gameEngine.nextTurn();
                    broadcastSyncState();
                    if (G.gameEngine.isGameOver) broadcastGameOver();
                }
            }
        }, 10000);
        return;
    }

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

// ★ 注入：让 gameUI.js 的选将逻辑能调 broadcastSyncState
injectBroadcastSyncState(broadcastSyncState);
