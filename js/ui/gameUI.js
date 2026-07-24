/**
 * gameUI — 游戏局内渲染
 * 对手卡牌、自己状态、手牌、回合 UI、A 牌面板、目标选择、出牌执行
 */
import { G } from '../state.js';
import { findPlayableCombinations } from '../engine/GameValidator.js';
import { Toast } from './toast.js';
import { audioManager } from '../audioManager.js';
// ★ 选将后广播状态（由 networkHandler.js 延迟注入以避免循环依赖）
let _broadcastSyncState = null;
export function injectBroadcastSyncState(fn) { _broadcastSyncState = fn; }
function broadcastSyncState() { if (_broadcastSyncState) _broadcastSyncState(); else console.warn('[gameUI] broadcastSyncState 尚未注入'); }

let _prevState = null;  // 用于检测变化以触发 VFX

export function renderState(state) {
    G.currentState = state;
    // ★ 防御：myPlayerId 可能是 0 (falsy)，禁止用 !myPlayerId 判定
    const myId = state.myPlayerId !== undefined ? state.myPlayerId : 0;
    const me = state.players[myId];
    const isSpectating = me && me.isEliminated;
    console.log('[renderState] myId:', myId, 'phase:', state.phase, 'handLen:', me?.hand?.length, 'starterSelected:', me?.starterSelected);

    // ★ Bug4: 选将阶段
    if (state.phase === 'SELECTING_STARTER') {
        if (me && !me.starterSelected) {
            showStarterModal(me);
        } else {
            hideStarterModal();
            // 已选完，等待他人
            const waitingCount = state.players.filter(p => !p.starterSelected).length;
            const deckInfo = document.getElementById('deck-info');
            if (deckInfo) deckInfo.textContent = `⏳ 等待 ${waitingCount} 人选将...`;
        }
        renderOpponents(state);
        renderSelf(state);
        return;
    }
    hideStarterModal();

    // ★ Bug3: 濒死救援阶段
    if (state.phase === 'WAITING_FOR_JOKER' && state.dyingInfo) {
        showDyingModal(state);
    } else {
        hideDyingModal();
    }

    const gamePage = document.getElementById('page-game');
    if (isSpectating) gamePage.classList.add('spectator-mode');
    else gamePage.classList.remove('spectator-mode');

    const deckInfo = document.getElementById('deck-info');
    if (deckInfo) {
        const cur = state.players[state.currentPlayerIndex];
        deckInfo.textContent = `🎴 牌堆: ${state.deckCount} | 回合 ${state.turnCount || state.roundCount || 1} | 当前: ${cur ? cur.name : '--'}`;
    }

    renderOpponents(state);
    renderSelf(state);

    if (!isSpectating && me && me.hand) {
        renderHand(me.hand);
        if (state.currentPlayerIndex === state.myPlayerId) {
            markSuggestedCards(me.hand);
        }
    }
    else document.getElementById('hand-container').innerHTML = '';

    // ★ VFX/音效必须在 renderOpponents/renderSelf 之后执行（否则 DOM 被 innerHTML='' 清掉）
    if (state.lastAction) {
        const { type, targetId, amount } = state.lastAction;
        const cardEl = document.querySelector(`.player-card[data-player-id="${targetId}"]`);
        if (cardEl) {
            const vfx = document.createElement('div');
            vfx.className = `vfx-popup ${type === 'damage' ? 'vfx-dmg' : 'vfx-shd'}`;
            vfx.textContent = type === 'damage' ? `-${amount}` : `+${amount} 🛡️`;
            cardEl.appendChild(vfx);

            if (type === 'damage') {
                cardEl.classList.add('card-shake');
                audioManager.play('attack');
            } else {
                audioManager.play('heal');
                audioManager.play('shield');
            }

            // ★ 屏幕特效：攻击=刀光，护盾=光圈
            if (typeof playVisualEffect === 'function') {
                playVisualEffect(targetId, type === 'damage' ? 'attack' : 'shield');
            }

            setTimeout(() => {
                vfx.remove();
                cardEl.classList.remove('card-shake');
            }, 1200);
        }
    } else if (_prevState) {
        state.players.forEach((p, i) => {
            const prev = _prevState.players[i];
            if (!prev || p.isEliminated !== prev.isEliminated) return;
            const curChar = p.characters[p.activeCharIndex];
            const prevChar = prev.characters[prev.activeCharIndex];
            if (!curChar || !prevChar) return;
            const hpDelta = prevChar.hp - curChar.hp;
            if (hpDelta > 0) showDamageFloat(i, hpDelta);
            else if (hpDelta < 0) showHealFloat(i, -hpDelta);
        });
        if (me && me.hand && _prevState.players[state.myPlayerId]?.hand) {
            const prevLen = _prevState.players[state.myPlayerId].hand?.length || 0;
            if (me.hand.length > prevLen) {
                setTimeout(() => markNewCardsAsDealt(prevLen, me.hand), 50);
            }
        }
    }
    _prevState = JSON.parse(JSON.stringify(state));

    updateTurnUI(state);

    if (G._pendingClear) {
        G.selectedTargetId = -1;
        G.selectedCardIndices = [];
        G._pendingClear = false;
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

    const aliveChar = p.characters.find(c => !c.isDead && !c.isDying);
    // ★ 优先用 activeCharIndex 指向的角色（护盾/HP 都在这个角色上）
    const charIdx = p.activeCharIndex >= 0 ? p.activeCharIndex : 0;
    const displayChar = p.characters[charIdx] || aliveChar || p.characters[0];
    const isRed = displayChar.suit === '♦' || displayChar.suit === '♥';
    const suitClass = isRed ? 'suit-red' : 'suit-black';

    const avatar = p.isEliminated ? '😭' : (G.playerAvatars[idx] || G.avatars[idx % G.avatars.length]);
    const avatarCls = p.isEliminated ? '' : 'cute-bounce';
    const nameHtml = isSelf
        ? `<div class="name">${p.name} (你)</div>`
        : `<div class="name">${p.name}${p.isEliminated ? ' 💀' : ''}</div>`;

    const hpPct = displayChar.maxHp > 0 ? (displayChar.hp / displayChar.maxHp * 100) : 0;
    const shPct = displayChar.maxHp > 0 ? (displayChar.shield / displayChar.maxHp * 100) : 0;
    console.log('[createPlayerCard]', p.name, 'idx:', idx, 'hp:', displayChar.hp, 'shield:', displayChar.shield, 'shPct:', shPct.toFixed(1) + '%', 'activeIdx:', p.activeCharIndex);

    const roleHtml = p.isEliminated
        ? '<span class="role eliminated">已淘汰</span>'
        : `<span class="role ${suitClass}">${displayChar.suit}${displayChar.rank}</span>`;

    const charDots = p.characters.map(c =>
        `<span class="char-dot ${c.isDead ? 'dead' : c.isDying ? 'dying' : 'alive'}"></span>`
    ).join('');

    div.innerHTML = `
        ${nameHtml}
        <div class="avatar ${avatarCls}">${avatar}</div>
        ${roleHtml}
        <div class="hp-text">${displayChar.hp}/${displayChar.maxHp}${displayChar.shield > 0 ? ' +' + displayChar.shield + '🛡' : ''}</div>
        ${(() => {
            const lives = displayChar.lives !== undefined ? displayChar.lives : 0;
            const max = displayChar.maxLives || 3;
            let h = ''; for (let i = 0; i < max; i++) h += (i < lives ? '❤️' : '🤍');
            return '<div style="font-size:10px">' + h + '</div>';
        })()}
        <div class="status-bar" data-shield="${displayChar.shield}">
            <div class="status-hp" style="width:${hpPct}%"></div>
            ${displayChar.shield > 0 ? `<div class="status-shield" style="width:${shPct}%"></div>` : ''}
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
    const wanhuaBtn = document.getElementById('wanhua-btn');
    if (!btn) return;

    const state = G.currentState;
    if (!state || state.currentPlayerIndex !== state.myPlayerId) {
        if (wanhuaBtn) wanhuaBtn.style.display = 'none';
        return;
    }

    const myHand = state.players[state.myPlayerId]?.hand;
    if (!myHand || G.selectedCardIndices.length === 0) {
        btn.textContent = '出牌';
        btn.disabled = true;
        if (wanhuaBtn) wanhuaBtn.style.display = 'none';
        G.declaredSuit = null;
        return;
    }

    const selectedCards = G.selectedCardIndices.map(i => myHand[i]).filter(Boolean);
    const nonJokers = selectedCards.filter(c => !c.isJoker);
    const hasJoker = selectedCards.some(c => c.isJoker);
    const aCount = selectedCards.filter(c => c.rank === 'A' && !c.isJoker).length;

    // ★ 万化按钮：恰好 1 张 A 时显示，文字简洁
    if (wanhuaBtn) {
        wanhuaBtn.style.display = (aCount === 1 && !hasJoker) ? '' : 'none';
        wanhuaBtn.textContent = G.declaredSuit ? `✨ ${G.declaredSuit}` : '万化';
    }
    if (aCount !== 1) G.declaredSuit = null;

    const isPureClub = nonJokers.length > 0 && nonJokers.every(c => c.suit === '♣') && aCount === 0;

    if (hasJoker) {
        btn.textContent = '出牌';
        btn.disabled = G.selectedTargetId < 0;
    } else if (isPureClub) {
        if (G.selectedTargetId >= 0) {
            document.querySelectorAll('.player-card.targeted').forEach(c => c.classList.remove('targeted'));
            G.selectedTargetId = -1;
        }
        btn.textContent = '出牌';
        btn.disabled = false;
    } else if (aCount === 1 && !G.declaredSuit) {
        btn.textContent = '出牌';
        btn.disabled = true;
    } else if (aCount === 1 && G.declaredSuit === '♣') {
        if (G.selectedTargetId >= 0) {
            document.querySelectorAll('.player-card.targeted').forEach(c => c.classList.remove('targeted'));
            G.selectedTargetId = -1;
        }
        btn.textContent = '出牌';
        btn.disabled = false;
    } else {
        btn.textContent = '出牌';
        btn.disabled = G.selectedTargetId < 0;
    }
}

// 计算合体总效能（普通牌 + aValue）
function calcComboValue(cards) {
    return cards.filter(c => !c.isJoker && c.rank !== 'A').reduce((s, c) => s + c.value, 0) + (G.aValue || 1);
}

// ═══ 手牌 ═══

let _prevHandCount = 0;

export function renderHand(cards) {
    const container = document.getElementById('hand-container');
    if (!container) { console.warn('[renderHand] hand-container not found'); return; }
    const prevCount = container.children.length;
    container.innerHTML = '';
    container.offsetHeight; // ★ 强制重排：确保浏览器完成 DOM 清除的布局计算
    
    cards.forEach((card, i) => {
        const div = document.createElement('div');
        div.className = 'poker-card';
        div.dataset.index = i;

        if (G.selectedCardIndices && G.selectedCardIndices.length > 0 && G.selectedCardIndices.includes(i)) div.classList.add('selected');

        // ★ Joker 优先判断（无花色，防止 null-pointer）
        if (card.isJoker) {
            div.classList.add('card-joker');
            div.innerHTML = '<span>🃏</span><span style="font-size:14px">Joker</span>';
        } else if (card.suit === '♥' || card.suit === '♦') {
            div.classList.add('suit-red');
            div.innerHTML = `<span>${card.suit}</span><span>${card.rank}</span>`;
        } else if (card.suit === '♠' || card.suit === '♣') {
            div.classList.add('suit-black');
            div.innerHTML = `<span>${card.suit}</span><span>${card.rank}</span>`;
        } else {
            // 兜底：未知花色
            div.innerHTML = `<span>${card.suit || '?'}</span><span>${card.rank}</span>`;
        }

        div.addEventListener('click', () => toggleCard(i, div));
        container.appendChild(div);
    });

    // ★ 强制重排：在设置动画类之前确保所有 DOM 节点都已布局
    container.offsetHeight;

    // ★ Staggered dealing：必须先设置 animationDelay，再添加 deal-stagger 类
    //    因为 CSS animation 简写会重置 delay 为 0s，inline style 必须先生效
    cards.forEach((card, i) => {
        const isNewCard = (i >= prevCount - 1 || prevCount === 0);
        if (!isNewCard) return;
        const el = container.children[i];
        if (!el) return;
        const delay = 60 + i * 50;
        setTimeout(() => {
            // ★ 关键：先设置 animationDelay，再添加动画类（避免 CSS 简写覆盖）
            el.style.animationDelay = (i * 50) + 'ms';
            el.classList.add('deal-stagger');
        }, delay);
    });

    // ★ 渲染后调用推荐提示 + 最终强制重排
    container.offsetHeight;
    highlightRecommendedCards(cards);

    // ★ 兜底：500ms 后强制移除残留的 opacity:0（防止动画永不触发导致卡牌永久不可见）
    setTimeout(() => {
        const allCards = container.querySelectorAll('.poker-card.deal-stagger');
        allCards.forEach(el => {
            const cs = getComputedStyle(el);
            if (cs.opacity === '0') {
                console.warn('[renderHand] 幽灵卡牌检测 — 强制刷新 card', el.dataset.index);
                el.style.opacity = '1';
                el.style.animation = 'none';
            }
        });
    }, 550);
}

// ═══ 全屏中央出牌播报 ═══
export function playActionBroadcast(attackerName, targetName, suit, rank, actionType) {
    const overlay = document.createElement('div');
    overlay.className = 'broadcast-overlay';
    const isRed = suit === '♦' || suit === '♥';
    const isJoker = (suit === '🃏' || suit === null);
    const suitColor = isJoker ? '#cba6f7' : (isRed ? '#ff6b6b' : '#ffffff');
    const actionText = actionType === 'shield' ? '🛡️ 使用护盾' : actionType === 'joker' ? '🃏 使用 Joker' : '⚔️ 打出攻击';

    overlay.innerHTML = `
        <div class="broadcast-backdrop"></div>
        <div class="broadcast-card-icon" style="color:${suitColor}">${isJoker ? '🃏' : suit + rank}</div>
        <div class="broadcast-text">【${attackerName}】对【${targetName}】${actionText}！</div>
    `;
    document.body.appendChild(overlay);

    // 入场动画
    requestAnimationFrame(() => {
        overlay.classList.add('broadcast-in');
    });

    // 退场
    setTimeout(() => {
        overlay.classList.remove('broadcast-in');
        overlay.classList.add('broadcast-out');
        setTimeout(() => overlay.remove(), 500);
    }, 1500);
}

/**
 * ★ 系统推荐出牌：自动找出同花色或万化A，加上 gold 发光边框
 */
export function highlightRecommendedCards(cards) {
    if (!G.currentState) return;
    const me = G.currentState.players[G.myPlayerId];
    if (!me || G.currentState.currentPlayerIndex !== G.myPlayerId) return;

    const nonJokers = cards.filter(c => !c.isJoker);
    const suitCounts = {};
    nonJokers.forEach(c => { if (c.suit) suitCounts[c.suit] = (suitCounts[c.suit]||0)+1; });
    const primarySuit = Object.entries(suitCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];

    const handEls = document.querySelectorAll('#hand-container .poker-card');
    handEls.forEach(el => el.classList.remove('recommended'));

    nonJokers.forEach((card, i) => {
        const el = handEls[i];
        if (!el) return;
        if (card.rank === 'A' || card.suit === primarySuit) {
            el.classList.add('recommended');
        }
    });
}

export function toggleCard(index, el) {
    const pos = G.selectedCardIndices.indexOf(index);
    if (pos >= 0) {
        G.selectedCardIndices.splice(pos, 1);
        el.classList.remove('selected');
        audioManager.play('select');
    } else {
        G.selectedCardIndices.push(index);
        el.classList.add('selected');
        audioManager.play('select');
    }
    updateActionButtonUI();
}

// ═══ 回合 UI ═══

export function updateTurnUI(state) {
    const isMyTurn = state.currentPlayerIndex === state.myPlayerId;
    const me = state.players[state.myPlayerId];
    const isSpectating = me && me.isEliminated;
    const actionArea = document.getElementById('action-area');
    const btn = document.getElementById('attack-btn');

    if (isSpectating) {
        actionArea.style.visibility = 'hidden';
        clearTimer();
    } else if (isMyTurn) {
        actionArea.style.visibility = 'visible';
        updateActionButtonUI();
        startTimer();
    } else {
        // 非自己回合：检测是否只选了 Joker 可插队
        actionArea.style.visibility = 'visible';
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

    // ★ 浸染机制：有 A 时不校验同花色（A 可浸染杂色牌）
    let primarySuit = null;
    if (nonJokers.length > 0 && !hasA) {
        primarySuit = nonJokers[0].suit;
        const isSame = nonJokers.every(c => c.suit === primarySuit);
        if (!isSame && !hasJoker) {
            Toast.show('多张普通牌必须同花色（或使用A浸染）！', 'error');
            audioManager.play('error');
            // ★ 自动清空选牌并刷新手牌
            const myHand = state.players[state.myPlayerId]?.hand || [];
            G.selectedCardIndices = [];
            G.declaredSuit = null;
            G.aValue = 1;
            renderHand(myHand);
            updateActionButtonUI();
            return;
        }
    }

    if (hasA && !G.declaredSuit) {
        Toast.show('请先点击【万化】选择浸染花色！✨', 'error');
        audioManager.play('error');
        return;
    }

    const isShield = (hasA && G.declaredSuit === '♣')
        || (!hasA && nonJokers.length > 0 && nonJokers.every(c => c.suit === '♣'));
    if (!isShield && !hasJoker && G.selectedTargetId < 0) {
        Toast.show('请先选择一个攻击目标！🐾', 'error');
        audioManager.play('error');
        return;
    }
    if (hasJoker && G.selectedTargetId < 0) {
        Toast.show('Joker 需要指定目标！🐾', 'error');
        audioManager.play('error');
        return;
    }

    // 直接出牌（合体状态已在弹窗中暂存到 G.declaredSuit / G.aValue）
    dispatchPlayAction(selectedCards, hasA ? G.declaredSuit : primarySuit, hasJoker, nonJokers, state);
}

// ═══ 万化弹窗：穷举花色 + 点数输入 + 确认合体 ═══

let _wanhuaSelectedSuit = null;

export function openWanhuaModal() {
    const state = G.currentState;
    if (!state) return;
    const myHand = state.players[state.myPlayerId]?.hand;
    if (!myHand) return;

    const selectedCards = G.selectedCardIndices.map(i => myHand[i]).filter(Boolean);
    const hasA = selectedCards.some(c => c.rank === 'A' && !c.isJoker);
    if (!hasA) { Toast.show('需要选中含 A 的组合才能万化！', 'error'); return; }

    // ★ 穷举：提取组合中所有唯一花色
    const possibleSuits = [...new Set(selectedCards.filter(c => !c.isJoker).map(c => c.suit))];
    const SUIT_NAMES = { '♦': '方块', '♣': '梅花', '♥': '红桃', '♠': '黑桃' };
    const SUIT_EFFECTS = { '♣': '🛡️护盾', '♠': '⚔️双倍', '♥': '💗吸血', '♦': '🌾摸牌' };

    const modal = document.getElementById('wanhua-modal');
    const container = document.getElementById('wanhua-suit-options');
    if (!modal || !container) return;

    container.innerHTML = '';
    _wanhuaSelectedSuit = null;

    // 渲染花色按钮
    possibleSuits.forEach(suit => {
        const isRed = (suit === '♦' || suit === '♥');
        const btn = document.createElement('button');
        btn.className = 'combo-card-btn';
        btn.innerHTML = `
            <span class="suit-icon ${isRed ? 'red' : 'black'}">${suit}</span>
            <span class="suit-text">${SUIT_NAMES[suit]}组合</span>
            <span class="suit-effect-text">${SUIT_EFFECTS[suit] || ''}</span>
        `;
        btn.onclick = () => {
            container.querySelectorAll('.combo-card-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _wanhuaSelectedSuit = suit;
        };
        container.appendChild(btn);
    });

    // 确认（aValue 固定为 1，点数 +1）
    document.getElementById('wanhua-confirm-btn').onclick = () => {
        if (!_wanhuaSelectedSuit) { Toast.show('请先选择一个花色！', 'error'); return; }
        G.declaredSuit = _wanhuaSelectedSuit;
        G.aValue = 1;  // ★ 固定 +1
        modal.classList.remove('show');
        audioManager.play('click');
        updateActionButtonUI();
        Toast.show(`✨ 万化为 ${_wanhuaSelectedSuit} 组合（A=+1）`, 'success');
    };

    document.getElementById('wanhua-cancel-btn').onclick = () => {
        modal.classList.remove('show');
        audioManager.play('click');
    };

    modal.classList.add('show');
}

function dispatchPlayAction(selectedCards, chosenSuit, hasJoker, nonJokers, state) {
    const isShield = chosenSuit === '♣';
    const hasA = selectedCards.some(c => c.rank === 'A' && !c.isJoker);

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

    // ★ payload 携带 declaredSuit + aValue（有 A 时）
    const payload = {
        action: 'PLAY_CARD',
        targetPlayerId: isShield ? state.myPlayerId : G.selectedTargetId,
        cardIndices: [...G.selectedCardIndices],
        aSuit: chosenSuit,
        declaredSuit: chosenSuit,
        aValue: hasA ? (G.aValue || 1) : null,
        hasA: hasA,  // ★ 万化特权标志
    };

    // 出牌后清空合体状态
    G.declaredSuit = null;
    G.aValue = 1;
    G._pendingClear = true;
    G.selectedCardIndices = [];
    G.selectedTargetId = -1;

    // ★ 统一通过 WebSocket 发送到权威服务器（主机和客户端走同一条路径）
    if (G.ws && G.ws.isConnected) {
        G.ws.send({ type: 'player_action', payload });
    } else {
        Toast.show('未连接到服务器！', 'error');
        G._pendingClear = false;
    }
}

// 由 main.js 注入（避免循环依赖）
let _wsClient = null;
export function injectWSClient(ws) { _wsClient = ws; }

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

// ═══ 飞牌暴击动效 (Choreography) ═══
export function playCardFlyAnimation(attackerId, targetId, suit, rank) {
    const attackerCard = document.querySelector(`.player-card[data-player-id="${attackerId}"]`);
    const targetCard = document.querySelector(`.player-card[data-player-id="${targetId}"]`);
    if (!attackerCard || !targetCard) return;

    const aRect = attackerCard.getBoundingClientRect();
    const tRect = targetCard.getBoundingClientRect();

    // 起点：attacker 头像中心
    const sx = aRect.left + aRect.width / 2;
    const sy = aRect.top + aRect.height / 2;
    // 终点：target 头像中心
    const ex = tRect.left + tRect.width / 2;
    const ey = tRect.top + tRect.height / 2;

    const flyCard = document.createElement('div');
    flyCard.className = 'flying-card';
    if (suit === '♥' || suit === '♦') flyCard.classList.add('suit-red');
    else if (suit === '♠' || suit === '♣') flyCard.classList.add('suit-black');
    flyCard.style.left = (sx - 26) + 'px';
    flyCard.style.top = (sy - 36) + 'px';
    flyCard.textContent = suit + rank;
    // 注入终点坐标到 CSS 自定义属性
    flyCard.style.setProperty('--fly-dx', (ex - sx) + 'px');
    flyCard.style.setProperty('--fly-dy', (ey - sy) + 'px');
    document.body.appendChild(flyCard);

    // ★ requestAnimationFrame 触发 @keyframes cardFly
    requestAnimationFrame(() => {
        flyCard.style.animation = 'cardFly 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
    });

    // ★ 落地：震动 + 音效 + 销毁
    setTimeout(() => {
        targetCard.classList.add('hit-shake');
        setTimeout(() => targetCard.classList.remove('hit-shake'), 500);
        try { audioManager.play('attack'); } catch(e) {}
        flyCard.remove();
    }, 500);
}

// ═══ VFX: 飘字 / 受击 / 回血 ═══

export function showDamageFloat(playerId, amount) {
    const card = document.querySelector(`.player-card[data-player-id="${playerId}"]`);
    if (!card) return;
    const el = document.createElement('div');
    el.className = 'damage-float';
    el.textContent = `-${amount}`;
    card.appendChild(el);
    // ★ [emil-design-eng] 受击震动：Spring Shake 物理反馈
    card.classList.add('hit-shake');
    setTimeout(() => { card.classList.remove('hit-shake'); el.remove(); }, 1000);
    audioManager.play('attack');
}

export function showHealFloat(playerId, amount) {
    const card = document.querySelector(`.player-card[data-player-id="${playerId}"]`);
    if (!card) return;
    const el = document.createElement('div');
    el.className = 'damage-float shield-float';
    el.textContent = `+${amount}`;
    card.appendChild(el);
    setTimeout(() => el.remove(), 1000);
    audioManager.play('heal');
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
    if (currentCards.length > prevHandLength) audioManager.play('draw');
}

/** 斗地主式智能提示：高亮可参与合法组合的卡牌 */
export function markSuggestedCards(handCards) {
    const playable = findPlayableCombinations(handCards);
    const container = document.getElementById('hand-container');
    if (!container) return;
    container.querySelectorAll('.poker-card').forEach((el, idx) => {
        if (playable.has(idx)) {
            el.classList.add('suggested');
        } else {
            el.classList.remove('suggested');
        }
    });
}

// ═══ Bug4: 首发选将弹窗 ═══

function showStarterModal(me) {
    const modal = document.getElementById('modal-starter');
    const container = document.getElementById('starter-options');
    if (!modal || !container) { console.warn('[Starter] modal or container missing'); return; }
    console.log('[Starter] showing modal for', me.name || 'player', 'myPlayerId:', G.myPlayerId);

    // ★ 动态副标题 — 快速模式 vs 常规模式
    const subtitle = document.getElementById('starter-subtitle');
    if (subtitle) {
        const maxLives = G.currentState?.players?.[G.myPlayerId]?.characters?.[0]?.maxLives || 3;
        subtitle.textContent = maxLives === 1
            ? '⚡ 快速模式：选择您的出战角色（一局定胜负，仅有一条命）'
            : '选择一个角色作为首发，其余两个待机：';
    }

    container.innerHTML = '';

    me.characters.forEach((c, idx) => {
        const card = document.createElement('div');
        card.className = 'starter-card';
        if (c.suit === '♥' || c.suit === '♦') card.classList.add('suit-red');
        else if (c.suit === '♠' || c.suit === '♣') card.classList.add('suit-black');
        card.innerHTML = `
            <div class="starter-suit">${c.suit}</div>
            <div class="starter-rank">${c.rank}</div>
            <div class="starter-hp">${c.hp}/${c.maxHp} HP</div>
        `;
        card.onclick = () => {
            console.log('[Starter] click idx:', idx);
            // ★ 统一通过 WebSocket 发送
            if (G.ws && G.ws.isConnected) {
                G.ws.send({ type: 'player_action', payload: { action: 'SELECT_STARTER', charIndex: idx } });
                modal.classList.remove('show');
            } else {
                Toast.show('未连接到服务器！', 'error');
            }
        };
        container.appendChild(card);
    });

    modal.classList.add('show');
}

function hideStarterModal() {
    const modal = document.getElementById('modal-starter');
    if (modal) modal.classList.remove('show');
}

// ═══ Bug3: 濒死救援弹窗 ═══

let _dyingTimer = null;

function showDyingModal(state) {
    const modal = document.getElementById('modal-dying');
    const desc = document.getElementById('dying-desc');
    const countdown = document.getElementById('dying-countdown');
    const actions = document.getElementById('dying-actions');
    if (!modal || !desc || !countdown || !actions) return;

    const dyingPlayer = state.players[state.dyingInfo.playerId];
    const dyingChar = dyingPlayer.characters[state.dyingInfo.charIndex];
    const me = state.players[state.myPlayerId];
    const myJokers = me?.hand?.map((c, i) => ({ ...c, idx: i })).filter(c => c.isJoker) || [];

    desc.textContent = `${dyingPlayer.name} 的 ${dyingChar.suit}${dyingChar.rank} 濒死！ (${dyingChar.hp}/${dyingChar.maxHp} HP)`;

    // 倒计时（从 dyingInfo.timestamp 计算）
    const elapsed = Math.floor((Date.now() - state.dyingInfo.timestamp) / 1000);
    const remaining = Math.max(0, 10 - elapsed);
    countdown.textContent = remaining;

    // 清除旧定时器
    if (_dyingTimer) clearInterval(_dyingTimer);
    _dyingTimer = setInterval(() => {
        const el2 = Math.floor((Date.now() - state.dyingInfo.timestamp) / 1000);
        const rem = Math.max(0, 10 - el2);
        countdown.textContent = rem;
        if (rem <= 0) {
            clearInterval(_dyingTimer);
            _dyingTimer = null;
            hideDyingModal();
        }
    }, 500);

    // 救援按钮
    actions.innerHTML = '';
    if (myJokers.length > 0) {
        const rescueBtn = document.createElement('button');
        rescueBtn.className = 'btn';
        rescueBtn.textContent = `💊 使用 Joker 救援 (${myJokers.length}张)`;
        rescueBtn.onclick = () => {
            // ★ 统一通过 WebSocket 发送
            if (G.ws && G.ws.isConnected) {
                G.ws.send({ type: 'player_action', payload: { action: 'JOKER_RESCUE', jokerCardIdx: myJokers[0].idx } });
            }
            hideDyingModal();
        };
        actions.appendChild(rescueBtn);
    }

    const passBtn = document.createElement('button');
    passBtn.className = 'btn btn-secondary';
    passBtn.textContent = myJokers.length > 0 ? '不救' : '等待...';
    if (myJokers.length > 0) {
        passBtn.onclick = () => hideDyingModal();
    } else {
        passBtn.disabled = true;
    }
    actions.appendChild(passBtn);

    modal.classList.add('show');
}

function hideDyingModal() {
    const modal = document.getElementById('modal-dying');
    if (modal) modal.classList.remove('show');
    if (_dyingTimer) { clearInterval(_dyingTimer); _dyingTimer = null; }
}

// ═══ 战斗屏幕特效 ═══
(function initFxLayer() {
    if (!document.getElementById('fx-layer')) {
        const fx = document.createElement('div'); fx.id = 'fx-layer'; document.body.appendChild(fx);
    }
})();

function playVisualEffect(targetPlayerId, effectType) {
    const targetEl = document.querySelector(`.player-card[data-player-id="${targetPlayerId}"]`);
    if (!targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    const fxLayer = document.getElementById('fx-layer');
    if (!fxLayer) return;
    const fxNode = document.createElement('div');
    fxNode.className = effectType === 'shield' ? 'shield-effect' : 'slash-effect';
    fxNode.style.left = rect.left + rect.width / 2 + 'px';
    fxNode.style.top = rect.top + rect.height / 2 + 'px';
    fxLayer.appendChild(fxNode);
    setTimeout(() => { if (fxNode.parentNode) fxNode.parentNode.removeChild(fxNode); }, 600);
}
// expose globally so renderState can call it
window.playVisualEffect = playVisualEffect;
