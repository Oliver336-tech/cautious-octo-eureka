import { db, now } from './db.js';
import { FriendLink, FriendRequestRow } from './types.js';
import { v4 as uuid } from 'uuid';

function mapRequest(row: any): FriendRequestRow {
  return {
    id: row.id,
    requester_id: row.requester_id,
    recipient_id: row.recipient_id,
    status: row.status,
    created_at: row.created_at
  };
}

export function sendFriendRequest(requester: string, recipient: string): FriendRequestRow {
  const existingLink = db
    .prepare('SELECT 1 FROM friendships WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)')
    .get(requester, recipient, recipient, requester);
  if (existingLink) throw new Error('Already friends');
  const existingRequest = db
    .prepare('SELECT * FROM friend_requests WHERE requester_id = ? AND recipient_id = ? AND status = "pending"')
    .get(requester, recipient);
  if (existingRequest) return mapRequest(existingRequest);
  const id = uuid();
  db.prepare('INSERT INTO friend_requests (id, requester_id, recipient_id, status, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    requester,
    recipient,
    'pending',
    now()
  );
  return { id, requester_id: requester, recipient_id: recipient, status: 'pending', created_at: now() };
}

export function acceptFriendRequest(id: string, userId: string) {
  const req = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(id);
  if (!req) throw new Error('Request not found');
  if (req.recipient_id !== userId) throw new Error('Unauthorized');
  db.prepare('UPDATE friend_requests SET status = "accepted" WHERE id = ?').run(id);
  const createdAt = now();
  const sorted: [string, string] = req.requester_id < req.recipient_id ? [req.requester_id, req.recipient_id] : [req.recipient_id, req.requester_id];
  db.prepare('INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)').run(sorted[0], sorted[1], createdAt);
}

export function removeFriend(userId: string, friendId: string) {
  const sorted: [string, string] = userId < friendId ? [userId, friendId] : [friendId, userId];
  db.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(sorted[0], sorted[1]);
}

export function listFriends(userId: string): FriendLink[] {
  const rows = db.prepare('SELECT * FROM friendships WHERE user_a = ? OR user_b = ?').all(userId, userId);
  return rows.map((r: any) => ({ user_a: r.user_a, user_b: r.user_b, created_at: r.created_at }));
}

export function listRequests(userId: string): FriendRequestRow[] {
  const rows = db.prepare('SELECT * FROM friend_requests WHERE requester_id = ? OR recipient_id = ? ORDER BY created_at DESC').all(userId, userId);
  return rows.map(mapRequest);
}
