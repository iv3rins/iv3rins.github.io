import type { GameState, PublicGameState } from './types.ts';

export function toPublicGameState(state: GameState, viewerId: string): PublicGameState {
  const current = state.players[state.currentTurnIndex];
  return {
    id: state.id,
    phase: state.phase,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      handCount: player.hand.length,
      hand: player.id === viewerId ? player.hand : null,
      characters: player.characters,
      activeCharacterIndex: player.activeCharacterIndex,
      livesRemaining: player.livesRemaining,
      isEliminated: player.isEliminated,
    })),
    deckCount: state.deck.length,
    discardTop: state.discard.at(-1) ?? null,
    currentTurnPlayerId: current?.id ?? null,
    round: state.round,
    revision: state.revision,
    pendingDying: state.pendingDying,
    winnerId: state.winnerId,
    log: state.log,
  };
}
