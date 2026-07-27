import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeck, createGameState, selectStarter } from '../src/index.ts';
import type { GameDependencies, PlayerSeed } from '../src/types.ts';

// ── helpers ──────────────────────────────────────────────
function deps(now = 1_000): GameDependencies {
  let id = 0;
  return {
    now: () => now,
    random: () => 0.25,
    createId: () => `id-${(id += 1)}`,
  };
}

// ── deck scaling ─────────────────────────────────────────
void test('deck scales with player count: 2-4 players → 42 cards', () => {
  const deck = createDeck(2);
  assert.equal(deck.length, 42);
  assert.equal(deck.filter((c) => c.isJoker).length, 2);
});

void test('deck scales with player count: 5-8 players → 84 cards', () => {
  const deck = createDeck(5);
  assert.equal(deck.length, 84);
  assert.equal(deck.filter((c) => c.isJoker).length, 4);
});

void test('deck scales with player count: 9-12 players → 126 cards', () => {
  const deck = createDeck(12);
  assert.equal(deck.length, 126);
  assert.equal(deck.filter((c) => c.isJoker).length, 6);
});

void test('deck scales with player count: all IDs are unique', () => {
  const deck = createDeck(10);
  const ids = deck.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

void test('deck backward-compatible: no-arg defaults to 4-player deck', () => {
  // createDeck() without arg should default to 42 cards
  const deck = createDeck();
  assert.equal(deck.length, 42);
});

// ── player count validation ──────────────────────────────
void test('allows 2 players (minimum)', () => {
  const seeds: PlayerSeed[] = [
    { id: 'p1', name: 'One' },
    { id: 'p2', name: 'Two' },
  ];
  const state = createGameState('g1', seeds, 3, deps());
  assert.equal(state.players.length, 2);
});

void test('allows 12 players (maximum)', () => {
  const seeds: PlayerSeed[] = Array.from({ length: 12 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player${i + 1}`,
  }));
  const state = createGameState('g1', seeds, 3, deps());
  assert.equal(state.players.length, 12);
});

void test('rejects 1 player (below minimum)', () => {
  assert.throws(
    () => createGameState('g1', [{ id: 'p1', name: 'One' }], 3, deps()),
    /2 to 12/,
  );
});

void test('rejects 13 players (above maximum)', () => {
  const seeds: PlayerSeed[] = Array.from({ length: 13 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player${i + 1}`,
  }));
  assert.throws(
    () => createGameState('g1', seeds, 3, deps()),
    /2 to 12/,
  );
});

// ── large game integration ───────────────────────────────
void test('12-player game can select starters and enter PLAYING', () => {
  const seeds: PlayerSeed[] = Array.from({ length: 12 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
  }));
  const d = deps();
  let state = createGameState('g1', seeds, 3, d);
  for (let i = 0; i < 12; i += 1) {
    state = selectStarter(state, `p${i + 1}`, 0, d);
  }
  assert.equal(state.phase, 'PLAYING');
  assert.equal(state.players.every((p) => p.activeCharacterIndex >= 0), true);
  // 12 players × 5 starting cards = 60 drawn; 126 deck − 60 = 66 left
  assert.equal(state.deck.length, 66);
});
