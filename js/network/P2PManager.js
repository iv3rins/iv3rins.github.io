/**
 * P2PManager — P2P 网络层 (PokeWar)
 * Peer ID 前缀统一为 'pokewar-'，支持彩色日志
 */

const PEER_PREFIX = 'pokewar-';

export class P2PManager {
    constructor() {
        this.peer = null;
        this.connections = {};
        this.hostConnection = null;
        this.isHost = false;
        this.myId = null;
        this.callbacks = {
            onPlayerJoin: null,
            onPlayerLeave: null,
            onMessage: null,
            onReady: null,
            onHostDisconnect: null,
            onPeerError: null,
        };
    }

    createRoom(roomId) {
        this.isHost = true;
        const finalRoomId = roomId || Math.floor(1000 + Math.random() * 9000).toString();
        this.peer = new Peer(PEER_PREFIX + finalRoomId);

        this.peer.on('open', (id) => {
            this.myId = id;
            console.log('%c[P2P] 房主已就绪，房间号:', 'color:#4facfe', finalRoomId);
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

        this.peer.on('disconnected', () => this.peer.reconnect());
        this.peer.on('error', (err) => {
            console.error('P2P 错误:', err);
            if (this.callbacks.onPeerError) this.callbacks.onPeerError(err);
        });
    }

    joinRoom(roomId) {
        this.isHost = false;
        this.peer = new Peer();

        this.peer.on('open', (id) => {
            this.myId = id;
            const targetHostId = PEER_PREFIX + roomId;
            console.log('%c[P2P] 正在连接房主 ID:', 'color:#f1c40f', targetHostId);
            this.hostConnection = this.peer.connect(targetHostId, { reliable: true });

            this.hostConnection.on('open', () => {
                console.log('%c[P2P] 成功连接到房主！', 'color:#2ecc71');
                if (this.callbacks.onReady) this.callbacks.onReady(roomId);
            });
            this.hostConnection.on('data', (data) => this._handleData(data, targetHostId));
            this.hostConnection.on('close', () => {
                console.warn('与房主断开连接');
                if (this.callbacks.onHostDisconnect) this.callbacks.onHostDisconnect();
            });
            this.hostConnection.on('error', () => {
                if (this.callbacks.onHostDisconnect) this.callbacks.onHostDisconnect();
            });
        });

        this.peer.on('error', (err) => {
            console.error('加入房间失败:', err);
            if (this.callbacks.onPeerError) this.callbacks.onPeerError(err);
        });
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
