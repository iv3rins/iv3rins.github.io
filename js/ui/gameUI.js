/**
 * gameUI — 游戏局内渲染
 * 对手卡牌、自己状态、手牌、回合 UI、A 牌面板、目标选择、出牌执行
 */
import { G } from '../state.js';
import { calculateWildcardCombinations, findPlayableCombinations } from '../engine/GameValidator.js';
import { Toast } from './toast.js';
import { audioManager } from '../audioManager.js';

// ═══ 渲染入口 ═══

let _prevState = null;  // 用于检测变化以触发 VFX

export function renderState(state) {
    G.currentState = state;
    const me = state.players[state.myPlayerId];
    const isSpectating = me && me.isEliminated;

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

    // ★ VFX: lastAction — 夸张飘字 + 音效
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

    if (!isSpectating && me && me.hand) {
        renderHand(me.hand);
        // ★ 智能提示：高亮可出牌
        if (state.currentPlayerIndex === state.myPlayerId) {
            markSuggestedCards(me.hand);
        }
    }
    else document.getElementById('hand-container').innerHTML = '';

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
    // ★ Bug4: activeCharIndex=-1 时用第一个角色显示
    const charIdx = p.activeCharIndex >= 0 ? p.activeCharIndex : 0;
    const displayChar = aliveChar || p.characters[charIdx] || p.characters[0];
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
        `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 2px;background:${c.isDead ? '#dfe6e9' : c.isDying ? '#ff4757' : '#55efc4'}"></span>`
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

    // 纯 ♣（无 A）→ 护盾提示
    const isPureClub = nonJokers.length > 0 && nonJokers.every(c => c.suit === '♣') && !selectedCards.some(c => c.rank === 'A');

    if (hasJoker) {
        btn.textContent = '🃏 Joker 特殊行动';
        btn.disabled = G.selectedTargetId < 0;
    } else if (isPureClub) {
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
    updateActionButtonUI();  // ★ 动态按钮文字
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
            return;
        }
    }

    // 目标校验
    const isPureClub = nonJokers.length > 0 && nonJokers.every(c => c.suit === '♣') && !hasA;
    if (!isPureClub && !hasJoker && G.selectedTargetId < 0) {
        Toast.show('请先选择一个攻击目标！🐾', 'error'); return;
    }
    if (hasJoker && G.selectedTargetId < 0) {
        Toast.show('Joker 需要指定目标！🐾', 'error'); return;
    }

    // ★ 如果有 A 牌，弹出万化组合方案选择弹窗
    if (hasA) {
        openCombinationModal(selectedCards, primarySuit, (combo) => {
            dispatchPlayAction(selectedCards, combo.targetSuit, hasJoker, nonJokers, state);
        });
        return;
    }

    // 无 A 牌：直接出牌
    dispatchPlayAction(selectedCards, primarySuit, hasJoker, nonJokers, state);
}

function openCombinationModal(selectedCards, primarySuit, onConfirm) {
    const modal = document.getElementById('modal-combination');
    const container = document.getElementById('combo-list-container');
    if (!modal || !container) return;
    container.innerHTML = '';

    // ★ 使用穷举计算器
    const combos = calculateWildcardCombinations(selectedCards);

    combos.forEach(combo => {
        const { targetSuit, totalValue, isShield, effectHint, previewCards } = combo;

        // 预览卡牌
        let previewHtml = '<div class="combo-cards-preview">';
        previewCards.forEach(c => {
            const displaySuit = c.rank === 'A' ? targetSuit : c.suit;
            const displayRank = c.rank;
            const colorClass = (displaySuit === '♦' || displaySuit === '♥') ? 'suit-red' : 'suit-black';
            previewHtml += `<div class="mini-poker-card ${colorClass}"><span style="font-size:10px">${displaySuit}</span><span style="font-size:12px">${displayRank}</span></div>`;
        });
        previewHtml += '</div>';

        const item = document.createElement('div');
        item.className = 'combo-item';
        item.innerHTML = `
            <div>
                <div style="font-weight: bold; margin-bottom: 4px;">
                    ${effectHint}
                    <span style="color: var(--hp-color); margin-left: 10px;">总效能: ${totalValue}</span>
                </div>
                ${previewHtml}
            </div>
            <button class="btn btn-small">选择此方案</button>
        `;

        item.onclick = () => {
            modal.classList.remove('show');
            onConfirm({ targetSuit, totalValue, isShield });
        };
        container.appendChild(item);
    });

    modal.classList.add('show');
    document.getElementById('btn-cancel-combo').onclick = () => {
        modal.classList.remove('show');
    };
}

function dispatchPlayAction(selectedCards, chosenSuit, hasJoker, nonJokers, state) {
    const isShield = chosenSuit === '♣';

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

    const payload = {
        targetPlayerId: isShield ? state.myPlayerId : G.selectedTargetId,
        cardIndices: [...G.selectedCardIndices],
        aSuit: chosenSuit,
    };

    G._pendingClear = true;
    G.selectedCardIndices = [];
    G.selectedTargetId = -1;

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
    audioManager.play('attack');
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
    if (!modal || !container) return;
    container.innerHTML = '';

    me.characters.forEach((c, idx) => {
        const isRed = c.suit === '♦' || c.suit === '♥';
        const card = document.createElement('div');
        card.className = 'starter-card';
        card.style.color = isRed ? '#dc2626' : '#1e293b';
        card.innerHTML = `
            <div class="starter-suit">${c.suit}</div>
            <div class="starter-rank">${c.rank}</div>
            <div class="starter-hp">${c.hp}/${c.maxHp} HP</div>
        `;
        card.onclick = () => {
            // 发送选将消息
            if (G.isHost) {
                const result = G.gameEngine.selectStarter(G.myPlayerId, idx);
                if (result.ok) {
                    modal.classList.remove('show');
                    broadcastSyncState();
                }
            } else {
                G.p2p.sendMessage({ type: 'SELECT_STARTER', payload: { charIndex: idx } });
                modal.classList.remove('show');
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
            if (G.isHost) {
                const result = G.gameEngine.rescueWithJoker(G.myPlayerId, myJokers[0].idx);
                if (result.ok) {
                    hideDyingModal();
                    broadcastSyncState();
                }
            } else {
                G.p2p.sendMessage({ type: 'JOKER_RESCUE', payload: { jokerCardIdx: myJokers[0].idx } });
            }
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
