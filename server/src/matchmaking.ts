import { db, now } from './db.js';
import { getCharacter, getRoster, simulateBattle, getStoryWorld, checkmatePvE } from './engine.js';
import { MatchEvent, MatchRequest, MatchRow, Progression, Role } from './types.js';
import { v4 as uuid } from 'uuid';
import { updateProgress } from './auth.js';
import { bossModifiers, BossModifier } from './content.js';

interface QueueEntry {
  userId: string;
  mode: MatchRequest['mode'];
  ranked: boolean;
  isPrivate: boolean;
  experimental?: boolean;
  team: string[];
}

const queue: QueueEntry[] = [];
const presence = new Map<string, number>();

function toMatchRow(match: any): MatchRow {
  return {
    id: match.id,
    mode: match.mode,
    ranked: match.ranked,
    status: match.status,
    host_user_id: match.host_user_id,
    is_private: match.is_private,
    created_at: match.created_at,
    updated_at: match.updated_at,
    experimental: match.experimental
  };
}

export function setPresence(userId: string) {
  presence.set(userId, now());
}

export function getPresence(userId: string): boolean {
  const ts = presence.get(userId);
  return ts ? now() - ts < 120000 : false;
}

function recordEvents(matchId: string, events: MatchEvent[]) {
  let seq = 0;
  const stmt = db.prepare('INSERT INTO match_events (id, match_id, sequence, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (const ev of events) {
    stmt.run(uuid(), matchId, seq, ev.type, JSON.stringify(ev), now());
    seq += 1;
  }
}

function adjustRatings(userId: string, ranked: boolean, won: boolean) {
  const progRow = db.prepare('SELECT * FROM progressions WHERE user_id = ?').get(userId);
  if (!progRow) return;
  const prog: Progression = {
    user_id: progRow.user_id,
    story_world: progRow.story_world,
    trophy: progRow.trophy,
    mmr_ranked: progRow.mmr_ranked,
    mmr_casual: progRow.mmr_casual,
    unlocked_characters: JSON.parse(progRow.unlocked_characters),
    omni_gauge: progRow.omni_gauge,
    omni_unlocked: progRow.omni_unlocked,
    augments: JSON.parse(progRow.augments || '[]'),
    mythic_modifiers: JSON.parse(progRow.mythic_modifiers || '[]'),
    new_game_plus: progRow.new_game_plus || 0
  };
  if (ranked) {
    prog.mmr_ranked = Math.max(0, prog.mmr_ranked + (won ? 25 : -20));
    prog.trophy += won ? 15 : 5;
  } else {
    prog.mmr_casual = Math.max(0, prog.mmr_casual + (won ? 10 : -8));
  }
  if (prog.trophy >= 1000 && !prog.unlocked_characters.includes('oliver')) {
    prog.unlocked_characters.push('oliver');
  }
  updateProgress(prog);
}

function logMatch(matchId: string, userId: string, result: 'win' | 'loss' | 'draw', ranked: boolean, team: number, mmrBefore: number, mmrAfter: number) {
  db.prepare('INSERT INTO match_players (id, match_id, user_id, team, result, mmr_before, mmr_after) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    uuid(),
    matchId,
    userId,
    team,
    result,
    mmrBefore,
    mmrAfter
  );
}

function buildTeamFromLoadout(loadout: string[]): ReturnType<typeof getRoster> {
  return loadout.map((id) => getCharacter(id)!).filter(Boolean);
}

function scaleEnemy(def: ReturnType<typeof getCharacter>, multiplier: number) {
  if (!def) return def;
  return {
    ...def,
    maxHealth: Math.round(def.maxHealth * multiplier),
    baseDamage: Math.round(def.baseDamage * multiplier)
  };
}

function applyBossModifier(defs: ReturnType<typeof getRoster>, modifier: BossModifier, difficulty: number) {
  return defs.map((d) => {
    let scaled = { ...d };
    switch (modifier) {
      case 'enraged':
        scaled = scaleEnemy(scaled, 1.15 + difficulty * 0.05);
        break;
      case 'mirror':
        scaled = { ...scaled, baseDamage: scaled.baseDamage + 6 + Math.round(difficulty * 3), maxHealth: scaled.maxHealth + 20 };
        break;
      case 'corrupted':
        scaled = scaleEnemy(scaled, 1.1 + difficulty * 0.03);
        break;
      case 'adaptive':
        scaled = { ...scaled, baseDamage: scaled.baseDamage + Math.round(4 + difficulty * 2) };
        break;
      default:
        break;
    }
    return scaled;
  });
}

function createMatchRecord(req: QueueEntry, opponent?: QueueEntry) {
  const id = uuid();
  const matchRow: MatchRow = {
    id,
    mode: req.mode,
    ranked: req.ranked ? 1 : 0,
    status: 'completed',
    host_user_id: req.isPrivate ? req.userId : opponent?.userId || req.userId,
    is_private: req.isPrivate ? 1 : 0,
    created_at: now(),
    updated_at: now(),
    experimental: req.experimental ? 1 : 0
  };
  db.prepare('INSERT INTO matches (id, mode, ranked, status, host_user_id, is_private, created_at, updated_at, experimental) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(matchRow.id, matchRow.mode, matchRow.ranked, matchRow.status, matchRow.host_user_id, matchRow.is_private, matchRow.created_at, matchRow.updated_at, matchRow.experimental);
  return matchRow;
}

export function createStoryBattle(userId: string, world: number): { match: MatchRow; result: 'win' | 'loss'; events: MatchEvent[] } {
  const id = uuid();
  const roster = buildTeamFromLoadout(getRoster().slice(0, Math.min(3 + Math.floor(world / 5), 6)).map((c) => c.id));
  const progRow = db.prepare('SELECT * FROM progressions WHERE user_id = ?').get(userId);
  const ngPlusLevel = progRow?.new_game_plus || 0;
  const difficulty = ngPlusLevel + world / 10;
  const modifier: BossModifier = bossModifiers[world % bossModifiers.length];
  const baseEnemy = getStoryWorld(world);
  const enemy = applyBossModifier(baseEnemy, modifier, difficulty);
  const simulation = simulateBattle(roster, enemy, `story-${userId}-${world}-${id}`);
  simulation.events.unshift({ type: 'modifier', detail: `Boss modifier: ${modifier}`, data: { modifier, difficulty } });
  const win = simulation.winner === 0;
  db.prepare('INSERT INTO matches (id, mode, ranked, status, host_user_id, is_private, created_at, updated_at, experimental) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, 'story', 0, 'completed', userId, 1, now(), now(), 0);
  recordEvents(id, simulation.events);
  logMatch(id, userId, win ? 'win' : 'loss', false, 0, 0, 0);
  const progRowPost = db.prepare('SELECT * FROM progressions WHERE user_id = ?').get(userId);
  if (progRowPost) {
    const prog: Progression = {
      user_id: progRowPost.user_id,
      story_world: progRowPost.story_world,
      trophy: progRowPost.trophy,
      mmr_ranked: progRowPost.mmr_ranked,
      mmr_casual: progRowPost.mmr_casual,
      unlocked_characters: JSON.parse(progRowPost.unlocked_characters),
      omni_gauge: progRowPost.omni_gauge,
      omni_unlocked: progRowPost.omni_unlocked,
      augments: JSON.parse(progRowPost.augments || '[]'),
      mythic_modifiers: JSON.parse(progRowPost.mythic_modifiers || '[]'),
      new_game_plus: progRowPost.new_game_plus || 0
    };
    if (win) {
      prog.story_world = Math.max(prog.story_world, world + 1);
      prog.trophy += 10;
      if (prog.story_world > 15 && !prog.unlocked_characters.includes('oliver')) {
        prog.unlocked_characters.push('oliver');
        prog.omni_unlocked = 1;
      }
      if (prog.story_world > 15) {
        prog.new_game_plus += 1;
        prog.story_world = 1;
        prog.trophy += 100;
      }
      updateProgress(prog);
    }
  }
  return { match: { id, mode: 'story', ranked: 0, status: 'completed', host_user_id: userId, is_private: 1, created_at: now(), updated_at: now(), experimental: 0 }, result: win ? 'win' : 'loss', events: simulation.events };
}

export function bossRush(userId: string, team: string[]) {
  const roster = buildTeamFromLoadout(team);
  const events: MatchEvent[] = [];
  let success = true;
  for (let wave = 1; wave <= 5; wave += 1) {
    const enemy = getStoryWorld(wave + 5);
    const result = simulateBattle(roster, enemy, `bossrush-${userId}-${wave}`);
    events.push(...result.events.map((e) => ({ ...e, detail: `[Wave ${wave}] ${e.detail}` })));
    if (result.winner !== 0) {
      success = false;
      break;
    }
  }
  const match = createMatchRecord({ userId, mode: 'boss_rush', ranked: false, isPrivate: false, team });
  recordEvents(match.id, events);
  logMatch(match.id, userId, success ? 'win' : 'loss', false, 0, 0, 0);
  if (success) {
    const progRow = db.prepare('SELECT * FROM progressions WHERE user_id = ?').get(userId);
    if (progRow) {
      const prog: Progression = {
        user_id: progRow.user_id,
        story_world: progRow.story_world,
        trophy: progRow.trophy + 25,
        mmr_ranked: progRow.mmr_ranked,
        mmr_casual: progRow.mmr_casual,
        unlocked_characters: JSON.parse(progRow.unlocked_characters),
        omni_gauge: progRow.omni_gauge,
        omni_unlocked: progRow.omni_unlocked
      };
      updateProgress(prog);
    }
  }
  return { match, success, events };
}

export function infiniteWaves(userId: string, team: string[], waves = 10) {
  const roster = buildTeamFromLoadout(team);
  const events: MatchEvent[] = [];
  let cleared = 0;
  for (let wave = 1; wave <= waves; wave += 1) {
    const enemy = getStoryWorld(wave + 8);
    const result = simulateBattle(roster, enemy, `infinite-${userId}-${wave}-${waves}`);
    events.push(...result.events.map((e) => ({ ...e, detail: `[Wave ${wave}] ${e.detail}` })));
    if (result.winner !== 0) break;
    cleared = wave;
  }
  const match = createMatchRecord({ userId, mode: 'infinite_waves', ranked: false, isPrivate: false, team });
  recordEvents(match.id, events);
  logMatch(match.id, userId, cleared === waves ? 'win' : 'loss', false, 0, 0, 0);
  const progRow = db.prepare('SELECT * FROM progressions WHERE user_id = ?').get(userId);
  if (progRow) {
    const prog: Progression = {
      user_id: progRow.user_id,
      story_world: progRow.story_world,
      trophy: progRow.trophy + cleared * 2,
      mmr_ranked: progRow.mmr_ranked,
      mmr_casual: progRow.mmr_casual,
      unlocked_characters: JSON.parse(progRow.unlocked_characters),
      omni_gauge: progRow.omni_gauge,
      omni_unlocked: progRow.omni_unlocked
    };
    updateProgress(prog);
  }
  return { match, cleared, events };
}

export function enqueueMatch(entry: QueueEntry) {
  const opponentIndex = queue.findIndex((q) => q.mode === entry.mode && q.ranked === entry.ranked && !q.isPrivate);
  if (opponentIndex >= 0 && !entry.isPrivate) {
    const opponent = queue.splice(opponentIndex, 1)[0];
    return resolveMatch(entry, opponent);
  }
  queue.push(entry);
  return null;
}

function resolveMatch(a: QueueEntry, b: QueueEntry) {
  const match = createMatchRecord(a, b);
  const teamA = buildTeamFromLoadout(a.team);
  const teamB = buildTeamFromLoadout(b.team);
  const simulation = simulateBattle(teamA, teamB, `match-${match.id}`);
  recordEvents(match.id, simulation.events);
  const winner = simulation.winner;
  const progA = db.prepare('SELECT * FROM progressions WHERE user_id = ?').get(a.userId);
  const progB = db.prepare('SELECT * FROM progressions WHERE user_id = ?').get(b.userId);
  const mmrABefore = a.ranked && progA ? progA.mmr_ranked : 0;
  const mmrBBefore = b.ranked && progB ? progB.mmr_ranked : 0;
  if (winner === 0) {
    adjustRatings(a.userId, a.ranked, true);
    adjustRatings(b.userId, b.ranked, false);
  } else if (winner === 1) {
    adjustRatings(a.userId, a.ranked, false);
    adjustRatings(b.userId, b.ranked, true);
  }
  const progAAfter = a.ranked ? db.prepare('SELECT mmr_ranked FROM progressions WHERE user_id = ?').get(a.userId)?.mmr_ranked || mmrABefore : mmrABefore;
  const progBAfter = b.ranked ? db.prepare('SELECT mmr_ranked FROM progressions WHERE user_id = ?').get(b.userId)?.mmr_ranked || mmrBBefore : mmrBBefore;
  logMatch(match.id, a.userId, winner === 0 ? 'win' : winner === 1 ? 'loss' : 'draw', a.ranked, 0, mmrABefore, progAAfter);
  logMatch(match.id, b.userId, winner === 1 ? 'win' : winner === 0 ? 'loss' : 'draw', b.ranked, 1, mmrBBefore, progBAfter);
  return { match, winner, events: simulation.events };
}

export function createPrivateMatch(entry: QueueEntry) {
  const match = createMatchRecord(entry, undefined);
  const simulation = simulateBattle(buildTeamFromLoadout(entry.team), buildTeamFromLoadout(entry.team), `private-${match.id}`);
  recordEvents(match.id, simulation.events);
  logMatch(match.id, entry.userId, 'draw', false, 0, 0, 0);
  return match;
}

export function leaderboards(category: 'trophy' | 'ranked', season: number) {
  const rows = db.prepare('SELECT user_id, score FROM leaderboards WHERE category = ? AND season = ? ORDER BY score DESC LIMIT 50').all(category, season);
  return rows;
}

export function updateLeaderboard(userId: string, category: 'trophy' | 'ranked', season: number, score: number) {
  db.prepare('INSERT OR REPLACE INTO leaderboards (id, user_id, category, score, season) VALUES (?, ?, ?, ?, ?)').run(`${userId}-${category}-${season}`, userId, category, score, season);
}

export function omniCheckmate(userId: string) {
  const progRow = db.prepare('SELECT omni_unlocked FROM progressions WHERE user_id = ?').get(userId);
  if (!progRow || !progRow.omni_unlocked) throw new Error('Checkmate unavailable');
  return checkmatePvE();
}
