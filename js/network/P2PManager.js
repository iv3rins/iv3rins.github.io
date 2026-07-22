/**
 * P2PManager — 纯净 P2P 网络层
 * Bug Fix: 移除所有业务判断（特别是 CHAT 的自动广播）
 * 只负责收发数据，所有业务逻辑由 networkHandler 处理
 */

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
        this.peer = new Peer('cute-poker-' + finalRoomId);

        this.peer.on('open', (id) => {
            this.myId = id;
            if (this.callbacks.onReady) this.callbacks.onReady(finalRoomId);
        });

        this.peer.on('connection', (conn) => {
            conn.on('open', () => {
                this.connections[conn.peer] = conn;
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
            const targetHostId = 'cute-poker-' + roomId;
            this.hostConnection = this.peer.connect(targetHostId, { reliable: true });

            this.hostConnection.on('open', () => {
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

    // 纯净：只解包转发给 callback，不做任何业务判断
    _handleData(data, senderId) {
        if (this.callbacks.onMessage) {
            this.callbacks.onMessage(data, senderId);
        }
    }
}
