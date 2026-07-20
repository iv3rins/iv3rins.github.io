/**
 * P2P 网络管理器 - 基于 PeerJS (WebRTC)
 * 依赖: <script src="https://unpkg.com/peerjs@1.5.1/dist/peerjs.min.js"></script>
 */
class P2PManager {
    constructor() {
        this.peer = null;
        this.connections = {}; // 存储所有客户端连接 (房主用)
        this.hostConnection = null; // 连接到房主的通道 (客户端用)
        this.isHost = false;
        this.myId = null;

        // 消息回调注册字典
        this.callbacks = {
            onPlayerJoin: null,
            onPlayerLeave: null,
            onMessage: null,
            onReady: null
        };
    }

    /**
     * 作为房主创建房间
     * @param {String} roomId (可选) 指定的四位邀请码，如果不传则随机生成
     */
    createRoom(roomId) {
        this.isHost = true;
        const finalRoomId = roomId || Math.floor(1000 + Math.random() * 9000).toString();
        
        // 初始化 Peer，使用特定的前缀防止全局 ID 冲突
        this.peer = new Peer('cute-poker-' + finalRoomId);

        this.peer.on('open', (id) => {
            this.myId = id;
            console.log("房间创建成功，邀请码:", finalRoomId);
            if (this.callbacks.onReady) this.callbacks.onReady(finalRoomId);
        });

        this.peer.on('connection', (conn) => {
            console.log("新玩家尝试连接:", conn.peer);
            
            conn.on('open', () => {
                this.connections[conn.peer] = conn;
                if (this.callbacks.onPlayerJoin) this.callbacks.onPlayerJoin(conn.peer);
            });

            conn.on('data', (data) => {
                this._handleData(data, conn.peer);
            });

            conn.on('close', () => {
                delete this.connections[conn.peer];
                if (this.callbacks.onPlayerLeave) this.callbacks.onPlayerLeave(conn.peer);
            });
        });

        this.peer.on('error', (err) => {
            console.error("P2P 错误:", err);
            alert("网络错误或房间号被占用: " + err.type);
        });
    }

    /**
     * 作为客户端加入房间
     * @param {String} roomId 四位邀请码
     */
    joinRoom(roomId) {
        this.isHost = false;
        this.peer = new Peer(); // 客户端随机分配自身ID

        this.peer.on('open', (id) => {
            this.myId = id;
            const targetHostId = 'cute-poker-' + roomId;
            console.log("正在连接到房间:", roomId);

            this.hostConnection = this.peer.connect(targetHostId, { reliable: true });

            this.hostConnection.on('open', () => {
                console.log("成功加入房间!");
                if (this.callbacks.onReady) this.callbacks.onReady(roomId);
            });

            this.hostConnection.on('data', (data) => {
                this._handleData(data, targetHostId);
            });

            this.hostConnection.on('close', () => {
                console.log("与房主断开连接");
                alert("房主已解散房间或网络断开");
            });
        });

        this.peer.on('error', (err) => {
            console.error("加入房间失败:", err);
            alert("加入失败，请检查邀请码是否正确！");
        });
    }

    /**
     * 发送消息 (客户端发给房主，房主发给所有客户端)
     * @param {Object} data 必须包含 { type: String, payload: Object }
     */
    sendMessage(data) {
        if (!data || !data.type) return console.error("消息格式错误");

        if (this.isHost) {
            // 房主广播给所有人
            Object.values(this.connections).forEach(conn => {
                if (conn.open) conn.send(data);
            });
        } else {
            // 客户端发送给房主
            if (this.hostConnection && this.hostConnection.open) {
                this.hostConnection.send(data);
            }
        }
    }

    /**
     * 内部处理收到的数据
     */
    _handleData(data, senderId) {
        // 如果是房主收到消息，并且类型是广播类型的，自动转发给其他客户端 (可选)
        if (this.isHost && data.type === 'CHAT') {
            this.sendMessage(data); // 房主做中转站
        }
        
        // 触发上层业务逻辑
        if (this.callbacks.onMessage) {
            this.callbacks.onMessage(data, senderId);
        }
    }
}