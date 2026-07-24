/**
 * P2PManager — P2P 网络层 (PokeWar)
 * Peer ID 前缀统一为 'pokewar-'，支持彩色日志
 */

const PEER_PREFIX = 'pokewar-';

// ★ 私有信令服务器配置（香港 64.90.30.38:9000）
const PEER_SERVER = {
    host: '64.90.30.38',
    port: 9000,
    path: '/myapp',
    secure: false,
    pingInterval: 5000,
};

export class P2PManager {
    constructor() {
        this.peer = null;
        this.connections = {};
        this.hostConnection = null;
        this.isHost = false;
        this.myId = null;
        this._roomId = null;          // ★ 用于重连
        this._heartbeat = null;       // ★ 心跳定时器
        this._reconnectTimer = null;  // ★ 重连定时器
        this._retryCount = 0;         // ★ 重连计数
        this.callbacks = {
            onPlayerJoin: null,
            onPlayerLeave: null,
            onMessage: null,
            onReady: null,
            onHostDisconnect: null,
            onPeerError: null,
            onConnectionFailed: null,  // ★ 新增：连接彻底失败回调
        };
    }

    /** ★ 心跳：每 15 秒 ping，保持 WebRTC 通道活跃 */
    _startHeartbeat() {
        this._stopHeartbeat();
        this._heartbeat = setInterval(() => {
            this.sendMessage({ type: 'PING', payload: { ts: Date.now() } });
        }, 15000);
    }
    _stopHeartbeat() {
        if (this._heartbeat) { clearInterval(this._heartbeat); this._heartbeat = null; }
    }

    createRoom(roomId) {
        this.isHost = true;
        const finalRoomId = roomId || Math.floor(1000 + Math.random() * 9000).toString();
        this._roomId = finalRoomId;
        this.peer = new Peer(PEER_PREFIX + finalRoomId, PEER_SERVER);

        this.peer.on('open', (id) => {
            this.myId = id;
            console.log('%c[P2P] 房主已就绪 — 房间号:', 'color:#4facfe', finalRoomId);
            this._startHeartbeat();
            if (this.callbacks.onReady) this.callbacks.onReady(finalRoomId);
        });

        this.peer.on('connection', (conn) => {
            conn.on('open', () => {
                this.connections[conn.peer] = conn;
                console.log('%c[P2P] 新客户端连接:', 'color:#2ecc71', conn.peer);
                if (this.callbacks.onPlayerJoin) this.callbacks.onPlayerJoin(conn.peer);
            });
            conn.on('data', (data) => this._handleData(data, conn.peer));
            conn.on('close', () => {
                delete this.connections[conn.peer];
                if (this.callbacks.onPlayerLeave) this.callbacks.onPlayerLeave(conn.peer);
            });
            conn.on('error', (err) => console.warn('客户端连接错误:', err));
        });

        this.peer.on('disconnected', () => {
            console.warn('[P2P] 信令断开，尝试重连...');
            this.peer.reconnect();
        });
        this.peer.on('error', (err) => {
            console.error('[P2P] Peer 错误:', err.type || err.message || err);
            if (err.type === 'unavailable-id') {
                console.error('[P2P] 房间 ID 已被占用');
            }
            if (this.callbacks.onPeerError) this.callbacks.onPeerError(err);
        });
    }

    joinRoom(roomId) {
        this.isHost = false;
        this._roomId = roomId;
        this._doJoin(roomId);
    }

    /** ★ 执行连接 + 失败后 3 秒自动重试 */
    _doJoin(roomId) {
        if (this.peer) this.peer.destroy();
        this.peer = new Peer(PEER_SERVER);

        this.peer.on('open', (id) => {
            this.myId = id;
            const targetHostId = PEER_PREFIX + roomId;
            console.log('%c[P2P] 正在连接房主 ID:', 'color:#f1c40f', targetHostId);
            this.hostConnection = this.peer.connect(targetHostId, { reliable: true });

            this.hostConnection.on('open', () => {
                console.log('%c[P2P] 成功连接到房主！', 'color:#2ecc71');
                this._retryCount = 0;  // 重置重试计数
                this._startHeartbeat();
                // 清除重连定时器
                if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
                if (this.callbacks.onReady) this.callbacks.onReady(roomId);
            });
            this.hostConnection.on('data', (data) => this._handleData(data, targetHostId));
            this.hostConnection.on('close', () => {
                console.warn('[P2P] 与房主断开连接，3 秒后重连...');
                this._stopHeartbeat();
                this._scheduleReconnect();
            });
            this.hostConnection.on('error', () => {
                this._stopHeartbeat();
                this._scheduleReconnect();
            });
        });

        this.peer.on('disconnected', () => {
            console.warn('[P2P] 信令断开，尝试重连...');
            this.peer.reconnect();
        });
        this.peer.on('error', (err) => {
            console.error('[P2P] 加入房间失败:', err.type || err.message || err);
            this._scheduleReconnect();
            if (this.callbacks.onPeerError) this.callbacks.onPeerError(err);
        });
    }

    _scheduleReconnect() {
        this._retryCount = (this._retryCount || 0) + 1;
        if (this._retryCount > 3) {
            console.error('[P2P] 重试 3 次均失败，放弃重连');
            if (this.callbacks.onConnectionFailed) {
                this.callbacks.onConnectionFailed(this._retryCount);
            }
            return;
        }
        if (this._reconnectTimer) return;
        console.log(`[P2P] 第 ${this._retryCount}/3 次重连，3 秒后...`);
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            if (this._roomId) this._doJoin(this._roomId);
        }, 3000);
    }

    sendMessage(data) {
        if (!data || !data.type) return;
        if (this.isHost) {
            Object.values(this.connections).forEach(conn => {
                if (conn.open) conn.send(data);
            });
        } else {
            if (this.hostConnection && this.hostConnection.open) {
                this.hostConnection.send(data);
            }
        }
    }

    sendTo(peerId, data) {
        if (this.isHost) {
            const conn = this.connections[peerId];
            if (conn && conn.open) conn.send(data);
        }
    }

    disconnect() {
        this._stopHeartbeat();
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        Object.values(this.connections).forEach(conn => {
            if (conn.open) conn.close();
        });
        if (this.hostConnection && this.hostConnection.open) {
            this.hostConnection.close();
        }
        if (this.peer) this.peer.destroy();
    }

    _handleData(data, senderId) {
        console.log('%c[P2P] 收到消息:', 'color:#a0a0a0', data.type, 'from', senderId.slice(0,16)+'...');
        if (this.callbacks.onMessage) {
            this.callbacks.onMessage(data, senderId);
        }
    }
}
