import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveAceSuit } from '../src/wanhua-utils.ts';

// Minimal card shape for testing (matches Pick<Card, 'rank' | 'suit'>)
type TestCard = { rank: string; suit: string | null; isJoker?: boolean };

// ── Helpers ────────────────────────────────────────────────────────────────
function hand(...cards: TestCard[]): readonly (TestCard | undefined)[] {
  return cards;
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('deriveAceSuit', () => {
  it('returns suit of selected A card', () => {
    const h = hand(
      { rank: 'A', suit: 'H' },
      { rank: '3', suit: 'D' },
    );
    assert.equal(deriveAceSuit(h, new Set([0, 1])), 'H');
  });

  it('returns null when no A is in selection', () => {
    const h = hand(
      { rank: '5', suit: 'S' },
      { rank: '3', suit: 'D' },
    );
    assert.equal(deriveAceSuit(h, new Set([0, 1])), null);
  });

  it('uses first selected A when multiple A are present', () => {
    const h = hand(
      { rank: 'A', suit: 'S' },
      { rank: '3', suit: 'D' },
      { rank: 'A', suit: 'H' },
    );
    // Indices 0 and 2 are both A; 0 is first → suit should be 'S'
    assert.equal(deriveAceSuit(h, new Set([0, 1, 2])), 'S');
  });

  it('switches to new A suit when A card is changed', () => {
    const h = hand(
      { rank: 'A', suit: 'S' },
      { rank: '3', suit: 'D' },
      { rank: 'A', suit: 'H' },
    );
    // Only index 2 (♥A) selected
    assert.equal(deriveAceSuit(h, new Set([2, 1])), 'H');
  });

  it('returns null when selection is empty', () => {
    const h = hand({ rank: 'A', suit: 'C' });
    assert.equal(deriveAceSuit(h, new Set()), null);
  });

  it('returns null for A card with null suit (edge case)', () => {
    const h = hand({ rank: 'A', suit: null });
    assert.equal(deriveAceSuit(h, new Set([0])), null);
  });

  it('ignores Joker cards even if labeled rank A', () => {
    const h = hand(
      { rank: 'A', suit: null, isJoker: true },
      { rank: 'A', suit: 'D' },
    );
    // index 0 has no suit, index 1 should be picked
    assert.equal(deriveAceSuit(h, new Set([0, 1])), 'D');
  });

  it('派发参数中的花色等于 A 自身花色 — ♣A', () => {
    const h = hand(
      { rank: '7', suit: 'H' },
      { rank: 'A', suit: 'C' },
    );
    assert.equal(deriveAceSuit(h, new Set([0, 1])), 'C');
  });

  it('切换不同花色 A 后不使用旧花色', () => {
    const h = hand(
      { rank: 'A', suit: 'S' },
      { rank: '3', suit: 'D' },
      { rank: 'A', suit: 'D' },
    );
    // Deselect index-0 (♠A), only index-2 (♦A) remains with index-1
    const derivedOld = deriveAceSuit(h, new Set([0, 1]));
    const derivedNew = deriveAceSuit(h, new Set([2, 1]));
    assert.equal(derivedOld, 'S');
    assert.equal(derivedNew, 'D');
    assert.notEqual(derivedNew, derivedOld);
  });
});
