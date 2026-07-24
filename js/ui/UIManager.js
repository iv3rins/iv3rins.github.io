/**
 * UIManager.js — 纯粹视图渲染器
 * 职责：接收状态 G，更新 DOM。不包含任何业务逻辑。
 * 与 SkinManager 配合，所有颜色通过 CSS 变量流动。
 */
import { skinManager } from './SkinManager.js';

export class UIManager {
    constructor() {
        /** @type {object|null} 当前游戏状态快照 */
        this.state = null;
        this._prevState = null;
    }

    // ═══ 主入口：完整渲染 ═══

    render(state) {
        this.state = state;
        this._renderOpponents();
        this._renderSelf();
        this._renderHand();
        this._renderVFX();
        this._prevState = JSON.parse(JSON.stringify(state));
    }

    // ═══ 对手区（Bento 面板） ═══

    _renderOpponents() {
        const container = document.getElementById('bento-opponents');
        if (!container) return;
        container.innerHTML = '';

        const myId = this.state.myPlayerId ?? 0;
        const isMyTurn = this.state.currentPlayerIndex === myId;

        this.state.players.forEach((p, i) => {
            if (i === myId) return;
            const card = this._createPlayerBento(p, i, isMyTurn);
            container.appendChild(card);
        });
    }

    // ═══ 自己区（左下角 Bento） ═══

    _renderSelf() {
        const container = document.getElementById('bento-self');
        if (!container) return;
        container.innerHTML = '';

        const myId = this.state.myPlayerId ?? 0;
        const me = this.state.players[myId];
        if (!me) return;

        const card = this._createPlayerBento(me, myId, false, true);
        container.appendChild(card);
    }

    // ═══ 手牌区 ═══

    _renderHand() {
        const container = document.getElementById('my-hand-cards');
        if (!container) return;

        const myId = this.state.myPlayerId ?? 0;
        const me = this.state.players[myId];
        const isSpectating = me && me.isEliminated;

        if (isSpectating || !me || !me.hand) {
            container.innerHTML = '';
            return;
        }

        const prevCount = container.children.length;
        container.innerHTML = '';
        container.offsetHeight;

        me.hand.forEach((card, i) => {
            const div = document.createElement('div');
            div.className = 'apple-card';
            div.dataset.index = i;

            // 选中态（需要外部 G 对象提供 selectedCardIndices）
            if (window.__G && window.__G.selectedCardIndices && window.__G.selectedCardIndices.includes(i)) {
                div.classList.add('selected');
            }

            if (card.isJoker) {
                div.classList.add('card-joker');
                div.innerHTML = '<span>🃏</span><span style="font-size:12px">Joker</span>';
            } else {
                const isRed = card.suit === '♥' || card.suit === '♦';
                div.classList.add(isRed ? 'suit-red' : 'suit-black');
                div.innerHTML = `<span>${card.suit}</span><span>${card.rank}</span>`;
            }

            div.addEventListener('click', () => this._onCardClick(i, div));
            container.appendChild(div);
        });

        container.offsetHeight;

        // Staggered animation
        for (let i = 0; i < Math.min(me.hand.length, container.children.length); i++) {
            const el = container.children[i];
            const isNew = i >= prevCount - 1 || prevCount === 0;
            if (!isNew) continue;
            setTimeout(() => {
                el.style.animationDelay = (i * 50) + 'ms';
                el.classList.add('deal-stagger');
            }, 60 + i * 50);
        }

        container.offsetHeight;

        // 550ms ghost guard
        setTimeout(() => {
            container.querySelectorAll('.apple-card.deal-stagger').forEach(el => {
                if (getComputedStyle(el).opacity === '0') {
                    el.style.opacity = '1';
                    el.style.animation = 'none';
                }
            });
        }, 550);
    }

    // ═══ VFX / 飘字 ═══

    _renderVFX() {
        const st = this.state;
        if (!st || !st.lastAction) return;

        const { type, targetId, amount } = st.lastAction;
        const cardEl = document.querySelector(`[data-player-id="${targetId}"]`);
        if (!cardEl) return;

        const vfx = document.createElement('div');
        vfx.className = `vfx-popup ${type === 'damage' ? 'vfx-dmg' : 'vfx-shd'}`;
        vfx.textContent = type === 'damage' ? `-${amount}` : `+${amount} 🛡️`;
        cardEl.appendChild(vfx);
        setTimeout(() => vfx.remove(), 1200);
    }

    // ═══ Bento 玩家卡片 ═══

    _createPlayerBento(p, idx, isTargetable, isSelf = false) {
        const div = document.createElement('div');
        div.className = 'bento-card';
        div.dataset.playerId = idx;

        if (isTargetable) div.classList.add('targetable');
        if (isSelf) div.classList.add('is-self');

        const aliveChar = p.characters?.find(c => !c.isDead && !c.isDying);
        const charIdx = p.activeCharIndex >= 0 ? p.activeCharIndex : 0;
        const displayChar = p.characters?.[charIdx] || aliveChar || p.characters?.[0];
        if (!displayChar) return div;

        const isRed = displayChar.suit === '♦' || displayChar.suit === '♥';
        const suitCls = isRed ? 'suit-red' : 'suit-black';
        const avatar = p.isEliminated ? '😭' : (this.state?.playerAvatars?.[idx] || '🐱');
        const hpPct = displayChar.maxHp > 0 ? (displayChar.hp / displayChar.maxHp * 100) : 0;
        const shPct = displayChar.maxHp > 0 ? (displayChar.shield / displayChar.maxHp * 100) : 0;

        div.innerHTML = `
            <div class="bento-avatar">${avatar}</div>
            <div class="bento-name">${p.name || '玩家' + (idx + 1)}${isSelf ? ' (你)' : ''}${p.isEliminated ? ' 💀' : ''}</div>
            <div class="bento-role ${suitCls}">${p.isEliminated ? '已淘汰' : displayChar.suit + displayChar.rank}</div>
            <div class="bento-hp">${displayChar.hp}/${displayChar.maxHp}${displayChar.shield > 0 ? ' +' + displayChar.shield + '🛡' : ''}</div>
            <div class="bento-bar">
                <div class="bento-hp-bar" style="width:${hpPct}%"></div>
                ${displayChar.shield > 0 ? `<div class="bento-shield-bar" style="width:${shPct}%"></div>` : ''}
            </div>
            <div class="bento-hand-count">${p.handCount ?? 0} 张</div>
        `;

        return div;
    }

    // ═══ 辅助 ═══

    /** 显示/隐藏确定取消面板 + 按钮状态 */
    toggleActionPanel(show) {
        const panel = document.getElementById('action-panel');
        if (!panel) return;
        if (show) panel.classList.remove('hidden');
        else {
            panel.classList.add('hidden');
            this._updateConfirmButton(0);
        }
    }

    /** 手牌点击：toggle selected → 更新按钮 */
    _onCardClick(index, el) {
        el.classList.toggle('selected');
        const count = document.querySelectorAll('#my-hand-cards .apple-card.selected').length;
        const panel = document.getElementById('action-panel');
        if (panel) {
            if (count > 0) panel.classList.remove('hidden');
            else panel.classList.add('hidden');
        }
        this._updateConfirmButton(count);
    }

    /** 强制更新确认按钮 disabled 状态 + 文字 */
    _updateConfirmButton(selectedCount) {
        const btn = document.getElementById('btn-confirm');
        if (!btn) return;
        if (selectedCount > 0) {
            btn.disabled = false;
            btn.textContent = `出牌 (${selectedCount})`;
        } else {
            btn.disabled = true;
            btn.textContent = '请选牌';
        }
    }

    /** 渲染牌堆信息 */
    renderDeckInfo() {
        const el = document.getElementById('deck-info');
        if (!el || !this.state) return;
        const cur = this.state.players[this.state.currentPlayerIndex];
        el.textContent = `🎴 牌堆: ${this.state.deckCount} | 回合 ${this.state.turnCount || 1} | ${cur ? cur.name : '--'} 行动`;
    }
}

// 全局单例
export const uiManager = new UIManager();
