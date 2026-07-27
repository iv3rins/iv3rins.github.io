import {
  createGameState,
  expireDyingWindow,
  playCards,
  rescueWithJoker,
  selectStarter,
  toPublicGameState,
  type GameState,
  type PublicGameState,
  type Suit,
} from '@pokewar/domain';
import { botChoosePlay, botSelectStarter } from './bot.ts';
import { createId } from './id.ts';

export const LOCAL_HUMAN_ID = 'local-human';
export const LOCAL_BOT_ID = 'local-bot-1';
const BOT_IDS = ['local-bot-1', 'local-bot-2', 'local-bot-3'] as const;
type BotId = typeof BOT_IDS[number];

/** 中国神话传说角色名，与"Bot α/β/γ"区分明显 */
const BOT_NAMES: Record<BotId, string> = {
  'local-bot-1': '孙悟空',
  'local-bot-2': '哪  吒',
  'local-bot-3': '杨  戬',
};

const BOT_DELAY_MIN_MS = 1200;
const BOT_DELAY_MAX_MS = 2200;

export type LocalEvent =
  | { readonly type: 'state'; readonly state: PublicGameState }
  | { readonly type: 'gameover'; readonly winnerId: string | null; readonly rounds: number }
  | { readonly type: 'hint'; readonly message: string }
  | { readonly type: 'broadcast'; readonly attackerName: string; readonly targetName: string | null; readonly suit: string | null; readonly rank: string }
  | { readonly type: 'error'; readonly message: string };

export interface HumanAction {
  readonly type: 'select_starter' | 'play_cards' | 'rescue_with_joker';
  readonly characterIndex?: number;
  readonly cardIndices?: number[];
  readonly targetPlayerId?: string;
  readonly declaredSuit?: Suit;
  readonly jokerCardIndex?: number;
}

export class LocalGameManager {
  #state: GameState;
  #onEvent: (e: LocalEvent) => void;
  #botTimer: ReturnType<typeof window.setTimeout> | null = null;
  /** 当人类玩家濒死时，到达 deadlineAt 后自动过期的计时器 */
  #jokerExpireTimer: ReturnType<typeof window.setTimeout> | null = null;
  #hintedPhases = new Set<string>();

  constructor(humanName: string, maxLives: number, onEvent: (e: LocalEvent) => void) {
    this.#onEvent = onEvent;
    const deps = { now: Date.now, random: Math.random, createId: () => createId() };
    this.#state = createGameState(
      createId(),
      [
        { id: LOCAL_HUMAN_ID, name: humanName },
        ...BOT_IDS.map((id) => ({ id, name: BOT_NAMES[id] })),
      ],
      maxLives,
      deps,
    );
    this.#emit();
    this.#scheduleBotIfNeeded();
  }

  applyHumanAction(action: HumanAction): void {
    if (this.#botTimer !== null) { clearTimeout(this.#botTimer); this.#botTimer = null; }
    // 人类行动时取消濒死自动过期计时（自救成功）
    this.#clearJokerExpireTimer();
    try {
      const deps = { now: Date.now };
      if (action.type === 'select_starter' && action.characterIndex !== undefined) {
        this.#state = selectStarter(this.#state, LOCAL_HUMAN_ID, action.characterIndex, deps);
      } else if (action.type === 'play_cards' && action.cardIndices) {
        this.#emitBroadcast(LOCAL_HUMAN_ID, action.cardIndices, action.targetPlayerId, action.declaredSuit);
        const base = { playerId: LOCAL_HUMAN_ID, cardIndices: action.cardIndices };
        const cmd = action.targetPlayerId != null
          ? action.declaredSuit != null
            ? { ...base, targetPlayerId: action.targetPlayerId, declaredSuit: action.declaredSuit }
            : { ...base, targetPlayerId: action.targetPlayerId }
          : action.declaredSuit != null
            ? { ...base, declaredSuit: action.declaredSuit }
            : base;
        this.#state = playCards(this.#state, cmd, deps);
      } else if (action.type === 'rescue_with_joker' && action.jokerCardIndex !== undefined) {
        this.#state = rescueWithJoker(this.#state, LOCAL_HUMAN_ID, action.jokerCardIndex, deps);
      }
    } catch (err) {
      this.#onEvent({ type: 'error', message: err instanceof Error ? err.message : 'Action failed' });
      return;
    }
    this.#emit();
    this.#scheduleBotIfNeeded();
  }

  destroy(): void {
    if (this.#botTimer !== null) clearTimeout(this.#botTimer);
    this.#clearJokerExpireTimer();
  }

  #clearJokerExpireTimer(): void {
    if (this.#jokerExpireTimer !== null) {
      clearTimeout(this.#jokerExpireTimer);
      this.#jokerExpireTimer = null;
    }
  }

  #isBotId(id: string): id is BotId {
    return (BOT_IDS as readonly string[]).includes(id);
  }

  #emitBroadcast(attackerId: string, cardIndices: readonly number[], targetPlayerId?: string, declaredSuit?: string): void {
    const attacker = this.#state.players.find((p) => p.id === attackerId);
    if (!attacker) return;
    const firstCard = attacker.hand[cardIndices[0] ?? 0];
    if (!firstCard || firstCard.isJoker) return;
    const suit = declaredSuit ?? firstCard.suit ?? null;
    const rank = firstCard.rank;
    const effectiveTarget = (suit === 'C') ? null : targetPlayerId;
    const targetPlayer = effectiveTarget ? this.#state.players.find((p) => p.id === effectiveTarget) : null;
    this.#onEvent({
      type: 'broadcast',
      attackerName: attacker.name,
      targetName: targetPlayer?.name ?? null,
      suit,
      rank,
    });
  }

  #emit(): void {
    const pub = toPublicGameState(this.#state, LOCAL_HUMAN_ID);
    this.#onEvent({ type: 'state', state: pub });
    if (this.#state.phase === 'GAME_OVER') {
      this.#onEvent({ type: 'gameover', winnerId: this.#state.winnerId, rounds: this.#state.round });
    }
    const hintKey = this.#state.phase;
    if (!this.#hintedPhases.has(hintKey)) {
      this.#hintedPhases.add(hintKey);
      if (this.#state.phase === 'SELECTING_STARTER') {
        this.#onEvent({ type: 'hint', message: '📖 选择首发角色：♠黑桃=双倍伤害 / ♥红桃=吸血 / ♦方块=全场摸牌 / ♣梅花=护盾' });
      } else if (this.#state.phase === 'PLAYING') {
        this.#onEvent({ type: 'hint', message: '🃏 出牌步骤：① 点击手牌选择 → ② 点击对手选目标 → ③ 点击出牌按钮' });
        window.setTimeout(() => {
          this.#onEvent({ type: 'hint', message: '💡 同花色多张出牌可触发花色特效！含A牌可无视花色免疫（万化合体）' });
        }, 4000);
      } else if (this.#state.phase === 'WAITING_FOR_JOKER') {
        this.#onEvent({ type: 'hint', message: '🃏 Joker 窗口：单张Joker可救活即将阵亡的角色，双张Joker可直接斩杀！' });
      }
    }
  }

  #scheduleBotIfNeeded(): void {
    if (this.#state.phase === 'GAME_OVER') return;

    // 人类玩家濒死：启动自动过期计时器（修复 JOKER 窗口永远不过期的 bug）
    if (
      this.#state.phase === 'WAITING_FOR_JOKER' &&
      this.#state.pendingDying?.playerId === LOCAL_HUMAN_ID &&
      this.#jokerExpireTimer === null
    ) {
      const remaining = Math.max(
        200,
        (this.#state.pendingDying.deadlineAt - Date.now()),
      );
      this.#jokerExpireTimer = setTimeout(() => {
        this.#jokerExpireTimer = null;
        if (
          this.#state.phase === 'WAITING_FOR_JOKER' &&
          this.#state.pendingDying?.playerId === LOCAL_HUMAN_ID
        ) {
          try {
            this.#state = expireDyingWindow(this.#state, Date.now());
          } catch { /* already resolved */ }
          this.#emit();
          this.#scheduleBotIfNeeded();
        }
      }, remaining);
      return; // 等待计时器触发，不调度机器人
    }

    const needsBot =
      (this.#state.phase === 'SELECTING_STARTER' &&
        this.#state.players.some((p) => this.#isBotId(p.id) && p.activeCharacterIndex === -1)) ||
      (this.#state.phase === 'PLAYING' &&
        this.#isBotId(this.#state.players[this.#state.currentTurnIndex]?.id ?? '')) ||
      (this.#state.phase === 'WAITING_FOR_JOKER' &&
        this.#isBotId(this.#state.pendingDying?.playerId ?? ''));
    if (needsBot) {
      const delay = BOT_DELAY_MIN_MS + Math.floor(Math.random() * (BOT_DELAY_MAX_MS - BOT_DELAY_MIN_MS));
      this.#botTimer = setTimeout(() => this.#runBot(), delay);
    }
  }

  #runBot(): void {
    this.#botTimer = null;
    const currentBotId: string | undefined =
      this.#state.phase === 'SELECTING_STARTER'
        ? this.#state.players.find((p) => this.#isBotId(p.id) && p.activeCharacterIndex === -1)?.id
        : this.#state.phase === 'PLAYING'
          ? this.#state.players[this.#state.currentTurnIndex]?.id
          : this.#state.pendingDying?.playerId;
    if (!currentBotId || !this.#isBotId(currentBotId)) return;
    try {
      const deps = { now: Date.now };
      if (this.#state.phase === 'SELECTING_STARTER') {
        const idx = botSelectStarter(this.#state, currentBotId);
        this.#state = selectStarter(this.#state, currentBotId, idx, deps);
      } else if (this.#state.phase === 'WAITING_FOR_JOKER' && this.#state.pendingDying?.playerId === currentBotId) {
        this.#state = expireDyingWindow(this.#state, Date.now() + 99_999);
      } else if (this.#state.phase === 'PLAYING') {
        const play = botChoosePlay(this.#state, currentBotId);
        this.#emitBroadcast(currentBotId, play.cardIndices, play.targetPlayerId, play.declaredSuit);
        const base = { playerId: currentBotId, cardIndices: play.cardIndices };
        const cmd = play.targetPlayerId != null
          ? play.declaredSuit != null
            ? { ...base, targetPlayerId: play.targetPlayerId, declaredSuit: play.declaredSuit }
            : { ...base, targetPlayerId: play.targetPlayerId }
          : play.declaredSuit != null
            ? { ...base, declaredSuit: play.declaredSuit }
            : base;
        this.#state = playCards(this.#state, cmd, deps);
      }
    } catch { /* ignore bot errors */ }
    this.#emit();
    this.#scheduleBotIfNeeded();
  }
}
