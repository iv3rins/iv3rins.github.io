/**
 * app.js — 《扑克战争》boardgame.io 客户端控制器 (MVC-C)
 *
 * 职责：
 *   1. 连接 boardgame.io 服务器 (SocketIO)
 *   2. 管理房间（创建/加入/开始游戏）
 *   3. 发送 Moves (playCards, selectStarter, rescueWithJoker)
 *   4. 接收状态更新 → 派发给 View 层
 *
 * 依赖：window.BoardgameIO (CDN), game.js (ES module)
 */
import { PokeWar } from '../game.js';

const { Client, LobbyClient, SocketIO } = window.BoardgameIO || {};

// ── 默认配置 ──
const DEFAULT_SERVER = `${location.hostname}:${location.port || 8080}`;
const LobbyAPI = `${location.protocol}//${location.hostname}:8081`;

// ═══════════════════════════════════════════
// AppController — 单例
// ═══════════════════════════════════════════
class AppController {
  constructor() {
    /** @type {string} 玩家 ID */
    this.playerID = null;
    /** @type {string} 匹配 ID */
    this.matchID = null;
    /** @type {string} 凭证 */
    this.credentials = null;
    /** @type {object|null} boardgame.io Client 实例 */
    this.client = null;
    /** @type {LobbyClient|null} */
    this.lobby = null;
    /** @type {string} 玩家名称 */
    this.playerName = '玩家';
    /** @type {string} Emoji 头像 */
    this.avatar = '🐱';

    /** 游戏完整状态 (G + ctx) */
    this.state = null;
    /** 是否已连接 */
    this.connected = false;
    /** 房间中的玩家列表 */
    this.roomPlayers = [];

    // ── 回调注册 ──
    /** @type {Function[]} 状态变更监听器 */
    this._stateListeners = [];
    /** @type {Function[]} 聊天消息监听器 */
    this._chatListeners = [];
    /** @type {Function[]} 错误监听器 */
    this._errorListeners = [];
    /** @type {Function[]} 连接变更监听器 */
    this._connectListeners = [];
  }

  // ═══ 事件系统 ═══

  /** 注册状态变更回调 */
  onStateChange(fn) { this._stateListeners.push(fn); }
  /** 注册聊天回调 */
  onChat(fn) { this._chatListeners.push(fn); }
  /** 注册错误回调 */
  onError(fn) { this._errorListeners.push(fn); }
  /** 注册连接变更回调 */
  onConnect(fn) { this._connectListeners.push(fn); }

  _emitState(state) {
    this.state = state;
    for (const fn of this._stateListeners) {
      try { fn(state); } catch (e) { console.error('[App] State listener error:', e); }
    }
  }

  _emitChat(msg) {
    for (const fn of this._chatListeners) {
      try { fn(msg); } catch (e) { console.error('[App] Chat listener error:', e); }
    }
  }

  _emitError(err) {
    for (const fn of this._errorListeners) {
      try { fn(err); } catch (e) { console.error('[App] Error listener error:', e); }
    }
  }

  _setConnected(val) {
    this.connected = val;
    for (const fn of this._connectListeners) {
      try { fn(val); } catch (e) { console.error('[App] Connect listener error:', e); }
    }
  }

  // ═══ 初始化 Lobby ═══

  initLobby(serverAddr) {
    const host = serverAddr || LobbyAPI;
    this.lobby = new LobbyClient({ server: host });
    console.log('[App] LobbyClient 初始化:', host);
  }

  // ═══ 房间操作 (Lobby API) ═══

  /**
   * 创建房间
   * @param {number} numPlayers - 玩家数量
   * @returns {Promise<{matchID: string}>}
   */
  async createRoom(numPlayers = 4) {
    if (!this.lobby) this.initLobby();
    try {
      const { matchID } = await this.lobby.createMatch('poke-war', { numPlayers });
      this.matchID = matchID;
      console.log('[App] 房间创建成功:', matchID);
      return { matchID };
    } catch (e) {
      console.error('[App] 创建房间失败:', e);
      this._emitError({ type: 'create_failed', message: e.message });
      throw e;
    }
  }

  /**
   * 加入房间
   * @param {string} matchID
   * @returns {Promise<{playerID: string, playerCredentials: string}>}
   */
  async joinRoom(matchID) {
    if (!this.lobby) this.initLobby();
    try {
      const { playerID, playerCredentials } = await this.lobby.joinMatch('poke-war', matchID, {
        data: { name: this.playerName, avatar: this.avatar },
      });
      this.matchID = matchID;
      this.playerID = playerID;
      this.credentials = playerCredentials;
      console.log('[App] 加入房间成功:', matchID, 'player:', playerID);
      return { playerID, playerCredentials };
    } catch (e) {
      console.error('[App] 加入房间失败:', e);
      this._emitError({ type: 'join_failed', message: e.message });
      throw e;
    }
  }

  /**
   * 列出所有房间
   * @returns {Promise<Array>}
   */
  async listRooms() {
    if (!this.lobby) this.initLobby();
    try {
      const { matches } = await this.lobby.listMatches('poke-war');
      return matches || [];
    } catch (e) {
      console.error('[App] 列出房间失败:', e);
      return [];
    }
  }

  // ═══ 游戏连接 ═══

  /**
   * 连接到游戏（进入对局）
   * 必须在 createRoom/joinRoom 之后调用
   */
  connectGame(serverAddr) {
    if (!this.matchID || this.playerID === null || !this.credentials) {
      console.error('[App] 缺少 matchID/playerID/credentials');
      return;
    }

    const host = serverAddr || DEFAULT_SERVER;
    console.log('[App] 连接游戏服务器:', host, 'match:', this.matchID);

    this.client = Client({
      game: PokeWar,
      matchID: this.matchID,
      playerID: this.playerID,
      credentials: this.credentials,
      multiplayer: SocketIO({ server: host }),
    });

    // 监听状态变更
    this.client.subscribe((state) => {
      if (!state) return;
      this._emitState(state);
    });

    // 监听聊天 (boardgame.io chat)
    this.client.onChatMessage?.((msg) => {
      console.log('[App] Chat:', msg);
      this._emitChat(msg);
    });

    this.client.onConnectionChange?.((connected) => {
      console.log('[App] 连接状态:', connected);
      this._setConnected(connected);
    });

    // 启动连接
    this.client.start();
  }

  // ═══ Moves — 发送动作 ═══

  /** 选将 */
  selectStarter(charIdx) {
    console.log('[App] selectStarter:', charIdx);
    this.client?.moves.selectStarter(charIdx);
  }

  /**
   * 出牌
   * @param {number[]} cardIndices - 手牌索引
   * @param {string} targetPlayerId - 目标玩家 ID
   * @param {string|null} declaredSuit - A 万化声明花色
   */
  playCards(cardIndices, targetPlayerId, declaredSuit = null) {
    console.log('[App] playCards:', cardIndices, 'target:', targetPlayerId, 'suit:', declaredSuit);
    this.client?.moves.playCards(cardIndices, targetPlayerId, declaredSuit);
  }

  /** 濒死救援 */
  rescueWithJoker(jokerCardIdx) {
    console.log('[App] rescueWithJoker:', jokerCardIdx);
    this.client?.moves.rescueWithJoker(jokerCardIdx);
  }

  // ═══ 工具 ═══

  /** 获取当前玩家数据 */
  getMyPlayer() {
    if (!this.state || this.playerID === null) return null;
    return this.state.G?.players?.[this.playerID] || null;
  }

  /** 获取我的活跃角色 */
  getMyActiveChar() {
    const p = this.getMyPlayer();
    if (!p) return null;
    const idx = p.activeCharIdx;
    if (idx >= 0 && idx < (p.characters?.length || 0)) return p.characters[idx];
    return null;
  }

  /** 检查是否我的回合 */
  isMyTurn() {
    if (!this.state) return false;
    return String(this.state.ctx?.currentPlayer) === String(this.playerID);
  }

  /** 获取当前阶段 */
  getPhase() {
    return this.state?.G?.phase || 'SELECTING_STARTER';
  }

  /** 获取所有玩家 */
  getAllPlayers() {
    return this.state?.G?.players || {};
  }

  /** 断开连接 */
  disconnect() {
    this.client?.stop?.();
    this.client = null;
    this.connected = false;
  }
}

// ── 单例导出 ──
export const app = new AppController();
