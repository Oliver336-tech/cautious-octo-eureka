# Family Combo Battler: Ascension Online

Full-stack implementation of a deterministic, server-authoritative multiplayer RPG with progression, ranked ladder, PvE, and sandbox modes.

## Stack
- **Frontend:** React + TypeScript (Vite), Tailwind CSS, Zustand state.
- **Backend:** Node.js + TypeScript with Express and WebSocket presence ping.
- **Database:** SQLite (via better-sqlite3) persisted to `server/data/fcba.sqlite`.

## Running locally
1. Install dependencies:
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```
2. Configure environment (create `server/.env` if desired):
   ```bash
   ADMIN_EMAIL=admin@example.com
   JWT_SECRET=super-secret
   DB_PATH=./data/fcba.sqlite
   ```
3. Start backend:
   ```bash
   cd server
   npm run dev
   ```
4. Start frontend:
   ```bash
   cd client
   npm run dev
   ```

## Features
- Email/password authentication with JWT and RBAC; admin assignment uses `ADMIN_EMAIL` server-side only.
- Deterministic combat engine with combo energy, status effects, charged skills, bursts, and Oliver (Ascended) omni-gauge fantasy.
- Modes: Story (15 worlds, party growth), Boss Rush, Infinite Waves, Playground/Checkmate, Competitive (ranked/casual), Co-op, Experimental real-time (admin only toggle).
- Progression: Trophy Road, MMR, character unlocks (Oliver gated by story/trophy), omni gauge tracking.
- Social: friends (send/accept/remove), presence pings, private matches.
- Leaderboards with seasonal categories.
- Determinism: engine seeds are derived from authoritative match IDs (story/boss/infinite/competitive) so replays and anti-cheat validation can be reproduced server-side; base seed can be set via `SIMULATION_SEED`.

## Determinism & authority
All matches are simulated server-side via a deterministic RNG seed. Clients request actions such as matchmaking or PvE runs; outcomes and logs are produced by the authoritative engine to prevent tampering.
