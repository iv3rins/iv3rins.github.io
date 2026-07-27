import { assertDomain } from './errors.ts';
import type { Card, GameState, Player, Suit } from './types.ts';

export interface ValidatedPlay {
  readonly cards: readonly Card[];
  readonly effectiveSuit: Suit;
  readonly hasAce: boolean;
  readonly cardValue: number;
}

export function playerById(state: GameState, playerId: string): Player {
  const player = state.players.find((candidate) => candidate.id === playerId);
  assertDomain(player, 'PLAYER_NOT_FOUND', `Player ${playerId} was not found.`);
  return player;
}

export function validateSelectedCards(
  player: Player,
  cardIndices: readonly number[],
  declaredSuit?: Suit,
): ValidatedPlay {
  assertDomain(cardIndices.length > 0, 'INVALID_CARD_SELECTION', 'Select at least one card.');
  const uniqueIndices = [...new Set(cardIndices)];
  assertDomain(
    uniqueIndices.length === cardIndices.length,
    'INVALID_CARD_SELECTION',
    'The same card cannot be selected twice.',
  );

  const cards = uniqueIndices.map((index) => player.hand[index]);
  assertDomain(
    cards.every((card): card is Card => card !== undefined),
    'INVALID_CARD_SELECTION',
    'A selected card index is out of range.',
  );
  assertDomain(
    !cards.some((card) => card.isJoker),
    'JOKER_ACTION_REQUIRED',
    'Joker must use a dedicated interrupt action.',
  );

  const hasAce = cards.some((card) => card.rank === 'A');
  const allSuits = new Set(cards.map((card) => card.suit).filter(isDefined));

  let effectiveSuit: Suit;
  if (cards.length === 1) {
    const suit = cards[0]?.suit;
    assertDomain(suit, 'INVALID_CARD_COMBINATION', 'Normal card must have a suit.');
    effectiveSuit = suit;
  } else if (hasAce) {
    assertDomain(
      declaredSuit,
      'DECLARED_SUIT_REQUIRED',
      'Every multi-card Ace combination requires a declared suit.',
    );
    effectiveSuit = declaredSuit;
  } else {
    assertDomain(
      allSuits.size === 1,
      'INVALID_CARD_COMBINATION',
      'Multiple cards must share one suit unless an Ace is present.',
    );
    const suit = [...allSuits][0];
    assertDomain(suit, 'INVALID_CARD_COMBINATION', 'Unable to determine card suit.');
    effectiveSuit = suit;
  }

  return {
    cards,
    effectiveSuit,
    hasAce,
    cardValue: cards.reduce((sum, card) => sum + card.value, 0),
  };
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
