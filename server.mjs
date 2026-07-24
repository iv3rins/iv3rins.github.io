/**
 * server.mjs — PokeWar 权威服务器
 * 启动: node server.mjs
 * 监听 ws://0.0.0.0:8080
 *
 * 架构：服务器承载 GameEngine，客户端退化为纯渲染视图。
 * 所有 game logic 在服务器执行 → 广播脱敏状态给每个客户端。
 */
import { WebSocketServer } from 'ws';
import { GameEngine } from './js/engine/GameEngine.js';

const PORT = process.env.PORT || 8080;
const HEARTBEAT_INTERVAL = 15000;
const DISCONNECT_GRACE = 30000; // 30s 断线容忍

// ─── 房间管理 ───

/** @type {Map<string, Room>} */
const rooms = new Map();

class Room {
    constructor(code, hostWs) {
        this.code = code;
        this.hostWs = hostWs;
        /** @type {Map<WebSocket, {id:number, name:string, avatar:string, ready:boolean}>} */
        this.players = new Map();
        this.engine = null;
        this.engineToWs = {};    // enginePlayerId → ws
        this.wsToEngine = {};    // ws → enginePlayerId
        this.nextPlayerId = 0;
        this.gameStarted = false;
    }

    addPlayer(ws, name, avatar) {
        const id = this.nextPlayerId++;
        this.players.set(ws, { id, name, avatar, ready: false });
        this.wsToEngine[this._wsKey(ws)] = id;
        console.log(`[Room ${this.code}] 玩家加入 — id:${id} name:${name}`);
        return id;
    }

    removePlayer(ws) {
        const info = this.players.get(ws);
        if (!info) return null;
        this.players.delete(ws);
        delete this.wsToEngine[this._wsKey(ws)];
        if (this.engine) {
            const eid = this._findEngineId(info.id);
            if (eid !== undefined && this.engineToWs[eid] === ws) {
                delete this.engineToWs[eid];
            }
        }
        console.log(`[Room ${this.code}] 玩家离开 — id:${info.id} name:${info.name}`);
        return info;
    }

    /** 房主开始游戏 */
    startGame(maxLives = 3) {
        const count = this.players.size;
        if (count < 2) return { ok: false, error: '至少需要 2 名玩家' };

        this.engine = new GameEngine(count, maxLives);
        this.gameStarted = true;

        // 建立 engine id → ws 映射 (按加入顺序)
        const entries = [...this.players.entries()];
        entries.forEach(([ws, info], engineIdx) => {
            this.engineToWs[engineIdx] = ws;
            this.engine.players[engineIdx].name = info.name;
        });

        // ★ 统一渲染出口：任何状态变更 → 广播
        this.engine.onStateChange = () => this.broadcastState();

        console.log(`[Room ${this.code}] 游戏开始 — ${count} 人, maxLives:${maxLives}`);
        return { ok: true, count };
    }

    /** 向每个客户端发送个人专属脱敏状态 */
    broadcastState() {
        if (!this.engine) return;
        for (const [ws, info] of this.players) {
            const eid = this._findEngineId(info.id);
            if (eid === undefined) continue;
            const masked = this.engine.getMaskedState(eid);
            // 附加 playerAvatars 等全局信息
            masked.playerAvatars = {};
            for (const [w, inf] of this.players) {
                masked.playerAvatars[inf.id] = inf.avatar;
            }
            this._send(ws, { type: 'SYNC_STATE', payload: masked });
        }
    }

    /** 广播消息给所有玩家 */
    broadcastToAll(msg) {
        for (const ws of this.players.keys()) {
            this._send(ws, msg);
        }
    }

    /** 获取某个 ws 对应的 engine 玩家 id */
    _findEngineId(playerId) {
        const eid = Object.keys(this.engineToWs).find(
            k => this.engineToWs[k] === this._wsByPlayerId(playerId)
        );
        return eid !== undefined ? parseInt(eid) : undefined;
    }

    _wsByPlayerId(playerId) {
        for (const [ws, info] of this.players) {
            if (info.id === playerId) return ws;
        }
        return null;
    }

    _wsKey(ws) { return ws._socket?.remotePort + '_' + Date.now(); }

    _send(ws, msg) {
        if (ws.readyState === 1) { // WebSocket.OPEN
            ws.send(JSON.stringify(msg));
        }
    }
}

// ─── 工具函数 ───

function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function playerInfo(room, ws) {
    return room.players.get(ws) || null;
}

// ─── WebSocket 服务器 ───

const wss = new WebSocketServer({ port: PORT });
console.log(`🐾 PokeWar 权威服务器已启动 — ws://0.0.0.0:${PORT}`);

wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[WS] 新连接 — ${clientIp}`);

    let currentRoom = null;
    let heartbeatTimer = null;

    // ★ 心跳检测
    const resetHeartbeat = () => {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        heartbeatTimer = setTimeout(() => {
            console.log(`[WS] 心跳超时 — ${clientIp}`);
            ws.terminate();
        }, HEARTBEAT_INTERVAL + 5000);
    };
    resetHeartbeat();

    ws.on('message', (raw) => {
        resetHeartbeat();
        let msg;
        try { msg = JSON.parse(raw.toString()); }
        catch (e) { ws.send(JSON.stringify({ type: 'ERROR', payload: { message: '无效的 JSON' } })); return; }

        switch (msg.type) {

            // ── 创建房间 ──
            case 'create_room': {
                let code = generateRoomCode();
                while (rooms.has(code)) code = generateRoomCode();
                const room = new Room(code, ws);
                rooms.set(code, room);
                currentRoom = room;
                const pid = room.addPlayer(ws, msg.payload.playerName || '房主', msg.payload.avatar || '🐱');
                ws.send(JSON.stringify({
                    type: 'room_created',
                    payload: { roomCode: code, myPlayerId: pid, isHost: true }
                }));
                console.log(`[Room ${code}] 创建成功 — 房主:${pid}`);
                break;
            }

            // ── 加入房间 ──
            case 'join_room': {
                const code = msg.payload.roomCode;
                const room = rooms.get(code);
                if (!room) {
                    ws.send(JSON.stringify({ type: 'ERROR', payload: { message: '房间不存在' } }));
                    break;
                }
                if (room.gameStarted) {
                    ws.send(JSON.stringify({ type: 'ERROR', payload: { message: '游戏已开始，无法加入' } }));
                    break;
                }
                if (room.players.size >= 12) {
                    ws.send(JSON.stringify({ type: 'ERROR', payload: { message: '房间已满 (最多12人)' } }));
                    break;
                }
                currentRoom = room;
                const pid = room.addPlayer(ws, msg.payload.playerName || '小猫猫', msg.payload.avatar || '🐱');
                ws.send(JSON.stringify({
                    type: 'room_joined',
                    payload: { roomCode: code, myPlayerId: pid, isHost: false }
                }));
                // 广播房间更新给所有人
                room.broadcastToAll({ type: 'ROOM_UPDATE', payload: getRoomState(room) });
                room.broadcastToAll({ type: 'CHAT', payload: { senderId: 'system', senderName: '系统', text: `${msg.payload.playerName} 加入了房间！` } });
                break;
            }

            // ── 切换准备 ──
            case 'toggle_ready': {
                if (!currentRoom) break;
                const pi = playerInfo(currentRoom, ws);
                if (!pi) break;
                pi.ready = !pi.ready;
                currentRoom.broadcastToAll({ type: 'ROOM_UPDATE', payload: getRoomState(currentRoom) });
                break;
            }

            // ── 开始游戏 ──
            case 'start_game': {
                if (!currentRoom) break;
                if (currentRoom.hostWs !== ws) {
                    ws.send(JSON.stringify({ type: 'ERROR', payload: { message: '只有房主可以开始游戏' } }));
                    break;
                }
                const maxLives = msg.payload.maxLives || 3;
                const result = currentRoom.startGame(maxLives);
                if (!result.ok) {
                    ws.send(JSON.stringify({ type: 'ERROR', payload: { message: result.error } }));
                    break;
                }
                // 通知所有客户端游戏开始 (含各自的 enginePlayerId)
                for (const [w, info] of currentRoom.players) {
                    const eid = currentRoom._findEngineId(info.id);
                    currentRoom._send(w, {
                        type: 'GAME_START',
                        payload: { enginePlayerId: eid, playerNames: currentRoom.engine.players.map(p => p.name) }
                    });
                }
                // 广播初始状态
                currentRoom.broadcastState();
                break;
            }

            // ── 玩家动作 (出牌/选将/Joker救援) ──
            case 'player_action': {
                if (!currentRoom || !currentRoom.engine) break;
                const pi = playerInfo(currentRoom, ws);
                if (!pi) break;
                const eid = currentRoom._findEngineId(pi.id);
                if (eid === undefined) break;
                try {
                    processPlayerAction(currentRoom, eid, msg.payload);
                } catch (err) {
                    currentRoom._send(ws, { type: 'ERROR', payload: { message: err.message } });
                }
                break;
            }

            // ── 聊天 ──
            case 'chat': {
                if (!currentRoom) break;
                const pi = playerInfo(currentRoom, ws);
                if (!pi) break;
                const chatMsg = {
                    type: 'CHAT',
                    payload: {
                        senderId: pi.id,
                        senderName: pi.name,
                        text: msg.payload.text
                    }
                };
                currentRoom.broadcastToAll(chatMsg);
                break;
            }

            // ── PING 心跳 ──
            case 'PING':
                ws.send(JSON.stringify({ type: 'PONG' }));
                break;

            default:
                console.warn(`[WS] 未知消息类型: ${msg.type}`);
        }
    });

    ws.on('close', () => {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        if (!currentRoom) return;
        const pi = currentRoom.removePlayer(ws);
        if (pi) {
            currentRoom.broadcastToAll({ type: 'ROOM_UPDATE', payload: getRoomState(currentRoom) });
            currentRoom.broadcastToAll({ type: 'CHAT', payload: { senderId: 'system', senderName: '系统', text: `${pi.name} 离开了房间` } });

            // 游戏中断线：启动 30s 重连计时器
            if (currentRoom.gameStarted && currentRoom.engine) {
                const eid = currentRoom._findEngineId(pi.id);
                if (eid !== undefined) {
                    currentRoom.engine.startDisconnectTimer(eid);
                    currentRoom.broadcastState();
                }
            }

            // 空房间清理
            if (currentRoom.players.size === 0) {
                rooms.delete(currentRoom.code);
                console.log(`[Room ${currentRoom.code}] 房间销毁 (无玩家)`);
            }
        }
    });

    ws.on('error', (err) => {
        console.error(`[WS] 连接错误 — ${clientIp}:`, err.message);
    });
});

// ─── 状态序列化 ───

function getRoomState(room) {
    const players = {};
    for (const [ws, info] of room.players) {
        players[info.id] = {
            id: info.id,
            name: info.name,
            avatar: info.avatar,
            ready: info.ready,
            isHost: ws === room.hostWs,
        };
    }
    return {
        roomCode: room.code,
        players,
        gameStarted: room.gameStarted,
    };
}

// ─── 玩家动作处理 (服务器端 processPlayCard) ───

function processPlayerAction(room, attackerEid, payload) {
    const engine = room.engine;
    if (!engine) throw new Error('游戏未开始');

    switch (payload.action) {

        case 'SELECT_STARTER': {
            const result = engine.selectStarter(attackerEid, payload.charIndex);
            if (!result.ok) throw new Error(result.error);
            room.broadcastState();
            // 聊天播报
            const player = engine.players[attackerEid];
            room.broadcastToAll({
                type: 'CHAT',
                payload: { senderId: 'system', senderName: '⚔️ 战斗', text: `${player.name} 已选择首发角色` }
            });
            break;
        }

        case 'PLAY_CARD': {
            if (engine.phase !== 'PLAYING') throw new Error('当前阶段不能出牌');

            const attacker = engine.players[attackerEid];
            if (!attacker) throw new Error('无效攻击者');

            const sorted = [...payload.cardIndices].sort((a, b) => b - a);
            const cards = sorted.map(i => attacker.hand[i]).filter(Boolean);
            if (cards.length !== payload.cardIndices.length) throw new Error('手牌索引无效');

            const isPureJoker = cards.every(c => c.isJoker);
            if (!isPureJoker && engine.currentPlayerIndex !== attackerEid) {
                throw new Error('不是你的回合');
            }

            const nonJokers = cards.filter(c => !c.isJoker);
            const hasA = cards.some(c => c.rank === 'A' && !c.isJoker);
            const declaredSuit = payload.declaredSuit || null;
            const aValue = hasA ? (payload.aValue || 1) : null;
            const isClub = (nonJokers.length > 0 && nonJokers.every(c => c.suit === '♣') && !hasA)
                || (hasA && declaredSuit === '♣');

            const atkName = attacker.name || '玩家' + attacker.id;

            if (cards.some(c => c.isJoker)) {
                const target = engine.players[payload.targetPlayerId];
                if (!target) throw new Error('Joker 需要指定目标');
                const jokerCard = cards[0];
                engine.playJoker(attacker, target, target.activeCharIndex, cards);
                room.broadcastToAll({
                    type: 'CHAT', payload: { senderId: 'system', senderName: '⚔️ 战斗', text: `${atkName} 使用了 Joker！` }
                });
                // 全屏播报
                room.broadcastToAll({
                    type: 'BROADCAST',
                    payload: { attackerName: atkName, targetName: target.name, suit: jokerCard.suit || '🃏', rank: jokerCard.rank || '', actionType: 'joker' }
                });
            } else if (isClub) {
                const mainCard = nonJokers[0];
                engine.playShield(attacker, cards, declaredSuit, aValue);
                room.broadcastToAll({
                    type: 'CHAT', payload: { senderId: 'system', senderName: '⚔️ 战斗', text: `${atkName} 获得了护盾！🛡️` }
                });
                room.broadcastToAll({
                    type: 'BROADCAST', payload: { attackerName: atkName, targetName: atkName, suit: mainCard.suit, rank: mainCard.rank, actionType: 'shield' }
                });
            } else {
                const target = engine.players[payload.targetPlayerId];
                if (!target) throw new Error('无效目标');
                const mainCard = nonJokers[0];
                engine.playAttack(attacker, target, cards, declaredSuit, aValue, hasA);
                room.broadcastToAll({
                    type: 'CHAT', payload: { senderId: 'system', senderName: '⚔️ 战斗', text: `${atkName} 攻击了 ${target.name}！` }
                });
                room.broadcastToAll({
                    type: 'BROADCAST', payload: { attackerName: atkName, targetName: target.name, suit: mainCard.suit, rank: mainCard.rank, actionType: 'attack' }
                });
            }

            // 濒死救援倒计时
            if (engine.phase === 'WAITING_FOR_JOKER') {
                const dyingPlayer = engine.players[engine.dyingInfo.playerId];
                room.broadcastToAll({
                    type: 'CHAT', payload: { senderId: 'system', senderName: '⚔️ 战斗', text: `⚠️ ${dyingPlayer.name} 濒死！等待 Joker 救援...` }
                });
                room.broadcastState();
                // 10 秒后自动死亡
                setTimeout(() => {
                    if (engine.phase === 'WAITING_FOR_JOKER') {
                        const result = engine.resolveDying();
                        if (result.ok) {
                            room.broadcastToAll({
                                type: 'CHAT', payload: { senderId: 'system', senderName: '⚔️ 战斗', text: `💀 无人救援，${dyingPlayer.name} 的角色阵亡...` }
                            });
                            if (!engine.isGameOver) engine.nextTurn();
                            room.broadcastState();
                            if (engine.isGameOver) {
                                room.broadcastToAll({ type: 'GAME_OVER', payload: getGameOverPayload(engine) });
                            }
                        }
                    }
                }, 10000);
                return;
            }

            if (!engine.isGameOver) engine.nextTurn();
            room.broadcastState();
            if (engine.isGameOver) {
                room.broadcastToAll({ type: 'GAME_OVER', payload: getGameOverPayload(engine) });
            }
            break;
        }

        case 'JOKER_RESCUE': {
            const result = engine.rescueWithJoker(attackerEid, payload.jokerCardIdx);
            if (!result.ok) throw new Error(result.error);
            room.broadcastToAll({
                type: 'CHAT', payload: { senderId: 'system', senderName: '⚔️ 战斗', text: `${result.rescuerName} 用 Joker 救回了 ${result.rescuedName}！💊` }
            });
            room.broadcastState();
            break;
        }

        default:
            throw new Error(`未知动作: ${payload.action}`);
    }
}

function getGameOverPayload(engine) {
    return {
        winner: engine.winner ? engine.winner.name : '平局',
        rounds: engine.turnCount,
        survivors: engine.players.filter(p => !p.isEliminated).length,
    };
}

// ─── 优雅退出 ───
process.on('SIGINT', () => {
    console.log('\n🐾 服务器关闭中...');
    wss.close(() => process.exit(0));
});
