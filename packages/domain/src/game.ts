import { assertDomain } from './errors.ts';
import { resolveAttack } from './combat.ts';
import {
  activeCharacter,
  activePlayers,
  appendLog,
  cloneState,
  drawCards,
} from './state.ts';
import { playerById, validateSelectedCards } from './validation.ts';
import type {
  GameDependencies,
  GameState,
  PlayCardsCommand,
  Player,
  Suit,
} from './types.ts';

const DYING_WINDOW_MS = 5_000;

export function selectStarter(
  state: GameState,
  playerId: string,
  characterIndex: number,
  dependencies: Pick<GameDependencies, 'now'>,
): GameState {
  assertDomain(state.phase === 'SELECTING_STARTER', 'INVALID_PHASE', 'Starter selection is closed.');
  const next = cloneState(state);
  const player = playerById(next, playerId);
  assertDomain(
    Number.isInteger(characterIndex) && characterIndex >= 0 && characterIndex < player.characters.length,
    'INVALID_STARTER',
    'Starter index is invalid.',
  );
  assertDomain(player.activeCharacterIndex === -1, 'ACTION_NOT_ALLOWED', 'Starter already selected.');

  player.activeCharacterIndex = characterIndex;
  const character = player.characters[characterIndex];
  assertDomain(character, 'INVALID_STARTER', 'Starter character is missing.');
  character.status = 'ACTIVE';
  appendLog(next, dependencies.now(), 'StarterSelected', `${player.name} selected a starter.`);

  if (next.players.every((candidate) => candidate.activeCharacterIndex >= 0)) {
    next.phase = 'PLAYING';
    appendLog(next, dependencies.now(), 'BattleStarted', 'All players selected a starter.');
  }
  return commit(next);
}

export function playCards(
  state: GameState,
  command: PlayCardsCommand,
  dependencies: Pick<GameDependencies, 'now'>,
): GameState {
  assertDomain(state.phase === 'PLAYING', 'INVALID_PHASE', 'Cards can only be played in PLAYING.');
  const next = cloneState(state);
  const attacker = playerById(next, command.playerId);
  assertCurrentTurn(next, attacker.id);

  const play = validateSelectedCards(attacker, command.cardIndices, command.declaredSuit);
  const attackerCharacter = activeCharacter(attacker);
  const target = resolveTarget(next, attacker, play.effectiveSuit, command.targetPlayerId);
  const targetCharacter = target ? activeCharacter(target) : attackerCharacter;
  const resolution = resolveAttack({
    suit: play.effectiveSuit,
    cardValue: play.cardValue,
    hasAce: play.hasAce,
    target: targetCharacter,
    attacker: attackerCharacter,
  });

  removePlayedCards(attacker, command.cardIndices, next);
  if (resolution.shieldGranted > 0) {
    attackerCharacter.shield += resolution.shieldGranted;
  } else if (target) {
    applyDamage(targetCharacter, resolution.shieldBlocked, resolution.hpDamage);
    attackerCharacter.hp += resolution.lifesteal;
    if (resolution.harvestDraws > 0) {
      triggerDiamondDraw(next, attacker.id, resolution.harvestDraws);
    }
  }

  appendLog(
    next,
    dependencies.now(),
    'CardsPlayed',
    describePlay(attacker.name, target?.name, play.effectiveSuit, play.cardValue, resolution.hpDamage),
  );
  replenishIfEmpty(next, attacker);

  if (target && targetCharacter.hp <= 0) {
    handleDefeat(next, attacker, target, dependencies.now());
  }

  if (next.phase === 'PLAYING') advanceTurn(next, attacker.id);
  return commit(next);
}

export function rescueWithJoker(
  state: GameState,
  playerId: string,
  jokerCardIndex: number,
  dependencies: Pick<GameDependencies, 'now'>,
): GameState {
  assertDomain(state.phase === 'WAITING_FOR_JOKER', 'INVALID_PHASE', 'No Joker rescue window is open.');
  assertDomain(state.pendingDying, 'NO_DYING_WINDOW', 'Dying window is missing.');
  assertDomain(state.pendingDying.playerId === playerId, 'ACTION_NOT_ALLOWED', 'Only the dying player can self-rescue.');

  const next = cloneState(state);
  const player = playerById(next, playerId);
  const card = player.hand[jokerCardIndex];
  assertDomain(card?.isJoker, 'JOKER_NOT_AVAILABLE', 'Selected card is not a Joker.');
  // Remove played joker then discard rest of hand (full rebirth)
  player.hand.splice(jokerCardIndex, 1);
  next.discard.push(card);

  const window = next.pendingDying;
  assertDomain(window, 'NO_DYING_WINDOW', 'Dying window is missing.');
  const character = player.characters[window.characterIndex];
  assertDomain(character, 'INVALID_STARTER', 'Dying character is missing.');

  // Full rebirth: discard remaining hand, draw 5 fresh, full HP & 0 shield
  next.discard.push(...player.hand);
  player.hand = [];
  character.hp = character.maxHp;
  character.shield = 0;
  character.status = 'ACTIVE';
  player.isEliminated = false;
  next.pendingDying = null;
  next.phase = 'PLAYING';
  next.currentTurnIndex = window.resumeTurnIndex;
  drawCards(next, player, 5);
  appendLog(next, dependencies.now(), 'JokerRescue', `${player.name} used a Joker to fully revive!`);
  return commit(next);
}

export function executeWithDoubleJoker(
  state: GameState,
  actorId: string,
  jokerCardIndices: readonly [number, number],
  dependencies: Pick<GameDependencies, 'now'>,
): GameState {
  assertDomain(state.phase === 'WAITING_FOR_JOKER', 'INVALID_PHASE', 'No execution window is open.');
  assertDomain(state.pendingDying, 'NO_DYING_WINDOW', 'Dying window is missing.');
  assertDomain(state.pendingDying.playerId !== actorId, 'ACTION_NOT_ALLOWED', 'Dying player cannot execute self.');

  const next = cloneState(state);
  const actor = playerById(next, actorId);
  const indices = [...jokerCardIndices].sort((a, b) => b - a);
  assertDomain(indices[0] !== indices[1], 'INVALID_CARD_SELECTION', 'Select two different Jokers.');
  const cards = indices.map((index) => actor.hand[index]);
  assertDomain(cards.every((card) => card?.isJoker), 'JOKER_NOT_AVAILABLE', 'Two Jokers are required.');
  for (const index of indices) {
    const [card] = actor.hand.splice(index, 1);
    if (card) next.discard.push(card);
  }
  replenishIfEmpty(next, actor);
  const window = next.pendingDying;
  assertDomain(window, 'NO_DYING_WINDOW', 'Dying window is missing.');
  const target = playerById(next, window.playerId);
  eliminatePlayer(next, target, dependencies.now(), `${actor.name} executed ${target.name} with two Jokers.`);
  return commit(next);
}

export function expireDyingWindow(
  state: GameState,
  now: number,
): GameState {
  if (state.phase !== 'WAITING_FOR_JOKER' || !state.pendingDying || now < state.pendingDying.deadlineAt) {
    return state;
  }
  const next = cloneState(state);
  const target = playerById(next, next.pendingDying?.playerId ?? '');
  eliminatePlayer(next, target, now, `${target.name} was eliminated after the rescue window expired.`);
  return commit(next);
}


export function forfeitPlayer(
  state: GameState,
  playerId: string,
  now: number,
  reason = 'Disconnected player forfeited.',
): GameState {
  if (state.phase === 'GAME_OVER') return state;
  const next = cloneState(state);
  const player = playerById(next, playerId);
  if (player.isEliminated) return state;
  if (next.pendingDying?.playerId === playerId) next.pendingDying = null;
  eliminatePlayer(next, player, now, `${player.name}: ${reason}`);
  return commit(next);
}

function resolveTarget(
  state: GameState,
  attacker: Player,
  suit: Suit,
  targetPlayerId?: string,
): Player | null {
  if (suit === 'C') return null;
  assertDomain(targetPlayerId, 'TARGET_REQUIRED', 'An attack target is required.');
  const target = playerById(state, targetPlayerId);
  assertDomain(target.id !== attacker.id && !target.isEliminated, 'TARGET_INVALID', 'Target is invalid.');
  return target;
}

function removePlayedCards(player: Player, cardIndices: readonly number[], state: GameState): void {
  const descending = [...cardIndices].sort((a, b) => b - a);
  for (const index of descending) {
    const [card] = player.hand.splice(index, 1);
    if (card) state.discard.push(card);
  }
}

function applyDamage(target: ReturnType<typeof activeCharacter>, shieldBlocked: number, hpDamage: number): void {
  target.shield = Math.max(0, target.shield - shieldBlocked);
  target.hp = Math.max(0, target.hp - hpDamage);
}

function triggerDiamondDraw(state: GameState, attackerId: string, count: number): void {
  const startIndex = state.players.findIndex((player) => player.id === attackerId);
  if (startIndex < 0) return;
  let remaining = count;
  let cursor = startIndex;
  let attemptsWithoutDraw = 0;
  while (remaining > 0 && attemptsWithoutDraw < state.players.length) {
    const player = state.players[cursor];
    cursor = (cursor + 1) % state.players.length;
    if (!player || player.isEliminated) {
      attemptsWithoutDraw += 1;
      continue;
    }
    const drawn = drawCards(state, player, 1);
    if (drawn > 0) {
      remaining -= 1;
      attemptsWithoutDraw = 0;
    } else {
      attemptsWithoutDraw += 1;
    }
  }
}

function replenishIfEmpty(state: GameState, player: Player): void {
  if (player.hand.length === 0 || player.hand.every((card) => card.isJoker)) {
    drawCards(state, player, 3);
  }
}

function handleDefeat(state: GameState, attacker: Player, target: Player, now: number): void {
  const defeated = activeCharacter(target);
  drawCards(state, attacker, 3);
  const nextCharacterIndex = target.characters.findIndex(
    (character, index) => index !== target.activeCharacterIndex && character.status !== 'DEAD',
  );
  if (target.livesRemaining > 1 && nextCharacterIndex >= 0) {
    target.livesRemaining -= 1;
    defeated.status = 'DEAD';
    target.activeCharacterIndex = nextCharacterIndex;
    const nextCharacter = activeCharacter(target);
    nextCharacter.status = 'ACTIVE';
    drawCards(state, target, 5);
    appendLog(state, now, 'CharacterSwitched', `${target.name} switched character after defeat.`);
    return;
  }

  target.livesRemaining = 0;
  defeated.status = 'DYING';
  state.phase = 'WAITING_FOR_JOKER';
  state.pendingDying = {
    playerId: target.id,
    characterIndex: target.activeCharacterIndex,
    openedAt: now,
    deadlineAt: now + DYING_WINDOW_MS,
    resumeTurnIndex: state.currentTurnIndex,
  };
  appendLog(state, now, 'CharacterDying', `${target.name} entered the Joker rescue window.`);
}

function eliminatePlayer(state: GameState, player: Player, now: number, message: string): void {
  player.isEliminated = true;
  const character = player.characters[player.activeCharacterIndex];
  if (character) character.status = 'DEAD';
  state.pendingDying = null;
  appendLog(state, now, 'PlayerEliminated', message);
  const survivors = activePlayers(state);
  if (survivors.length <= 1) {
    state.phase = 'GAME_OVER';
    state.winnerId = survivors[0]?.id ?? null;
    appendLog(state, now, 'GameOver', `Winner: ${survivors[0]?.name ?? 'none'}.`);
  } else {
    state.phase = 'PLAYING';
    state.currentTurnIndex = nextLivingIndex(state, state.currentTurnIndex);
  }
}

function assertCurrentTurn(state: GameState, playerId: string): void {
  const current = state.players[state.currentTurnIndex];
  assertDomain(current?.id === playerId, 'NOT_YOUR_TURN', 'It is not this player鈥檚 turn.');
}

function advanceTurn(state: GameState, actorId: string): void {
  const previous = state.currentTurnIndex;
  state.currentTurnIndex = nextLivingIndex(state, previous);
  if (state.players[state.currentTurnIndex]?.id === actorId) return;
  if (state.currentTurnIndex <= previous) state.round += 1;
}

function nextLivingIndex(state: GameState, fromIndex: number): number {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (fromIndex + offset) % state.players.length;
    if (!state.players[index]?.isEliminated) return index;
  }
  return fromIndex;
}

function describePlay(
  attackerName: string,
  targetName: string | undefined,
  suit: Suit,
  value: number,
  damage: number,
): string {
  if (suit === 'C') return `${attackerName} gained ${value} shield.`;
  return `${attackerName} attacked ${targetName ?? 'unknown'} with ${suit}${value}, dealing ${damage}.`;
}

function commit(state: GameState): GameState {
  state.revision += 1;
  return state;
}

