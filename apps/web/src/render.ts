import type { Card, Character, PublicPlayerState } from '@pokewar/domain';
import type { AppState, BroadcastData, WanhuaPending } from './types.ts';
import { button, clearAndAppend, requiredElement } from './dom.ts';
import { getMockLeaderboard } from './store.ts';
import { deriveWanhuaSuit } from './wanhua-utils.ts';

let lastFatalError: string | null = null;
let prevHandCount = 0;
let prevGameId: string | null = null;
// Track previous opponent HP for damage popups
const prevOpponentHp = new Map<string, number>();
let prevSelfHp = -1;


/* ── Animation helpers ──────────────────────────────────────────────────── */
export function triggerCardPlayAnim(suitSym: string, suitColor: string): void {
  const bc = document.getElementById('broadcast-display');
  if (!bc) return;
  const burst = document.createElement('div');
  burst.className = 'suit-burst';
  burst.textContent = suitSym;
  burst.style.color = suitColor;
  bc.appendChild(burst);
  burst.addEventListener('animationend', () => burst.remove(), { once: true });
}

/**
 * 出牌飞行动画：将选中手牌克隆体从原始位置飞向广播区中心，落地后触发花色爆炸。
 * 每张牌依次延迟，形成连续飞出效果。
 */
export function triggerCardPlayFlightAnim(
  cardEls: HTMLElement[],
  broadcastEl: HTMLElement,
  onLand: () => void,
): void {
  if (cardEls.length === 0) { onLand(); return; }
  const bcRect = broadcastEl.getBoundingClientRect();
  const bcCX = bcRect.left + bcRect.width / 2;
  const bcCY = bcRect.top + bcRect.height / 2;
  let landedCount = 0;

  cardEls.forEach((el, idx) => {
    const r = el.getBoundingClientRect();
    const clone = document.createElement('div');
    clone.className = 'card-flight-clone';
    // 复制牌面内容
    clone.innerHTML = el.innerHTML;
    const suit = el.dataset['suit'] ?? '';
    if (suit === 'H' || suit === 'D') clone.classList.add('suit-red-clone');
    // 固定定位在原始位置
    clone.style.cssText = [
      `position:fixed`,
      `left:${r.left}px`,
      `top:${r.top}px`,
      `width:${r.width}px`,
      `height:${r.height}px`,
      `z-index:9999`,
      `pointer-events:none`,
      `transition:none`,
    ].join(';');
    document.body.appendChild(clone);

    // 强制回流后开始动画
    void clone.getBoundingClientRect();
    const delay = idx * 70;
    clone.style.transition = `transform ${300}ms cubic-bezier(.2,.8,.3,1.1) ${delay}ms, opacity ${200}ms ease ${delay + 220}ms`;
    // 飞向广播区中心
    const tx = bcCX - (r.left + r.width / 2);
    const ty = bcCY - (r.top + r.height / 2);
    clone.style.transform = `translate(${tx}px,${ty}px) scale(1.25) rotate(${idx % 2 === 0 ? -6 : 6}deg)`;
    clone.style.opacity = '0';

    const totalDelay = delay + 300;
    setTimeout(() => {
      clone.remove();
      landedCount++;
      if (landedCount === cardEls.length) onLand();
    }, totalDelay + 220);
  });
}

const JOKER_SVG_INNER = '<svg class="joker-run-svg" width="36" height="40" viewBox="0 0 28 32" xmlns="http://www.w3.org/2000/svg">'
  + '<circle cx="14" cy="20" r="9" fill="#fffde7" stroke="#333" stroke-width="1"/>'
  + '<path d="M5,14 Q6,2 14,4 Q22,2 23,14" fill="#e53e3e" stroke="#333" stroke-width="1"/>'
  + '<path d="M9,7 Q12,1 14,4" fill="#7c3aed" stroke="#333" stroke-width="1"/>'
  + '<path d="M14,4 Q16,1 19,7" fill="#059669" stroke="#333" stroke-width="1"/>'
  + '<circle cx="11" cy="19" r="1.5" fill="#1a1a1a"/>'
  + '<circle cx="17" cy="19" r="1.5" fill="#1a1a1a"/>'
  + '<path d="M10,23 Q14,27 18,23" fill="none" stroke="#333" stroke-width="1.2"/></svg>';

/**
 * 救援动画：小丑从左侧飞出跑一圈，最终躲进目标玩家的面板背后。
 * @param _sourcePanelId 旧签名兼容，保留但忽略
 * @param targetPlayerId 被救助玩家 ID；null 时默认躲进自身面板
 */
export function triggerJokerRescueAnim(_sourcePanelId: string, targetPlayerId: string | null): void {
  // 确定目标面板：自己 → self-panel；对手 → opp-card[data-opp-id]
  let targetEl: HTMLElement | null = null;
  if (targetPlayerId) {
    targetEl = document.querySelector<HTMLElement>(`[data-opp-id="${targetPlayerId}"]`);
  }
  // 回退到自身面板
  const hostEl: HTMLElement = targetEl ?? document.getElementById('self-panel') ?? document.body;

  /* 将小丑追加到 body 使用 fixed 定位，避免被父级 overflow:hidden 裁剪 */
  const hostRect = hostEl.getBoundingClientRect();
  const jester = document.createElement('div');
  jester.className = 'joker-rescue-anim joker-rescue-fixed';
  jester.innerHTML = JOKER_SVG_INNER;

  // 自身面板在左侧；对手面板在顶部 → 进入方向不同
  const isSelf = !targetEl;
  // position:fixed via inline (仅这一项)；left/top 通过 CSS var 设置，
  // 这样 @keyframes 才能覆盖 left/top（inline style 无法被 keyframes 覆盖）
  const startX = -60;
  const startY = hostRect.top + hostRect.height / 2 - 20;
  const endX   = hostRect.left + hostRect.width  / 2 - 18;
  const endY   = hostRect.top  + hostRect.height - 10;

  jester.style.position      = 'fixed';
  jester.style.zIndex        = '9998';
  jester.style.pointerEvents = 'none';
  // 初始位置与终点位置均通过 CSS 自定义属性传递，供 .joker-rescue-fixed 和 @keyframes 读取
  jester.style.setProperty('--jr-start-x', `${startX}px`);
  jester.style.setProperty('--jr-start-y', `${startY}px`);
  jester.style.setProperty('--jr-end-x',   `${endX}px`);
  jester.style.setProperty('--jr-end-y',   `${endY}px`);
  jester.style.setProperty('--jr-is-self', isSelf ? '1' : '0');

  document.body.appendChild(jester);

  // 启动动画（class 添加后 keyframes 可读取上方 CSS var）
  void jester.getBoundingClientRect();
  jester.classList.add('joker-rescue-run');
  jester.addEventListener('animationend', () => jester.remove(), { once: true });
}

export function render(state: AppState): void {
  renderTopbar(state);
  renderConnection(state);
  renderPage(state);
  renderRoom(state);
  renderGame(state);
  renderChat(state);
  renderModal(state);
  renderReconnectBanner(state);
  renderMultiplayerPanel(state);
  if (state.fatalError && state.fatalError !== lastFatalError) {
    lastFatalError = state.fatalError;
    toast(state.fatalError, 'danger');
  }
}

/* == Topbar ================================================================= */
function renderTopbar(state: AppState): void {
  const themeBtn = document.querySelector<HTMLButtonElement>('[data-action="toggle-theme"]');
  if (themeBtn) {
    const isDark = document.documentElement.dataset['theme'] === 'dark';
    themeBtn.textContent = isDark ? '深色' : '浅色';
    themeBtn.setAttribute('aria-label', isDark ? '切换日间模式' : '切换暗夜模式');
  }
  const langBtn = document.querySelector<HTMLButtonElement>('[data-action="toggle-lang"]');
  if (langBtn) {
    langBtn.textContent = document.documentElement.dataset['lang'] === 'en' ? 'EN' : 'ZH';
  }
  const authArea = requiredElement<HTMLElement>('#topbar-auth');
  if (state.currentUser) {
    const titleHtml = titleLabel(state.currentUser.cosmeticTitleId);
    const frameHtml = avatarFrameSvg(state.currentUser.cosmeticFrameId, state.currentUser.username);
    const uname = state.currentUser.username;
    authArea.innerHTML = `
      <span class="user-title">${titleHtml}</span>
      <button class="avatar-chip" type="button" data-action="go-profile" title="我的档案">
        ${frameHtml}<span class="avatar-username">${uname}</span>
      </button>
      <button class="neo-btn compact" type="button" data-action="open-cosmetics">🎨</button>
      <button class="neo-btn compact danger-soft" type="button" data-action="logout">退出</button>`;
  } else {
    const frameHtml = avatarFrameSvg('frame-default', state.guestName, 28);
    const gname = state.guestName;
    authArea.innerHTML = `
      <button class="guest-chip" type="button" data-action="open-auth" title="点击登录">
        ${frameHtml}<span class="guest-name">${gname}</span>
      </button>
      <button class="neo-btn compact primary" type="button" data-action="open-auth">登录 / 注册</button>`;
  }
}

/* == Connection ============================================================= */
function renderConnection(state: AppState): void {
  const status = requiredElement<HTMLElement>('#connection-status');
  const labels: Record<string, string> = { offline: '离线', connecting: '连接中', online: '在线', error: '连接错误' };
  status.textContent = state.gameMode === 'local' ? '本地' : (labels[state.connection] ?? state.connection);
  status.dataset['status'] = state.gameMode === 'local' ? 'local' : state.connection;
}

/* == Page routing =========================================================== */
function renderPage(state: AppState): void {
  let pageId: string;
  if (state.game?.phase === 'GAME_OVER') pageId = 'page-result';
  else if (state.game) pageId = 'page-game';
  else if (state.room) pageId = 'page-waiting';
  else if (state.activePage === 'leaderboard') pageId = 'page-leaderboard';
  else if (state.activePage === 'profile') pageId = 'page-profile';
  else if (state.activePage === 'bot-lobby') pageId = 'page-bot-lobby';
  else pageId = 'page-home';

  for (const el of document.querySelectorAll<HTMLElement>('.page-view')) {
    el.classList.toggle('active', el.id === pageId);
  }
  if (pageId === 'page-leaderboard') renderLeaderboard(state);
  if (pageId === 'page-profile') renderProfile(state);
}

/* == Room =================================================================== */
function renderRoom(state: AppState): void {
  if (!state.room) return;
  requiredElement<HTMLElement>('.room-code').textContent = state.room.code;
  const list = requiredElement('#room-players');
  clearAndAppend(list, state.room.players.map((player) => {
    const card = document.createElement('article');
    card.className = 'player-card bento-card';
    const frameHtml = avatarFrameSvg(state.currentUser?.cosmeticFrameId ?? 'frame-default', player.name, 40);
    const badges = [
      player.isHost ? '房主' : '玩家',
      player.isReady || player.isHost ? '✅ 已准备' : '⏳ 未准备',
      player.isConnected ? '🟢' : '🔴 重连中',
    ].join(' · ');
    card.innerHTML = `<div class="player-card-inner">${frameHtml}<div><h3>${player.name}</h3><p class="neo-body">${badges}</p></div></div>`;
    return card;
  }));
  requiredElement<HTMLButtonElement>('#start-game').hidden =
    !state.room.players.find((p) => p.isHost && p.id === state.playerId);
}

/* == Game =================================================================== */
function renderGame(state: AppState): void {
  if (!state.game || !state.playerId) return;
  requiredElement<HTMLElement>('#phase-pill').textContent = phaseLabel(state.game.phase);
  const current = state.game.players.find((p) => p.id === state.game?.currentTurnPlayerId);
  const isMyTurn = state.game.currentTurnPlayerId === state.playerId && state.game.phase === 'PLAYING';
  const turnText = isMyTurn ? '⚡ 你的回合' : `${current?.name ?? '…'} 行动中`;
  requiredElement<HTMLElement>('#turn-label').textContent = `回合 ${state.game.round} · ${turnText}`;

  const self = state.game.players.find((p) => p.id === state.playerId);
  if (!self) return;
  renderSelf(self, state.currentUser?.eloScore, state.currentUser?.cosmeticFrameId, state.currentUser?.cosmeticTitleId);
  const _selCards = (self.hand ?? []).filter((_, i) => state.selectedCardIndices.has(i));
  const isClubsOnly = _selCards.length > 0 && _selCards.every(c => !c.isJoker && c.suit === 'C');
  renderOpponents(state.game.players.filter((p) => p.id !== state.playerId), state.selectedTargetId, state.game.currentTurnPlayerId, isClubsOnly);
  renderStarterModal(self, state.game.phase, state.currentUser);
  renderStarterSelection(self, state.game.phase);
  renderJokerActions(self, state.game.phase, state.game.pendingDying, state.playerId, state.game.players);
  const canPlay = state.game.phase === 'PLAYING' && state.game.currentTurnPlayerId === state.playerId;
  // Drive timer ring animation reset on turn change
  const handCenter = document.getElementById('hand-action-center');
  if (handCenter) {
    const wasMyTurn = handCenter.dataset['myturn'] === 'true';
    handCenter.dataset['myturn'] = String(canPlay);
    if (canPlay && !wasMyTurn) {
      // Restart the timer animation by re-setting the element
      // timer-progress-circle removed; progress bar resets automatically via stopTurnTimer()
    }
  }
  if (state.game.id !== prevGameId) {
    prevHandCount = 0;
    prevGameId = state.game.id;
  }
  const newHandCount = self.hand?.length ?? 0;
  const isNewDeal = newHandCount > prevHandCount;
  const _isSelfDying = state.game.phase === 'WAITING_FOR_JOKER' && state.game.pendingDying?.playerId === state.playerId;
  const _jokerDyingIdx = _isSelfDying ? (self.hand ?? []).findIndex(c => c.isJoker) : -1;
  const jokerDyingIdx = _jokerDyingIdx >= 0 ? _jokerDyingIdx : undefined;
  renderHand(self.hand ?? [], state.selectedCardIndices, canPlay, isNewDeal, jokerDyingIdx, state.wanhuaPending);
  prevHandCount = newHandCount;
  requiredElement<HTMLButtonElement>('#play-selected').disabled = !canPlay;
  renderTargetsHidden(state.game.players, state.playerId, state.selectedTargetId);
  renderBroadcastDisplay(state.lastBroadcast, state.game.players);
  if (state.game.phase === 'GAME_OVER') {
    const winner = state.game.players.find((p) => p.id === state.game?.winnerId);
    const txt = winner ? `${winner.name} 获胜，共 ${state.game.round} 回合。` : '本局无人获胜。';
    requiredElement<HTMLElement>('#result-text').textContent = txt;
  }
}

function renderSelf(player: PublicPlayerState, eloScore?: number, frameId?: string, titleId?: string): void {
  const panel = requiredElement('#self-panel');
  const active = player.activeCharacterIndex >= 0 ? player.characters[player.activeCharacterIndex] : null;
  const maxHp = active ? (active.rank === 'J' ? 30 : active.rank === 'Q' ? 40 : 50) : 30;
  const hpPct = active ? Math.max(0, Math.min(100, (active.hp / maxHp) * 100)) : 0;
  const shieldPct = active ? Math.max(0, Math.min(100, (active.shield / 20) * 100)) : 0;
  const hpColor = hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#facc15' : '#f87171';
  const SUIT_ABILITY: Record<string, string> = {
    S: '出牌双倍伤害·受♠效果豁免', H: '出牌吸血回复·受♥效果豁免',
    D: '出牌五谷丰登·受♦效果豁免', C: '出牌获盾·攻击穿甲',
  };
  const abilityText = active?.suit ? (SUIT_ABILITY[active.suit] ?? '') : '';
  const frameHtml = avatarFrameSvg(frameId ?? 'frame-default', player.name, 60);
  const livesTotal = player.characters.length;
  const activeHtml = active ? `
    <div class="sp-shield-row">
      <span class="sp-stat-label">🛡</span>
      <div class="sp-hp-bar"><div class="sp-hp-fill" style="width:${shieldPct}%;background:#60a5fa"></div></div>
      <span class="sp-hp-nums">${active.shield}<span class="sp-hp-max">/20</span></span>
    </div>
    <div class="sp-hp-wrap">
      <div class="sp-hp-bar"><div class="sp-hp-fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
      <span class="sp-hp-nums">${active.hp}<span class="sp-hp-max">/${maxHp}</span></span>
    </div>` : '<p class="sp-waiting">等待选将…</p>';
  panel.innerHTML = `
    <div class="sp-header">
      ${titleId && titleLabel(titleId) ? '<span class=\"sp-title-badge\">' + titleLabel(titleId) + '</span>' : ''}
      <span class="sp-id-text">${player.name}</span>
      ${eloScore !== undefined ? '<span class=\"sp-elo-badge\">' + eloScore + '</span>' : ''}
    </div>
    <div class="sp-avatar-zone">
      ${frameHtml}
      ${active ? '<div class=\"sp-suit-chip suit-' + (active.suit ?? 'S').toLowerCase() + '\" title=\"' + abilityText + '\">' + suitSymbol(active.suit) + '</div>' : ''}
    </div>
    ${activeHtml}
    <div class="sp-bottom-row">
      <div class="sp-hand-badge">
        <span class="sp-hand-num">${player.handCount}</span>
        <span class="sp-hand-icon">🃏</span>
      </div>
      <div class="sp-lives">${'❤️'.repeat(player.livesRemaining)}${'🖤'.repeat(Math.max(0, livesTotal - player.livesRemaining))}</div>
    </div>
    ${MOUSE_SVG}`;
  initMouseTracker();
  // Hit flash when self HP drops
  if (active) {
    if (prevSelfHp >= 0 && active.hp < prevSelfHp) {
      panel.classList.add('sp-hit-flash');
      panel.addEventListener('animationend', () => panel.classList.remove('sp-hit-flash'), { once: true });
    }
    prevSelfHp = active.hp;
  }
}

let _mouseX = 50;
let _mouseY = 70;
let _mouseListenerAdded = false;

function initMouseTracker(): void {
  const panel = document.getElementById('self-panel');
  if (!panel || _mouseListenerAdded) return;
  _mouseListenerAdded = true;
  document.addEventListener('mousemove', (ev: MouseEvent) => {
    const rect = panel.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, ev.clientY - rect.top));
    _mouseX = (x / rect.width) * 100;
    _mouseY = (y / rect.height) * 100;
    const widget = document.getElementById('mouse-widget');
    if (widget) {
      (widget as HTMLElement).style.left = _mouseX + '%';
      (widget as HTMLElement).style.top = _mouseY + '%';
    }
  });
}

const MOUSE_SVG = '<svg id="mouse-widget" class="mouse-widget" width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<ellipse cx="18" cy="22" rx="11" ry="13" fill="#c8b89a" stroke="#6b4f2a" stroke-width="1.5"/>' +
  '<ellipse cx="12" cy="11" rx="5" ry="7" fill="#c8b89a" stroke="#6b4f2a" stroke-width="1.5" transform="rotate(-20 12 11)"/>' +
  '<ellipse cx="24" cy="11" rx="5" ry="7" fill="#c8b89a" stroke="#6b4f2a" stroke-width="1.5" transform="rotate(20 24 11)"/>' +
  '<ellipse cx="12" cy="11" rx="3.5" ry="5.5" fill="#f5d0c5" transform="rotate(-20 12 11)"/>' +
  '<ellipse cx="24" cy="11" rx="3.5" ry="5.5" fill="#f5d0c5" transform="rotate(20 24 11)"/>' +
  '<circle cx="14" cy="21" r="2" fill="#2d1a0e"/><circle cx="22" cy="21" r="2" fill="#2d1a0e"/>' +
  '<circle cx="14.6" cy="20.3" r="0.7" fill="#fff"/><circle cx="22.6" cy="20.3" r="0.7" fill="#fff"/>' +
  '<ellipse cx="18" cy="26" rx="2.5" ry="1.5" fill="#f87171"/>' +
  '<line x1="4" y1="24" x2="14" y2="25" stroke="#9ca3af" stroke-width="0.8"/>' +
  '<line x1="4" y1="27" x2="13" y2="27" stroke="#9ca3af" stroke-width="0.8"/>' +
  '<line x1="22" y1="25" x2="32" y2="24" stroke="#9ca3af" stroke-width="0.8"/>' +
  '<line x1="23" y1="27" x2="32" y2="27" stroke="#9ca3af" stroke-width="0.8"/>' +
  '<path class="mouse-tail" d="M18,35 Q26,38 30,30 Q34,22 26,18" fill="none" stroke="#c8b89a" stroke-width="3" stroke-linecap="round"/>' +
  '</svg>';

function renderOpponents(players: readonly PublicPlayerState[], selectedTargetId: string | null, currentTurnPlayerId: string | null, disableTarget?: boolean): void {
  clearAndAppend(requiredElement('#opponents-list'), players.map((player) => {
    const card = document.createElement('article');
    const isSelected = player.id === selectedTargetId;
    card.className = `opp-card${player.isEliminated ? ' eliminated' : ''}${isSelected ? ' selected-target' : ''}`;
    if (!player.isEliminated && !disableTarget) {
      card.dataset['action'] = 'select-target';
      card.dataset['value'] = player.id;
      card.dataset['oppId'] = player.id;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', String(isSelected));
    }
    const active = player.activeCharacterIndex >= 0 ? player.characters[player.activeCharacterIndex] : null;
    const maxHp = active ? (active.rank === 'J' ? 30 : active.rank === 'Q' ? 40 : 50) : 30;
    const hpPct = active ? Math.max(0, Math.min(100, (active.hp / maxHp) * 100)) : 0;
    const hpColor = hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#facc15' : '#f87171';
    const shieldPct = active ? Math.max(0, Math.min(100, (active.shield / 20) * 100)) : 0;
    const frameHtml = avatarFrameSvg('frame-default', player.name, 38);
    const livesTotal = player.characters.length;
    const isThinking = player.id === currentTurnPlayerId;
    const suitAb: Record<string,string> = {S:'双倍伤害·♠效果豁免',H:'吸血回复·♥效果豁免',D:'五谷丰登·♦效果豁免',C:'护盾强化·穿甲'};
    const suitTip = active?.suit ? (suitAb[active.suit] ?? '') : '';
    const suitSym2 = active?.suit ? suitSymbol(active.suit) : '';
    const suitClass2 = (active?.suit === 'H' || active?.suit === 'D') ? 'suit-red' : 'suit-black';
    if (isThinking) card.classList.add('bot-thinking');
    card.innerHTML = `
      <div class="opp-sticker-top">
        <span class="opp-id">${player.name}</span>
        ${active?.suit ? `<span class="opp-suit-chip ${suitClass2}" title="${suitTip}">${suitSym2}</span>` : ''}
      </div>
      ${active?.suit ? `<div class="opp-immunity-badge ${suitClass2}">${suitSym2}效果豁免</div>` : ''}
      ${isThinking ? '<div class="opp-thinking-bar"><span class="opp-thinking-dot"></span><span class="opp-thinking-dot"></span><span class="opp-thinking-dot"></span></div>' : ''}
      <div class="opp-avatar-zone">${frameHtml}</div>
      <div class="opp-bars">
        <div class="opp-bar-row">
          <span class="opp-bar-icon">🛡</span>
          <div class="opp-hp-bar"><div class="opp-hp-fill" style="width:${shieldPct}%;background:#60a5fa"></div></div>
          <span class="opp-bar-num">${active?.shield ?? 0}/20</span>
        </div>
        <div class="opp-bar-row">
          <span class="opp-bar-icon">❤</span>
          <div class="opp-hp-bar opp-hp-bar-main"><div class="opp-hp-fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
          <span class="opp-bar-num">${active?.hp ?? '?'}/${maxHp}</span>
        </div>
      </div>
      <div class="opp-footer">
        <span class="opp-hand-num">🃏${player.handCount}</span>
        <span class="opp-lives-num">${player.livesRemaining}❤/${livesTotal}</span>
      </div>
      ${isSelected ? '<div class=\"opp-target-badge\">⚔ 目标</div>' : ''}`;
    // Damage popup
    if (active) {
      const prevHp = prevOpponentHp.get(player.id);
      const dmg = prevHp !== undefined ? prevHp - active.hp : 0;
      if (dmg > 0) {
        const popup = document.createElement('div');
        popup.className = 'damage-number';
        popup.textContent = '-' + String(dmg);
        card.appendChild(popup);
      }
      prevOpponentHp.set(player.id, active.hp);
    }
    return card;
  }));
}

/** Stub: starter selection handled by renderStarterModal */
function renderStarterSelection(_player: PublicPlayerState, _phase: string): void { /* modal active */ }

/** Replaces inline starter selection — now uses a modal */
function renderStarterModal(player: PublicPlayerState, phase: string, currentUser: AppState['currentUser']): void {
  const modal = document.getElementById('starter-modal') as HTMLElement | null;
  const overlay = requiredElement<HTMLElement>('#overlay-layer');
  if (!modal) return;
  const shouldShow = phase === 'SELECTING_STARTER' && player.activeCharacterIndex < 0;
  if (!shouldShow) {
    modal.style.display = 'none';
    if (!document.getElementById('auth-modal')?.classList.contains('open') &&
        !document.getElementById('cosmetics-modal')?.classList.contains('open')) {
      overlay.classList.remove('open');
    }
    return;
  }
  modal.style.display = 'block';
  overlay.classList.add('open');
  const suitEffects: Record<string, string> = {
    S: '双倍伤害', H: '吸血回复', D: '五谷丰登', C: '加盾/穿透',
  };
  const cardsContainer = requiredElement('#starter-modal-cards');
  clearAndAppend(cardsContainer, player.characters.map((char, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `starter-card-big suit-${(char.suit ?? 'S').toLowerCase()}`;
    btn.dataset['action'] = 'select-starter';
    btn.dataset['value'] = String(idx);
    const charMaxHp = char.rank === 'J' ? 30 : char.rank === 'Q' ? 40 : 50;
    const immTooltip = char.suit ? ({
      S: '♠黑桃：免疫其他♠攻击，自身造成双倍伤害',
      H: '♥红桃：免疫其他♥攻击，命中后吸血回复',
      D: '♦方块：免疫其他♦攻击，出牌时全场摸牌',
      C: '♣梅花：免疫其他♣攻击，攻击可穿透护盾',
    } as const)[char.suit] ?? '' : '';
    btn.setAttribute('aria-label', `选择 ${char.rank}${suitSymbol(char.suit)}，满血${charMaxHp}`);
    btn.dataset['tooltip'] = immTooltip;
    btn.innerHTML = `
      <span class="sc-rank">${char.rank}</span>
      <span class="sc-suit">${suitSymbol(char.suit)}</span>
      <div class="sc-hp-bar-wrap">
        <div class="sc-hp-bar"><div class="sc-hp-fill" style="width:100%;background:#4ade80"></div></div>
        <span class="sc-hp-num">${charMaxHp}/${charMaxHp}</span>
      </div>`;
    return btn;
  }));

}

function renderJokerActions(
  player: PublicPlayerState, phase: string,
  pendingDying: { readonly playerId: string; readonly deadlineAt: number } | null,
  playerId: string,
  players: readonly PublicPlayerState[],
): void {
  const container = requiredElement('#joker-actions');
  if (phase !== 'WAITING_FOR_JOKER' || !pendingDying || !player.hand) { container.replaceChildren(); return; }
  const jokerIndices = player.hand.map((c, i) => c.isJoker ? i : -1).filter((i) => i >= 0);
  const dyingPlayer = players.find((p) => p.id === pendingDying.playerId);
  const dyingName = dyingPlayer?.name ?? '???';
  const secsLeft = Math.max(0, Math.ceil((pendingDying.deadlineAt - Date.now()) / 1000));
  const isSelfDying = pendingDying.playerId === playerId;

  // 三国杀-style dying banner
  const banner = document.createElement('div');
  banner.className = 'peach-dying-banner';
  banner.innerHTML = `<span class="peach-dying-skull">💀</span><span class="peach-dying-who">${dyingName}</span><span class="peach-dying-label"> 气血归零！濒死！</span><span class="peach-dying-timer">⏱${secsLeft}s</span>`;
  const nodes: HTMLElement[] = [banner];

  if (isSelfDying && jokerIndices[0] !== undefined) {
    const btn = button('🃏 出桃自救', 'rescue-joker', String(jokerIndices[0]));
    btn.className += ' peach-rescue-btn';
    nodes.push(btn);
  } else if (!isSelfDying && jokerIndices.length >= 2) {
    const btn = button('⚡ 双桃斩杀', 'execute-joker', `${jokerIndices[0]},${jokerIndices[1]}`);
    btn.className += ' peach-execute-btn';
    nodes.push(btn);
  } else {
    const unavail = document.createElement('p');
    unavail.className = 'neo-body muted peach-no-action';
    unavail.textContent = isSelfDying ? '手中无桃，无法自救…' : '无双桃，无法斩杀';
    nodes.push(unavail);
  }
  clearAndAppend(container, nodes);
}

function renderHand(
  cards: readonly Card[],
  selected: ReadonlySet<number>,
  canSelect: boolean,
  isNewDeal: boolean,
  jokerDyingIdx?: number,
  wanhuaPending: WanhuaPending | null = null,
): void {
  const container = requiredElement('#hand');
  const existingCount = container.querySelectorAll('.poker-card').length;

  // 万化合体：恰好 1 张 A + 1 张普通牌时才显示按钮
  const selArr = [...selected];
  const aceIndices    = selArr.filter(i => cards[i]?.rank === 'A' && !cards[i]!.isJoker);
  const normalIndices = selArr.filter(i => cards[i] && cards[i]!.rank !== 'A' && !cards[i]!.isJoker);
  const isExactWanhua = aceIndices.length === 1 && normalIndices.length === 1;

  const wanhuaBar = document.getElementById('wanhua-bar') as HTMLElement | null;
  if (wanhuaBar) {
    if (wanhuaPending) {
      // 已合成 → 不需要显示按钮
      wanhuaBar.style.display = 'none';
    } else if (isExactWanhua) {
      // 恰好选了 1A + 1普通牌 → 显示合成按钮
      wanhuaBar.style.display = '';
      const _sn: Record<string,string> = { S:'♠黑桃', H:'♥红心', D:'♦方块', C:'♣梅花' };
      const aceCard  = cards[aceIndices[0]!];
      const normCard = cards[normalIndices[0]!];
      const synthVal = (normCard?.value ?? 0) + 1;
      const suitHint = [aceCard?.suit, normCard?.suit]
        .filter((s): s is NonNullable<typeof s> => s != null)
        .filter((v, i, a) => a.indexOf(v) === i)
        .map(s => _sn[s] ?? s).join(' / ');
      wanhuaBar.innerHTML =
        `<button class="neo-btn primary wanhua-merge-btn" type="button"
           data-action="activate-wanhua">⚡ 万化合体 → ${synthVal}点</button>
         <span class="wh-suit-hint">${suitHint}</span>`;
    } else {
      wanhuaBar.style.display = 'none';
    }
  }

  // 发牌动画起点：右上角牌堆
  const deckEl  = document.getElementById('deck-stack');
  const deckRect = deckEl?.getBoundingClientRect();

  // 合成牌：仅当 declaredSuit 已确认后才隐藏原始两张并显示合成牌
  // declaredSuit=null 代表弹窗等待中，原始牌应保持可见
  const synthReady = wanhuaPending?.declaredSuit != null;
  const skipIndices = synthReady
    ? new Set([wanhuaPending!.aceIndex, wanhuaPending!.partnerIndex])
    : new Set<number>();
  const synthCard = synthReady ? buildSynthCard(wanhuaPending!) : null;

  clearAndAppend(container, [
    ...cards.map((card, index) => {
      if (skipIndices.has(index)) return null;
      return buildHandCard(card, index, selected, canSelect, isNewDeal,
        existingCount, deckRect, jokerDyingIdx);
    }).filter((el): el is HTMLButtonElement => el !== null),
    ...(synthCard ? [synthCard] : []),
  ]);
}


function buildSynthCard(pending: WanhuaPending): HTMLButtonElement {
  const { declaredSuit, synthValue, partnerRank } = pending;
  if (!declaredSuit) throw new Error('declaredSuit required');
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'poker-card wanhua-synth';
  el.dataset['action'] = 'play-wanhua-synth';
  el.dataset['suit'] = declaredSuit;
  const suitSym: Record<string,string> = { S:'♠', H:'♥', D:'♦', C:'♣' };
  const isRed = declaredSuit === 'H' || declaredSuit === 'D';
  el.innerHTML = `
    <span class="card-rank${isRed ? ' suit-red-text' : ''}">${synthValue}</span>
    <span class="card-suit${isRed ? ' suit-red-text' : ''}">${suitSym[declaredSuit] ?? declaredSuit}</span>
    <span class="synth-badge">合成</span>`;
  el.setAttribute('aria-label', `万化合成牌：${synthValue}${suitSym[declaredSuit]}，点击出牌`);
  el.classList.add('dealing');
  el.addEventListener('animationend', () => el.classList.remove('dealing'), { once: true });
  return el;
}

function buildHandCard(
  card: Card, index: number,
  selected: ReadonlySet<number>, canSelect: boolean,
  isNewDeal: boolean, existingCount: number,
  deckRect: DOMRect | undefined, jokerDyingIdx: number | undefined,
): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `poker-card${selected.has(index) ? ' selected' : ''}`;
  el.dataset['action'] = 'toggle-card';
  el.dataset['value'] = String(index);
  el.dataset['suit'] = card.suit ?? 'JOKER';
  const isRescueJoker = jokerDyingIdx !== undefined && index === jokerDyingIdx;
  el.disabled = isRescueJoker ? false : !canSelect;
  if (isRescueJoker) {
    el.dataset['action'] = 'rescue-joker';
    el.dataset['value'] = String(index);
    el.classList.add('joker-rescue-active');
  }
  el.setAttribute('aria-pressed', selected.has(index) ? 'true' : 'false');
  if (card.isJoker) {
    el.innerHTML =
      '<span class="card-rank joker-card">'
      + '<svg class="joker-svg" width="28" height="32" viewBox="0 0 28 32" xmlns="http://www.w3.org/2000/svg" aria-label="Joker">'
      + '<circle cx="14" cy="20" r="9" fill="#fffde7" stroke="#333" stroke-width="1"/>'
      + '<path d="M5,14 Q6,2 14,4 Q22,2 23,14" fill="#e53e3e" stroke="#333" stroke-width="1"/>'
      + '<path d="M9,7 Q12,1 14,4" fill="#7c3aed" stroke="#333" stroke-width="1"/>'
      + '<path d="M14,4 Q16,1 19,7" fill="#059669" stroke="#333" stroke-width="1"/>'
      + '<circle cx="9" cy="6" r="2" fill="#fbbf24"/>'
      + '<circle cx="14" cy="3" r="2" fill="#fbbf24"/>'
      + '<circle cx="19" cy="6" r="2" fill="#fbbf24"/>'
      + '<circle cx="11" cy="19" r="1.5" fill="#1a1a1a"/>'
      + '<circle cx="17" cy="19" r="1.5" fill="#1a1a1a"/>'
      + '<path d="M10,23 Q14,27 18,23" fill="none" stroke="#333" stroke-width="1.2"/>'
      + '<ellipse cx="14" cy="22" rx="2" ry="1.2" fill="#f87171"/></svg>'
      + '</span><span class="card-suit">JOKER</span>';
  } else {
    el.innerHTML = `<span class="card-rank">${card.rank}</span><span class="card-suit">${suitSymbol(card.suit)}</span>`;
  }
  if (isNewDeal && index >= existingCount) {
    const delay = (index - existingCount) * 80;
    if (deckRect) {
      el.style.opacity = '0';
      const deckCX = deckRect.left + deckRect.width / 2 - 36;
      const deckCY = deckRect.top;
      const clone = document.createElement('div');
      clone.className = 'card-deal-clone';
      clone.style.cssText = [
        'position:fixed',
        `left:${deckCX}px`, `top:${deckCY}px`,
        'width:72px', 'height:104px',
        'z-index:9990', 'pointer-events:none',
        'transition:none',
      ].join(';');
      document.body.appendChild(clone);
      void clone.getBoundingClientRect();
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        const tx = r.left - deckCX;
        const ty = r.top  - deckCY;
        clone.style.transition = `transform 320ms cubic-bezier(.2,.8,.3,1.1) ${delay}ms, opacity 80ms ease ${delay + 260}ms`;
        clone.style.transform  = `translate(${tx}px,${ty}px)`;
        clone.style.opacity    = '0';
        setTimeout(() => {
          clone.remove();
          el.style.opacity = '';
          el.classList.add('dealing');
          el.addEventListener('animationend', () => el.classList.remove('dealing'), { once: true });
        }, delay + 360);
      }, 16);
    } else {
      el.classList.add('dealing');
      el.style.animationDelay = `${delay}ms`;
      el.addEventListener('animationend', () => { el.classList.remove('dealing'); el.style.animationDelay = ''; }, { once: true });
    }
  }
  return el;
}



function renderTargetsHidden(players: readonly PublicPlayerState[], playerId: string, selectedTargetId: string | null): void {
  const select = requiredElement<HTMLSelectElement>('#target-player');
  const options = players.filter((p) => p.id !== playerId && !p.isEliminated).map((p) => {
    const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; return o;
  });
  clearAndAppend(select, options);
  if (selectedTargetId && options.some((o) => o.value === selectedTargetId)) select.value = selectedTargetId;
}


/** 广播区域完整玩家卡片：显示 HP/护盾条、角色花色、手牌数 */
function buildBcPlayerCard(
  player: import('@pokewar/domain').PublicPlayerState | undefined,
  name: string,
  isDefender: boolean,
): string {
  if (!player) {
    return `<div class="bc-player-card bc-player-mini">
      <span class="bc-pc-name">${name}</span>
    </div>`;
  }
  const active = player.activeCharacterIndex >= 0
    ? player.characters[player.activeCharacterIndex] : null;
  const maxHp = active ? (active.rank === 'J' ? 30 : active.rank === 'Q' ? 40 : 50) : 30;
  const hpPct = active ? Math.max(0, Math.min(100, (active.hp / maxHp) * 100)) : 0;
  const shieldPct = active ? Math.max(0, Math.min(100, (active.shield / 20) * 100)) : 0;
  const hpColor = hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#facc15' : '#f87171';
  const suitMap: Record<string,string> = { S:'♠', H:'♥', D:'♦', C:'♣' };
  const suitClass = (active?.suit === 'H' || active?.suit === 'D') ? 'suit-red' : 'suit-black';
  const suitChip = active?.suit
    ? `<span class="bc-pc-suit ${suitClass}">${suitMap[active.suit]}</span>` : '';
  const role = isDefender ? 'bc-player-defend' : 'bc-player-attack';
  return `<div class="bc-player-card ${role}">
    <div class="bc-pc-header">
      <span class="bc-pc-name">${name}</span>${suitChip}
    </div>
    <div class="bc-pc-bar-row">
      <span class="bc-pc-icon">🛡</span>
      <div class="bc-pc-bar"><div class="bc-pc-fill" style="width:${shieldPct}%;background:#60a5fa"></div></div>
    </div>
    <div class="bc-pc-bar-row">
      <span class="bc-pc-icon">❤</span>
      <div class="bc-pc-bar"><div class="bc-pc-fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
      <span class="bc-pc-hp">${active?.hp ?? '?'}/${maxHp}</span>
    </div>
    <div class="bc-pc-footer">
      <span class="bc-pc-cards">🃏${player.handCount}</span>
      <span class="bc-pc-lives">${player.livesRemaining}❤</span>
    </div>
  </div>`;
}

function renderBroadcastDisplay(
  broadcast: BroadcastData | null,
  players: readonly import('@pokewar/domain').PublicPlayerState[] = [],
): void {
  const container = document.getElementById('broadcast-display');
  if (!container) return;
  if (!broadcast) {
    container.innerHTML = '<span class="bc-idle-hint">等待出牌…</span>';
    return;
  }
  const suitMap = { S: '♠', H: '♥', D: '♦', C: '♣' } as const;
  const suitSym = broadcast.suit ? suitMap[broadcast.suit] : '🃏';
  const suitColor = broadcast.suit === 'H' || broadcast.suit === 'D' ? 'var(--color-suit-red)' : 'var(--color-suit-black)';
  const suitEffectName: Record<string, string> = {
    S: '双倍伤害', H: '吸血攻击', D: '五谷丰登', C: '护盾强化',
  };
  const skillName = broadcast.suit ? (suitEffectName[broadcast.suit] ?? '出牌') : '出牌';
  const _atkPlayer = players.find(p => p.name === broadcast.attackerName);
  const attackerSvg = buildBcPlayerCard(_atkPlayer, broadcast.attackerName, false);
  const isSelfBuff = broadcast.suit === 'C';
  const _defName = isSelfBuff ? broadcast.attackerName : (broadcast.targetName ?? null);
  const _defPlayer = _defName ? players.find(p => p.name === _defName) : undefined;
  const defenderSvg = _defName
    ? buildBcPlayerCard(_defPlayer, _defName, true)
    : `<div class="bc-all-players">🌍 全场</div>`;
  const targetLabel = isSelfBuff ? broadcast.attackerName : (broadcast.targetName ?? '全场');
  const cardInner = inlineMiniCard(broadcast.rank, suitSym, suitColor);
  container.innerHTML = `
    <div class="bc-sgs-scene ${isSelfBuff ? 'bc-sgs-self' : ''}">
      <div class="bc-sgs-connector" aria-hidden="true">
        <svg class="bc-conn-svg" viewBox="0 0 300 10" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.3"/>
            <stop offset="60%" stop-color="var(--color-danger)" stop-opacity="1"/>
            <stop offset="100%" stop-color="var(--color-danger)" stop-opacity="0.3"/>
          </linearGradient></defs>
          <line x1="0" y1="5" x2="290" y2="5" stroke="url(#cg)" stroke-width="2.5" class="bc-conn-line"/>
          <polygon points="284,1 300,5 284,9" fill="var(--color-danger)" class="bc-conn-head"/>
        </svg>
      </div>
      <div class="bc-sgs-attacker">
        <div class="bc-sgs-frame bc-sgs-frame-attack bc-aura-active">${attackerSvg}</div>
        <span class="bc-sgs-name bc-sgs-name-attack">${broadcast.attackerName}</span>
      </div>
      <div class="bc-sgs-center">
        <div class="bc-sgs-card">${cardInner}</div>
        <div class="bc-sgs-skill" style="color:${suitColor}">${skillName}</div>
        <svg class="bc-sgs-arrow" viewBox="0 0 120 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="arr-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.3"/>
              <stop offset="100%" stop-color="var(--color-danger)" stop-opacity="1"/>
            </linearGradient>
          </defs>
          <line x1="4" y1="12" x2="104" y2="12" stroke="url(#arr-grad)" stroke-width="3" stroke-linecap="round" class="bc-sgs-line"/>
          <polygon points="104,5 120,12 104,19" fill="var(--color-danger)" class="bc-sgs-arrowhead"/>
        </svg>
      </div>
      <div class="bc-sgs-defender">
        <div class="bc-sgs-frame bc-sgs-frame-defend bc-impact-active">${defenderSvg}</div>
        <span class="bc-sgs-name bc-sgs-name-defend">${targetLabel}</span>
      </div>
    </div>
    <div class="bc-dmg-float" aria-live="polite" aria-label="伤害信息">
      <span class="bc-dmg-icon">⚔️</span>
      <span class="bc-dmg-text">
        <strong style="color:var(--color-primary)">${broadcast.attackerName}</strong>
        <span> 出牌 · </span>
        <strong style="color:${suitColor}">${skillName}</strong>
      </span>
    </div>`;
}


function inlineMiniCard(rank: string, suitSym: string, suitColor: string): string {
  return `<svg width="40" height="58" viewBox="0 0 40 58" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="38" height="56" rx="5" fill="var(--color-surface)" stroke="var(--color-text)" stroke-width="2"/>
    <text x="6" y="16" font-family="Impact, Arial Black" font-size="12" font-weight="bold" fill="${suitColor}">${rank}</text>
    <text x="20" y="36" text-anchor="middle" font-size="18" fill="${suitColor}">${suitSym}</text>
  </svg>`;
}


function renderChat(state: AppState): void {
  const chatEl = requiredElement<HTMLElement>('#chat-system');
  const inWaitingRoom = state.gameMode === 'online' && state.room !== null && state.game === null;
  chatEl.classList.toggle('visible', inWaitingRoom);
  const chatItems = state.chats.slice(-30).map((chat) => {
    const p = document.createElement('p');
    const name = document.createElement('strong'); name.textContent = `${chat.playerName}: `;
    p.append(name, document.createTextNode(chat.text));
    return p;
  });
  clearAndAppend(requiredElement('#chat-list'), chatItems);
  const inGameList = document.getElementById('in-game-chat-list') as HTMLElement | null;
  if (inGameList) {
    const items = state.chats.slice(-30).map((chat) => {
      const p = document.createElement('p');
      const name = document.createElement('strong'); name.textContent = `${chat.playerName}: `;
      p.append(name, document.createTextNode(chat.text));
      return p;
    });
    clearAndAppend(inGameList, items);
    inGameList.scrollTop = inGameList.scrollHeight;
  }
}

function renderLeaderboard(state: AppState): void {
  const list = requiredElement('#leaderboard-list');
  const entries = getMockLeaderboard(state.currentUser);
  clearAndAppend(list, entries.map((entry) => {
    const row = document.createElement('div');
    row.className = `lb-row${entry.isCurrentUser ? ' lb-me' : ''}`;
    const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;
    row.innerHTML = `<span class="lb-rank">${medal}</span><span class="lb-name">${entry.username}</span><span class="lb-score">${entry.eloScore} ELO</span><span class="lb-wins">${entry.wins}胜</span>`;
    return row;
  }));
}

function renderProfile(state: AppState): void {
  const user = state.currentUser;
  if (!user) return;
  const total = user.wins + user.losses;
  const winRate = total ? Math.round((user.wins / total) * 100) : 0;
  requiredElement('#profile-username').textContent = user.username;
  requiredElement('#profile-elo').textContent = String(user.eloScore);
  requiredElement('#profile-stats').innerHTML = `
    <div class="stat-item"><span class="stat-val">${user.wins}</span><span class="stat-label">胜场</span></div>
    <div class="stat-item"><span class="stat-val">${user.losses}</span><span class="stat-label">败场</span></div>
    <div class="stat-item"><span class="stat-val">${winRate}%</span><span class="stat-label">胜率</span></div>
    <div class="stat-item"><span class="stat-val">${user.botWins}</span><span class="stat-label">人机胜</span></div>`;
  requiredElement('#profile-avatar-frame').innerHTML = avatarFrameSvg(user.cosmeticFrameId, user.username, 80);
}

function renderModal(state: AppState): void {
  const overlay = requiredElement<HTMLElement>('#overlay-layer');
  const authModal = requiredElement<HTMLElement>('#auth-modal');
  const cosmeticsModal = requiredElement<HTMLElement>('#cosmetics-modal');
  const wanhuaModal = document.getElementById('wanhua-modal') as HTMLElement | null;
  authModal.classList.toggle('open', state.modalView === 'auth');
  cosmeticsModal.classList.toggle('open', state.modalView === 'cosmetics');
  if (wanhuaModal) wanhuaModal.classList.toggle('open', state.modalView === 'wanhua');
  overlay.classList.toggle('open', state.modalView !== null);
  if (state.modalView === 'cosmetics') renderCosmeticsModal(state);
  if (state.modalView === 'wanhua') renderWanhuaModal(state);
}

function renderWanhuaModal(state: AppState): void {
  const pending = state.wanhuaPending;
  if (!pending) return;
  const self = state.game?.players.find(p => p.id === state.playerId);
  const hand = self?.hand ?? [];
  const aceCard  = hand[pending.aceIndex];
  const normCard = hand[pending.partnerIndex];
  if (!aceCard || !normCard) return;

  const suitSym: Record<string,string> = { S:'♠', H:'♥', D:'♦', C:'♣' };
  const suitName: Record<string,string> = { S:'黑桃', H:'红心', D:'方块', C:'梅花' };
  const suitColor = (s: string) => (s === 'H' || s === 'D') ? 'var(--color-suit-red)' : 'var(--color-suit-black)';

  // ── Source cards preview ─────────────────────────────────────────────────
  const srcContainer = document.getElementById('wanhua-source-cards');
  if (srcContainer) {
    srcContainer.innerHTML = '';
    [aceCard, normCard].forEach(card => {
      const div = document.createElement('div');
      div.className = 'wh-preview-card';
      const s = card.suit ?? 'S';
      div.innerHTML = `
        <span class="wh-prev-rank" style="color:${suitColor(s)}">${card.rank}</span>
        <span class="wh-prev-suit" style="color:${suitColor(s)}">${suitSym[s] ?? s}</span>`;
      srcContainer.appendChild(div);
      if (card === aceCard) {
        const plus = document.createElement('span');
        plus.className = 'wh-plus'; plus.textContent = '+';
        srcContainer.appendChild(plus);
      }
    });
    const arrow = document.createElement('span');
    arrow.className = 'wh-arrow'; arrow.textContent = '→';
    const result = document.createElement('div');
    result.className = 'wh-preview-card wh-preview-result';
    const rs = pending.declaredSuit ?? pending.availableSuits[0];
    if (rs) {
      result.innerHTML = `
        <span class="wh-prev-rank" style="color:${suitColor(rs)}">${pending.synthValue}</span>
        <span class="wh-prev-suit" style="color:${suitColor(rs)}">${suitSym[rs] ?? rs}</span>
        <span class="wh-prev-tag">合成</span>`;
    }
    srcContainer.appendChild(arrow);
    srcContainer.appendChild(result);
  }

  // ── Suit option buttons ──────────────────────────────────────────────────
  const optContainer = document.getElementById('wanhua-suit-options');
  if (optContainer) {
    clearAndAppend(optContainer, pending.availableSuits.map(suit => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isSelected = pending.declaredSuit === suit;
      btn.className = `neo-btn wh-suit-option${isSelected ? ' wh-suit-selected' : ''}`;
      const isRed = suit === 'H' || suit === 'D';
      btn.style.color = isRed ? 'var(--color-suit-red)' : 'var(--color-suit-black)';
      btn.dataset['action'] = 'select-wanhua-suit';
      btn.dataset['value'] = suit;
      btn.innerHTML = `<span class="wh-opt-sym">${suitSym[suit]}</span><span class="wh-opt-name">${suitName[suit]}</span>`;
      btn.setAttribute('aria-pressed', String(isSelected));
      return btn;
    }));
  }
}

function renderCosmeticsModal(state: AppState): void {
  const user = state.currentUser;
  if (!user) return;
  const frames = [
    { id: 'frame-default', label: '默认', tier: 'common' },
    { id: 'frame-gold', label: '黄金', tier: 'rare' },
    { id: 'frame-dragon', label: '龙纹', tier: 'epic' },
    { id: 'frame-neon', label: '霓虹', tier: 'legendary' },
    { id: 'frame-sakura', label: '樱花', tier: 'rare' },
    { id: 'frame-storm', label: '风暴', tier: 'epic' },
  ];
  const titles = [
    { id: 'title-none', label: '无称号' }, { id: 'title-novice', label: '初心者' },
    { id: 'title-veteran', label: '老将' }, { id: 'title-legend', label: '传奇' },
  ];
  clearAndAppend(requiredElement('#cosmetics-frames'), frames.map((f) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `frame-item tier-${f.tier}${user.cosmeticFrameId === f.id ? ' active' : ''}`;
    item.dataset['action'] = 'set-frame'; item.dataset['value'] = f.id;
    item.innerHTML = `${avatarFrameSvg(f.id, user.username, 56)}<span>${f.label}</span>`;
    return item;
  }));
  clearAndAppend(requiredElement('#cosmetics-titles'), titles.map((t) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `title-item${user.cosmeticTitleId === t.id ? ' active' : ''}`;
    item.dataset['action'] = 'set-title'; item.dataset['value'] = t.id;
    item.textContent = t.label;
    return item;
  }));
}

/* == Helpers ================================================================ */
function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    SELECTING_STARTER: '🎴 选首发', PLAYING: '⚔️ 对战',
    WAITING_FOR_JOKER: '🃏 Joker', GAME_OVER: '🏆 结算',
  };
  return map[phase] ?? phase;
}

function suitSymbol(suit: Card['suit']): string {
  return suit ? ({ S: '♠', H: '♥', D: '♦', C: '♣' } as const)[suit] : '';
}

function titleLabel(id: string): string {
  const map: Record<string, string> = {
    'title-none': '', 'title-novice': '【初心者】', 'title-veteran': '【老将】', 'title-legend': '【传奇】',
  };
  return map[id] ?? '';
}

function renderReconnectBanner(state: AppState): void {
  const banner = document.getElementById('reconnect-banner');
  if (banner instanceof HTMLElement) banner.hidden = !state.reconnecting;
}

function renderMultiplayerPanel(state: AppState): void {
  const panel = document.getElementById('multiplayer-panel');
  if (panel instanceof HTMLElement) panel.hidden = !state.multiplayerOpen;
}

export function avatarFrameSvg(frameId: string, username: string, size = 40): string {
  const initials = username.slice(0, 1).toUpperCase();
  const frames: Record<string, string> = {
    'frame-default': `<circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-primary)" stroke-width="6"/>`,
    'frame-gold': `<circle cx="50" cy="50" r="44" fill="none" stroke="#f5c518" stroke-width="6"/><circle cx="50" cy="50" r="38" fill="none" stroke="#c8950a" stroke-width="2" stroke-dasharray="6 4"/>`,
    'frame-dragon': `<path d="M50 6 L94 50 L50 94 L6 50Z" fill="none" stroke="#a855f7" stroke-width="5"/>`,
    'frame-neon': `<circle cx="50" cy="50" r="44" fill="none" stroke="#00ffe7" stroke-width="5"/>`,
    'frame-sakura': `<circle cx="50" cy="50" r="44" fill="none" stroke="#fb7185" stroke-width="5"/><circle cx="50" cy="10" r="4" fill="#fb7185"/><circle cx="90" cy="50" r="4" fill="#fb7185"/>`,
    'frame-storm': `<circle cx="50" cy="50" r="44" fill="none" stroke="#60a5fa" stroke-width="4"/>`,
  };
  const framePath = frames[frameId] ?? frames['frame-default']!;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="var(--color-surface)"/><text x="50" y="56" text-anchor="middle" font-size="28" font-weight="bold" fill="var(--color-text)" font-family="system-ui">${initials}</text>${framePath}</svg>`;
}

export function toast(message: string, kind: 'normal' | 'danger' = 'normal'): void {
  const container = requiredElement('#toast-container');
  const item = document.createElement('div');
  item.className = `toast ${kind}`;
  item.textContent = message;
  container.append(item);
  window.setTimeout(() => item.remove(), 4_000);
}

export function triggerAttackAnimation(targetName: string): void {
  const card = document.querySelector<HTMLElement>(`[data-action="select-target"][data-value="${targetName}"]`);
  if (!card) return;
  card.classList.remove('attacking');
  void card.offsetWidth;
  card.classList.add('attacking');
  card.addEventListener('animationend', () => card.classList.remove('attacking'), { once: true });
}




