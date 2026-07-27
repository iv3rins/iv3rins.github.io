import {
  createGameState,
  executeWithDoubleJoker,
  expireDyingWindow,
  forfeitPlayer,
  playCards,
  rescueWithJoker,
  selectStarter,
  toPublicGameState,
  type PublicGameState,
} from '@pokewar/domain';
import { assertApplication } from './errors.ts';
import type {
  ApplicationAction,
  MatchRecorder,
  Room,
  RoomPlayer,
  RoomServiceDependencies,
  RoomSession,
} from './types.ts';

const RECONNECT_WINDOW_MS = 30_000;
const MAX_PLAYERS = 12;
const MAX_REQUEST_IDS = 500;

export class RoomService {
  readonly #rooms = new Map<string, Room>();
  readonly #sessions = new Map<string, { roomCode: string; playerId: string }>();
  readonly #dependencies: RoomServiceDependencies;
  readonly #recorder: MatchRecorder | null;
  readonly #maxRooms: number;

  constructor(
    dependencies: RoomServiceDependencies,
    options: { readonly maxRooms?: number; readonly recorder?: MatchRecorder } = {},
  ) {
    this.#dependencies = dependencies;
    this.#recorder = options.recorder ?? null;
    this.#maxRooms = options.maxRooms ?? 200;
  }

  createRoom(name: string, avatar: string | null): RoomSession {
    assertApplication(this.#rooms.size < this.#maxRooms, 'MAX_ROOMS_REACHED', 'Room capacity reached.');
    const code = this.#createRoomCode();
    const player = this.#createPlayer(name, avatar, true);
    const room: Room = {
      code,
      status: 'WAITING',
      players: [player],
      maxLives: 3,
      game: null,
      processedRequestIds: [],
      isResultRecorded: false,
    };
    this.#rooms.set(code, room);
    return this.#registerSession(room, player);
  }

  joinRoom(code: string, name: string, avatar: string | null): RoomSession {
    const room = this.getRoom(code);
    assertApplication(room.status === 'WAITING', 'ROOM_ALREADY_STARTED', 'Room already started.');
    assertApplication(room.players.length < MAX_PLAYERS, 'ROOM_FULL', 'Room is full.');
    const player = this.#createPlayer(name, avatar, false);
    room.players.push(player);
    return this.#registerSession(room, player);
  }

  quickMatch(name: string, avatar: string | null): RoomSession {
    const room = [...this.#rooms.values()].find(
      (candidate) => candidate.status === 'WAITING' && candidate.players.length < MAX_PLAYERS,
    );
    return room ? this.joinRoom(room.code, name, avatar) : this.createRoom(name, avatar);
  }

  reconnect(reconnectToken: string): RoomSession {
    const session = this.#sessions.get(reconnectToken);
    assertApplication(session, 'SESSION_NOT_FOUND', 'Reconnect session was not found.');
    const room = this.getRoom(session.roomCode);
    const player = this.#player(room, session.playerId);
    assertApplication(
      player.disconnectDeadlineAt === null || player.disconnectDeadlineAt >= this.#dependencies.now(),
      'SESSION_NOT_FOUND',
      'Reconnect window expired.',
    );
    player.isConnected = true;
    player.disconnectDeadlineAt = null;
    return { ...session, reconnectToken };
  }

  disconnect(roomCode: string, playerId: string): void {
    const room = this.#rooms.get(roomCode);
    if (!room) return;
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player) return;
    player.isConnected = false;
    player.disconnectDeadlineAt = this.#dependencies.now() + RECONNECT_WINDOW_MS;
  }

  toggleReady(roomCode: string, playerId: string): Room {
    const room = this.getRoom(roomCode);
    assertApplication(room.status === 'WAITING', 'ROOM_ALREADY_STARTED', 'Room already started.');
    const player = this.#player(room, playerId);
    player.isReady = !player.isReady;
    return room;
  }

  startGame(roomCode: string, hostId: string, maxLives: number): Room {
    const room = this.getRoom(roomCode);
    assertApplication(room.status === 'WAITING', 'ROOM_ALREADY_STARTED', 'Room already started.');
    const host = this.#player(room, hostId);
    assertApplication(host.isHost, 'HOST_ONLY', 'Only host can start the game.');
    assertApplication(room.players.length >= 2, 'NOT_ENOUGH_PLAYERS', 'At least two players are required.');
    assertApplication(
      room.players.filter((player) => !player.isHost).every((player) => player.isReady),
      'PLAYERS_NOT_READY',
      'Every non-host player must be ready.',
    );

    room.maxLives = maxLives;
    room.game = createGameState(
      this.#dependencies.createId(),
      room.players.map((player) => ({ id: player.id, name: player.name, avatar: player.avatar })),
      maxLives,
      this.#dependencies,
    );
    room.status = 'PLAYING';
    return room;
  }

  applyAction(
    roomCode: string,
    playerId: string,
    requestId: string,
    action: ApplicationAction,
  ): Room {
    const room = this.getRoom(roomCode);
    this.#player(room, playerId);
    assertApplication(room.game, 'ROOM_ALREADY_STARTED', 'Game state is unavailable.');
    if (room.processedRequestIds.includes(requestId)) return room;

    const dependencies = { now: this.#dependencies.now };
    switch (action.action) {
      case 'select_starter':
        room.game = selectStarter(room.game, playerId, action.characterIndex, dependencies);
        break;
      case 'play_cards':
        room.game = playCards(
          room.game,
          {
            playerId,
            cardIndices: action.cardIndices,
            ...(action.targetPlayerId ? { targetPlayerId: action.targetPlayerId } : {}),
            ...(action.declaredSuit ? { declaredSuit: action.declaredSuit } : {}),
          },
          dependencies,
        );
        break;
      case 'rescue_with_joker':
        room.game = rescueWithJoker(room.game, playerId, action.jokerCardIndex, dependencies);
        break;
      case 'execute_with_double_joker':
        room.game = executeWithDoubleJoker(
          room.game,
          playerId,
          action.jokerCardIndices,
          dependencies,
        );
        break;
    }

    this.#rememberRequest(room, requestId);
    this.#syncRoomStatus(room);
    return room;
  }

  tick(): Room[] {
    const now = this.#dependencies.now();
    const changed: Room[] = [];
    for (const room of this.#rooms.values()) {
      let didChange = false;
      for (const player of [...room.players]) {
        if (player.disconnectDeadlineAt === null || player.disconnectDeadlineAt > now) continue;
        this.#expireDisconnected(room, player, now);
        didChange = true;
      }
      if (room.game) {
        const expired = expireDyingWindow(room.game, now);
        if (expired !== room.game) {
          room.game = expired;
          didChange = true;
        }
      }
      this.#syncRoomStatus(room);
      if (didChange) changed.push(room);
    }
    return changed;
  }

  getRoom(code: string): Room {
    const room = this.#rooms.get(code);
    assertApplication(room, 'ROOM_NOT_FOUND', 'Room was not found.');
    return room;
  }

  roomForPlayer(roomCode: string, playerId: string): Room {
    const room = this.getRoom(roomCode);
    this.#player(room, playerId);
    return room;
  }

  publicGameState(roomCode: string, viewerId: string): PublicGameState | null {
    const room = this.roomForPlayer(roomCode, viewerId);
    return room.game ? toPublicGameState(room.game, viewerId) : null;
  }

  allRooms(): readonly Room[] {
    return [...this.#rooms.values()];
  }

  async recordFinishedRooms(): Promise<void> {
    if (!this.#recorder) return;
    for (const room of this.#rooms.values()) {
      if (room.status !== 'FINISHED' || !room.game || room.isResultRecorded) continue;
      await this.#recorder.record({
        gameId: room.game.id,
        roomCode: room.code,
        winnerId: room.game.winnerId,
        rounds: room.game.round,
        finishedAt: this.#dependencies.now(),
        players: room.players.map((player) => ({ id: player.id, name: player.name })),
      });
      room.isResultRecorded = true;
    }
  }

  #createPlayer(name: string, avatar: string | null, isHost: boolean): RoomPlayer {
    return {
      id: this.#dependencies.createId(),
      name,
      avatar,
      isHost,
      isReady: false,
      isConnected: true,
      reconnectToken: this.#dependencies.createSecret(),
      disconnectDeadlineAt: null,
    };
  }

  #registerSession(room: Room, player: RoomPlayer): RoomSession {
    this.#sessions.set(player.reconnectToken, { roomCode: room.code, playerId: player.id });
    return { roomCode: room.code, playerId: player.id, reconnectToken: player.reconnectToken };
  }

  #player(room: Room, playerId: string): RoomPlayer {
    const player = room.players.find((candidate) => candidate.id === playerId);
    assertApplication(player, 'PLAYER_NOT_IN_ROOM', 'Player is not in this room.');
    return player;
  }

  #createRoomCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = '';
      for (let index = 0; index < 6; index += 1) {
        code += alphabet[Math.floor(this.#dependencies.random() * alphabet.length)] ?? 'A';
      }
      if (!this.#rooms.has(code)) return code;
    }
    return this.#dependencies.createId().replaceAll('-', '').slice(0, 6).toUpperCase();
  }

  #rememberRequest(room: Room, requestId: string): void {
    room.processedRequestIds.push(requestId);
    if (room.processedRequestIds.length > MAX_REQUEST_IDS) {
      room.processedRequestIds.splice(0, room.processedRequestIds.length - MAX_REQUEST_IDS);
    }
  }

  #expireDisconnected(room: Room, player: RoomPlayer, now: number): void {
    this.#sessions.delete(player.reconnectToken);
    if (room.status === 'WAITING') {
      room.players = room.players.filter((candidate) => candidate.id !== player.id);
      if (player.isHost && room.players[0]) room.players[0].isHost = true;
      if (room.players.length === 0) this.#rooms.delete(room.code);
      return;
    }
    if (room.game && room.status === 'PLAYING') {
      room.game = forfeitPlayer(room.game, player.id, now, 'Reconnect window expired.');
    }
  }

  #syncRoomStatus(room: Room): void {
    if (room.game?.phase === 'GAME_OVER') room.status = 'FINISHED';
  }
}
