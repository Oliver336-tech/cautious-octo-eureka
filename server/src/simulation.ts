import crypto from 'crypto';
import { BattleSnapshot, BattleState, FighterState } from './types.js';

function sanitizeFighter(f: FighterState) {
  return {
    id: f.id,
    userId: f.userId,
    character: f.character.id,
    health: f.health,
    comboEnergy: f.comboEnergy,
    omniGauge: f.omniGauge,
    statuses: f.statuses.map((s) => ({ id: s.id, stacks: s.stacks, duration: s.duration })).sort((a, b) => a.id.localeCompare(b.id)),
    cooldowns: Object.keys(f.cooldowns)
      .sort()
      .reduce((acc, key) => {
        acc[key] = f.cooldowns[key];
        return acc;
      }, {} as Record<string, number>),
    team: f.team
  };
}

function sanitizeState(state: BattleState) {
  return {
    fighters: state.fighters.map(sanitizeFighter).sort((a, b) => a.id.localeCompare(b.id)),
    comboChain: state.comboChain,
    turn: state.turn
  };
}

export function checksumState(state: BattleState): string {
  const sanitized = sanitizeState(state);
  const json = JSON.stringify(sanitized);
  return crypto.createHash('sha256').update(json).digest('hex');
}

export function snapshotState(state: BattleState): BattleSnapshot {
  return { turn: state.turn, checksum: checksumState(state) };
}

export function verifyDeterminism(states: BattleState[]): { consistent: boolean; baseline: string; mismatches: number } {
  if (states.length === 0) return { consistent: true, baseline: '', mismatches: 0 };
  const baseline = checksumState(states[0]);
  let mismatches = 0;
  for (const s of states) {
    if (checksumState(s) !== baseline) mismatches += 1;
  }
  return { consistent: mismatches === 0, baseline, mismatches };
}

export function verifyReplays(seed: string, simulate: () => BattleState[]): { consistent: boolean; baseline: string; mismatches: number } {
  // simulate twice using the provided factory, compare checksums per snapshot length
  const runs = [simulate(), simulate()];
  const baseline = runs[0].map((s) => checksumState(s));
  let mismatches = 0;
  for (let i = 0; i < runs[1].length; i += 1) {
    if (baseline[i] !== checksumState(runs[1][i])) mismatches += 1;
  }
  return { consistent: mismatches === 0 && baseline.length === runs[1].length, baseline: baseline.join(','), mismatches };
}
