import './style.css';
import type { ClientMessage, ServerMessage } from '@pokewar/protocol';
import { requiredElement } from './dom.ts';
import { render, toast, triggerAttackAnimation, triggerCardPlayAnim, triggerJokerRescueAnim, triggerCardPlayFlightAnim } from './render.ts';
import { Store, authLogin, authLogout, authRegister, authRestore, authUpdateUser } from './store.ts';
import { WSClient } from './ws-client.ts';
import { LocalGameManager, LOCAL_HUMAN_ID } from './local-game.ts';
import type { HumanAction } from './local-game.ts';
import { audio } from './audio.ts';
import { deriveWanhuaSuit } from './wanhua-utils.ts';

const store = new Store();
let client: WSClient;
let localGame: LocalGameManager | null = null;
let turnTimerInterval: ReturnType<typeof setInterval> | null = null;
let turnDeadline: number | null = null;

function boot(): void {
  const url = import.meta.env['VITE_WS_URL'] ?? inferWebSocketUrl();
  client = new WSClient(url, store, handleServerMessage);
  store.subscribe(render);
  store.subscribe(handleTurnTimer);
  bindEvents();
  restoreTheme();
  const restored = authRestore();
  if (restored) store.set({ currentUser: restored });
  // Only auto-connect when resuming a previous online session
  if (localStorage.getItem('pokewar.reconnectToken')) {
    client.connect();
  }
}

function bindEvents(): void {
  requiredElement<HTMLFormElement>('#create-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = playerName();
    send({ type: 'create_room', requestId: crypto.randomUUID(), payload: { playerName: name } });
  });

  requiredElement<HTMLFormElement>('#join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const code = requiredElement<HTMLInputElement>('#join-code').value.trim().toUpperCase();
    if (code.length !== 6) return toast('请填写六位房间码', 'danger');
    const name = playerName();
    send({ type: 'join_room', requestId: crypto.randomUUID(), payload: { playerName: name, roomCode: code } });
  });

  requiredElement<HTMLFormElement>('#chat-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = requiredElement<HTMLInputElement>('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    if (store.state.gameMode === 'local') { input.value = ''; return; }
    send({ type: 'chat', requestId: crypto.randomUUID(), payload: { text } });
    input.value = '';
  });

  requiredElement<HTMLFormElement>('#auth-login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const username = requiredElement<HTMLInputElement>('#auth-username').value.trim();
    const password = requiredElement<HTMLInputElement>('#auth-password').value;
    const result = authLogin(username, password);
    if (typeof result === 'string') return toast(result, 'danger');
    store.set({ currentUser: result, modalView: null });
    toast(`欢迎回来，${result.username}！`);
    audio.play('ready');
  });

  requiredElement<HTMLFormElement>('#auth-register-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const username = requiredElement<HTMLInputElement>('#reg-username').value.trim();
    const password = requiredElement<HTMLInputElement>('#reg-password').value;
    if (username.length < 2) return toast('昵称至少2个字符', 'danger');
    if (password.length < 4) return toast('密码至少4位', 'danger');
    const result = authRegister(username, password);
    if (typeof result === 'string') return toast(result, 'danger');
    store.set({ currentUser: result, modalView: null });
    toast(`注册成功，欢迎 ${result.username}！`);
    audio.play('ready');
  });


  const inGameChatForm = document.getElementById('in-game-chat-form') as HTMLFormElement | null;
  inGameChatForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('in-game-chat-input') as HTMLInputElement | null;
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    if (store.state.gameMode === 'local') { input.value = ''; return; }
    send({ type: 'chat', requestId: crypto.randomUUID(), payload: { text } });
    input.value = '';
  });

  // Unlock audio on first interaction and attach click sounds
  document.addEventListener('click', () => { audio.unlock(); }, { once: true, capture: true });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
    if (!target) return;
    audio.play('click');
    handleAction(target.dataset['action'] ?? '', target.dataset['value']);
  });
}

function handleAction(action: string, value?: string): void {
  switch (action) {
    case 'toggle-theme': toggleTheme(); break;
    case 'open-auth': store.set({ modalView: 'auth' }); audio.play('select'); break;
    case 'close-modal': store.set({ modalView: null }); break;
    case 'open-cosmetics':
      if (!store.state.currentUser) return toast('请先登录', 'danger');
      store.set({ modalView: 'cosmetics' });
      audio.play('select');
      break;
    case 'activate-wanhua': {
      // 触发条件：恰好选中 1张A + 1张普通牌
      const _awHand = store.state.game?.players.find((p) => p.id === store.state.playerId)?.hand;
      if (!_awHand) { toast('手牌数据未就绪', 'danger'); break; }
      const _awSel = [...store.state.selectedCardIndices];
      const _aceIdxArr   = _awSel.filter(i => _awHand[i]?.rank === 'A' && !_awHand[i]!.isJoker);
      const _normIdxArr  = _awSel.filter(i => _awHand[i] && _awHand[i]!.rank !== 'A' && !_awHand[i]!.isJoker);
      if (_aceIdxArr.length !== 1 || _normIdxArr.length !== 1) {
        toast('万化合体需恰好选 1 张 A + 1 张普通牌', 'danger'); break;
      }
      const _aceIdx  = _aceIdxArr[0]!;
      const _normIdx = _normIdxArr[0]!;
      const _aceCard  = _awHand[_aceIdx]!;
      const _normCard = _awHand[_normIdx]!;
      // 弹窗可选花色 = 两张牌涉及的去重花色
      const _suits = [...new Set([_aceCard.suit, _normCard.suit].filter(Boolean))] as import('@pokewar/domain').Suit[];
      store.set({
        modalView: 'wanhua',
        wanhuaPending: {
          aceIndex: _aceIdx,
          partnerIndex: _normIdx,
          availableSuits: _suits,
          declaredSuit: null,
          synthValue: (_normCard.value ?? 0) + 1,
          partnerRank: _normCard.rank,
        },
      });
      audio.play('select');
      break;
    }
    case 'cancel-wanhua':
      store.set({ modalView: null, wanhuaPending: null, selectedCardIndices: new Set<number>() });
      break;
    case 'select-wanhua-suit': {
      const pending = store.state.wanhuaPending;
      if (!pending || !value) break;
      // 确认花色 → 关闭弹窗，保留 wanhuaPending（含 declaredSuit）
      store.set({
        modalView: null,
        wanhuaPending: { ...pending, declaredSuit: value as import('@pokewar/domain').Suit },
      });
      audio.play('select');
      break;
    }
    case 'play-wanhua-synth': {
      const pending = store.state.wanhuaPending;
      if (!pending?.declaredSuit) { toast('请先完成万化合体', 'danger'); break; }
      const targetPlayerId = store.state.selectedTargetId
        ?? requiredElement<HTMLSelectElement>('#target-player').value;
      // 播放飞行动画
      const handEl = document.getElementById('hand');
      const broadcastEl = document.getElementById('broadcast-display');
      if (handEl && broadcastEl) {
        const synthEl = handEl.querySelector<HTMLElement>('.wanhua-synth');
        const _s = pending.declaredSuit;
        const _sm: Record<string,string> = {S:'♠',H:'♥',D:'♦',C:'♣'};
        const _sc: Record<string,string> = {S:'var(--color-suit-black)',H:'var(--color-suit-red)',D:'var(--color-suit-red)',C:'var(--color-suit-black)'};
        triggerCardPlayFlightAnim(synthEl ? [synthEl] : [], broadcastEl, () => {
          triggerCardPlayAnim(_sm[_s] ?? '🃏', _sc[_s] ?? 'inherit');
        });
      }
      handleGameAction({
        type: 'play_cards',
        cardIndices: [pending.aceIndex, pending.partnerIndex],
        ...(targetPlayerId ? { targetPlayerId } : {}),
        declaredSuit: pending.declaredSuit,
      });
      store.set({ selectedCardIndices: new Set<number>(), selectedTargetId: null, wanhuaPending: null });
      audio.play('attack');
      break;
    }
    case 'set-frame': {
      const user = store.state.currentUser;
      if (!user || !value) break;
      const updated = { ...user, cosmeticFrameId: value };
      authUpdateUser(updated);
      store.set({ currentUser: updated });
      toast('头像框已更换！');
      audio.play('select');
      break;
    }
    case 'set-title': {
      const user = store.state.currentUser;
      if (!user || !value) break;
      const updated = { ...user, cosmeticTitleId: value };
      authUpdateUser(updated);
      store.set({ currentUser: updated });
      toast('称号已更换！');
      audio.play('select');
      break;
    }
    case 'logout':
      authLogout();
      store.set({ currentUser: null, modalView: null });
      toast('已退出登录');
      break;
    case 'toggle-multiplayer':
      if (!store.state.multiplayerOpen && store.state.connection === 'offline') {
        client.connect(); // Lazy-connect only when user opens online panel
      }
      store.set({ multiplayerOpen: !store.state.multiplayerOpen });
      break;
    case 'go-leaderboard': store.set({ activePage: 'leaderboard', multiplayerOpen: false }); break;
    case 'go-profile':
      if (!store.state.currentUser) return toast('请先登录查看档案', 'danger');
      store.set({ activePage: 'profile', multiplayerOpen: false });
      break;
    case 'go-home':
      store.set({ activePage: 'home', room: null, game: null, gameMode: 'online', multiplayerOpen: false });
      if (localGame) { localGame.destroy(); localGame = null; }
      stopTurnTimer();
      break;
    case 'go-bot-lobby': store.set({ activePage: 'bot-lobby', multiplayerOpen: false }); audio.play('select'); break;
    case 'start-bot-game': startBotGame(); break;
    case 'toggle-ready':
      send({ type: 'toggle_ready', requestId: crypto.randomUUID() });
      audio.play('ready');
      break;
    case 'start-game': {
      const maxLivesEl = document.querySelector<HTMLSelectElement>('#max-lives');
      const maxLives = maxLivesEl ? parseInt(maxLivesEl.value, 10) : 3;
      send({ type: 'start_game', requestId: crypto.randomUUID(), payload: { maxLives } });
      break;
    }
    case 'quick-match':
      send({ type: 'quick_match', requestId: crypto.randomUUID(), payload: { playerName: playerName() } });
      break;
    case 'select-starter':
      triggerJokerRescueAnim('self-panel', null);
      handleGameAction({ type: 'select_starter', characterIndex: parseInt(value ?? '0', 10) });
      audio.play('starter');
      break;
    case 'toggle-card':
      toggleCard(parseInt(value ?? '0', 10));
      break;
    case 'play-selected':
      playSelected();
      audio.play('attack');
      break;
    case 'rescue-joker':
      triggerJokerRescueAnim('self-panel', store.state.game?.pendingDying?.playerId ?? null);
      handleGameAction({ type: 'rescue_with_joker', jokerCardIndex: parseInt(value ?? '0', 10) });
      audio.play('joker');
      break;
    case 'execute-joker': {
      const parts = (value ?? '').split(',').map(Number);
      handleGameAction({ type: 'play_cards', cardIndices: parts });
      audio.play('joker');
      break;
    }
    case 'select-target':
      if (value) {
        const alreadySelected = store.state.selectedTargetId === value;
        store.set({ selectedTargetId: alreadySelected ? null : value });
        if (!alreadySelected) audio.play('select');
      }
      break;
    case 'toggle-lang': {
      const next = document.documentElement.dataset['lang'] === 'zh' ? 'en' : 'zh';
      document.documentElement.dataset['lang'] = next;
      break;
    }
    case 'auth-tab': {
      const loginPane = document.getElementById('auth-login-pane');
      const regPane = document.getElementById('auth-register-pane');
      const tabs = document.querySelectorAll<HTMLButtonElement>('[data-action="auth-tab"]');
      tabs.forEach((t) => t.classList.toggle('active', t.dataset['value'] === value));
      if (loginPane) loginPane.classList.toggle('active', value === 'login');
      if (regPane) regPane.classList.toggle('active', value === 'register');
      break;
    }
  }
}

function startBotGame(): void {
  if (localGame) { localGame.destroy(); localGame = null; }
  const name = playerName();
  const maxLivesEl = document.querySelector<HTMLSelectElement>('#bot-max-lives');
  const lives = maxLivesEl ? parseInt(maxLivesEl.value, 10) : 3;
  audio.play('starter');
  store.set({ lastBroadcast: null });
  localGame = new LocalGameManager(name, lives, (event) => {
    if (event.type === 'state') store.set({ game: event.state, gameMode: 'local' });
    else if (event.type === 'broadcast') {
      store.set({ lastBroadcast: { attackerName: event.attackerName, targetName: event.targetName ?? null, suit: event.suit as 'S'|'H'|'D'|'C'|null, rank: event.rank } });
      if (event.targetName) triggerAttackAnimation(event.targetName);
    }
    else if (event.type === 'hint') toast(event.message);
    else if (event.type === 'gameover') {
      const user = store.state.currentUser;
      if (user) {
        const isWin = event.winnerId === LOCAL_HUMAN_ID;
        const updated = {
          ...user,
          botWins: isWin ? user.botWins + 1 : user.botWins,
          wins: isWin ? user.wins + 1 : user.wins,
          losses: isWin ? user.losses : user.losses + 1,
          eloScore: Math.max(800, user.eloScore + (isWin ? 15 : -10)),
        };
        authUpdateUser(updated);
        store.set({ currentUser: updated });
      }
      audio.play(event.winnerId === LOCAL_HUMAN_ID ? 'win' : 'lose');
      stopTurnTimer();
    } else if (event.type === 'error') { toast(event.message, 'danger'); audio.play('error'); }
  });
  store.set({ playerId: LOCAL_HUMAN_ID, gameMode: 'local', activePage: 'home' });
}

/* ── Turn Timer (30s visual countdown) ──────────────────────────────────── */
function handleTurnTimer(state: typeof store.state): void {
  const isMyTurn =
    state.game?.phase === 'PLAYING' &&
    state.game.currentTurnPlayerId === state.playerId;
  if (isMyTurn) {
    if (turnDeadline === null) {
      turnDeadline = Date.now() + 30_000;
      startTurnTimer();
    }
  } else {
    stopTurnTimer();
  }
}

/** 更新手牌区上方的进度条宽度（0–100） */
function setProgressBar(pct: number, urgent: boolean): void {
  const fill = document.getElementById('turn-progress-fill');
  const bar  = document.getElementById('turn-progress-bar');
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (bar)  bar.dataset['urgent'] = String(urgent);
}

function startTurnTimer(): void {
  if (turnTimerInterval !== null) clearInterval(turnTimerInterval);
  const TOTAL = 30_000;
  turnTimerInterval = setInterval(() => {
    if (turnDeadline === null) { stopTurnTimer(); return; }
    const remaining = turnDeadline - Date.now();
    const remSecs   = Math.ceil(remaining / 1000);
    const pct       = Math.max(0, (remaining / TOTAL) * 100);
    const urgent    = remSecs <= 5;

    // 进度条驱动（替代圆圈动画）
    setProgressBar(pct, urgent);

    // 右侧数字标签保留作辅助显示
    const el = document.getElementById('turn-timer');
    if (el) {
      el.textContent = remSecs > 0 ? `${remSecs}s` : '0s';
      el.dataset['urgent'] = String(urgent);
    }

    if (remSecs <= 0) {
      stopTurnTimer();
      if (store.state.gameMode === 'local' && localGame) {
        const hand = store.state.game?.players.find(p => p.id === LOCAL_HUMAN_ID)?.hand;
        const firstCard = hand?.[0];
        if (firstCard !== undefined) {
          const opponents = store.state.game?.players.filter(p => p.id !== LOCAL_HUMAN_ID && !p.isEliminated);
          const target = opponents?.[0]?.id;
          handleGameAction({ type: 'play_cards', cardIndices: [0], ...(target ? { targetPlayerId: target } : {}) });
        }
      }
      toast('⏰ 超时！', 'danger');
    }
  }, 100);
}

function stopTurnTimer(): void {
  if (turnTimerInterval !== null) { clearInterval(turnTimerInterval); turnTimerInterval = null; }
  turnDeadline = null;
  setProgressBar(100, false);
  const el = document.getElementById('turn-timer');
  if (el) { el.textContent = ''; el.dataset['urgent'] = 'false'; }
}

function handleGameAction(action: HumanAction): void {
  if (store.state.gameMode === 'local' && localGame) {
    localGame.applyHumanAction(action);
  } else {
    const payload =
      action.type === 'select_starter'
        ? { action: 'select_starter' as const, characterIndex: action.characterIndex ?? 0 }
        : action.type === 'rescue_with_joker'
          ? { action: 'rescue_with_joker' as const, jokerCardIndex: action.jokerCardIndex ?? 0 }
          : (() => {
              const b = { action: 'play_cards' as const, cardIndices: action.cardIndices ?? [] };
              return action.targetPlayerId != null
                ? action.declaredSuit != null
                  ? { ...b, targetPlayerId: action.targetPlayerId, declaredSuit: action.declaredSuit }
                  : { ...b, targetPlayerId: action.targetPlayerId }
                : action.declaredSuit != null
                  ? { ...b, declaredSuit: action.declaredSuit }
                  : b;
            })();
    send({ type: 'player_action', requestId: crypto.randomUUID(), payload });
  }
}

function toggleCard(index: number): void {
  const selected = new Set(store.state.selectedCardIndices);
  if (selected.has(index)) selected.delete(index); else selected.add(index);
  store.set({ selectedCardIndices: selected });
}

function playSelected(): void {
  const cardIndices = [...store.state.selectedCardIndices].sort((a, b) => a - b);
  if (cardIndices.length === 0) return toast('请先选择手牌', 'danger');

  // 法则：合法出牌数为 1、3、5 张
  const n = cardIndices.length;
  if (n !== 1 && n !== 3 && n !== 5) {
    return toast('出牌数必须为 1、3 或 5 张', 'danger');
  }

  const targetPlayerId = store.state.selectedTargetId ?? requiredElement<HTMLSelectElement>('#target-player').value;

  // 含 A 的多张组合必须走万化合体流程（不允许直接出牌）
  const _hand = store.state.game?.players.find(p => p.id === store.state.playerId)?.hand ?? [];
  const hasAce = cardIndices.some(i => _hand[i]?.rank === 'A');
  const isMultiWithAce = cardIndices.length > 1 && hasAce;
  if (isMultiWithAce) {
    return toast('含 A 牌的组合请使用「⚡ 万化合体」流程', 'danger');
  }

  const declaredSuit: '' | 'S' | 'H' | 'D' | 'C' = '';

  // 出牌飞出动画：手牌克隆飞向广播区，然后花色爆炸
  const handEl = document.getElementById('hand');
  const broadcastEl = document.getElementById('broadcast-display');
  if (handEl && broadcastEl) {
    const cardEls = cardIndices
      .map(i => handEl.querySelectorAll<HTMLElement>('.poker-card')[i])
      .filter((el): el is HTMLElement => el !== null);
    const effectSuit = (declaredSuit || _hand[cardIndices[0] ?? 0]?.suit) as string | undefined; // computed
    const _sm: Record<string,string> = {S:'♠',H:'♥',D:'♦',C:'♣'};
    const _sc: Record<string,string> = {S:'var(--color-suit-black)',H:'var(--color-suit-red)',D:'var(--color-suit-red)',C:'var(--color-suit-black)'};
    triggerCardPlayFlightAnim(cardEls, broadcastEl, () => {
      if (effectSuit) triggerCardPlayAnim(_sm[effectSuit] ?? '🃏', _sc[effectSuit] ?? 'inherit');
    });
  }

  handleGameAction({
    type: 'play_cards',
    cardIndices,
    ...(targetPlayerId ? { targetPlayerId } : {}),
    ...(declaredSuit ? { declaredSuit } : {}),
  });
  store.set({ selectedCardIndices: new Set<number>(), selectedTargetId: null, wanhuaPending: null });
}

function send(message: ClientMessage): void {
  try { client.send(message); }
  catch (error) { toast(error instanceof Error ? error.message : '发送失败', 'danger'); }
}

function playerName(): string {
  return store.state.currentUser?.username ?? store.state.guestName;
}

function handleServerMessage(message: ServerMessage): void {
  switch (message.type) {
    case 'room_created': case 'room_joined':
      localStorage.setItem('pokewar.reconnectToken', message.payload.reconnectToken);
      store.set({ playerId: message.payload.myPlayerId, reconnectToken: message.payload.reconnectToken, gameMode: 'online' });
      break;
    case 'session_resumed':
      store.set({ playerId: message.payload.myPlayerId, reconnecting: false });
      audio.play('reconnect');
      break;
    case 'ROOM_UPDATE': store.set({ room: message.payload }); break;
    case 'GAME_START': store.set({ playerId: message.payload.enginePlayerId }); break;
    case 'SYNC_STATE':
      if ((store.state.game?.revision ?? -1) <= message.payload.revision) store.set({ game: message.payload });
      break;
    case 'CHAT':
      store.update((s) => ({ ...s, chats: [...s.chats, message.payload].slice(-30) }));
      break;
    case 'BROADCAST': {
      store.set({ lastBroadcast: {
        attackerName: message.payload.attackerName,
        targetName: message.payload.targetName,
        suit: message.payload.suit as 'S' | 'H' | 'D' | 'C' | null,
        rank: message.payload.rank,
      }});
      if (message.payload.targetName) triggerAttackAnimation(message.payload.targetName);
      toast(message.payload.attackerName + ' 出牌攻击 ' + message.payload.targetName);
      break;
    }
    case 'GAME_OVER': break;
    case 'ERROR':
      toast(`${message.payload.code}: ${message.payload.message}`, 'danger');
      audio.play('error');
      if (message.payload.code === 'SESSION_NOT_FOUND') localStorage.removeItem('pokewar.reconnectToken');
      break;
    case 'PONG': break;
  }
}

function inferWebSocketUrl(): string {
  if (location.port === '5173') return 'ws://localhost:8080/ws';
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
}

function restoreTheme(): void {
  document.documentElement.dataset['theme'] = localStorage.getItem('pokewar.theme') ?? 'light';
}

function toggleTheme(): void {
  const next = document.documentElement.dataset['theme'] === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset['theme'] = next;
  localStorage.setItem('pokewar.theme', next);
}

try { boot(); }
catch (error) {
  const message = error instanceof Error ? error.message : '前端初始化失败';
  store.set({ fatalError: message, connection: 'error' });
}





