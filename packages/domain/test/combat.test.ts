import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAttack, type Character } from '../src/index.ts';

function character(suit: Character['suit'], hp = 10, shield = 0): Character {
  return { id: 'c', rank: 'J', suit, hp, maxHp: 10, shield, status: 'ACTIVE' };
}

void test('spade doubles damage when target is not immune', () => {
  const result = resolveAttack({
    suit: 'S',
    cardValue: 4,
    hasAce: false,
    attacker: character('H'),
    target: character('D'),
  });
  assert.equal(result.hpDamage, 8);
  assert.equal(result.isDouble, true);
});

void test('same-suit immunity prevents heart damage and lifesteal', () => {
  const attacker = character('S', 4);
  const result = resolveAttack({
    suit: 'H',
    cardValue: 6,
    hasAce: false,
    attacker,
    target: character('H'),
  });
  assert.equal(result.isImmune, true);
  assert.equal(result.hpDamage, 0);
  assert.equal(result.lifesteal, 0);
});

void test('ace bypasses immunity and club character pierces shield', () => {
  const result = resolveAttack({
    suit: 'D',
    cardValue: 5,
    hasAce: true,
    attacker: character('C'),
    target: character('D', 10, 99),
  });
  assert.equal(result.isImmune, false);
  assert.equal(result.shieldBlocked, 0);
  assert.equal(result.hpDamage, 5);
  assert.equal(result.harvestDraws, 5);
});
