import type { GameDependencies, GameState, PlayerSeed } from '../src/types.ts';
import { createGameState, selectStarter } from '../src/index.ts';

export function dependencies(now = 1_000): GameDependencies {
  let id = 0;
  return {
    now: () => now,
    random: () => 0.25,
    createId: () => `id-${(id += 1)}`,
  };
}

export function startedGame(maxLives = 3): GameState {
  const deps = dependencies();
  const seeds: PlayerSeed[] = [
    { id: 'p1', name: 'One' },
    { id: 'p2', name: 'Two' },
  ];
  let state = createGameState('g1', seeds, maxLives, deps);
  state = selectStarter(state, 'p1', 0, deps);
  state = selectStarter(state, 'p2', 0, deps);
  return state;
}
