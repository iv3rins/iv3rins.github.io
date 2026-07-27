import { assertDomain } from './errors.ts';
import { createDeck, shuffleCards } from './deck.ts';
import {
  SUITS,
  type Card,
  type Character,
  type CharacterRank,
  type GameDependencies,
  type GameState,
  type Player,
  type PlayerSeed,
} from './types.ts';

const CHARACTER_RANKS: readonly CharacterRank[] = ['J', 'Q', 'K'];
const MAX_HAND_SIZE = 7;

export function createGameState(
  gameId: string,
  playerSeeds: readonly PlayerSeed[],
  maxLives: number,
  dependencies: GameDependencies,
): GameState {
  assertDomain(
    playerSeeds.length >= 2 && playerSeeds.length <= 12,
    'INVALID_PLAYER_COUNT',
    'PokeWar requires 2 to 12 players.',
  );
  assertDomain(
    Number.isInteger(maxLives) && maxLives >= 1 && maxLives <= 5,
    'ACTION_NOT_ALLOWED',
    'maxLives must be an integer between 1 and 5.',
  );

  const deck = shuffleCards(createDeck(playerSeeds.length), dependencies.random);
  const players = playerSeeds.map((seed) => createPlayer(seed, maxLives, dependencies));
  const state: GameState = {
    id: gameId,
    phase: 'SELECTING_STARTER',
    players,
    deck,
    discard: [],
    currentTurnIndex: 0,
    round: 1,
    revision: 0,
    pendingDying: null,
    winnerId: null,
    log: [],
  };

  for (const player of state.players) {
    drawCards(state, player, 5);
  }
  appendLog(state, dependencies.now(), 'GameCreated', `Game created with ${players.length} players.`);
  return state;
}

function createPlayer(
  seed: PlayerSeed,
  maxLives: number,
  dependencies: GameDependencies,
): Player {
  const characters = CHARACTER_RANKS.map((rank) =>
    createCharacter(rank, pickSuit(dependencies.random), dependencies.createId()),
  );
  return {
    id: seed.id,
    name: seed.name,
    avatar: seed.avatar ?? null,
    hand: [],
    characters,
    activeCharacterIndex: -1,
    livesRemaining: maxLives,
    isEliminated: false,
  };
}

const CHARACTER_MAX_HP: Record<CharacterRank, number> = { J: 30, Q: 40, K: 50 };
function createCharacter(rank: CharacterRank, suit: (typeof SUITS)[number], id: string): Character {
  const maxHp = CHARACTER_MAX_HP[rank];
  return {
    id,
    rank,
    suit,
    hp: maxHp,
    maxHp,
    shield: 0,
    status: 'BENCH',
  };
}

function pickSuit(random: () => number): (typeof SUITS)[number] {
  const index = Math.min(SUITS.length - 1, Math.floor(random() * SUITS.length));
  return SUITS[index] ?? 'S';
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export function drawCards(state: GameState, player: Player, count: number): number {
  let drawn = 0;
  while (drawn < count && player.hand.length < MAX_HAND_SIZE) {
    const card = drawOne(state);
    if (!card) break;
    player.hand.push(card);
    drawn += 1;
  }
  return drawn;
}

function drawOne(state: GameState): Card | null {
  if (state.deck.length === 0) {
    recycleDiscard(state);
  }
  return state.deck.pop() ?? null;
}

function recycleDiscard(state: GameState): void {
  const top = state.discard.pop();
  if (state.discard.length === 0) {
    if (top) state.discard.push(top);
    return;
  }
  state.deck = [...state.discard].reverse();
  state.discard = top ? [top] : [];
}

export function appendLog(state: GameState, at: number, type: string, message: string): void {
  const previous = state.log.at(-1);
  state.log.push({ sequence: (previous?.sequence ?? 0) + 1, type, message, at });
  if (state.log.length > 100) state.log.splice(0, state.log.length - 100);
}

export function activeCharacter(player: Player): Character {
  const character = player.characters[player.activeCharacterIndex];
  assertDomain(character, 'INVALID_STARTER', 'Player has no active character.');
  return character;
}

export function activePlayers(state: GameState): Player[] {
  return state.players.filter((player) => !player.isEliminated);
}

