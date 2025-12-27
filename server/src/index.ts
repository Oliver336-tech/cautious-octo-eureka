import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { authenticate, createUser, findUserById, getProgress } from './auth.js';
import { requireAdmin, requireAuth, AuthedRequest } from './middleware.js';
import { acceptFriendRequest, listFriends, listRequests, removeFriend, sendFriendRequest } from './social.js';
import { bossRush, enqueueMatch, createPrivateMatch, createStoryBattle, infiniteWaves, leaderboards, omniCheckmate, setPresence, updateLeaderboard } from './matchmaking.js';
import { getRoster } from './engine.js';
import { z } from 'zod';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { augments, bossModifiers, mythicModifiers, skillEvolutions } from './content.js';
import { verifyDeterminism } from './simulation.js';
import { getRoster, simulateBattle } from './engine.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (socket, req) => {
  socket.send(JSON.stringify({ type: 'welcome', message: 'Family Combo Battler: Ascension Online' }));
  socket.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === 'presence' && parsed.userId) {
        setPresence(parsed.userId);
        socket.send(JSON.stringify({ type: 'presence:ack' }));
      }
    } catch (err) {
      socket.send(JSON.stringify({ type: 'error', message: 'Malformed message' }));
    }
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', game: 'Family Combo Battler: Ascension Online' });
});

app.post('/api/auth/login', (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
  try {
    const { user, token } = authenticate(parsed.data.email, parsed.data.password);
    const progress = getProgress(user.id);
    res.json({ user: { id: user.id, email: user.email, role: user.role }, token, progress });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/signup', (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
  try {
    const user = createUser(parsed.data.email, parsed.data.password);
    const { token } = authenticate(parsed.data.email, parsed.data.password);
    const progress = getProgress(user.id);
    res.json({ user: { id: user.id, email: user.email, role: user.role }, token, progress });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
  const user = findUserById(req.user!.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const progress = getProgress(user.id);
  setPresence(user.id);
  res.json({ user: { id: user.id, email: user.email, role: user.role }, progress });
});

app.get('/api/roster', (_req, res) => {
  res.json({ roster: getRoster() });
});

app.get('/api/content', (_req, res) => {
  res.json({ augments, skillEvolutions, mythicModifiers, bossModifiers });
});

app.post('/api/friends/request', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ recipientId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
  try {
    const fr = sendFriendRequest(req.user!.userId, parsed.data.recipientId);
    res.json(fr);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/friends/accept', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ requestId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
  try {
    acceptFriendRequest(parsed.data.requestId, req.user!.userId);
    res.json({ status: 'accepted' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/friends/remove', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ friendId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
  removeFriend(req.user!.userId, parsed.data.friendId);
  res.json({ status: 'removed' });
});

app.get('/api/friends', requireAuth, (req: AuthedRequest, res) => {
  res.json({ friends: listFriends(req.user!.userId), requests: listRequests(req.user!.userId) });
});

app.post('/api/story', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ world: z.number().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
  const progress = getProgress(req.user!.userId);
  if (parsed.data.world > progress.story_world + 1) {
    return res.status(400).json({ error: 'Advance sequentially through worlds' });
  }
  const { match, result, events } = createStoryBattle(req.user!.userId, parsed.data.world);
  res.json({ match, result, events });
});

app.post('/api/progression/newgameplus', requireAuth, (req: AuthedRequest, res) => {
  const progress = getProgress(req.user!.userId);
  if (progress.story_world < 15 && !progress.omni_unlocked) {
    return res.status(400).json({ error: 'Finish story before New Game+.' });
  }
  progress.new_game_plus += 1;
  progress.story_world = 1;
  updateProgress(progress);
  res.json({ status: 'ng+ unlocked', new_game_plus: progress.new_game_plus });
});

app.post('/api/admin/verify-determinism', requireAuth, requireAdmin, (_req: AuthedRequest, res) => {
  const roster = getRoster().slice(0, 3);
  const simA = simulateBattle(roster, roster, 'verify-seed');
  const simB = simulateBattle(roster, roster, 'verify-seed');
  const consistent = verifyDeterminism([simA.finalState, simB.finalState]);
  res.json({ consistent });
});

app.post('/api/omni/checkmate', requireAuth, (req: AuthedRequest, res) => {
  try {
    const result = omniCheckmate(req.user!.userId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/match/queue', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ mode: z.string(), ranked: z.boolean(), isPrivate: z.boolean().default(false), team: z.array(z.string()).min(3).max(6), experimental: z.boolean().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
  if ((parsed.data.experimental || parsed.data.mode === 'experimental_real_time') && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Experimental real-time mode is admin only' });
  }
  const progress = getProgress(req.user!.userId);
  if (parsed.data.team.some((id) => !progress.unlocked_characters.includes(id))) {
    return res.status(400).json({ error: 'Loadout includes locked character' });
  }
  const result = enqueueMatch({ userId: req.user!.userId, ...parsed.data });
  if (result) {
    res.json({ status: 'matched', match: result.match, winner: result.winner, events: result.events });
  } else {
    res.json({ status: 'queued' });
  }
});

app.post('/api/bossrush', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ team: z.array(z.string()).min(3).max(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
  const progress = getProgress(req.user!.userId);
  if (parsed.data.team.some((id) => !progress.unlocked_characters.includes(id))) return res.status(400).json({ error: 'Loadout includes locked character' });
  const result = bossRush(req.user!.userId, parsed.data.team);
  res.json(result);
});

app.post('/api/infinite', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ team: z.array(z.string()).min(3).max(6), waves: z.number().min(5).max(30).default(10) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
  const progress = getProgress(req.user!.userId);
  if (parsed.data.team.some((id) => !progress.unlocked_characters.includes(id))) return res.status(400).json({ error: 'Loadout includes locked character' });
  const result = infiniteWaves(req.user!.userId, parsed.data.team, parsed.data.waves);
  res.json(result);
});

app.post('/api/match/private', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ team: z.array(z.string()).min(3).max(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
  const match = createPrivateMatch({ userId: req.user!.userId, mode: 'playground', ranked: false, isPrivate: true, team: parsed.data.team });
  res.json({ match });
});

app.get('/api/leaderboard', requireAuth, (req: AuthedRequest, res) => {
  const category = req.query.category === 'ranked' ? 'ranked' : 'trophy';
  const season = parseInt((req.query.season as string) || '1', 10);
  res.json({ entries: leaderboards(category as any, season) });
});

app.post('/api/admin/leaderboard', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
  const schema = z.object({ category: z.enum(['trophy', 'ranked']), season: z.number().min(1), score: z.number().min(0) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });
  updateLeaderboard(req.user!.userId, parsed.data.category, parsed.data.season, parsed.data.score);
  res.json({ status: 'updated' });
});

server.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
