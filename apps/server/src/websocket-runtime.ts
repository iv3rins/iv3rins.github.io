import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { ApplicationError, RoomService, type Room } from '@pokewar/application';
import { DomainError } from '@pokewar/domain';
import {
  decodeJsonMessage,
  encodeServerMessage,
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
} from '@pokewar/protocol';
import { ZodError } from 'zod';
import { ConnectionRegistry } from './connection-registry.ts';
import type { ServerConfig } from './config.ts';
import { TokenBucket } from './rate-limiter.ts';
import { toRoomView } from './room-view.ts';
import type { SqliteMatchRecorder } from '@pokewar/persistence';

const TICK_INTERVAL_MS = 500;
const HEARTBEAT_INTERVAL_MS = 15_000;

interface SocketMetadata {
  readonly limiter: TokenBucket;
  isAlive: boolean;
}

function normalizeRawData(data: RawData): Uint8Array {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data;
}

export class WebSocketRuntime {
  readonly #webSocketServer: WebSocketServer;
  readonly #roomService: RoomService;
  readonly #registry = new ConnectionRegistry();
  readonly #metadata = new WeakMap<WebSocket, SocketMetadata>();
  readonly #log: FastifyBaseLogger;
  readonly #config: ServerConfig;
  #tickTimer: NodeJS.Timeout | null = null;
  #heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(
    server: FastifyInstance,
    config: ServerConfig,
    recorder: SqliteMatchRecorder,
  ) {
    this.#config = config;
    this.#log = server.log;
    this.#webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
    this.#roomService = new RoomService(
      {
        now: Date.now,
        random: Math.random,
        createId: randomUUID,
        createSecret: () => randomBytes(32).toString('base64url'),
      },
      { maxRooms: config.maxRooms, recorder },
    );

    server.server.on('upgrade', (request, socket, head) => {
      if (!this.#acceptUpgrade(request)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      if (this.#webSocketServer.clients.size >= config.maxConnections) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }
      this.#webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        this.#webSocketServer.emit('connection', webSocket, request);
      });
    });

    this.#webSocketServer.on('connection', (socket) => this.#onConnection(socket));
  }

  start(): void {
    this.#tickTimer = setInterval(() => void this.#tick(), TICK_INTERVAL_MS);
    this.#tickTimer.unref();
    this.#heartbeatTimer = setInterval(() => this.#heartbeat(), HEARTBEAT_INTERVAL_MS);
    this.#heartbeatTimer.unref();
  }

  close(): void {
    if (this.#tickTimer) clearInterval(this.#tickTimer);
    if (this.#heartbeatTimer) clearInterval(this.#heartbeatTimer);
    for (const socket of this.#webSocketServer.clients) socket.close(1001, 'Server shutdown');
    this.#webSocketServer.close();
  }

  #acceptUpgrade(request: IncomingMessage): boolean {
    if (request.url !== '/ws') return false;
    if (this.#config.nodeEnv !== 'production') return true;
    return request.headers.origin === this.#config.publicOrigin;
  }

  #onConnection(socket: WebSocket): void {
    this.#metadata.set(socket, { limiter: new TokenBucket(), isAlive: true });
    socket.on('pong', () => {
      const metadata = this.#metadata.get(socket);
      if (metadata) metadata.isAlive = true;
    });
    socket.on('message', (data) => void this.#onMessage(socket, data));
    socket.on('close', () => {
      const session = this.#registry.unbind(socket);
      if (!session) return;
      this.#roomService.disconnect(session.roomCode, session.playerId);
      try {
        this.#broadcastRoom(this.#roomService.getRoom(session.roomCode));
      } catch {
        // Room may already have been removed after the final connection closed.
      }
    });
    socket.on('error', (error) => this.#log.warn({ error }, 'WebSocket client error'));
  }

  async #onMessage(socket: WebSocket, data: RawData): Promise<void> {
    const metadata = this.#metadata.get(socket);
    if (!metadata?.limiter.take()) {
      this.#sendError(socket, 'RATE_LIMITED', 'Too many messages.');
      return;
    }

    let message: ClientMessage | null = null;
    try {
      const raw = decodeJsonMessage(normalizeRawData(data));
      message = parseClientMessage(raw);
      await this.#dispatch(socket, message);
    } catch (error) {
      this.#handleError(socket, error, message?.requestId);
    }
  }

  async #dispatch(socket: WebSocket, message: ClientMessage): Promise<void> {
    switch (message.type) {
      case 'create_room': {
        const session = this.#roomService.createRoom(
          message.payload.playerName,
          message.payload.avatar ?? null,
        );
        this.#registry.bind(socket, session);
        this.#send(socket, {
          type: 'room_created',
          requestId: message.requestId,
          payload: {
            roomCode: session.roomCode,
            myPlayerId: session.playerId,
            reconnectToken: session.reconnectToken,
          },
        });
        this.#broadcastRoom(this.#roomService.getRoom(session.roomCode));
        break;
      }
      case 'join_room': {
        const session = this.#roomService.joinRoom(
          message.payload.roomCode,
          message.payload.playerName,
          message.payload.avatar ?? null,
        );
        this.#bindAndAcknowledgeJoin(socket, message.requestId, session);
        break;
      }
      case 'quick_match': {
        const session = this.#roomService.quickMatch(
          message.payload.playerName,
          message.payload.avatar ?? null,
        );
        this.#bindAndAcknowledgeJoin(socket, message.requestId, session);
        break;
      }
      case 'resume_session': {
        const session = this.#roomService.reconnect(message.payload.reconnectToken);
        this.#registry.bind(socket, session);
        this.#send(socket, {
          type: 'session_resumed',
          requestId: message.requestId,
          payload: { roomCode: session.roomCode, myPlayerId: session.playerId },
        });
        const room = this.#roomService.getRoom(session.roomCode);
        this.#broadcastRoom(room);
        this.#broadcastGameState(room);
        break;
      }
      case 'PING':
        this.#send(socket, { type: 'PONG', requestId: message.requestId, payload: { at: Date.now() } });
        break;
      case 'toggle_ready': {
        const session = this.#requireSession(socket);
        const room = this.#roomService.toggleReady(session.roomCode, session.playerId);
        this.#broadcastRoom(room);
        break;
      }
      case 'start_game': {
        const session = this.#requireSession(socket);
        const room = this.#roomService.startGame(
          session.roomCode,
          session.playerId,
          message.payload.maxLives,
        );
        this.#broadcastRoom(room);
        for (const player of room.players) {
          this.#sendToPlayer(room.code, player.id, {
            type: 'GAME_START',
            payload: { enginePlayerId: player.id },
          });
        }
        this.#broadcastGameState(room);
        break;
      }
      case 'player_action': {
        const session = this.#requireSession(socket);
        const room = this.#roomService.applyAction(
          session.roomCode,
          session.playerId,
          message.requestId,
          message.payload,
        );
        this.#broadcastAction(room, session.playerId, message);
        this.#broadcastRoom(room);
        this.#broadcastGameState(room);
        break;
      }
      case 'chat': {
        const session = this.#requireSession(socket);
        const room = this.#roomService.roomForPlayer(session.roomCode, session.playerId);
        const player = room.players.find((candidate) => candidate.id === session.playerId);
        if (!player) throw new ApplicationError('PLAYER_NOT_IN_ROOM', 'Player is unavailable.');
        this.#broadcast(room, {
          type: 'CHAT',
          payload: {
            playerId: player.id,
            playerName: player.name,
            text: message.payload.text,
            at: Date.now(),
          },
        });
        break;
      }
    }
  }

  #bindAndAcknowledgeJoin(
    socket: WebSocket,
    requestId: string,
    session: { roomCode: string; playerId: string; reconnectToken: string },
  ): void {
    this.#registry.bind(socket, session);
    this.#send(socket, {
      type: 'room_joined',
      requestId,
      payload: {
        roomCode: session.roomCode,
        myPlayerId: session.playerId,
        reconnectToken: session.reconnectToken,
      },
    });
    this.#broadcastRoom(this.#roomService.getRoom(session.roomCode));
  }

  #requireSession(socket: WebSocket): { roomCode: string; playerId: string } {
    const session = this.#registry.session(socket);
    if (!session) throw new ApplicationError('SESSION_NOT_FOUND', 'Join or resume a room first.');
    return session;
  }

  #broadcastRoom(room: Room): void {
    this.#broadcast(room, { type: 'ROOM_UPDATE', payload: toRoomView(room) });
  }

  #broadcastGameState(room: Room): void {
    if (!room.game) return;
    for (const player of room.players) {
      const state = this.#roomService.publicGameState(room.code, player.id);
      if (state) this.#sendToPlayer(room.code, player.id, { type: 'SYNC_STATE', payload: state });
    }
    if (room.game.phase === 'GAME_OVER') {
      this.#broadcast(room, {
        type: 'GAME_OVER',
        payload: { winnerId: room.game.winnerId, rounds: room.game.round },
      });
    }
  }

  #broadcastAction(room: Room, actorId: string, message: Extract<ClientMessage, { type: 'player_action' }>): void {
    if (message.payload.action !== 'play_cards') return;
    const actor = room.players.find((player) => player.id === actorId);
    const target = room.players.find((player) => player.id === message.payload.targetPlayerId);
    this.#broadcast(room, {
      type: 'BROADCAST',
      payload: {
        attackerName: actor?.name ?? 'Unknown',
        targetName: target?.name ?? null,
        suit: message.payload.declaredSuit ?? 'AUTO',
        rank: message.payload.cardIndices.join('+'),
      },
    });
  }

  #broadcast(room: Room, message: ServerMessage): void {
    for (const player of room.players) this.#sendToPlayer(room.code, player.id, message);
  }

  #sendToPlayer(roomCode: string, playerId: string, message: ServerMessage): void {
    for (const socket of this.#registry.sockets(roomCode, playerId)) this.#send(socket, message);
  }

  #send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(encodeServerMessage(message));
  }

  #sendError(socket: WebSocket, code: string, message: string, requestId?: string): void {
    this.#send(socket, {
      type: 'ERROR',
      ...(requestId ? { requestId } : {}),
      payload: { code, message },
    });
  }

  #handleError(socket: WebSocket, error: unknown, requestId?: string): void {
    if (error instanceof DomainError || error instanceof ApplicationError) {
      this.#sendError(socket, error.code, error.message, requestId);
      return;
    }
    if (error instanceof ZodError) {
      this.#sendError(socket, 'INVALID_MESSAGE', 'Message schema validation failed.', requestId);
      return;
    }
    if (error instanceof SyntaxError) {
      this.#sendError(socket, 'INVALID_JSON', 'Message is not valid JSON.', requestId);
      return;
    }
    if (error instanceof Error && error.message === 'MESSAGE_TOO_LARGE') {
      this.#sendError(socket, 'MESSAGE_TOO_LARGE', 'Message exceeds 16 KiB.', requestId);
      return;
    }
    this.#log.error({ error }, 'Unhandled WebSocket command error');
    this.#sendError(socket, 'INTERNAL_ERROR', 'Unexpected server error.', requestId);
  }

  async #tick(): Promise<void> {
    const changed = this.#roomService.tick();
    for (const room of changed) {
      this.#broadcastRoom(room);
      this.#broadcastGameState(room);
    }
    try {
      await this.#roomService.recordFinishedRooms();
    } catch (error) {
      this.#log.error({ error }, 'Failed to persist match result');
    }
  }

  #heartbeat(): void {
    for (const socket of this.#webSocketServer.clients) {
      const metadata = this.#metadata.get(socket);
      if (!metadata) continue;
      if (!metadata.isAlive) {
        socket.terminate();
        continue;
      }
      metadata.isAlive = false;
      socket.ping();
    }
  }
}
