import type { WebSocket } from 'ws';

export interface ConnectionSession {
  readonly roomCode: string;
  readonly playerId: string;
}

export class ConnectionRegistry {
  readonly #sessionBySocket = new WeakMap<WebSocket, ConnectionSession>();
  readonly #socketsByPlayer = new Map<string, Set<WebSocket>>();

  bind(socket: WebSocket, session: ConnectionSession): void {
    this.unbind(socket);
    this.#sessionBySocket.set(socket, session);
    const key = this.#key(session.roomCode, session.playerId);
    const sockets = this.#socketsByPlayer.get(key) ?? new Set<WebSocket>();
    sockets.add(socket);
    this.#socketsByPlayer.set(key, sockets);
  }

  unbind(socket: WebSocket): ConnectionSession | null {
    const session = this.#sessionBySocket.get(socket);
    if (!session) return null;
    const key = this.#key(session.roomCode, session.playerId);
    const sockets = this.#socketsByPlayer.get(key);
    sockets?.delete(socket);
    if (sockets?.size === 0) this.#socketsByPlayer.delete(key);
    this.#sessionBySocket.delete(socket);
    return session;
  }

  session(socket: WebSocket): ConnectionSession | null {
    return this.#sessionBySocket.get(socket) ?? null;
  }

  sockets(roomCode: string, playerId: string): readonly WebSocket[] {
    return [...(this.#socketsByPlayer.get(this.#key(roomCode, playerId)) ?? [])];
  }

  #key(roomCode: string, playerId: string): string {
    return `${roomCode}:${playerId}`;
  }
}
