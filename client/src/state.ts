import { create } from 'zustand';

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
}

export interface Progression {
  story_world: number;
  trophy: number;
  mmr_ranked: number;
  mmr_casual: number;
  unlocked_characters: string[];
  omni_gauge: number;
  omni_unlocked: number;
  augments: string[];
  mythic_modifiers: string[];
  new_game_plus: number;
}

export interface CharacterDefinition {
  id: string;
  name: string;
  element: string;
  role: string;
  maxHealth: number;
  passive: string;
  baseDamage: number;
  burst: { id: string; name: string; description: string; ceCost: number };
  skills: { id: string; name: string; description: string; ceCost: number; chargeLevel: string }[];
}

interface AppState {
  user?: User;
  token?: string;
  progress?: Progression;
  roster: CharacterDefinition[];
  setAuth: (user: User, token: string, progress: Progression) => void;
  clear: () => void;
  setRoster: (r: CharacterDefinition[]) => void;
  updateProgress: (p: Progression) => void;
}

export const useAppState = create<AppState>((set) => ({
  roster: [],
  setAuth: (user, token, progress) => set({ user, token, progress }),
  clear: () => set({ user: undefined, token: undefined, progress: undefined }),
  setRoster: (r) => set({ roster: r }),
  updateProgress: (p) => set({ progress: p })
}));

const API_URL = 'http://localhost:4000/api';

async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Request failed');
  }
  return res.json();
}

export async function login(email: string, password: string) {
  const data = await api<{ user: User; token: string; progress: Progression }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  useAppState.getState().setAuth(data.user, data.token, data.progress);
}

export async function signup(email: string, password: string) {
  const data = await api<{ user: User; token: string; progress: Progression }>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  useAppState.getState().setAuth(data.user, data.token, data.progress);
}

export async function fetchRoster() {
  const data = await api<{ roster: CharacterDefinition[] }>('/roster');
  useAppState.getState().setRoster(data.roster);
}

export async function fetchMe() {
  const token = useAppState.getState().token;
  if (!token) return;
  const data = await api<{ user: User; progress: Progression }>('/auth/me', { method: 'GET' }, token);
  useAppState.getState().setAuth(data.user, token, data.progress);
}

export async function startStory(world: number) {
  const token = useAppState.getState().token;
  if (!token) throw new Error('Auth required');
  return api<{ match: any; result: string; events: any[] }>('/story', { method: 'POST', body: JSON.stringify({ world }) }, token);
}

export async function queueMatch(payload: { mode: string; ranked: boolean; team: string[]; isPrivate?: boolean }) {
  const token = useAppState.getState().token;
  if (!token) throw new Error('Auth required');
  return api('/match/queue', { method: 'POST', body: JSON.stringify({ ...payload, isPrivate: payload.isPrivate ?? false }) }, token);
}

export async function runCheckmate() {
  const token = useAppState.getState().token;
  if (!token) throw new Error('Auth required');
  return api('/omni/checkmate', { method: 'POST' }, token);
}

export async function fetchFriends() {
  const token = useAppState.getState().token;
  if (!token) throw new Error('Auth required');
  return api<{ friends: any[]; requests: any[] }>('/friends', { method: 'GET' }, token);
}

export async function sendFriend(recipientId: string) {
  const token = useAppState.getState().token;
  if (!token) throw new Error('Auth required');
  return api('/friends/request', { method: 'POST', body: JSON.stringify({ recipientId }) }, token);
}

export async function acceptFriend(requestId: string) {
  const token = useAppState.getState().token;
  if (!token) throw new Error('Auth required');
  return api('/friends/accept', { method: 'POST', body: JSON.stringify({ requestId }) }, token);
}

export async function removeFriend(friendId: string) {
  const token = useAppState.getState().token;
  if (!token) throw new Error('Auth required');
  return api('/friends/remove', { method: 'POST', body: JSON.stringify({ friendId }) }, token);
}

export async function fetchLeaderboard(category: 'trophy' | 'ranked') {
  const token = useAppState.getState().token;
  if (!token) throw new Error('Auth required');
  return api<{ entries: any[] }>(`/leaderboard?category=${category}`, { method: 'GET' }, token);
}

export async function fetchContent() {
  return api<{ augments: any[]; skillEvolutions: any[]; mythicModifiers: any[]; bossModifiers: string[] }>('/content');
}

export async function startNewGamePlus() {
  const token = useAppState.getState().token;
  if (!token) throw new Error('Auth required');
  const data = await api<{ status: string; new_game_plus: number }>('/progression/newgameplus', { method: 'POST' }, token);
  await fetchMe();
  return data;
}

export async function startBossRush(team: string[]) {
  const token = useAppState.getState().token;
  if (!token) throw new Error('Auth required');
  return api('/bossrush', { method: 'POST', body: JSON.stringify({ team }) }, token);
}

export async function startInfinite(team: string[], waves: number) {
  const token = useAppState.getState().token;
  if (!token) throw new Error('Auth required');
  return api('/infinite', { method: 'POST', body: JSON.stringify({ team, waves }) }, token);
}
