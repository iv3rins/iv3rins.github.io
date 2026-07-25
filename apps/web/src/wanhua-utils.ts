import type { Card } from '@pokewar/domain';

type HandSlice = readonly (Pick<Card, 'rank' | 'suit'> | undefined)[];

/**
 * 万化花色派生规则 (RULES.md §2.7)
 *
 * 优先级：
 *  1. 被万化牌（非 A）全部同花色 → 使用该花色（A 染入非 A 牌的花色组）
 *  2. 被万化牌花色不统一 / 无非 A 牌 → 使用 A 牌自身花色
 *
 * 单张 A 出牌走 validation.ts 的单张路径，不需要 declaredSuit，调用方无需处理。
 */
export function deriveWanhuaSuit(
  hand: HandSlice,
  selected: ReadonlySet<number>,
): Card['suit'] | null {
  const sel = [...selected].map(i => hand[i]).filter((c): c is NonNullable<typeof c> => c != null);

  const nonAceSuits = new Set(
    sel.filter(c => c.rank !== 'A' && c.suit != null).map(c => c.suit as Card['suit']),
  );

  // 被万化牌花色唯一 → 使用该花色
  if (nonAceSuits.size === 1) {
    return [...nonAceSuits][0] ?? null;
  }

  // 否则回退到 A 牌自身花色
  const aceCard = sel.find(c => c.rank === 'A' && c.suit != null);
  return (aceCard?.suit as Card['suit']) ?? null;
}

/**
 * @deprecated 已被 deriveWanhuaSuit 替代；仅供旧调用方过渡使用。
 */
export function deriveAceSuit(
  hand: HandSlice,
  selected: ReadonlySet<number>,
): Card['suit'] | null {
  return deriveWanhuaSuit(hand, selected);
}
