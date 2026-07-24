/**
 * server.mjs — PokeWar 权威服务器 v3.0
 * 架构：OOP 分层（Account → Matchmaker → Room → GameEngine）
 * 特性：快速匹配 + AI 机器人补位 + 预留数据库接入
 *
 * 启动: node server.mjs  监听 ws://0.0.0.0:8080
 */
import { WebSocketServer } from 'ws';
import { GameEngine } from './js/engine/GameEngine.js';
import { Card } from './js/engine/Card.js';

const PORT = process.env.PORT || 8080;
const HEARTBEAT_INTERVAL = 15000;
const BOT_THINK_MS = 1500;       // AI 思考延迟（模拟真人）
const MATCHMAKER_TICK_MS = 1000; // 匹配轮询间隔
const MATCHMAKER_TIMEOUT_MS = 10000; // 超时自动补机器人

// ═══════════════════════════════════════════
// 1. 账号服务层（预留 MongoDB/MySQL 接入）
// ═══════════════════════════════════════════

class AccountService {
    /** 预留：验证登录 Token，返回玩家档案 */
    static async authenticate(token) {
        // TODO: 接入 MongoDB/MySQL 后替换为真实查询
        return { uid: 'u_' + Date.now().toString(36), nickname: 'Guest', rating: 1000 };
    }

    /** 预留：更新玩家战绩 */
    static async updateStats(uid, won) {
        // TODO: 写入数据库
    }
}

// ═══════════════════════════════════════════
// 2. 服务器端玩家封装
// ═══════════════════════════════════════════

class ServerPlayer {
    constructor(uid, nickname, avatar, isBot = false) {
        this.uid = uid;
        this.nickname = nickname;
        this.avatar = avatar || '🐱';
        this.isBot = isBot;
        this.ws = null;        // 机器人没有 WebSocket
        this.ready = isBot;    // 机器人默认准备
        this.engineIdx = -1;   // 游戏开始后映射到引擎里的 player index
        this.playerId = -1;    // ★ 房间内数字 ID（兼容前端）
    }

    /** 安全发送 JSON 消息 */
    send(type, payload) {
        if (this.isBot || !this.ws || this.ws.readyState !== 1) return;
        try { this.ws.send(JSON.stringify({ type, payload })); }
        catch (e) { console.error(`[send] ${this.uid}:`, e.message); }
    }
}

// ═══════════════════════════════════════════
// 3. 房间管理器
// ═══════════════════════════════════════════

class Room {
    constructor(roomId, maxPlayers = 4) {
        this.roomId = roomId;
        this.maxPlayers = maxPlayers;
        /** @type {Map<string, ServerPlayer>} uid → ServerPlayer */
        this.players = new Map();
        this.hostUid = null;
        this.state = 'WAITING'; // WAITING | PLAYING | ENDED
        this.engine = null;
        this.uidToEngineIdx = {}; // uid → enginePlayerIndex
        this.engineIdxToUid = {}; // enginePlayerIndex → uid
        this.botTimer = null;
        this.createdAt = Date.now();
    }

    get playerCount() { return this.players.size; }
    get humanCount() { return [...this.players.values()].filter(p => !p.isBot).length; }
    get isFull() { return this.playerCount >= this.maxPlayers; }

    // ── 加入 / 离开 ──

    addPlayer(sp) {
        if (this.isFull) return false;
        if (this.state !== 'WAITING') return false;
        // ★ 自动分配房间内数字 ID
        if (sp.playerId < 0) {
            sp.playerId = this._nextNumericId();
        }
        this.players.set(sp.uid, sp);
        if (!this.hostUid) this.hostUid = sp.uid;
        console.log(`[Room ${this.roomId}] +${sp.nickname} (${sp.isBot?'🤖':'👤'}) pid:${sp.playerId} ${this.playerCount}/${this.maxPlayers}`);
        this.broadcastRoomUpdate();
        return true;
    }

    _nextNumericId() {
        const used = new Set([...this.players.values()].map(p => p.playerId));
        let id = 0;
        while (used.has(id)) id++;
        return id;
    }

    removePlayer(uid) {
        const sp = this.players.get(uid);
        if (!sp) return null;
        this.players.delete(uid);
        delete this.uidToEngineIdx[uid];
        if (this.hostUid === uid) {
            // 转让房主给第一个真人
            const next = [...this.players.values()].find(p => !p.isBot);
            this.hostUid = next ? next.uid : null;
        }
        console.log(`[Room ${this.roomId}] -${sp.nickname}  剩余 ${this.playerCount}`);
        this.broadcastRoomUpdate();
        return sp;
    }

    // ── 机器人补位 ──

    fillWithBots() {
        const needed = this.maxPlayers - this.playerCount;
        if (needed <= 0) return 0;
        let added = 0;
        for (let i = 0; i < needed; i++) {
            const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
            const bot = new ServerPlayer(
                'bot_' + this.roomId + '_' + i,
                botName,
                BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)],
                true
            );
            if (this.addPlayer(bot)) added++;
        }
        if (added > 0) console.log(`[Room ${this.roomId}] 🤖 补入 ${added} 个机器人`);
        return added;
    }

    // ── 游戏流程 ──

    canStart() {
        return this.playerCount >= 2
            && this.state === 'WAITING'
            && [...this.players.values()].every(p => p.ready);
    }

    startGame(maxLives = 3) {
        if (!this.canStart()) return { ok: false, error: '条件不满足' };

        const ordered = [...this.players.values()]; // 保持插入顺序
        this.engine = new GameEngine(ordered.length, maxLives);
        this.state = 'PLAYING';

        ordered.forEach((sp, idx) => {
            sp.engineIdx = idx;
            this.uidToEngineIdx[sp.uid] = idx;
            this.engineIdxToUid[idx] = sp.uid;
            this.engine.players[idx].name = sp.nickname;
        });

        this.engine.onStateChange = () => this.broadcastGameState();

        // 告诉所有真人游戏开始
        for (const sp of this.players.values()) {
            if (sp.isBot) continue;
            sp.send('GAME_START', {
                enginePlayerId: sp.engineIdx,
                playerNames: this.engine.players.map(p => p.name),
            });
        }

        this.broadcastGameState();

        // ★ 如果当前回合是机器人，自动出牌
        this._checkBotTurn();

        console.log(`[Room ${this.roomId}] 🎮 游戏开始 — ${ordered.length}人`);
        return { ok: true, count: ordered.length };
    }

    // ── 广播 ──

    broadcastRoomUpdate() {
        const players = {};
        let idx = 0;
        for (const [uid, sp] of this.players) {
            const pid = sp.playerId ?? idx;  // ★ 兼容前端：数字 ID
            players[pid] = {
                id: pid,
                uid: sp.uid,
                name: sp.nickname,        // ★ 前端用 'name' 字段
                nickname: sp.nickname,
                avatar: sp.avatar,
                isBot: sp.isBot,
                ready: sp.ready,
                isHost: uid === this.hostUid,
            };
            idx++;
        }
        const msg = JSON.stringify({
            type: 'ROOM_UPDATE',
            payload: { roomCode: this.roomId, players, state: this.state }
        });
        for (const sp of this.players.values()) {
            if (!sp.isBot && sp.ws && sp.ws.readyState === 1) {
                try { sp.ws.send(msg); } catch(e) {}
            }
        }
    }

    broadcastGameState() {
        if (!this.engine) return;
        for (const sp of this.players.values()) {
            if (sp.isBot) continue; // 机器人不需要 UI
            const masked = this.engine.getMaskedState(sp.engineIdx);
            masked.playerAvatars = {};
            for (const [uid, p] of this.players) {
                masked.playerAvatars[uid] = p.avatar;
            }
            sp.send('SYNC_STATE', masked);
        }
    }

    broadcastChat(senderName, text) {
        const msg = JSON.stringify({
            type: 'CHAT',
            payload: { senderId: 'system', senderName, text }
        });
        for (const sp of this.players.values()) {
            if (!sp.isBot && sp.ws && sp.ws.readyState === 1) {
                try { sp.ws.send(msg); } catch(e) {}
            }
        }
    }

    broadcastToAll(type, payload) {
        const msg = JSON.stringify({ type, payload });
        for (const sp of this.players.values()) {
            if (!sp.isBot && sp.ws && sp.ws.readyState === 1) {
                try { sp.ws.send(msg); } catch(e) {}
            }
        }
    }

    // ── 获取玩家 ──

    getPlayerByEngineIdx(eid) {
        const uid = this.engineIdxToUid[eid];
        return uid ? this.players.get(uid) : null;
    }

    getHumanPlayers() {
        return [...this.players.values()].filter(p => !p.isBot);
    }

    // ── AI 机器人自动出牌 ──

    _checkBotTurn() {
        if (!this.engine || this.state !== 'PLAYING' || this.engine.isGameOver) return;
        const curEid = this.engine.currentPlayerIndex;
        const sp = this.getPlayerByEngineIdx(curEid);
        if (!sp || !sp.isBot) return;

        // 清除旧定时器，重新排程
        if (this.botTimer) clearTimeout(this.botTimer);
        this.botTimer = setTimeout(() => this._botPlay(curEid), BOT_THINK_MS);
    }

    _botPlay(botEid) {
        if (!this.engine || this.state !== 'PLAYING') return;
        if (this.engine.phase === 'WAITING_FOR_JOKER') {
            // 机器人不救（不持有 Joker 或选择不救）
            return;
        }
        if (this.engine.currentPlayerIndex !== botEid) return;

        const bot = this.engine.players[botEid];
        if (!bot || bot.isEliminated) return;

        try {
            this._botMakeMove(botEid, bot);
        } catch (err) {
            console.error(`[Bot ${botEid}] 出牌异常:`, err.message);
            // 实在不行就跳过回合
            if (!this.engine.isGameOver) this.engine.nextTurn();
            this.broadcastGameState();
            this._checkBotTurn();
        }
    }

    _botMakeMove(eid, bot) {
        // 阶段 1：选将
        if (this.engine.phase === 'SELECTING_STARTER' && !bot.starterSelected) {
            this.engine.selectStarter(eid, 0);
            this.broadcastGameState();
            this._checkBotTurn();
            return;
        }

        if (this.engine.phase !== 'PLAYING') return;

        // 手牌为空 → 跳回合
        if (!bot.hand || bot.hand.length === 0) {
            this.engine.nextTurn();
            this.broadcastGameState();
            this._checkBotTurn();
            return;
        }

        // 策略：找第一张非 Joker 牌，同色打成组合
        const nonJokers = bot.hand.filter(c => !c.isJoker);
        const jokers = bot.hand.filter(c => c.isJoker);

        // 有 Joker：复活死亡角色或斩杀
        if (jokers.length >= 1) {
            const deadTarget = this.engine.players.find(
                p => p.id !== eid && !p.isEliminated && p.getActiveCharacter().isDead
            );
            if (deadTarget && jokers.length === 1) {
                this.engine.playJoker(bot, deadTarget, deadTarget.activeCharIndex, [jokers[0]]);
                this.broadcastChat(this.engine.players[eid].name, '🤖 使用 Joker 复活了 ' + deadTarget.name);
            } else if (jokers.length >= 2) {
                const aliveTarget = this.engine.players.find(
                    p => p.id !== eid && !p.isEliminated && !p.getActiveCharacter().isDead
                );
                if (aliveTarget) {
                    this.engine.playJoker(bot, aliveTarget, aliveTarget.activeCharIndex, [jokers[0], jokers[1]]);
                    this.broadcastChat(this.engine.players[eid].name, '🤖 使用双 Joker 斩杀了 ' + aliveTarget.name);
                }
            }
            this._afterBotAction();
            return;
        }

        if (nonJokers.length === 0) {
            this.engine.nextTurn();
            this.broadcastGameState();
            this._checkBotTurn();
            return;
        }

        // 策略：找最大同花色组
        const suitGroups = {};
        for (const c of nonJokers) {
            if (!suitGroups[c.suit]) suitGroups[c.suit] = [];
            suitGroups[c.suit].push(c);
        }

        // 优先选张数最多的花色（≥3 更好），否则最大的单张
        let bestGroup = nonJokers.slice(0, 1);
        for (const [suit, cards] of Object.entries(suitGroups)) {
            if (cards.length > bestGroup.length) bestGroup = cards;
        }
        // 限制最多出 5 张（引擎限制）
        const playCards = bestGroup.slice(0, 5);

        const suit = playCards[0].suit;
        const isShield = suit === '♣';

        if (isShield) {
            this.engine.playShield(bot, playCards, suit, null);
            this.broadcastChat(this.engine.players[eid].name, '🛡️ 获得护盾');
        } else {
            // 找攻击目标：优先血量最低的敌人
            const targets = this.engine.players.filter(
                p => p.id !== eid && !p.isEliminated
            );
            if (targets.length === 0) {
                this.engine.nextTurn();
                this.broadcastGameState();
                this._checkBotTurn();
                return;
            }
            targets.sort((a, b) =>
                a.getActiveCharacter().hp - b.getActiveCharacter().hp
            );
            const target = targets[0];
            this.engine.playAttack(bot, target, playCards, suit, null, false);
            this.broadcastChat(this.engine.players[eid].name,
                `⚔️ 攻击 ${target.name}`);
        }

        this._afterBotAction();
    }

    _afterBotAction() {
        if (this.engine.phase === 'WAITING_FOR_JOKER') {
            // 机器人不救 → 直接等超时
            this.broadcastGameState();
            setTimeout(() => {
                if (this.engine.phase === 'WAITING_FOR_JOKER') {
                    this.engine.resolveDying();
                    if (!this.engine.isGameOver) this.engine.nextTurn();
                    this.broadcastGameState();
                    this._checkBotTurn();
                }
            }, 10000);
            return;
        }

        if (!this.engine.isGameOver && this.state === 'PLAYING') {
            this.engine.nextTurn();
        }
        this.broadcastGameState();

        if (this.engine.isGameOver) {
            this.state = 'ENDED';
            this.broadcastToAll('GAME_OVER', {
                winner: this.engine.winner ? this.engine.winner.name : '平局',
                rounds: this.engine.turnCount,
                survivors: this.engine.players.filter(p => !p.isEliminated).length,
            });
            this._cleanup();
            return;
        }

        this._checkBotTurn();
    }

    _cleanup() {
        if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; }
        // 5 分钟后自动销毁
        setTimeout(() => {
            for (const sp of this.players.values()) {
                if (sp.ws && sp.ws.readyState === 1) {
                    sp.send('ROOM_CLOSED', { reason: '房间已关闭' });
                }
            }
        }, 300000);
    }

    isAllBots() {
        return [...this.players.values()].every(p => p.isBot);
    }

    /** 统计信息 */
    getStats() {
        return {
            roomId: this.roomId,
            state: this.state,
            playerCount: this.playerCount,
            humanCount: this.humanCount,
            botCount: this.playerCount - this.humanCount,
            age: Math.floor((Date.now() - this.createdAt) / 1000),
        };
    }
}

// ═══════════════════════════════════════════
// 4. 匹配队列
// ═══════════════════════════════════════════

class Matchmaker {
    constructor() {
        this.queue = [];  // [{ sp, joinedAt }]
        this.timer = null;
        this.rooms = null; // 由外部注入
    }

    init(roomsMap) {
        this.rooms = roomsMap;
        this.timer = setInterval(() => this.tick(), MATCHMAKER_TICK_MS);
    }

    join(sp) {
        // 防止重复入队
        if (this.queue.find(e => e.sp.uid === sp.uid)) return false;
        this.queue.push({ sp, joinedAt: Date.now() });
        sp.send('MATCH_QUEUED', { position: this.queue.length });
        console.log(`[匹配] ${sp.nickname} 加入队列 (${this.queue.length}人)`);
        this.tick(); // 立即尝试匹配
        return true;
    }

    leave(uid) {
        const idx = this.queue.findIndex(e => e.sp.uid === uid);
        if (idx >= 0) {
            const sp = this.queue[idx].sp;
            this.queue.splice(idx, 1);
            sp.send('MATCH_CANCELLED', { reason: '已取消匹配' });
            return true;
        }
        return false;
    }

    tick() {
        if (!this.rooms) return;
        const now = Date.now();

        // 方案 A：队列 ≥ 2 人 → 直接匹配
        while (this.queue.length >= 2) {
            const a = this.queue.shift();
            const b = this.queue.shift();
            this._createRoom([a.sp, b.sp]);
        }

        // 方案 B：单人超时 → 补 AI 开局
        for (let i = this.queue.length - 1; i >= 0; i--) {
            const entry = this.queue[i];
            if (now - entry.joinedAt > MATCHMAKER_TIMEOUT_MS) {
                const sp = this.queue.splice(i, 1)[0].sp;
                this._createRoom([sp]);
            }
        }
    }

    _createRoom(spList) {
        const roomId = generateRoomId();
        const room = new Room(roomId, 4);
        this.rooms.set(roomId, room);

        for (const sp of spList) {
            room.addPlayer(sp);
        }

        // 补机器人
        room.fillWithBots();

        // 直接开局（快速匹配跳过等待大厅）
        room.startGame(3);

        console.log(`[匹配] 创建房间 ${roomId} — ${spList.length}真人 + ${room.playerCount - spList.length}机器人`);
    }

    getStatus() {
        return { queueSize: this.queue.length };
    }

    shutdown() {
        if (this.timer) clearInterval(this.timer);
    }
}

// ═══════════════════════════════════════════
// 5. 全局状态
// ═══════════════════════════════════════════

const rooms = new Map();           // roomId → Room
const connections = new Map();     // ws → { sp, roomId }
const matchmaker = new Matchmaker();
matchmaker.init(rooms);

function generateRoomId() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// ═══════════════════════════════════════════
// 6. WebSocket 服务器
// ═══════════════════════════════════════════

const wss = new WebSocketServer({ port: PORT });
console.log(`🐾 PokeWar v3.0 已启动 — ws://0.0.0.0:${PORT}`);
console.log(`   匹配队列: ${MATCHMAKER_TIMEOUT_MS/1000}s 超时自动补AI`);

wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[WS] 新连接 — ${clientIp}`);

    let heartbeatTimer = null;
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
        catch (e) {
            try { ws.send(JSON.stringify({ type: 'ERROR', payload: { message: '无效的 JSON' } })); }
            catch (_) {}
            return;
        }

        try {
            handleMessage(ws, msg);
        } catch (err) {
            console.error('[WS] 消息处理异常:', msg.type, err.message);
            try { ws.send(JSON.stringify({ type: 'ERROR', payload: { message: '服务器内部错误' } })); }
            catch (_) {}
        }
    });

    ws.on('close', () => {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);

        const conn = connections.get(ws);
        if (!conn) return;

        const { sp, roomId } = conn;
        connections.delete(ws);

        // 从匹配队列移除
        matchmaker.leave(sp.uid);

        // 从房间移除
        const room = rooms.get(roomId);
        if (room) {
            room.removePlayer(sp.uid);
            room.broadcastChat('系统', `${sp.nickname} 离开了房间`);

            // 空房间或全是机器人 → 销毁
            if (room.playerCount === 0 || room.isAllBots()) {
                room._cleanup();
                rooms.delete(roomId);
                console.log(`[Room ${roomId}] 销毁`);
            }
        }
    });

    ws.on('error', (err) => {
        console.error(`[WS] 连接错误 — ${clientIp}:`, err.message);
    });
});

// ═══════════════════════════════════════════
// 7. 消息路由
// ═══════════════════════════════════════════

function handleMessage(ws, msg) {
    switch (msg.type) {

        // ── 快速匹配 ──
        case 'QUICK_MATCH': {
            const name = msg.payload?.playerName || 'Guest';
            const avatar = msg.payload?.avatar || '🐱';
            const sp = new ServerPlayer('u_' + Date.now().toString(36), name, avatar, false);
            sp.ws = ws;
            connections.set(ws, { sp, roomId: null });

            // 尝试加入匹配队列
            if (!matchmaker.join(sp)) {
                sp.send('ERROR', { message: '已在匹配队列中' });
            }
            break;
        }

        case 'CANCEL_MATCH': {
            const conn = connections.get(ws);
            if (conn) matchmaker.leave(conn.sp.uid);
            break;
        }

        // ── 创建房间（传统模式） ──
        case 'create_room': {
            const name = msg.payload?.playerName || '房主';
            const avatar = msg.payload?.avatar || '🐱';

            let roomId = generateRoomId();
            while (rooms.has(roomId)) roomId = generateRoomId();

            const room = new Room(roomId, 4);
            rooms.set(roomId, room);

            const sp = new ServerPlayer('u_' + Date.now().toString(36), name, avatar, false);
            sp.ws = ws;
            connections.set(ws, { sp, roomId });

            room.addPlayer(sp);
            sp.send('room_created', { roomCode: roomId, myPlayerId: sp.playerId, isHost: true });
            break;
        }

        // ── 加入房间 ──
        case 'join_room': {
            const roomId = msg.payload?.roomCode;
            if (!roomId) { sendError(ws, '请提供房间码'); break; }

            const room = rooms.get(roomId);
            if (!room) { sendError(ws, '房间不存在'); break; }
            if (room.state !== 'WAITING') { sendError(ws, '游戏已开始'); break; }
            if (room.isFull) { sendError(ws, '房间已满'); break; }

            const name = msg.payload?.playerName || '小猫猫';
            const avatar = msg.payload?.avatar || '🐱';
            const sp = new ServerPlayer('u_' + Date.now().toString(36), name, avatar, false);
            sp.ws = ws;
            connections.set(ws, { sp, roomId });

            room.addPlayer(sp);
            sp.send('room_joined', { roomCode: roomId, myPlayerId: sp.playerId, isHost: false });
            room.broadcastChat('系统', `${sp.nickname} 加入了房间！`);
            break;
        }

        // ── 切换准备 ──
        case 'toggle_ready': {
            const conn = connections.get(ws);
            if (!conn || !conn.roomId) break;
            const room = rooms.get(conn.roomId);
            if (!room || room.state !== 'WAITING') break;
            conn.sp.ready = !conn.sp.ready;
            room.broadcastRoomUpdate();
            break;
        }

        // ── 开始游戏 ──
        case 'start_game': {
            const conn = connections.get(ws);
            if (!conn || !conn.roomId) break;
            const room = rooms.get(conn.roomId);
            if (!room) break;
            if (room.hostUid !== conn.sp.uid) {
                sendError(ws, '只有房主可以开始游戏');
                break;
            }
            const maxLives = msg.payload?.maxLives || 3;
            const result = room.startGame(maxLives);
            if (!result.ok) sendError(ws, result.error);
            break;
        }

        // ── 玩家动作 ──
        case 'player_action': {
            const conn = connections.get(ws);
            if (!conn || !conn.roomId) break;
            const room = rooms.get(conn.roomId);
            if (!room || !room.engine) break;

            const eid = conn.sp.engineIdx;
            if (eid < 0) break;

            try {
                processPlayerAction(room, eid, msg.payload);
            } catch (err) {
                conn.sp.send('ERROR', { message: err.message });
            }
            break;
        }

        // ── 聊天 ──
        case 'chat': {
            const conn = connections.get(ws);
            if (!conn || !conn.roomId) break;
            const room = rooms.get(conn.roomId);
            if (!room) break;
            room.broadcastToAll('CHAT', {
                senderId: conn.sp.uid,
                senderName: conn.sp.nickname,
                text: msg.payload?.text || '',
            });
            break;
        }

        // ── 心跳 ──
        case 'PING':
            try { ws.send(JSON.stringify({ type: 'PONG' })); } catch (_) {}
            break;

        default:
            console.warn(`[WS] 未知消息: ${msg.type}`);
    }
}

function sendError(ws, message) {
    try { ws.send(JSON.stringify({ type: 'ERROR', payload: { message } })); } catch (_) {}
}

// ═══════════════════════════════════════════
// 8. 玩家动作处理（复用之前的 processPlayerAction）
// ═══════════════════════════════════════════

function processPlayerAction(room, attackerEid, payload) {
    const engine = room.engine;
    if (!engine) throw new Error('游戏未开始');

    switch (payload.action) {

        case 'SELECT_STARTER': {
            const result = engine.selectStarter(attackerEid, payload.charIndex);
            if (!result.ok) throw new Error(result.error);
            room.broadcastGameState();
            room.broadcastChat('⚔️ 战斗', `${engine.players[attackerEid].name} 已选择首发角色`);
            room._checkBotTurn();
            break;
        }

        case 'PLAY_CARD': {
            if (engine.phase !== 'PLAYING') throw new Error('当前阶段不能出牌');

            const attacker = engine.players[attackerEid];
            if (!attacker) throw new Error('无效攻击者');

            const sorted = [...(payload.cardIndices || [])].sort((a, b) => b - a);
            const cards = sorted.map(i => attacker.hand[i]).filter(Boolean);
            if (cards.length !== (payload.cardIndices || []).length) throw new Error('手牌索引无效');

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
                room.broadcastChat('⚔️ 战斗', `${atkName} 使用了 Joker！`);
                room.broadcastToAll('BROADCAST', {
                    attackerName: atkName, targetName: target.name,
                    suit: jokerCard.suit || '🃏', rank: jokerCard.rank || '', actionType: 'joker'
                });
            } else if (isClub) {
                const mainCard = nonJokers[0];
                engine.playShield(attacker, cards, declaredSuit, aValue);
                room.broadcastChat('⚔️ 战斗', `${atkName} 获得了护盾！🛡️`);
                room.broadcastToAll('BROADCAST', {
                    attackerName: atkName, targetName: atkName,
                    suit: mainCard.suit, rank: mainCard.rank, actionType: 'shield'
                });
            } else {
                const target = engine.players[payload.targetPlayerId];
                if (!target) throw new Error('无效目标');
                const mainCard = nonJokers[0];
                engine.playAttack(attacker, target, cards, declaredSuit, aValue, hasA);
                room.broadcastChat('⚔️ 战斗', `${atkName} 攻击了 ${target.name}！`);
                room.broadcastToAll('BROADCAST', {
                    attackerName: atkName, targetName: target.name,
                    suit: mainCard.suit, rank: mainCard.rank, actionType: 'attack'
                });
            }

            // 濒死
            if (engine.phase === 'WAITING_FOR_JOKER') {
                const dyingPlayer = engine.players[engine.dyingInfo.playerId];
                room.broadcastChat('⚔️ 战斗', `⚠️ ${dyingPlayer.name} 濒死！等待 Joker 救援...`);
                room.broadcastGameState();
                setTimeout(() => {
                    if (engine.phase === 'WAITING_FOR_JOKER') {
                        engine.resolveDying();
                        room.broadcastChat('⚔️ 战斗', `💀 无人救援，${dyingPlayer.name} 的角色阵亡...`);
                        if (!engine.isGameOver) engine.nextTurn();
                        room.broadcastGameState();
                        if (engine.isGameOver) {
                            room.broadcastToAll('GAME_OVER', {
                                winner: engine.winner ? engine.winner.name : '平局',
                                rounds: engine.turnCount,
                                survivors: engine.players.filter(p => !p.isEliminated).length,
                            });
                        } else {
                            room._checkBotTurn();
                        }
                    }
                }, 10000);
                return;
            }

            if (!engine.isGameOver) engine.nextTurn();
            room.broadcastGameState();
            if (engine.isGameOver) {
                room.broadcastToAll('GAME_OVER', {
                    winner: engine.winner ? engine.winner.name : '平局',
                    rounds: engine.turnCount,
                    survivors: engine.players.filter(p => !p.isEliminated).length,
                });
            } else {
                room._checkBotTurn();
            }
            break;
        }

        case 'JOKER_RESCUE': {
            const result = engine.rescueWithJoker(attackerEid, payload.jokerCardIdx);
            if (!result.ok) throw new Error(result.error);
            room.broadcastChat('⚔️ 战斗', `${result.rescuerName} 用 Joker 救回了 ${result.rescuedName}！💊`);
            room.broadcastGameState();
            room._checkBotTurn();
            break;
        }

        default:
            throw new Error(`未知动作: ${payload.action}`);
    }
}

// ═══════════════════════════════════════════
// 9. AI 机器人名称库
// ═══════════════════════════════════════════

const BOT_NAMES = [
    'AI_呆呆兽', 'AI_皮卡丘', 'AI_喵喵', 'AI_可达鸭',
    'AI_卡比兽', 'AI_伊布', 'AI_梦幻', 'AI_超梦',
];
const BOT_AVATARS = ['🐢', '⚡', '🐱', '🦆', '🐻', '🦊', '🌟', '👾'];

// ═══════════════════════════════════════════
// 10. 优雅退出
// ═══════════════════════════════════════════

process.on('SIGINT', () => {
    console.log('\n🐾 服务器关闭中...');
    matchmaker.shutdown();
    wss.close(() => process.exit(0));
});

process.on('uncaughtException', (err) => {
    console.error('[FATAL] 未捕获异常:', err);
});
