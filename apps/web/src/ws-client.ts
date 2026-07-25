import type { ClientMessage, ServerMessage } from '@pokewar/protocol';
import type { Store } from './store.ts';

const HEARTBEAT_MS = 15_000;
const MAX_RECONNECT_ATTEMPTS = 5;

export class WSClient {
  #socket: WebSocket | null = null;
  #heartbeat: number | null = null;
  #reconnectAttempt = 0;
  #manualClose = false;
  readonly #url: string;
  readonly #store: Store;
  readonly #onMessage: (message: ServerMessage) => void;

  constructor(url: string, store: Store, onMessage: (message: ServerMessage) => void) {
    this.#url = url;
    this.#store = store;
    this.#onMessage = onMessage;
  }

  connect(): void {
    if (this.#socket?.readyState === WebSocket.OPEN || this.#socket?.readyState === WebSocket.CONNECTING) {
      return;
    }
    this.#manualClose = false;
    this.#store.set({ connection: 'connecting' });
    const socket = new WebSocket(this.#url);
    this.#socket = socket;

    socket.addEventListener('open', () => {
      this.#reconnectAttempt = 0;
      this.#store.set({ connection: 'online', reconnecting: false });
      this.#startHeartbeat();
      const token = localStorage.getItem('pokewar.reconnectToken');
      if (token) {
        this.send({
          type: 'resume_session',
          requestId: crypto.randomUUID(),
          payload: { reconnectToken: token },
        });
      }
    });
    socket.addEventListener('message', (event) => {
      try {
        this.#onMessage(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        this.#store.set({ fatalError: '服务器返回了无法解析的消息。' });
      }
    });
    socket.addEventListener('close', () => {
      this.#stopHeartbeat();
      this.#store.set({ connection: 'offline' });
      if (!this.#manualClose) {
        this.#store.set({ reconnecting: true });
        this.#scheduleReconnect();
      }
    });
    socket.addEventListener('error', () => this.#store.set({ connection: 'error' }));
  }

  send(message: ClientMessage): void {
    if (this.#socket?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected.');
    }
    this.#socket.send(JSON.stringify(message));
  }

  close(): void {
    this.#manualClose = true;
    this.#stopHeartbeat();
    this.#socket?.close(1000, 'Client close');
  }

  #scheduleReconnect(): void {
    if (this.#reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.#store.set({ fatalError: '自动重连失败，请刷新页面。', reconnecting: false });
      return;
    }
    const delay = 3_000 * 2 ** this.#reconnectAttempt;
    this.#reconnectAttempt += 1;
    window.setTimeout(() => this.connect(), delay);
  }

  #startHeartbeat(): void {
    this.#stopHeartbeat();
    this.#heartbeat = window.setInterval(() => {
      if (this.#socket?.readyState !== WebSocket.OPEN) return;
      this.send({ type: 'PING', requestId: crypto.randomUUID() });
    }, HEARTBEAT_MS);
  }

  #stopHeartbeat(): void {
    if (this.#heartbeat !== null) window.clearInterval(this.#heartbeat);
    this.#heartbeat = null;
  }
}
