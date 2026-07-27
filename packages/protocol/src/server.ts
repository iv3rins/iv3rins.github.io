import type { PublicGameState } from '@pokewar/domain';

export interface RoomPlayerView {
  readonly id: string;
  readonly name: string;
  readonly avatar: string | null;
  readonly isHost: boolean;
  readonly isReady: boolean;
  readonly isConnected: boolean;
}

export interface RoomView {
  readonly code: string;
  readonly status: 'WAITING' | 'PLAYING' | 'FINISHED';
  readonly players: readonly RoomPlayerView[];
  readonly maxLives: number;
}

export type ServerMessage =
  | {
      readonly type: 'room_created';
      readonly requestId: string;
      readonly payload: {
        readonly roomCode: string;
        readonly myPlayerId: string;
        readonly reconnectToken: string;
      };
    }
  | {
      readonly type: 'room_joined';
      readonly requestId: string;
      readonly payload: {
        readonly roomCode: string;
        readonly myPlayerId: string;
        readonly reconnectToken: string;
      };
    }
  | {
      readonly type: 'session_resumed';
      readonly requestId: string;
      readonly payload: { readonly roomCode: string; readonly myPlayerId: string };
    }
  | { readonly type: 'ROOM_UPDATE'; readonly payload: RoomView }
  | { readonly type: 'GAME_START'; readonly payload: { readonly enginePlayerId: string } }
  | { readonly type: 'SYNC_STATE'; readonly payload: PublicGameState }
  | {
      readonly type: 'BROADCAST';
      readonly payload: {
        readonly attackerName: string;
        readonly targetName: string | null;
        readonly suit: string;
        readonly rank: string;
      };
    }
  | {
      readonly type: 'CHAT';
      readonly payload: {
        readonly playerId: string;
        readonly playerName: string;
        readonly text: string;
        readonly at: number;
      };
    }
  | {
      readonly type: 'GAME_OVER';
      readonly payload: { readonly winnerId: string | null; readonly rounds: number };
    }
  | {
      readonly type: 'ERROR';
      readonly requestId?: string;
      readonly payload: { readonly code: string; readonly message: string };
    }
  | { readonly type: 'PONG'; readonly requestId: string; readonly payload: { readonly at: number } };
