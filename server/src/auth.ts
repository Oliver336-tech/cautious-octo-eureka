import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, now } from './db.js';
import { config } from './config.js';
import { Progression, Role, User } from './types.js';
import { v4 as uuid } from 'uuid';

const baseCharacters = ['sophia', 'endrit', 'grace', 'nona', 'grandma', 'liya', 'yohanna'];

function mapUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    password_hash: row.password_hash,
    role: row.role,
    created_at: row.created_at
  };
}

export function findUserByEmail(email: string): User | undefined {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  return row ? mapUser(row) : undefined;
}

export function findUserById(id: string): User | undefined {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return row ? mapUser(row) : undefined;
}

function determineRole(email: string): Role {
  return email.toLowerCase() === config.adminEmail.toLowerCase() && config.adminEmail !== '' ? 'admin' : 'user';
}

export function createUser(email: string, password: string): User {
  const existing = findUserByEmail(email);
  if (existing) {
    throw new Error('Email already registered');
  }
  const hashed = bcrypt.hashSync(password, 10);
  const role = determineRole(email);
  const id = uuid();
  db.prepare('INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(id, email, hashed, role, now());
  const progression: Progression = {
    user_id: id,
    story_world: 1,
    trophy: 0,
    mmr_ranked: 1200,
    mmr_casual: 1200,
    unlocked_characters: baseCharacters,
    omni_gauge: 0,
    omni_unlocked: 0,
    augments: [],
    mythic_modifiers: [],
    new_game_plus: 0
  };
  db.prepare('INSERT INTO progressions (user_id, story_world, trophy, mmr_ranked, mmr_casual, unlocked_characters, omni_gauge, omni_unlocked, augments, mythic_modifiers, new_game_plus) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      id,
      progression.story_world,
      progression.trophy,
      progression.mmr_ranked,
      progression.mmr_casual,
      JSON.stringify(progression.unlocked_characters),
      progression.omni_gauge,
      progression.omni_unlocked,
      JSON.stringify(progression.augments),
      JSON.stringify(progression.mythic_modifiers),
      progression.new_game_plus
    );
  return { id, email, password_hash: hashed, role, created_at: now() };
}

export function issueToken(user: User): string {
  return jwt.sign({ userId: user.id, role: user.role }, config.jwtSecret, { expiresIn: '7d' });
}

export function authenticate(email: string, password: string): { user: User; token: string } {
  let user = findUserByEmail(email);
  if (!user) {
    user = createUser(email, password);
  } else if (!bcrypt.compareSync(password, user.password_hash)) {
    throw new Error('Invalid credentials');
  }
  const role = determineRole(email);
  if (user.role !== role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
    user = { ...user, role };
  }
  const token = issueToken(user);
  db.prepare('INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)').run(uuid(), user.id, now());
  return { user, token };
}

export function getProgress(userId: string): Progression {
  const row = db.prepare('SELECT * FROM progressions WHERE user_id = ?').get(userId);
  if (!row) throw new Error('Progress missing');
  return {
    user_id: row.user_id,
    story_world: row.story_world,
    trophy: row.trophy,
    mmr_ranked: row.mmr_ranked,
    mmr_casual: row.mmr_casual,
    unlocked_characters: JSON.parse(row.unlocked_characters),
    omni_gauge: row.omni_gauge,
    omni_unlocked: row.omni_unlocked,
    augments: JSON.parse(row.augments || '[]'),
    mythic_modifiers: JSON.parse(row.mythic_modifiers || '[]'),
    new_game_plus: row.new_game_plus || 0
  };
}

export function updateProgress(prog: Progression) {
  db.prepare(
    'UPDATE progressions SET story_world = ?, trophy = ?, mmr_ranked = ?, mmr_casual = ?, unlocked_characters = ?, omni_gauge = ?, omni_unlocked = ?, augments = ?, mythic_modifiers = ?, new_game_plus = ? WHERE user_id = ?'
  ).run(
    prog.story_world,
    prog.trophy,
    prog.mmr_ranked,
    prog.mmr_casual,
    JSON.stringify(prog.unlocked_characters),
    prog.omni_gauge,
    prog.omni_unlocked,
    JSON.stringify(prog.augments),
    JSON.stringify(prog.mythic_modifiers),
    prog.new_game_plus,
    prog.user_id
  );
}

export function verifyToken(token: string): { userId: string; role: Role } | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    return { userId: decoded.userId, role: decoded.role };
  } catch (err) {
    return null;
  }
}
