import type { GameState } from '@pokewar/domain';

export type RoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED';

export interface RoomPlayer {
  readonly id: string;
  readonly name: string;
  readonly avatar: string | null;
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
  readonly reconnectToken: string;
  disconnectDeadlineAt: number | null;
}

export interface Room {
  readonly code: string;
  status: RoomStatus;
  players: RoomPlayer[];
  maxLives: number;
  game: GameState | null;
  processedRequestIds: string[];
  isResultRecorded: boolean;
}

export interface RoomServiceDependencies {
  readonly now: () => number;
  readonly random: () => number;
  readonly createId: () => string;
  readonly createSecret: () => string;
}

export interface RoomSession {
  readonly roomCode: string;
  readonly playerId: string;
  readonly reconnectToken: string;
}

export interface MatchResult {
  readonly gameId: string;
  readonly roomCode: string;
  readonly winnerId: string | null;
  readonly rounds: number;
  readonly finishedAt: number;
  readonly players: readonly { readonly id: string; readonly name: string }[];
}

export interface MatchRecorder {
  record(result: MatchResult): Promise<void>;
}

export type ApplicationAction =
  | { readonly action: 'select_starter'; readonly characterIndex: number }
  | {
      readonly action: 'play_cards';
      readonly cardIndices: readonly number[];
      readonly targetPlayerId?: string;
      readonly declaredSuit?: 'S' | 'H' | 'D' | 'C';
    }
  | { readonly action: 'rescue_with_joker'; readonly jokerCardIndex: number }
  | {
      readonly action: 'execute_with_double_joker';
      readonly jokerCardIndices: readonly [number, number];
    };
