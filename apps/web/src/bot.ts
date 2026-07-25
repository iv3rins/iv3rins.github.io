import type { GameState, Suit } from '@pokewar/domain';

export function botSelectStarter(state: GameState, botId: string): number {
  const bot = state.players.find((p) => p.id === botId);
  if (!bot) return 0;
  const kIndex = bot.characters.findIndex((c) => c.rank === 'K');
  return kIndex >= 0 ? kIndex : 0;
}

export interface BotPlay {
  readonly cardIndices: number[];
  readonly targetPlayerId?: string;
  readonly declaredSuit?: Suit;
}

/** 判断 id 是否为机器人（本地对战中机器人 id 以 "local-bot" 开头） */
function isBotPlayer(id: string): boolean {
  return id.startsWith('local-bot');
}

export function botChoosePlay(state: GameState, botId: string): BotPlay {
  const bot = state.players.find((p) => p.id === botId);
  if (!bot || bot.hand.length === 0) return { cardIndices: [0] };

  const opponents = state.players.filter((p) => p.id !== botId && !p.isEliminated);

  // 如果场上还有其他存活的机器人，则不把残血人类作为目标
  // 规则：只要有任意存活的非人类对手，就优先打机器人，让人类玩家多撑一会
  const livingBotOpponents = opponents.filter((p) => isBotPlayer(p.id));
  const candidateTargets = livingBotOpponents.length > 0
    ? livingBotOpponents          // 优先打其他机器人
    : opponents;                  // 场上只剩玩家时才打玩家

  // 找最低血量的候选目标
  const minHp = candidateTargets.reduce((m, opp) => {
    const hp = opp.characters[opp.activeCharacterIndex]?.hp ?? 999;
    return hp < m ? hp : m;
  }, Infinity);
  const weakest = candidateTargets.filter(
    (opp) => (opp.characters[opp.activeCharacterIndex]?.hp ?? 999) <= minHp,
  );
  const target = weakest[Math.floor(Math.random() * weakest.length)];

  // 选牌：优先♠（双倍）> 高点数
  let bestIdx = -1;
  let bestScore = -1;
  for (let i = 0; i < bot.hand.length; i++) {
    const card = bot.hand[i];
    if (!card || card.isJoker) continue;
    const suitBonus = card.suit === 'S' ? 20 : card.suit === 'H' ? 5 : 0;
    const score = card.value + suitBonus;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  if (bestIdx < 0) {
    bestIdx = bot.hand.findIndex((c) => !c.isJoker);
    if (bestIdx < 0) bestIdx = 0;
  }

  const chosenCard = bot.hand[bestIdx];
  const needsTarget = chosenCard != null && chosenCard.suit !== 'C';
  const tid = needsTarget ? target?.id : undefined;
  return tid != null
    ? { cardIndices: [bestIdx], targetPlayerId: tid }
    : { cardIndices: [bestIdx] };
}
