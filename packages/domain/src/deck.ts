import { NORMAL_RANKS, SUITS, type Card, type NormalRank, type Suit } from './types.ts';

const RANK_VALUES: Readonly<Record<NormalRank, number>> = {
  A: 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
};

export function createDeck(numPlayers = 4): Card[] {
  const multiplier = Math.ceil(numPlayers / 4);
  const cards: Card[] = [];
  for (let set = 0; set < multiplier; set += 1) {
    for (const suit of SUITS) {
      for (const rank of NORMAL_RANKS) {
        cards.push({
          id: `${suit}-${rank}-${set}`,
          suit,
          rank,
          value: RANK_VALUES[rank],
          isJoker: false,
        });
      }
    }
    cards.push(
      { id: `JOKER-${set * 2 + 1}`, suit: null, rank: 'JOKER', value: 0, isJoker: true },
      { id: `JOKER-${set * 2 + 2}`, suit: null, rank: 'JOKER', value: 0, isJoker: true },
    );
  }
  return cards;
}

export function shuffleCards(cards: readonly Card[], random: () => number): Card[] {
  const result = [...cards];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = result[index];
    const swap = result[swapIndex];
    if (current === undefined || swap === undefined) continue;
    result[index] = swap;
    result[swapIndex] = current;
  }
  return result;
}

export function isSuit(value: string): value is Suit {
  return SUITS.includes(value as Suit);
}
