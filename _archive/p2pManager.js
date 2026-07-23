/**
 * P2P 网络管理器 - 基于 PeerJS (WebRTC)
 * 依赖: <script src="https://unpkg.com/peerjs@1.5.1/dist/peerjs.min.js"></script>
 * 支持房主断线通知、客户端掉线回调
 */
class P2PManager {
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
            onPeerError: null
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
            conn.on('error', (err) => {
                console.warn('客户端连接错误:', err);
            });
        });

        this.peer.on('disconnected', () => {
            // 房主网络断开，尝试重连
            console.warn('房主网络断开，尝试重连...');
            this.peer.reconnect();
        });

        this.peer.on('close', () => {
            // 房主 Peer 被关闭
            console.warn('Peer 连接已关闭');
        });

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
            this.hostConnection.on('error', (err) => {
                console.warn('连接房主失败:', err);
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
        if (this.peer) {
            this.peer.destroy();
        }
    }

    _handleData(data, senderId) {
        if (this.isHost && data.type === 'CHAT') {
            this.sendMessage(data);
        }
        if (this.callbacks.onMessage) {
            this.callbacks.onMessage(data, senderId);
        }
    }
}
