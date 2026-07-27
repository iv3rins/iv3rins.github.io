import assert from 'node:assert/strict';
import test from 'node:test';
import { playCards, selectStarter } from '../src/index.ts';
import { dependencies, startedGame } from './helpers.ts';

void test('all players selecting starters moves game to PLAYING', () => {
  const state = startedGame();
  assert.equal(state.phase, 'PLAYING');
  assert.equal(state.players.every((player) => player.activeCharacterIndex === 0), true);
});

void test('club play grants shield and advances turn without a target', () => {
  const deps = dependencies();
  let state = startedGame();
  const attacker = state.players[0];
  if (!attacker) throw new Error('Missing attacker fixture.');
  attacker.hand = [{ id: 'C-4', suit: 'C', rank: '4', value: 4, isJoker: false }];
  state = playCards(state, { playerId: 'p1', cardIndices: [0] }, deps);
  assert.equal(state.players[0]?.characters[0]?.shield, 4);
  assert.equal(state.players[state.currentTurnIndex]?.id, 'p2');
  assert.equal(state.players[0]?.hand.length, 3, 'empty hand triggers three-card supply');
});

void test('turn start does not automatically draw a card', () => {
  const deps = dependencies();
  let state = startedGame();
  const p1 = state.players[0];
  const p2 = state.players[1];
  if (!p1 || !p2) throw new Error('Missing player fixture.');
  p1.hand = [
    { id: 'C-2', suit: 'C', rank: '2', value: 2, isJoker: false },
    { id: 'C-3', suit: 'C', rank: '3', value: 3, isJoker: false },
  ];
  const before = p2.hand.length;
  state = playCards(state, { playerId: 'p1', cardIndices: [0] }, deps);
  assert.equal(state.players[1]?.hand.length, before);
});

void test('starter cannot be selected twice', () => {
  const deps = dependencies();
  let state = startedGame();
  assert.throws(() => selectStarter(state, 'p1', 1, deps));
});

void test('final defeat opens Joker window, consumes the last life, and rewards the attacker', () => {
  const deps = dependencies();
  let state = startedGame(1);
  const attacker = state.players[0];
  const target = state.players[1];
  if (!attacker || !target) throw new Error('Missing player fixture.');
  attacker.hand = [
    { id: 'S-2', suit: 'S', rank: '2', value: 2, isJoker: false },
    { id: 'C-2', suit: 'C', rank: '2', value: 2, isJoker: false },
  ];
  const targetCharacter = target.characters[target.activeCharacterIndex];
  if (!targetCharacter) throw new Error('Missing target character fixture.');
  targetCharacter.hp = 2;

  state = playCards(
    state,
    { playerId: attacker.id, cardIndices: [0], targetPlayerId: target.id },
    deps,
  );

  assert.equal(state.phase, 'WAITING_FOR_JOKER');
  assert.equal(state.pendingDying?.playerId, target.id);
  assert.equal(state.players[1]?.livesRemaining, 0);
  assert.equal(state.players[0]?.hand.length, 4, 'attacker receives three reward cards');
});
