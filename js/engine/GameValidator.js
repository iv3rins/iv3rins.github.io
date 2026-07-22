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

/**
 * 万化组合穷举计算器（严格合法版）
 * 候选花色与 validateAceSuit 规则完全一致：
 *   - 含普通牌（executeAttack 已校验同花色）→ [A自身花色, primarySuit] 去重
 *   - 纯 A 单出 → 仅 [A自身花色]（唯一合法）
 * @param {Array} selectedCards - 玩家选中的卡牌
 * @returns {Array<{targetSuit, totalValue, isShield, effectHint, previewCards}>}
 */
export function calculateWildcardCombinations(selectedCards) {
    const normalCards = selectedCards.filter(c => c.rank !== 'A' && !c.isJoker);
    const aceCard = selectedCards.find(c => c.rank === 'A' && !c.isJoker);
    if (!aceCard) return [];

    // 候选花色：A 自身花色 + 普通牌主花色（普通牌同花色已由 executeAttack 保证）
    const primarySuit = normalCards.length > 0 ? normalCards[0].suit : null;
    const suits = [aceCard.suit, primarySuit].filter(Boolean);
    const possibleSuits = (typeof _ !== 'undefined' ? _.uniq(suits) : [...new Set(suits)]);

    const normalTotal = normalCards.reduce((sum, c) => sum + c.value, 0);
    const EFFECT_HINTS = { '♣': '🛡️ 转化为护盾', '♠': '⚔️ 黑桃双倍伤害', '♥': '💗 红桃吸血回复', '♦': '🌾 方块五谷摸牌' };

    return possibleSuits.map(targetSuit => ({
        targetSuit,
        totalValue: normalTotal + 1, // A 固定为 1
        isShield: (targetSuit === '♣'),
        effectHint: EFFECT_HINTS[targetSuit] || `⚔️ 主花色 ${targetSuit}`,
        previewCards: selectedCards.map(c => ({
            ...c,
            suit: c.rank === 'A' ? targetSuit : c.suit
        }))
    }));
}

/**
 * 斗地主式智能可用牌推荐
 * 扫描手牌，找出所有合法出牌组合的索引
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
            // 同花色 3 张：任何一张都可以作为组合的一部分
            cards.forEach(c => playableIndices.add(c.idx));
        }
        if (cards.length >= 5) {
            // 同花色 5 张
            cards.forEach(c => playableIndices.add(c.idx));
        }
    }

    // 3. 含 A 组合：A + 任意数字牌
    const aces = nonJokers.filter(c => c.rank === 'A');
    if (aces.length > 0) {
        // A 可以和任何普通牌组合
        nonJokers.forEach(c => playableIndices.add(c.idx));
    }

    return playableIndices;
}
