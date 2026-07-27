import {
  createGameState,
  executeWithDoubleJoker,
  playCards,
  rescueWithJoker,
  selectStarter,
  toPublicGameState,
  type GameState,
  type PlayerSeed,
} from '@pokewar/domain';

interface MoveContext {
  readonly G: GameState;
  readonly playerID: string;
}

interface SetupContext {
  readonly ctx: { readonly numPlayers: number };
  readonly setupData?: {
    readonly players?: readonly PlayerSeed[];
    readonly maxLives?: number;
    readonly gameId?: string;
  };
}

export function createBoardgameIoDefinition(dependencies: {
  readonly now: () => number;
  readonly random: () => number;
  readonly createId: () => string;
}): object {
  return {
    name: 'pokewar',
    setup: ({ ctx, setupData }: SetupContext): GameState => {
      const players = setupData?.players ?? Array.from({ length: ctx.numPlayers }, (_, index) => ({
        id: String(index),
        name: `Player ${index + 1}`,
      }));
      return createGameState(
        setupData?.gameId ?? dependencies.createId(),
        players,
        setupData?.maxLives ?? 3,
        dependencies,
      );
    },
    moves: {
      selectStarter: ({ G, playerID }: MoveContext, characterIndex: number) =>
        selectStarter(G, playerID, characterIndex, dependencies),
      playCards: (
        { G, playerID }: MoveContext,
        cardIndices: readonly number[],
        targetPlayerId?: string,
        declaredSuit?: 'S' | 'H' | 'D' | 'C',
      ) =>
        playCards(
          G,
          {
            playerId: playerID,
            cardIndices,
            ...(targetPlayerId ? { targetPlayerId } : {}),
            ...(declaredSuit ? { declaredSuit } : {}),
          },
          dependencies,
        ),
      rescueWithJoker: ({ G, playerID }: MoveContext, jokerCardIndex: number) =>
        rescueWithJoker(G, playerID, jokerCardIndex, dependencies),
      executeWithDoubleJoker: (
        { G, playerID }: MoveContext,
        jokerCardIndices: readonly [number, number],
      ) => executeWithDoubleJoker(G, playerID, jokerCardIndices, dependencies),
    },
    playerView: ({ G, playerID }: MoveContext) => toPublicGameState(G, playerID),
  };
}
