/**
 * GameValidator — 出牌合法性校验
 * ★ 浸染机制重构：含 A 时豁免同花色校验，A 可将杂色牌全部浸染
 */
export function validatePlay(cards, declaredSuit = null) {
    const normalCards = cards.filter(c => c.rank !== 'A' && !c.isJoker);
    const aCards = cards.filter(c => c.rank === 'A');
    const jokers = cards.filter(c => c.isJoker);

    if (jokers.length > 0) return { valid: false, error: 'Joker不能作为普通攻击牌打出' };
    if (aCards.length > 1) return { valid: false, error: '一次出牌最多只能包含一张A' };

    if (normalCards.length === 0 && aCards.length === 1) {
        // 纯 A 单出：只能用自身花色
        const allowedSuits = [aCards[0].suit];
        if (declaredSuit && !allowedSuits.includes(declaredSuit))
            return { valid: false, error: `纯A只能使用自身花色 ${aCards[0].suit}` };
        return { valid: true, primarySuit: null, normalCards: [], hasA: true, declaredSuit: declaredSuit || aCards[0].suit };
    }

    const validLengths = [1, 3, 5];
    if (!validLengths.includes(normalCards.length)) {
        return { valid: false, error: '合法组合只能是1张, 3张, 或5张（不计入A）' };
    }

    const hasA = aCards.length === 1;

    if (hasA) {
        // ★ 浸染机制：有 A 时不校验同花色，校验 declaredSuit ∈ 组合中所有花色
        const allSuits = [...new Set(cards.filter(c => !c.isJoker).map(c => c.suit))];
        if (declaredSuit && !allSuits.includes(declaredSuit))
            return { valid: false, error: `浸染花色必须为组合中出现过的花色: ${allSuits.join('/')}` };
        return {
            valid: true,
            primarySuit: null,  // ★ 有 A 时不再强制 primarySuit
            normalCards, hasA: true,
            declaredSuit: declaredSuit || allSuits[0],
            allSuits
        };
    }

    // 无 A：正常同花色校验
    const primarySuit = normalCards[0].suit;
    const isSameSuit = normalCards.every(c => c.suit === primarySuit);
    if (!isSameSuit) return { valid: false, error: '多张牌出牌必须同花色' };

    return { valid: true, primarySuit, normalCards, hasA: false, declaredSuit: primarySuit };
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
 * ★ 浸染机制后：保留用于 GameEngine 后端二次校验
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

/**
 * 万化组合穷举计算器（浸染机制版）
 * ★ 含 A 时候选花色 = 组合中所有出现过的花色（A 可浸染杂色牌）
 * @param {Array} selectedCards - 玩家选中的卡牌
 * @returns {Array<{targetSuit, totalValue, isShield, effectHint, previewCards}>}
 */
export function calculateWildcardCombinations(selectedCards) {
    const normalCards = selectedCards.filter(c => c.rank !== 'A' && !c.isJoker);
    const aceCard = selectedCards.find(c => c.rank === 'A' && !c.isJoker);
    if (!aceCard) return [];

    // ★ 浸染机制：候选花色 = 组合中所有出现过的花色（去重）
    const possibleSuits = (typeof _ !== 'undefined'
        ? _.uniq(selectedCards.filter(c => !c.isJoker).map(c => c.suit))
        : [...new Set(selectedCards.filter(c => !c.isJoker).map(c => c.suit))]
    );

    const normalTotal = normalCards.reduce((sum, c) => sum + c.value, 0);
    const EFFECT_HINTS = { '♣': '🛡️ 转化为护盾', '♠': '⚔️ 黑桃双倍伤害', '♥': '💗 红桃吸血回复', '♦': '🌾 方块五谷摸牌' };

    return possibleSuits.map(targetSuit => ({
        targetSuit,
        totalValue: normalTotal + 1, // A 固定为 1
        isShield: (targetSuit === '♣'),
        effectHint: EFFECT_HINTS[targetSuit] || `⚔️ 主花色 ${targetSuit}`,
        previewCards: selectedCards.map(c => ({
            ...c,
            // ★ 浸染：所有牌（含A和普通牌）变成目标花色，展示最终效果
            suit: targetSuit
        }))
    }));
}

/**
 * 斗地主式智能可用牌推荐
 * 扫描手牌，找出所有合法出牌组合的索引
 * ★ 浸染机制后：含 A 时任意杂色牌也可组队，全部高亮
 * @param {Array} handCards - 玩家当前手牌
 * @returns {Set<number>} 可参与合法组合的卡牌索引
 */
export function findPlayableCombinations(handCards) {
    const playableIndices = new Set();
    const nonJokers = handCards.map((c, i) => ({ ...c, idx: i })).filter(c => !c.isJoker);

    // 1. 单张出牌：任何非 Joker 都可以单独出
    nonJokers.forEach(c => playableIndices.add(c.idx));

    // 2. 同花色组合（3张或5张）
    const bySuit = {};
    nonJokers.forEach(c => {
        if (!bySuit[c.suit]) bySuit[c.suit] = [];
        bySuit[c.suit].push(c);
    });

    for (const suit in bySuit) {
        const cards = bySuit[suit];
        if (cards.length >= 3) {
            cards.forEach(c => playableIndices.add(c.idx));
        }
        if (cards.length >= 5) {
            cards.forEach(c => playableIndices.add(c.idx));
        }
    }

    // 3. 含 A 组合：A + 任意数字牌（浸染机制：杂色也可组队）
    const aces = nonJokers.filter(c => c.rank === 'A');
    if (aces.length > 0) {
        // ★ A 可以和任何普通牌组合（不再要求同花色）
        nonJokers.forEach(c => playableIndices.add(c.idx));
    }

    return playableIndices;
}