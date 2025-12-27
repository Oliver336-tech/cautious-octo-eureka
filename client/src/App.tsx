import { useEffect, useState } from 'react';
import {
  acceptFriend,
  fetchFriends,
  fetchLeaderboard,
  fetchMe,
  fetchRoster,
  login,
  queueMatch,
  removeFriend,
  runCheckmate,
  sendFriend,
  signup,
  startNewGamePlus,
  startBossRush,
  startInfinite,
  startStory,
  useAppState
} from './state';

function AuthPanel() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    try {
      if (mode === 'login') await login(email, password);
      else await signup(email, password);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="bg-slate-800/70 p-4 rounded-lg shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-amber-300">Account</h2>
        <div className="space-x-2 text-sm">
          <button
            className={`px-2 py-1 rounded ${mode === 'login' ? 'bg-amber-500 text-slate-900' : 'bg-slate-700'}`}
            onClick={() => setMode('login')}
          >
            Login
          </button>
          <button
            className={`px-2 py-1 rounded ${mode === 'signup' ? 'bg-amber-500 text-slate-900' : 'bg-slate-700'}`}
            onClick={() => setMode('signup')}
          >
            Sign up
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <input
          className="w-full rounded bg-slate-900/60 px-3 py-2 border border-slate-700"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full rounded bg-slate-900/60 px-3 py-2 border border-slate-700"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="w-full bg-amber-500 text-slate-900 rounded py-2 font-semibold" onClick={submit}>
          {mode === 'login' ? 'Login' : 'Create account'}
        </button>
        {error && <p className="text-red-300 text-sm">{error}</p>}
      </div>
    </div>
  );
}

function RosterPanel() {
  const roster = useAppState((s) => s.roster);
  return (
    <div className="bg-slate-800/70 p-4 rounded-lg shadow-xl">
      <h2 className="text-xl font-semibold text-amber-300 mb-3">Roster</h2>
      <div className="grid md:grid-cols-2 gap-3">
        {roster.map((c) => (
          <div key={c.id} className="border border-slate-700 rounded p-3 bg-slate-900/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">{c.name}</p>
                <p className="text-sm text-slate-300">{c.element} • {c.role}</p>
              </div>
              <span className="text-xs bg-slate-700 px-2 py-1 rounded">Max HP {c.maxHealth}</span>
            </div>
            <p className="text-sm text-slate-200 mt-2">Passive: {c.passive}</p>
            <div className="mt-2 space-y-1">
              {c.skills.map((s) => (
                <div key={s.id} className="text-sm text-slate-300">
                  <span className="font-semibold text-amber-300">{s.name}</span> — {s.description}
                  <span className="ml-2 text-xs text-slate-400">{s.chargeLevel} • CE {s.ceCost}</span>
                </div>
              ))}
              <div className="text-sm text-indigo-200">
                <span className="font-semibold">Burst: {c.burst.name}</span> — {c.burst.description} (CE {c.burst.ceCost})
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressPanel() {
  const progress = useAppState((s) => s.progress);
  const [ngMessage, setNgMessage] = useState('');
  if (!progress) return null;
  const activateNg = async () => {
    try {
      const res: any = await startNewGamePlus();
      setNgMessage(`New Game+ level ${res.new_game_plus} activated`);
    } catch (err: any) {
      setNgMessage(err.message);
    }
  };
  return (
    <div className="bg-slate-800/70 p-4 rounded-lg shadow-xl flex flex-wrap gap-3 items-center">
      <div>
        <p className="text-xl font-semibold text-amber-300">Progression</p>
        <p className="text-slate-200 text-sm">Story World: {progress.story_world} / 15</p>
        <p className="text-slate-200 text-sm">Trophy Road: {progress.trophy} trophies</p>
      </div>
      <div className="flex-1 flex flex-wrap gap-2 text-sm">
        <span className="px-3 py-2 rounded bg-slate-900/50 border border-slate-700">Ranked MMR: {progress.mmr_ranked}</span>
        <span className="px-3 py-2 rounded bg-slate-900/50 border border-slate-700">Casual MMR: {progress.mmr_casual}</span>
        <span className="px-3 py-2 rounded bg-slate-900/50 border border-slate-700">Omni Gauge: {progress.omni_gauge}</span>
        <span className="px-3 py-2 rounded bg-slate-900/50 border border-slate-700">Ascension Unlocked: {progress.omni_unlocked ? 'Yes' : 'No'}</span>
        <span className="px-3 py-2 rounded bg-slate-900/50 border border-slate-700">New Game+: {progress.new_game_plus}</span>
      </div>
      <div className="flex items-center gap-2">
        <button className="bg-indigo-500 text-slate-900 px-3 py-2 rounded" onClick={activateNg}>Activate New Game+</button>
        {ngMessage && <span className="text-xs text-slate-200">{ngMessage}</span>}
      </div>
    </div>
  );
}

function StoryPanel() {
  const progress = useAppState((s) => s.progress);
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  if (!progress) return null;
  const play = async () => {
    setLoading(true);
    const res = await startStory(progress.story_world);
    setLog(res.events.map((e: any) => e.detail || e.type));
    await fetchMe();
    setLoading(false);
  };
  return (
    <div className="bg-slate-800/70 p-4 rounded-lg shadow-xl space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-amber-300">Story Mode</h3>
        <button className="bg-amber-500 text-slate-900 px-4 py-2 rounded" onClick={play} disabled={loading}>
          {loading ? 'Battling...' : 'Play World ' + progress.story_world}
        </button>
      </div>
      <p className="text-sm text-slate-200">15 Worlds of escalating encounters culminating in unlocking Oliver (Ascended).</p>
      <div className="bg-slate-900/50 rounded p-2 h-32 overflow-auto text-xs text-slate-300 space-y-1">
        {log.map((l, idx) => (
          <div key={idx}>• {l}</div>
        ))}
      </div>
    </div>
  );
}

function MultiplayerPanel() {
  const roster = useAppState((s) => s.roster);
  const unlocked = useAppState((s) => s.progress?.unlocked_characters || []);
  const [selection, setSelection] = useState<string[]>([]);
  const [result, setResult] = useState('');
  const [mode, setMode] = useState<'competitive_ranked' | 'competitive_casual' | 'coop'>('competitive_ranked');

  useEffect(() => {
    setSelection(roster.slice(0, 3).map((c) => c.id));
  }, [roster]);

  const toggle = (id: string) => {
    setSelection((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 6) return prev;
      return [...prev, id];
    });
  };

  const queue = async () => {
    const res: any = await queueMatch({ mode, ranked: mode === 'competitive_ranked', team: selection });
    setResult(res.status === 'queued' ? 'Waiting for opponent...' : `Outcome: ${res.winner}`);
  };

  return (
    <div className="bg-slate-800/70 p-4 rounded-lg shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-amber-300">Multiplayer</h3>
        <select
          className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1"
          value={mode}
          onChange={(e) => setMode(e.target.value as any)}
        >
          <option value="competitive_ranked">Ranked (MMR)</option>
          <option value="competitive_casual">Casual</option>
          <option value="coop">Co-op</option>
        </select>
      </div>
      <p className="text-sm text-slate-200">Server-authoritative combat, anti-cheat validation, and Trophy Road progression.</p>
      <div className="grid md:grid-cols-3 gap-2">
        {roster.map((c) => (
          <button
            key={c.id}
            onClick={() => toggle(c.id)}
            disabled={!unlocked.includes(c.id)}
            className={`border rounded p-2 text-left ${selection.includes(c.id) ? 'border-amber-400 bg-amber-500/20' : 'border-slate-700 bg-slate-900/40'} ${!unlocked.includes(c.id) ? 'opacity-40' : ''}`}
          >
            <p className="font-semibold">{c.name}</p>
            <p className="text-xs text-slate-300">{c.element}</p>
          </button>
        ))}
      </div>
      <button className="bg-amber-500 text-slate-900 px-4 py-2 rounded" onClick={queue} disabled={selection.length < 3}>
        Queue Match ({selection.length} chosen)
      </button>
      {result && <p className="text-slate-200 text-sm">{result}</p>}
    </div>
  );
}

function FriendsPanel() {
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [target, setTarget] = useState('');
  const currentUser = useAppState((s) => s.user);
  if (!currentUser) return null;
  const refresh = async () => {
    const data = await fetchFriends();
    setFriends(data.friends);
    setRequests(data.requests);
  };
  useEffect(() => {
    refresh();
  }, []);
  return (
    <div className="bg-slate-800/70 p-4 rounded-lg shadow-xl space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-amber-300">Friends & Presence</h3>
        <button className="text-sm px-2 py-1 rounded bg-slate-700" onClick={refresh}>Refresh</button>
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 bg-slate-900/60 border border-slate-700 rounded px-3 py-2"
          placeholder="User ID to invite"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <button className="bg-amber-500 text-slate-900 px-3 py-2 rounded" onClick={() => { sendFriend(target).then(refresh); }}>
          Send Request
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-200">Friends</p>
          <ul className="space-y-1 text-sm">
            {friends.map((f) => (
              <li key={`${f.user_a}-${f.user_b}`} className="flex items-center justify-between bg-slate-900/50 px-2 py-1 rounded">
                <span>{f.user_a === currentUser?.id ? f.user_b : f.user_a}</span>
                <button className="text-xs text-red-300" onClick={() => removeFriend(f.user_a === currentUser?.id ? f.user_b : f.user_a).then(refresh)}>Remove</button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-200">Requests</p>
          <ul className="space-y-1 text-sm">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between bg-slate-900/50 px-2 py-1 rounded">
                <span>{r.requester_id} → {r.recipient_id} ({r.status})</span>
                {r.status === 'pending' && (
                  <button className="text-xs text-amber-300" onClick={() => acceptFriend(r.id).then(refresh)}>Accept</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function LeaderboardPanel() {
  const [entries, setEntries] = useState<any[]>([]);
  const [category, setCategory] = useState<'trophy' | 'ranked'>('trophy');
  const load = async (cat: 'trophy' | 'ranked') => {
    const data = await fetchLeaderboard(cat);
    setEntries(data.entries);
  };
  useEffect(() => {
    load(category);
  }, [category]);
  return (
    <div className="bg-slate-800/70 p-4 rounded-lg shadow-xl space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-amber-300">Leaderboards</h3>
        <select className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1" value={category} onChange={(e) => setCategory(e.target.value as any)}>
          <option value="trophy">Trophy Road</option>
          <option value="ranked">Ranked MMR</option>
        </select>
      </div>
      <ul className="text-sm space-y-1">
        {entries.map((e, idx) => (
          <li key={e.user_id} className="flex items-center justify-between bg-slate-900/50 px-3 py-2 rounded">
            <span className="text-slate-200">#{idx + 1} — {e.user_id}</span>
            <span className="text-amber-300 font-semibold">{e.score}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlaygroundPanel() {
  const roster = useAppState((s) => s.roster);
  const unlocked = useAppState((s) => s.progress?.unlocked_characters || []);
  const [log, setLog] = useState<string>('');
  const [team, setTeam] = useState<string[]>([]);
  const [waves, setWaves] = useState(10);

  useEffect(() => {
    setTeam(roster.slice(0, 3).map((c) => c.id));
  }, [roster]);

  const toggle = (id: string) => {
    setTeam((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 6) return prev;
      return [...prev, id];
    });
  };

  const playCheckmate = async () => {
    const result: any = await runCheckmate();
    setLog(result.events.map((e: any) => e.detail).join('\n'));
  };

  const playBossRush = async () => {
    const result: any = await startBossRush(team);
    setLog(result.events.map((e: any) => e.detail).join('\n'));
  };

  const playInfinite = async () => {
    const result: any = await startInfinite(team, waves);
    setLog(result.events.map((e: any) => e.detail).join('\n'));
  };
  return (
    <div className="bg-slate-800/70 p-4 rounded-lg shadow-xl space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-amber-300">Playground & Checkmate</h3>
        <div className="space-x-2">
          <button className="px-3 py-2 bg-indigo-500 text-slate-900 rounded" onClick={playCheckmate}>Oliver: Checkmate</button>
          <button className="px-3 py-2 bg-amber-500 text-slate-900 rounded" onClick={playBossRush} disabled={team.length < 3}>Boss Rush</button>
          <button className="px-3 py-2 bg-emerald-500 text-slate-900 rounded" onClick={playInfinite} disabled={team.length < 3}>Infinite Waves</button>
        </div>
      </div>
      <p className="text-sm text-slate-200">Sandbox battles and instant-win PvE fantasy. Experimental real-time toggles live server-side via admin RBAC.</p>
      <div className="grid grid-cols-3 gap-2">
        {roster.map((c) => (
          <button
            key={c.id}
            onClick={() => toggle(c.id)}
            disabled={!unlocked.includes(c.id)}
            className={`border rounded p-2 text-left text-xs ${team.includes(c.id) ? 'border-indigo-300 bg-indigo-500/10' : 'border-slate-700 bg-slate-900/40'} ${!unlocked.includes(c.id) ? 'opacity-40' : ''}`}
          >
            <p className="font-semibold">{c.name}</p>
            <p className="text-slate-400">{c.element}</p>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <label className="text-slate-200">Infinite waves:</label>
        <input type="number" value={waves} min={5} max={30} onChange={(e) => setWaves(Number(e.target.value))} className="bg-slate-900/60 border border-slate-700 rounded px-2 py-1 w-24" />
      </div>
      <pre className="bg-slate-900/50 rounded p-3 text-xs text-slate-200 whitespace-pre-wrap min-h-[80px]">{log}</pre>
    </div>
  );
}

export default function App() {
  const user = useAppState((s) => s.user);
  const roster = useAppState((s) => s.roster);

  useEffect(() => {
    fetchRoster();
    fetchMe().catch(() => undefined);
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-bold text-amber-300">Family Combo Battler: Ascension Online</p>
          <p className="text-slate-200 text-sm">Server-authoritative multiplayer RPG with deterministic combo combat.</p>
        </div>
        {!user && <AuthPanel />}
        {user && (
          <div className="bg-slate-800/70 p-3 rounded shadow">
            <p className="text-sm text-slate-200">Signed in as</p>
            <p className="font-semibold">{user.email}</p>
            <p className="text-xs text-amber-300">Role: {user.role}</p>
          </div>
        )}
      </header>

      {user && <ProgressPanel />}
      {roster.length > 0 && <RosterPanel />}
      {user && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            <StoryPanel />
            <MultiplayerPanel />
            <PlaygroundPanel />
          </div>
          <div className="space-y-4">
            <FriendsPanel />
            <LeaderboardPanel />
          </div>
        </div>
      )}
      {!user && <p className="text-slate-300 text-sm">Authenticate to access story, multiplayer, playground, and ranked systems.</p>}
      <footer className="text-xs text-slate-400 text-center py-4">Deterministic engine, admin-controlled experimental mode, and full PvE/PvP suite.</footer>
    </div>
  );
}
