import Database from 'better-sqlite3';
import { config } from './config.js';

export const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS progressions (
  user_id TEXT PRIMARY KEY,
  story_world INTEGER NOT NULL DEFAULT 1,
  trophy INTEGER NOT NULL DEFAULT 0,
  mmr_ranked INTEGER NOT NULL DEFAULT 1200,
  mmr_casual INTEGER NOT NULL DEFAULT 1200,
  unlocked_characters TEXT NOT NULL,
  omni_gauge INTEGER NOT NULL DEFAULT 0,
  omni_unlocked INTEGER NOT NULL DEFAULT 0,
  augments TEXT NOT NULL DEFAULT '[]',
  mythic_modifiers TEXT NOT NULL DEFAULT '[]',
  new_game_plus INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(requester_id) REFERENCES users(id),
  FOREIGN KEY(recipient_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS friendships (
  user_a TEXT NOT NULL,
  user_b TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_a, user_b)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  ranked INTEGER NOT NULL,
  status TEXT NOT NULL,
  host_user_id TEXT,
  is_private INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  experimental INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(host_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS match_players (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  team INTEGER NOT NULL,
  result TEXT,
  mmr_before INTEGER,
  mmr_after INTEGER,
  FOREIGN KEY(match_id) REFERENCES matches(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS match_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(match_id) REFERENCES matches(id)
);

CREATE TABLE IF NOT EXISTS leaderboards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  score INTEGER NOT NULL,
  season INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

// schema upgrades to maintain forward compatibility
const progressionInfo = db.prepare("PRAGMA table_info(progressions)").all() as { name: string }[];
const progressionColumns = new Set(progressionInfo.map((c) => c.name));
const addColumn = (name: string, ddl: string) => {
  if (!progressionColumns.has(name)) {
    try {
      db.exec(`ALTER TABLE progressions ADD COLUMN ${ddl}`);
    } catch (err) {
      console.error('Failed to alter progressions for', name, err);
    }
  }
};
addColumn('augments', "augments TEXT NOT NULL DEFAULT '[]'");
addColumn('mythic_modifiers', "mythic_modifiers TEXT NOT NULL DEFAULT '[]'");
addColumn('new_game_plus', 'new_game_plus INTEGER NOT NULL DEFAULT 0');

export function now(): number {
  return Date.now();
}
