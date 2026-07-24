/**
 * WSClient.js — WebSocket 客户端（替代 P2PManager）
 * 连接到权威服务器 ws://64.90.30.38:8080
 * 负责：连接/重连/心跳 + 消息序列化 + 回调派发
 */
export class WSClient {
    constructor(url = 'ws://64.90.30.38:8080') {
        this.url = url;
        this.ws = null;
        this.isConnected = false;
        this._heartbeat = null;
        this._reconnectTimer = null;
        this._retryCount = 0;
        this._maxRetries = 5;
        this._intentionalClose = false;

        /** @type {{onOpen:Function, onMessage:Function, onClose:Function, onError:Function, onReconnectFailed:Function}} */
        this.callbacks = {
            onOpen: null,
            onMessage: null,
            onClose: null,
            onError: null,
            onReconnectFailed: null,
        };
    }

    /** 建立 WebSocket 连接 */
    connect() {
        if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
            console.warn('[WSClient] 已有活跃连接，跳过');
            return;
        }
        this._intentionalClose = false;
        console.log(`[WSClient] 正在连接 ${this.url} ...`);

        try {
            this.ws = new WebSocket(this.url);
        } catch (e) {
            console.error('[WSClient] 创建 WebSocket 失败:', e);
            this._scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            this.isConnected = true;
            this._retryCount = 0;
            if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
            console.log('%c[WSClient] 已连接到服务器', 'color:#2ecc71');
            this._startHeartbeat();
            if (this.callbacks.onOpen) this.callbacks.onOpen();
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'PONG') return; // 心跳回包，忽略
                // 日志（SYNC_STATE 过于频繁，降级为 trace 或不显示）
                if (msg.type !== 'SYNC_STATE') {
                    console.log(`%c[WSClient] ← ${msg.type}`, 'color:#a0a0a0');
                }
                if (this.callbacks.onMessage) this.callbacks.onMessage(msg);
            } catch (e) {
                console.error('[WSClient] 消息解析失败:', e, event.data);
            }
        };

        this.ws.onclose = (event) => {
            this.isConnected = false;
            this._stopHeartbeat();
            console.warn(`[WSClient] 连接关闭 — code:${event.code} reason:${event.reason}`);
            if (!this._intentionalClose) {
                this._scheduleReconnect();
            }
            if (this.callbacks.onClose) this.callbacks.onClose(event);
        };

        this.ws.onerror = (err) => {
            console.error('[WSClient] WebSocket 错误:', err);
            if (this.callbacks.onError) this.callbacks.onError(err);
        };
    }

    /** 发送 JSON 消息 */
    send(msg) {
        if (!this.ws || this.ws.readyState !== 1) {
            console.warn('[WSClient] 未连接，消息未发送:', msg.type);
            return false;
        }
        this.ws.send(JSON.stringify(msg));
        return true;
    }

    /** 断开连接 */
    disconnect() {
        this._intentionalClose = true;
        this._stopHeartbeat();
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        if (this.ws) {
            this.ws.close(1000, '用户主动断开');
            this.ws = null;
        }
        this.isConnected = false;
    }

    // ── 内部 ──

    _startHeartbeat() {
        this._stopHeartbeat();
        this._heartbeat = setInterval(() => {
            this.send({ type: 'PING' });
        }, 15000);
    }

    _stopHeartbeat() {
        if (this._heartbeat) { clearInterval(this._heartbeat); this._heartbeat = null; }
    }

    _scheduleReconnect() {
        this._retryCount++;
        if (this._retryCount > this._maxRetries) {
            console.error(`[WSClient] 重连 ${this._maxRetries} 次失败，放弃`);
            if (this.callbacks.onReconnectFailed) this.callbacks.onReconnectFailed(this._retryCount);
            return;
        }
        if (this._reconnectTimer) return;
        const delay = Math.min(1000 * Math.pow(2, this._retryCount - 1), 15000); // 指数退避: 1s,2s,4s,8s,15s
        console.log(`[WSClient] 第 ${this._retryCount}/${this._maxRetries} 次重连，${(delay/1000).toFixed(1)}s 后...`);
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this.connect();
        }, delay);
    }
}
