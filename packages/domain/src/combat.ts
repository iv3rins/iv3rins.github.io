import type { AttackResolution, Character, Suit } from './types.ts';

export interface ResolveAttackInput {
  readonly suit: Suit;
  readonly cardValue: number;
  readonly hasAce: boolean;
  readonly target: Character;
  readonly attacker: Character;
}

export function resolveAttack(input: ResolveAttackInput): AttackResolution {
  if (input.suit === 'C') {
    return {
      effectiveSuit: 'C',
      cardValue: input.cardValue,
      hasAce: input.hasAce,
      isImmune: false,
      isDouble: false,
      shieldBlocked: 0,
      hpDamage: 0,
      lifesteal: 0,
      harvestDraws: 0,
      shieldGranted: input.cardValue,
    };
  }

  const isImmune = input.target.suit === input.suit && !input.hasAce;
  if (isImmune) {
    // Same-suit: base damage still applies, but card effect is nullified
    const piercesShield = input.attacker.suit === 'C';
    const rawDmg = input.cardValue; // no double
    const shieldBlocked = piercesShield ? 0 : Math.min(input.target.shield, rawDmg);
    const hpDamage = Math.min(input.target.hp, rawDmg - shieldBlocked);
    return {
      effectiveSuit: input.suit,
      cardValue: input.cardValue,
      hasAce: input.hasAce,
      isImmune: true,
      isDouble: false,
      shieldBlocked,
      hpDamage,
      lifesteal: 0,
      harvestDraws: 0,
      shieldGranted: 0,
    };
  }

  const isDouble = input.suit === 'S';
  const rawDamage = input.cardValue * (isDouble ? 2 : 1);
  const piercesShield = input.attacker.suit === 'C';
  const shieldBlocked = piercesShield ? 0 : Math.min(input.target.shield, rawDamage);
  const hpDamage = Math.min(input.target.hp, rawDamage - shieldBlocked);
  const lifesteal = input.suit === 'H' ? Math.min(input.attacker.maxHp - input.attacker.hp, hpDamage) : 0;

  return {
    effectiveSuit: input.suit,
    cardValue: input.cardValue,
    hasAce: input.hasAce,
    isImmune: false,
    isDouble,
    shieldBlocked,
    hpDamage,
    lifesteal,
    harvestDraws: input.suit === 'D' ? input.cardValue : 0,
    shieldGranted: 0,
  };
}
