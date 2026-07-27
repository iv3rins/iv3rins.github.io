export const SUITS = ['S', 'H', 'D', 'C'] as const;
export type Suit = (typeof SUITS)[number];

export const NORMAL_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;
export type NormalRank = (typeof NORMAL_RANKS)[number];
export type CardRank = NormalRank | 'JOKER';
export type CharacterRank = 'J' | 'Q' | 'K';

export type GamePhase = 'SELECTING_STARTER' | 'PLAYING' | 'WAITING_FOR_JOKER' | 'GAME_OVER';
export type CharacterStatus = 'BENCH' | 'ACTIVE' | 'DYING' | 'DEAD';

export interface Card {
  readonly id: string;
  readonly suit: Suit | null;
  readonly rank: CardRank;
  readonly value: number;
  readonly isJoker: boolean;
}

export interface Character {
  readonly id: string;
  readonly rank: CharacterRank;
  readonly suit: Suit;
  hp: number;
  readonly maxHp: number;
  shield: number;
  status: CharacterStatus;
}

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly avatar: string | null;
  hand: Card[];
  characters: Character[];
  activeCharacterIndex: number;
  livesRemaining: number;
  isEliminated: boolean;
}

export interface DyingWindow {
  readonly playerId: string;
  readonly characterIndex: number;
  readonly openedAt: number;
  readonly deadlineAt: number;
  readonly resumeTurnIndex: number;
}

export interface GameLogEntry {
  readonly sequence: number;
  readonly type: string;
  readonly message: string;
  readonly at: number;
}

export interface GameState {
  readonly id: string;
  phase: GamePhase;
  players: Player[];
  deck: Card[];
  discard: Card[];
  currentTurnIndex: number;
  round: number;
  revision: number;
  pendingDying: DyingWindow | null;
  winnerId: string | null;
  log: GameLogEntry[];
}

export interface PlayerSeed {
  readonly id: string;
  readonly name: string;
  readonly avatar?: string | null;
}

export interface GameDependencies {
  readonly now: () => number;
  readonly random: () => number;
  readonly createId: () => string;
}

export interface PlayCardsCommand {
  readonly playerId: string;
  readonly cardIndices: readonly number[];
  readonly targetPlayerId?: string;
  readonly declaredSuit?: Suit;
}

export interface AttackResolution {
  readonly effectiveSuit: Suit;
  readonly cardValue: number;
  readonly hasAce: boolean;
  readonly isImmune: boolean;
  readonly isDouble: boolean;
  readonly shieldBlocked: number;
  readonly hpDamage: number;
  readonly lifesteal: number;
  readonly harvestDraws: number;
  readonly shieldGranted: number;
}

export interface PublicPlayerState {
  readonly id: string;
  readonly name: string;
  readonly avatar: string | null;
  readonly handCount: number;
  readonly hand: readonly Card[] | null;
  readonly characters: readonly Character[];
  readonly activeCharacterIndex: number;
  readonly livesRemaining: number;
  readonly isEliminated: boolean;
}

export interface PublicGameState {
  readonly id: string;
  readonly phase: GamePhase;
  readonly players: readonly PublicPlayerState[];
  readonly deckCount: number;
  readonly discardTop: Card | null;
  readonly currentTurnPlayerId: string | null;
  readonly round: number;
  readonly revision: number;
  readonly pendingDying: DyingWindow | null;
  readonly winnerId: string | null;
  readonly log: readonly GameLogEntry[];
}
