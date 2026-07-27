import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError, validateSelectedCards, type Player } from '../src/index.ts';

function player(): Player {
  return {
    id: 'p1',
    name: 'One',
    avatar: null,
    hand: [
      { id: 'S-A', suit: 'S', rank: 'A', value: 1, isJoker: false },
      { id: 'H-4', suit: 'H', rank: '4', value: 4, isJoker: false },
      { id: 'D-5', suit: 'D', rank: '5', value: 5, isJoker: false },
    ],
    characters: [],
    activeCharacterIndex: -1,
    livesRemaining: 3,
    isEliminated: false,
  };
}

void test('mixed non-ace cards are rejected', () => {
  const candidate = player();
  assert.throws(
    () => validateSelectedCards(candidate, [1, 2]),
    (error: unknown) => error instanceof DomainError && error.code === 'INVALID_CARD_COMBINATION',
  );
});

void test('ace combination requires a declared suit when mixed', () => {
  const candidate = player();
  assert.throws(
    () => validateSelectedCards(candidate, [0, 1, 2]),
    (error: unknown) => error instanceof DomainError && error.code === 'DECLARED_SUIT_REQUIRED',
  );
});
