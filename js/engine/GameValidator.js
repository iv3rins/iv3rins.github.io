/**
 * GameValidator — 出牌合法性校验
 * Bug Fix: Ace 花色限制为二选一（A 自身花色 或 组合中其他牌花色）
 */
export function validatePlay(cards) {
    const normalCards = cards.filter(c => c.rank !== 'A' && !c.isJoker);
    const aCards = cards.filter(c => c.rank === 'A');
    const jokers = cards.filter(c => c.isJoker);

    if (jokers.length > 0) return { valid: false, error: 'Joker不能作为普通攻击牌打出' };
    if (aCards.length > 1) return { valid: false, error: '一次出牌最多只能包含一张A' };

    if (normalCards.length === 0 && aCards.length === 1) {
        return { valid: true, primarySuit: null, normalCards: [], hasA: true };
    }

    const validLengths = [1, 3, 5];
    if (!validLengths.includes(normalCards.length)) {
        return { valid: false, error: '合法组合只能是1张, 3张, 或5张（不计入A）' };
    }

    const primarySuit = normalCards[0].suit;
    const isSameSuit = normalCards.every(c => c.suit === primarySuit);
    if (!isSameSuit) return { valid: false, error: '多张牌出牌必须同花色' };

    return { valid: true, primarySuit, normalCards, hasA: aCards.length === 1 };
}

/**
 * 获取 Ace 可选花色列表：A 自身花色 + 其他选中牌的花色（去重）
 */
export function getAceAllowedSuits(aceCard, otherCards) {
    const otherSuits = otherCards
        .filter(c => !c.isJoker && c !== aceCard)
        .map(c => c.suit);
    return [...new Set([aceCard.suit, ...otherSuits])];
}

/**
 * 校验 Ace 花色合法性：aSuit 必须等于 A 自身花色 或 普通牌的 primarySuit
 */
export function validateAceSuit(aceCard, primarySuit, aSuit) {
    if (!aSuit) return { valid: false, error: 'A牌必须指定花色' };
    if (aSuit === aceCard.suit) return { valid: true };
    if (primarySuit && aSuit === primarySuit) return { valid: true };
    return {
        valid: false,
        error: `A牌花色只能为 ${aceCard.suit}(自身) 或 ${primarySuit || '组合花色'}`,
        allowed: [...new Set([aceCard.suit, primarySuit].filter(Boolean))]
    };
}
