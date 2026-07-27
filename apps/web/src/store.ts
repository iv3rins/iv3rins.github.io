import type { AppState } from './types.ts';
import { createId } from './id.ts';

type Listener = (state: AppState) => void;

const initialState: AppState = {
  connection: 'offline',
  playerId: null,
  reconnectToken: null,
  room: null,
  game: null,
  gameMode: 'online',
  selectedCardIndices: new Set<number>(),
  selectedTargetId: null,
  lastBroadcast: null,
  chats: [],
  fatalError: null,
  currentUser: null,
  modalView: null,
  activePage: 'home',
  guestName: `访客#${createId().slice(0, 6).toUpperCase()}`,
  multiplayerOpen: false,
  reconnecting: false,
  wanhuaPending: null,
};

export class Store {
  #state: AppState = initialState;
  readonly #listeners = new Set<Listener>();

  get state(): AppState { return this.#state; }

  set(patch: Partial<AppState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const l of this.#listeners) l(this.#state);
  }

  update(updater: (state: AppState) => AppState): void {
    this.#state = updater(this.#state);
    for (const l of this.#listeners) l(this.#state);
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }
}

/* ── Local auth helpers (localStorage, no real security) ─────────────────── */
const AUTH_KEY = 'pokewar.users';
const SESSION_KEY = 'pokewar.session';

export interface StoredUser {
  id: string; username: string; passwordHash: string;
  eloScore: number; wins: number; losses: number; botWins: number;
  cosmeticFrameId: string; cosmeticTitleId: string;
}

function loadUsers(): Record<string, StoredUser> {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) ?? '{}') as Record<string, StoredUser>; }
  catch { return {}; }
}

function saveUsers(users: Record<string, StoredUser>): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(users));
}

export function authRegister(username: string, password: string): StoredUser | string {
  const users = loadUsers();
  if (Object.values(users).some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return '用户名已存在';
  }
  const user: StoredUser = {
    id: createId(), username, passwordHash: btoa(password),
    eloScore: 1000, wins: 0, losses: 0, botWins: 0,
    cosmeticFrameId: 'frame-default', cosmeticTitleId: 'title-none',
  };
  users[user.id] = user;
  saveUsers(users);
  localStorage.setItem(SESSION_KEY, user.id);
  return user;
}

export function authLogin(username: string, password: string): StoredUser | string {
  const users = loadUsers();
  const user = Object.values(users).find(
    (u) => u.username.toLowerCase() === username.toLowerCase() && u.passwordHash === btoa(password),
  );
  if (!user) return '用户名或密码错误';
  localStorage.setItem(SESSION_KEY, user.id);
  return user;
}

export function authLogout(): void { localStorage.removeItem(SESSION_KEY); }

export function authRestore(): StoredUser | null {
  const id = localStorage.getItem(SESSION_KEY);
  if (!id) return null;
  return loadUsers()[id] ?? null;
}

export function authUpdateUser(updated: StoredUser): void {
  const users = loadUsers();
  users[updated.id] = updated;
  saveUsers(users);
}

export function getMockLeaderboard(currentUser: StoredUser | null) {
  const mock = [
    { id: 'm1', username: 'ShadowAce', eloScore: 2450, wins: 187, losses: 32 },
    { id: 'm2', username: 'FlameKing', eloScore: 2311, wins: 156, losses: 41 },
    { id: 'm3', username: 'DiamondRush', eloScore: 2188, wins: 142, losses: 55 },
    { id: 'm4', username: 'HeartBreaker', eloScore: 2044, wins: 98, losses: 49 },
    { id: 'm5', username: 'ClubMaster', eloScore: 1998, wins: 91, losses: 60 },
  ];
  const all = [...mock];
  if (currentUser && !mock.some((m) => m.id === currentUser.id)) {
    all.push({ id: currentUser.id, username: currentUser.username, eloScore: currentUser.eloScore, wins: currentUser.wins, losses: currentUser.losses });
  }
  all.sort((a, b) => b.eloScore - a.eloScore);
  return all.map((entry, i) => ({ rank: i + 1, ...entry, isCurrentUser: entry.id === currentUser?.id }));
}

