export type Role = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: number;
}

export interface Progression {
  user_id: string;
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

export interface FriendRequestRow {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: number;
}

export interface FriendLink {
  user_a: string;
  user_b: string;
  created_at: number;
}

export interface MatchRow {
  id: string;
  mode: string;
  ranked: number;
  status: 'pending' | 'active' | 'completed';
  host_user_id: string | null;
  is_private: number;
  created_at: number;
  updated_at: number;
  experimental: number;
}

export interface MatchPlayerRow {
  id: string;
  match_id: string;
  user_id: string;
  team: number;
  result: 'win' | 'loss' | 'draw' | null;
  mmr_before: number | null;
  mmr_after: number | null;
}

export interface MatchEventRow {
  id: string;
  match_id: string;
  sequence: number;
  event_type: string;
  payload: string;
  created_at: number;
}

export type CharacterId =
  | 'sophia'
  | 'endrit'
  | 'grace'
  | 'nona'
  | 'grandma'
  | 'liya'
  | 'yohanna'
  | 'oliver';

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  element: string;
  role: string;
  maxHealth: number;
  passive: string;
  baseDamage: number;
  burst: SkillDefinition;
  skills: SkillDefinition[];
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  chargeLevel: 'tap' | 'charged' | 'overcharged' | 'burst';
  ceCost: number;
  cooldown: number;
  onUse: (context: SkillContext) => void;
}

export type StatusId =
  | 'shield'
  | 'burn'
  | 'regen'
  | 'vulnerable'
  | 'haste'
  | 'slow'
  | 'bind'
  | 'weaken'
  | 'dodge'
  | 'echo'
  | 'afterglow'
  | 'ce_burn'
  | 'timeline_freeze'
  | 'timeline_rewind'
  | 'timeline_displace';

export interface StatusEffect {
  id: StatusId;
  stacks: number;
  duration: number;
}

export interface FighterState {
  id: string;
  userId?: string;
  character: CharacterDefinition;
  health: number;
  comboEnergy: number;
  omniGauge: number;
  ceDebt: number;
  ceLock: number;
  ceVolatility: number;
  statuses: StatusEffect[];
  cooldowns: Record<string, number>;
  team: number;
}

export interface BattleState {
  fighters: FighterState[];
  comboChain: {
    value: number;
    decayTimer: number;
  };
  turn: number;
  rng: DeterministicRng;
}

export interface SkillContext {
  state: BattleState;
  actor: FighterState;
  targets: FighterState[];
  log: (event: MatchEvent) => void;
}

export interface MatchEvent {
  type: string;
  detail: string;
  data?: Record<string, unknown>;
}

export interface SimulationResult {
  events: MatchEvent[];
  winner: number | null;
  finalState: BattleState;
  snapshots: BattleSnapshot[];
}

export type GameMode =
  | 'story'
  | 'boss_rush'
  | 'infinite_waves'
  | 'playground'
  | 'coop'
  | 'competitive_casual'
  | 'competitive_ranked'
  | 'experimental_real_time';

export interface MatchRequest {
  mode: GameMode;
  ranked: boolean;
  isPrivate: boolean;
  hostUserId?: string;
  experimental?: boolean;
}

export interface DeterministicRng {
  seed: number;
  next: () => number;
}

export interface BattleSnapshot {
  turn: number;
  checksum: string;
}
