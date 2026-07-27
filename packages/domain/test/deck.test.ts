import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeck } from '../src/index.ts';

void test('deck contains 40 normal cards and 2 jokers', () => {
  const deck = createDeck();
  assert.equal(deck.length, 42);
  assert.equal(deck.filter((card) => card.isJoker).length, 2);
  assert.equal(new Set(deck.map((card) => card.id)).size, 42);
});
