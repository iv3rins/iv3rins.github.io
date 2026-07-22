/**
 * gameUI — 游戏局内渲染
 * 对手卡牌、自己状态、手牌、回合 UI、A 牌面板、目标选择、出牌执行
 */
import { G } from '../state.js';
import { getAceAllowedSuits } from '../engine/GameValidator.js';
import { Toast } from './toast.js';
import { AudioManager } from '../audioManager.js';

// ═══ 渲染入口 ═══

let _prevState = null;  // 用于检测变化以触发 VFX

export function renderState(state) {
    G.currentState = state;
    const me = state.players[state.myPlayerId];
    const isSpectating = me && me.isEliminated;

    // ★ VFX: lastAction 优先（引擎显式触发）
    if (state.lastAction) {
        const la = state.lastAction;
        if (la.type === 'damage') {
            setTimeout(() => showDamageFloat(la.targetId, la.amount), 100);
        } else if (la.type === 'shield') {
            setTimeout(() => showHealFloat(la.targetId, la.amount), 100);
        }
    } else if (_prevState) {
        state.players.forEach((p, i) => {
            const prev = _prevState.players[i];
            if (!prev || p.isEliminated !== prev.isEliminated) return;
            const curChar = p.characters[p.activeCharIndex];
            const prevChar = prev.characters[prev.activeCharIndex];
            if (!curChar || !prevChar) return;
            const hpDelta = prevChar.hp - curChar.hp;
            const shieldDelta = curChar.shield - prevChar.shield;
            if (hpDelta > 0) {
                showDamageFloat(i, hpDelta);
            } else if (hpDelta < 0) {
                showHealFloat(i, -hpDelta);
            }
        });
        // 发牌动画：手牌数增加了
        if (me && me.hand && _prevState.players[state.myPlayerId]?.hand) {
            const prevLen = _prevState.players[state.myPlayerId].hand?.length || 0;
            if (me.hand.length > prevLen) {
                // 延迟等 DOM 渲染后再触发
                setTimeout(() => markNewCardsAsDealt(prevLen, me.hand), 50);
            }
        }
    }
    _prevState = JSON.parse(JSON.stringify(state));

    const gamePage = document.getElementById('page-game');
    if (isSpectating) gamePage.classList.add('spectator-mode');
    else gamePage.classList.remove('spectator-mode');

    const deckInfo = document.getElementById('deck-info');
    if (deckInfo) {
        const cur = state.players[state.currentPlayerIndex];
        deckInfo.textContent = `🎴 牌堆: ${state.deckCount} | 回合 ${state.roundCount} | 当前: ${cur ? cur.name : '--'}`;
    }

    renderOpponents(state);
    renderSelf(state);

    if (!isSpectating && me && me.hand) renderHand(me.hand);
    else document.getElementById('hand-container').innerHTML = '';

    updateTurnUI(state);

    if (G._pendingClear) {
        G.selectedTargetId = -1;
        G.selectedCardIndices = [];
        G._pendingClear = false;
        hideAValuePanel();
    }
}

// ═══ 对手区 ═══

export function renderOpponents(state) {
    const container = document.getElementById('opponents-container');
    container.innerHTML = '';
    const me = state.players[state.myPlayerId];
    const isMyTurn = state.currentPlayerIndex === state.myPlayerId;
    const isSpectating = me && me.isEliminated;

    state.players.forEach((p, i) => {
        if (i === state.myPlayerId) return;
        container.appendChild(createPlayerCard(p, i, false, isMyTurn && !isSpectating, state));
    });
}

export function renderSelf(state) {
    const container = document.getElementById('self-container');
    container.innerHTML = '';
    const me = state.players[state.myPlayerId];
    if (!me) return;
    container.appendChild(createPlayerCard(me, state.myPlayerId, true, false, state));
}

// ═══ 玩家卡片 ═══

export function createPlayerCard(p, idx, isSelf, isTargetable, state) {
    const div = document.createElement('div');
    div.className = 'player-card';
    if (isTargetable) div.classList.add('targetable');
    if (G.selectedTargetId === idx) div.classList.add('targeted');
    div.dataset.playerId = idx;

    const aliveChar = p.characters.find(c => !c.isDead);
    const displayChar = aliveChar || p.characters[p.activeCharIndex];
    const isRed = displayChar.suit === '♦' || displayChar.suit === '♥';
    const suitClass = isRed ? 'suit-red' : 'suit-black';

    const avatar = p.isEliminated ? '😭' : (G.playerAvatars[idx] || G.avatars[idx % G.avatars.length]);
    const avatarCls = p.isEliminated ? '' : 'cute-bounce';
    const nameHtml = isSelf
        ? `<div class="name">${p.name} (你)</div>`
        : `<div class="name">${p.name}${p.isEliminated ? ' 💀' : ''}</div>`;

    const hpPct = displayChar.maxHp > 0 ? (displayChar.hp / displayChar.maxHp * 100) : 0;
    const shPct = displayChar.maxHp > 0 ? (displayChar.shield / displayChar.maxHp * 100) : 0;

    const roleHtml = p.isEliminated
        ? '<span class="role" style="color:#b2bec3">已淘汰</span>'
        : `<span class="role ${suitClass}">${displayChar.suit}${displayChar.rank}</span>`;

    const charDots = p.characters.map(c =>
        `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 2px;background:${c.isDead ? '#dfe6e9' : '#55efc4'}"></span>`
    ).join('');

    div.innerHTML = `
        ${nameHtml}
        <div class="avatar ${avatarCls}">${avatar}</div>
        ${roleHtml}
        <div style="font-size:10px;color:#636e72">${displayChar.hp}/${displayChar.maxHp}${displayChar.shield > 0 ? ' +' + displayChar.shield + '🛡' : ''}</div>
        <div class="status-bar">
            <div class="status-hp" style="width:${hpPct}%"></div>
            <div class="status-shield" style="width:${shPct}%"></div>
        </div>
        <div style="margin-top:4px">${charDots}</div>
        <div class="hand-count">${p.handCount}</div>
    `;

    if (idx === state.currentPlayerIndex && !p.isEliminated) {
        const ind = document.createElement('div');
        ind.className = 'current-turn-indicator';
        ind.textContent = '⚡';
        div.appendChild(ind);
    }

    if (isTargetable) div.addEventListener('click', () => selectTarget(idx, div));
    return div;
}

export function selectTarget(playerId, el) {
    document.querySelectorAll('.player-card.targeted').forEach(c => c.classList.remove('targeted'));
    G.selectedTargetId = playerId;
    el.classList.add('targeted');
    updateActionButtonUI();
}

// ═══ 动态按钮文字（Task 2） ═══

export function updateActionButtonUI() {
    const btn = document.getElementById('attack-btn');
    if (!btn) return;

    const state = G.currentState;
    if (!state || state.currentPlayerIndex !== state.myPlayerId) return;

    const myHand = state.players[state.myPlayerId]?.hand;
    if (!myHand || G.selectedCardIndices.length === 0) {
        btn.textContent = '🃏 等待选牌...';
        btn.disabled = true;
        return;
    }

    const selectedCards = G.selectedCardIndices.map(i => myHand[i]).filter(Boolean);
    const nonJokers = selectedCards.filter(c => !c.isJoker);
    const hasJoker = selectedCards.some(c => c.isJoker);
    const hasA = selectedCards.some(c => c.rank === 'A' && !c.isJoker);

    // A 牌当前选的花色
    let currentASuit = null;
    if (hasA) {
        const suitSel = document.getElementById('a-suit-select');
        currentASuit = suitSel ? suitSel.value : null;
    }

    // 护盾判定：全♣ 或 A 万化为 ♣
    const isShield = (nonJokers.length > 0 && nonJokers.every(c => c.suit === '♣') && !hasA)
        || (hasA && currentASuit === '♣');

    if (hasJoker) {
        btn.textContent = '🃏 Joker 特殊行动';
        btn.disabled = G.selectedTargetId < 0;
    } else if (isShield) {
        if (G.selectedTargetId >= 0) {
            document.querySelectorAll('.player-card.targeted').forEach(c => c.classList.remove('targeted'));
            G.selectedTargetId = -1;
        }
        btn.textContent = '🛡️ 给自己加护盾';
        btn.disabled = false;
    } else {
        btn.textContent = G.selectedTargetId >= 0
            ? '⚔️ 发起攻击！'
            : '⚔️ 选择一个玩家，发起攻击';
        btn.disabled = G.selectedTargetId < 0;
    }
}

// ═══ 手牌 ═══

export function renderHand(cards) {
    const container = document.getElementById('hand-container');
    container.innerHTML = '';
    cards.forEach((card, i) => {
        const div = document.createElement('div');
        div.className = 'poker-card';
        div.dataset.index = i;
        if (G.selectedCardIndices && G.selectedCardIndices.length > 0 && G.selectedCardIndices.includes(i)) div.classList.add('selected');
        if (card.isJoker) {
            div.classList.add('card-joker');
            div.innerHTML = '<span>🃏</span><span style="font-size:14px">Joker</span>';
        } else {
            const isRed = card.suit === '♦' || card.suit === '♥';
            div.classList.add(isRed ? 'suit-red' : 'suit-black');
            div.innerHTML = `<span>${card.suit}</span><span>${card.rank}</span>`;
        }
        div.addEventListener('click', () => toggleCard(i, div));
        container.appendChild(div);
    });
}

export function toggleCard(index, el) {
    const pos = G.selectedCardIndices.indexOf(index);
    if (pos >= 0) {
        G.selectedCardIndices.splice(pos, 1);
        el.classList.remove('selected');
    } else {
        G.selectedCardIndices.push(index);
        el.classList.add('selected');
    }
    updateAValuePanel();
    updateActionButtonUI();  // ★ 动态按钮文字
}

// ═══ 回合 UI ═══

export function updateTurnUI(state) {
    const isMyTurn = state.currentPlayerIndex === state.myPlayerId;
    const me = state.players[state.myPlayerId];
    const isSpectating = me && me.isEliminated;
    const actionArea = document.getElementById('action-area');
    const btn = document.getElementById('attack-btn');
    const aPanel = document.getElementById('a-value-panel');

    if (isSpectating) {
        actionArea.style.visibility = 'hidden';
        clearTimer();
    } else if (isMyTurn) {
        actionArea.style.visibility = 'visible';
        if (aPanel) aPanel.style.display = '';
        updateActionButtonUI();
        startTimer();
    } else {
        // 非自己回合：隐藏 A 面板，检测是否只选了 Joker 可插队
        actionArea.style.visibility = 'visible';
        if (aPanel) { aPanel.classList.remove('show'); aPanel.style.display = 'none'; }
        clearTimer();
        // 检测是否选中了纯 Joker
        const myHand = state.players[state.myPlayerId]?.hand;
        const selectedCards = myHand && G.selectedCardIndices.length > 0
            ? G.selectedCardIndices.map(i => myHand[i]).filter(Boolean) : [];
        const onlyJoker = selectedCards.length > 0 && selectedCards.every(c => c.isJoker);
        if (onlyJoker && G.selectedTargetId >= 0) {
            btn.textContent = '🃏 使用 Joker (插队)';
            btn.disabled = false;
        } else {
            const cur = state.players[state.currentPlayerIndex];
            btn.textContent = `⏳ 等待 ${cur?.name || '...'} 出牌...`;
            btn.disabled = true;
        }
    }
}

// ═══ A 牌面板（Bug Fix：仅显示 Ace 自身花色 + 组合中其他牌花色） ═══

export function updateAValuePanel() {
    const panel = document.getElementById('a-value-panel');
    const state = G.currentState;
    if (!state || !panel) return;
    const myHand = state.players[state.myPlayerId]?.hand;
    if (!myHand) { panel.classList.remove('show'); return; }

    const selectedCards = G.selectedCardIndices.map(i => myHand[i]).filter(Boolean);
    const aceCard = selectedCards.find(c => c.rank === 'A' && !c.isJoker);
    const hasA = !!aceCard;

    if (!hasA) { panel.classList.remove('show'); return; }

    panel.classList.add('show');
    const allowedSuits = getAceAllowedSuits(aceCard, selectedCards);
    const suitSel = document.getElementById('a-suit-select');
    if (suitSel) {
        const currentValue = suitSel.value;
        suitSel.innerHTML = allowedSuits.map(s =>
            `<option value="${s}" ${s === currentValue ? 'selected' : ''}>${s} ${s === '♦' ? '方块' : s === '♣' ? '梅花' : s === '♥' ? '红桃' : '黑桃'}</option>`
        ).join('');
    }
}

export function hideAValuePanel() {
    const panel = document.getElementById('a-value-panel');
    if (panel) panel.classList.remove('show');
}

// ═══ 出牌执行 ═══

export function executeAttack() {
    if (G.selectedCardIndices.length === 0) { Toast.show('请先选择要打出的牌！🐾', 'error'); return; }

    const state = G.currentState;
    if (!state) return;
    const myHand = state.players[state.myPlayerId]?.hand;
    if (!myHand) return;

    const selectedCards = G.selectedCardIndices.map(i => myHand[i]).filter(Boolean);
    const hasJoker = selectedCards.some(c => c.isJoker);
    const nonJokers = selectedCards.filter(c => !c.isJoker);
    const hasA = selectedCards.some(c => c.rank === 'A' && !c.isJoker);

    // A 牌当前花色
    let aSuit = null;
    if (hasA) {
        const suitSel = document.getElementById('a-suit-select');
        aSuit = suitSel ? suitSel.value : null;
    }

    // 护盾判定
    const isShield = (nonJokers.length > 0 && nonJokers.every(c => c.suit === '♣') && !hasA)
        || (hasA && aSuit === '♣');

    if (!isShield && !hasJoker && G.selectedTargetId < 0) {
        Toast.show('请先选择一个攻击目标！🐾', 'error'); return;
    }
    if (hasJoker && G.selectedTargetId < 0) {
        Toast.show('Joker 需要指定目标！🐾', 'error'); return;
    }

    // 飞行动画
    const animLayer = document.getElementById('anim-layer');
    G.selectedCardIndices.forEach((ci, idx) => {
        const card = document.querySelector(`.poker-card[data-index="${ci}"]`);
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const clone = card.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.left = rect.left + 'px';
        clone.style.top = rect.top + 'px';
        clone.style.margin = '0';
        clone.style.animation = `attackDash 0.5s ease-in forwards ${idx * 0.05}s`;
        animLayer.appendChild(clone);
        setTimeout(() => clone.remove(), 600);
    });

    // Ace 花色（仅限允许的花色，固定值=1）
    let aSuit = null;
    if (selectedCards.some(c => c.rank === 'A' && !c.isJoker)) {
        const suitSel = document.getElementById('a-suit-select');
        aSuit = suitSel ? suitSel.value : null;
    }

    const payload = {
        targetPlayerId: isShield ? state.myPlayerId : G.selectedTargetId,
        cardIndices: [...G.selectedCardIndices],
        aSuit,
    };

    G._pendingClear = true;
    // ★ 立即清除选中状态，防止残留
    G.selectedCardIndices = [];
    G.selectedTargetId = -1;
    hideAValuePanel();

    if (G.isHost) {
        try { processPlayCard(G.myPlayerId, payload); }
        catch (err) { Toast.show('出牌失败: ' + err.message, 'error'); G._pendingClear = false; }
    } else {
        G.p2p.sendMessage({ type: 'PLAY_CARD', payload });
    }
}

// 由 main.js 注入（避免循环依赖）
let processPlayCard = null;
export function setProcessPlayCard(fn) { processPlayCard = fn; }
export function getProcessPlayCard() { return processPlayCard; }

// ═══ 倒计时 ═══

export function startTimer() {
    clearTimer();
    const tb = document.querySelector('.timer-bar-bg');
    if (tb) { tb.classList.remove('timer-active'); void tb.offsetWidth; tb.classList.add('timer-active'); }
    G.timerTimeout = setTimeout(() => forceRandomPlay(), 30000);
}

export function clearTimer() {
    if (G.timerTimeout) { clearTimeout(G.timerTimeout); G.timerTimeout = null; }
    const tb = document.querySelector('.timer-bar-bg');
    if (tb) tb.classList.remove('timer-active');
}

function forceRandomPlay() {
    const cards = document.querySelectorAll('#hand-container .poker-card');
    const targets = document.querySelectorAll('#opponents-container .player-card.targetable');
    if (cards.length > 0 && targets.length > 0) {
        cards[Math.floor(Math.random() * cards.length)].click();
        targets[Math.floor(Math.random() * targets.length)].click();
        setTimeout(executeAttack, 400);
    }
}

// ═══ VFX: 飘字 / 受击 / 回血 ═══

export function showDamageFloat(playerId, amount) {
    const card = document.querySelector(`.player-card[data-player-id="${playerId}"]`);
    if (!card) return;
    const el = document.createElement('div');
    el.className = 'damage-text';
    el.textContent = `-${amount}`;
    card.appendChild(el);
    requestAnimationFrame(() => el.classList.add('fly'));
    setTimeout(() => el.remove(), 900);
    triggerHitShake(playerId);
    AudioManager.play('attack');
}

export function showHealFloat(playerId, amount) {
    const card = document.querySelector(`.player-card[data-player-id="${playerId}"]`);
    if (!card) return;
    const el = document.createElement('div');
    el.className = 'heal-text';
    el.textContent = `+${amount}`;
    card.appendChild(el);
    requestAnimationFrame(() => el.classList.add('fly'));
    setTimeout(() => el.remove(), 900);
    triggerHealAnim(playerId);
    AudioManager.play('heal');
}

function triggerHitShake(playerId) {
    const card = document.querySelector(`.player-card[data-player-id="${playerId}"]`);
    if (!card) return;
    card.classList.add('hit-shake');
    setTimeout(() => card.classList.remove('hit-shake'), 500);
}

function triggerHealAnim(playerId) {
    const card = document.querySelector(`.player-card[data-player-id="${playerId}"]`);
    if (!card) return;
    card.classList.add('heal-anim');
    setTimeout(() => card.classList.remove('heal-anim'), 700);
}

/** 给手牌中的新卡添加发牌动画 */
export function markNewCardsAsDealt(prevHandLength, currentCards) {
    const container = document.getElementById('hand-container');
    if (!container) return;
    const allCards = container.querySelectorAll('.poker-card');
    for (let i = prevHandLength; i < allCards.length; i++) {
        allCards[i].classList.add('card-deal-anim');
        allCards[i].style.setProperty('--deal-delay', `${(i - prevHandLength) * 0.08}s`);
    }
    if (currentCards.length > prevHandLength) AudioManager.play('draw');
}
