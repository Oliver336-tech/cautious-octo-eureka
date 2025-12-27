import { CharacterDefinition, FighterState, BattleState, MatchEvent, SimulationResult, StatusEffect, StatusId } from './types.js';
import { createRng } from './rng.js';
import { config } from './config.js';
import { snapshotState } from './simulation.js';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function gainComboEnergy(fighter: FighterState, amount: number) {
  const gainMultiplier = 1 + fighter.statuses.filter((s) => s.id === 'afterglow').reduce((sum, s) => sum + 0.15 * s.stacks, 0);
  let total = amount * gainMultiplier;
  if (fighter.ceDebt > 0) {
    const repayment = Math.min(fighter.ceDebt, total);
    fighter.ceDebt -= repayment;
    total -= repayment;
  }
  if (fighter.character.id === 'oliver') {
    total *= 1.75;
    const overflowCandidate = fighter.comboEnergy + total - 100;
    fighter.comboEnergy = clamp(fighter.comboEnergy + total, 0, 100);
    if (overflowCandidate > 0) {
      fighter.omniGauge += Math.round(overflowCandidate);
    }
  } else {
    fighter.comboEnergy = clamp(fighter.comboEnergy + total, fighter.ceLock, 100);
  }
  if (fighter.comboEnergy > 85) {
    fighter.ceVolatility = Math.min(1, fighter.ceVolatility + 0.05);
  } else {
    fighter.ceVolatility = Math.max(0, fighter.ceVolatility - 0.02);
  }
}

function spendComboEnergy(fighter: FighterState, cost: number) {
  const borrowCap = 30;
  if (cost > fighter.comboEnergy) {
    const debtNeeded = cost - fighter.comboEnergy;
    if (debtNeeded > borrowCap) {
      throw new Error('Illegal CE borrow attempt');
    }
    fighter.ceDebt += debtNeeded;
    fighter.comboEnergy = fighter.ceLock;
  } else {
    fighter.comboEnergy = clamp(fighter.comboEnergy - cost, fighter.ceLock, 100);
  }
}

function applyStatus(target: FighterState, id: StatusId, stacks: number, duration: number) {
  const existing = target.statuses.find((s) => s.id === id);
  if (existing) {
    existing.stacks += stacks;
    existing.duration = Math.max(existing.duration, duration);
  } else {
    target.statuses.push({ id, stacks, duration });
  }
}

function removeExpiredStatuses(target: FighterState) {
  target.statuses = target.statuses.filter((s) => s.duration > 0 && s.stacks > 0);
}

function tickStatuses(target: FighterState, eventLog: MatchEvent[]) {
  for (const status of target.statuses) {
    switch (status.id) {
      case 'burn':
        target.health -= 4 * status.stacks;
        eventLog.push({ type: 'status', detail: `${target.character.name} suffers burn`, data: { status: 'burn', stacks: status.stacks } });
        break;
      case 'regen':
        target.health = clamp(target.health + 5 * status.stacks, 0, target.character.maxHealth);
        eventLog.push({ type: 'status', detail: `${target.character.name} regenerates`, data: { status: 'regen', stacks: status.stacks } });
        break;
      case 'afterglow':
        gainComboEnergy(target, 3 * status.stacks);
        break;
      case 'ce_burn':
        target.comboEnergy = clamp(target.comboEnergy - 8 * status.stacks, target.ceLock, 100);
        eventLog.push({ type: 'status', detail: `${target.character.name} loses combo energy to CE Burn`, data: { status: 'ce_burn', stacks: status.stacks } });
        break;
      default:
        break;
    }
    status.duration -= 1;
  }
  removeExpiredStatuses(target);
}

function calculateDamage(base: number, attacker: FighterState, defender: FighterState): number {
  let result = base;
  const weakenStacks = attacker.statuses.find((s) => s.id === 'weaken')?.stacks || 0;
  if (weakenStacks > 0) {
    result *= 1 - 0.1 * weakenStacks;
  }
  const vulnerable = defender.statuses.find((s) => s.id === 'vulnerable')?.stacks || 0;
  if (vulnerable > 0) {
    result *= 1 + 0.15 * vulnerable;
  }
  return Math.max(0, Math.round(result));
}

function applyDamage(attacker: FighterState, defender: FighterState, base: number, log: (event: MatchEvent) => void) {
  let damage = calculateDamage(base, attacker, defender);
  const shield = defender.statuses.find((s) => s.id === 'shield');
  if (shield) {
    const reduction = Math.min(damage, shield.stacks * 6);
    damage -= reduction;
    shield.stacks = Math.max(0, shield.stacks - Math.ceil(reduction / 6));
  }
  const dodge = defender.statuses.find((s) => s.id === 'dodge');
  if (dodge && dodge.stacks > 0) {
    defender.statuses = defender.statuses.filter((s) => s.id !== 'dodge');
    log({ type: 'dodge', detail: `${defender.character.name} dodges an attack` });
    damage = 0;
  }
  defender.health -= damage;
  const ceBurn = defender.statuses.find((s) => s.id === 'ce_burn');
  if (ceBurn) {
    defender.comboEnergy = clamp(defender.comboEnergy - 5 * ceBurn.stacks, defender.ceLock, 100);
  }
  gainComboEnergy(attacker, Math.max(3, Math.floor(damage / 5)));
  gainComboEnergy(defender, Math.max(2, Math.floor(damage / 10)));
  log({ type: 'damage', detail: `${attacker.character.name} hits ${defender.character.name} for ${damage}`, data: { damage } });
}

function applyHealing(source: FighterState, target: FighterState, amount: number, log: (event: MatchEvent) => void) {
  const healed = clamp(target.health + amount, 0, target.character.maxHealth) - target.health;
  target.health += healed;
  gainComboEnergy(source, Math.max(2, Math.floor(healed / 6)));
  log({ type: 'heal', detail: `${source.character.name} heals ${target.character.name} for ${healed}` });
}

function createFighter(character: CharacterDefinition, team: number, rng: DeterministicRng, userId?: string): FighterState {
  const idSeed = Math.floor(rng.next() * 1_000_000_000).toString(36);
  return {
    id: `${character.id}-${team}-${idSeed}`,
    userId,
    character,
    health: character.maxHealth,
    comboEnergy: 0,
    omniGauge: 0,
    ceDebt: 0,
    ceLock: 0,
    ceVolatility: 0,
    statuses: [],
    cooldowns: {},
    team
  };
}

function selectTargets(state: BattleState, actor: FighterState): FighterState[] {
  const opponents = state.fighters.filter((f) => f.team !== actor.team && f.health > 0);
  if (opponents.length === 0) return [];
  return [opponents[Math.floor(state.rng.next() * opponents.length)]];
}

function decrementCooldowns(fighter: FighterState) {
  for (const key of Object.keys(fighter.cooldowns)) {
    fighter.cooldowns[key] = Math.max(0, fighter.cooldowns[key] - 1);
  }
}

function pushStatus(events: MatchEvent[], message: string, data?: Record<string, unknown>) {
  events.push({ type: 'status', detail: message, data });
}

const characters: CharacterDefinition[] = [];

function registerCharacter(def: CharacterDefinition) {
  characters.push(def);
}

function hasteReduction(fighter: FighterState): number {
  const haste = fighter.statuses.find((s) => s.id === 'haste')?.stacks || 0;
  const slow = fighter.statuses.find((s) => s.id === 'slow')?.stacks || 0;
  return haste * 0.1 - slow * 0.1;
}

function putOnCooldown(fighter: FighterState, skillId: string, baseCooldown: number) {
  const modifier = hasteReduction(fighter);
  const cd = Math.max(1, Math.round(baseCooldown * (1 - modifier)));
  fighter.cooldowns[skillId] = cd;
}

registerCharacter({
  id: 'sophia',
  name: 'Sophia',
  element: 'Light',
  role: 'Guardian',
  maxHealth: 140,
  baseDamage: 14,
  passive: 'Shield allies when combo chain grows.',
  skills: [
    {
      id: 'radiant-strike',
      name: 'Radiant Strike',
      description: 'Tap: light attack, Charged: grants shield, Overcharged: team shield.',
      chargeLevel: 'tap',
      ceCost: 0,
      cooldown: 1,
      onUse: ({ actor, targets, log }) => {
        const target = targets[0];
        applyDamage(actor, target, actor.character.baseDamage, log);
        applyStatus(actor, 'shield', 1, 2);
        log({ type: 'skill', detail: 'Sophia taps Radiant Strike' });
      }
    },
    {
      id: 'bastion-charge',
      name: 'Bastion Charge',
      description: 'Charged: heavy strike, shield allies.',
      chargeLevel: 'charged',
      ceCost: 25,
      cooldown: 2,
      onUse: ({ actor, targets, state, log }) => {
        const target = targets[0];
        applyDamage(actor, target, actor.character.baseDamage + 18, log);
        state.fighters.filter((f) => f.team === actor.team).forEach((f) => applyStatus(f, 'shield', 2, 3));
        log({ type: 'skill', detail: 'Sophia charges forward' });
      }
    },
    {
      id: 'sanctuary-aegis',
      name: 'Sanctuary Aegis',
      description: 'Overcharged: massive team shield and vulnerable on enemies.',
      chargeLevel: 'overcharged',
      ceCost: 60,
      cooldown: 3,
      onUse: ({ actor, state, log }) => {
        state.fighters.filter((f) => f.team === actor.team).forEach((f) => applyStatus(f, 'shield', 4, 4));
        state.fighters.filter((f) => f.team !== actor.team).forEach((f) => applyStatus(f, 'vulnerable', 2, 3));
        log({ type: 'skill', detail: 'Sophia projects Sanctuary Aegis' });
      }
    }
  ],
  burst: {
    id: 'aegis-dawn',
    name: 'Aegis Dawn',
    description: 'Burst: shields, haste, and heal allies.',
    chargeLevel: 'burst',
    ceCost: 80,
    cooldown: 4,
    onUse: ({ actor, state, log }) => {
      state.fighters.filter((f) => f.team === actor.team).forEach((f) => {
        applyStatus(f, 'shield', 4, 4);
        applyStatus(f, 'haste', 2, 3);
        f.ceLock = Math.max(f.ceLock, 5);
        applyHealing(actor, f, 25, log);
      });
      log({ type: 'burst', detail: 'Sophia unleashes Aegis Dawn' });
    }
  }
});

registerCharacter({
  id: 'endrit',
  name: 'Endrit',
  element: 'Steel',
  role: 'Logic',
  maxHealth: 120,
  baseDamage: 16,
  passive: 'Applies weaken when hitting burning foes.',
  skills: [
    {
      id: 'calculating-swing',
      name: 'Calculating Swing',
      description: 'Tap: precise strike.',
      chargeLevel: 'tap',
      ceCost: 0,
      cooldown: 1,
      onUse: ({ actor, targets, log }) => {
        const t = targets[0];
        applyDamage(actor, t, actor.character.baseDamage + 6, log);
        if (t.statuses.find((s) => s.id === 'burn')) applyStatus(t, 'weaken', 1, 2);
        log({ type: 'skill', detail: 'Endrit swings with calculation' });
      }
    },
    {
      id: 'logic-net',
      name: 'Logic Net',
      description: 'Charged: bind foes and boost combo chain.',
      chargeLevel: 'charged',
      ceCost: 25,
      cooldown: 2,
      onUse: ({ actor, targets, state, log }) => {
        targets.forEach((t) => applyStatus(t, 'bind', 1, 1));
        state.comboChain.value += 1;
        gainComboEnergy(actor, 10);
        log({ type: 'skill', detail: 'Endrit deploys Logic Net' });
      }
    },
    {
      id: 'steel-theorem',
      name: 'Steel Theorem',
      description: 'Overcharged: massive damage and vulnerable.',
      chargeLevel: 'overcharged',
      ceCost: 60,
      cooldown: 3,
      onUse: ({ actor, targets, log }) => {
        const t = targets[0];
        applyDamage(actor, t, actor.character.baseDamage + 32, log);
        applyStatus(t, 'vulnerable', 2, 2);
        log({ type: 'skill', detail: 'Endrit proves the Steel Theorem' });
      }
    }
  ],
  burst: {
    id: 'axiom-overdrive',
    name: 'Axiom Overdrive',
    description: 'Burst: haste self, weaken enemies, echo next skill.',
    chargeLevel: 'burst',
    ceCost: 80,
    cooldown: 4,
    onUse: ({ actor, state, log }) => {
      applyStatus(actor, 'haste', 2, 3);
      state.fighters.filter((f) => f.team !== actor.team).forEach((enemy) => applyStatus(enemy, 'weaken', 2, 3));
      applyStatus(actor, 'echo', 1, 2);
      log({ type: 'burst', detail: 'Endrit enters Axiom Overdrive' });
    }
  }
});

registerCharacter({
  id: 'grace',
  name: 'Grace',
  element: 'Sound',
  role: 'Illusion',
  maxHealth: 110,
  baseDamage: 15,
  passive: 'Illusions add dodge stacks.',
  skills: [
    {
      id: 'sonic-feint',
      name: 'Sonic Feint',
      description: 'Tap: dodge and chip damage.',
      chargeLevel: 'tap',
      ceCost: 0,
      cooldown: 1,
      onUse: ({ actor, targets, log }) => {
        applyDamage(actor, targets[0], actor.character.baseDamage, log);
        applyStatus(actor, 'dodge', 1, 2);
        log({ type: 'skill', detail: 'Grace performs Sonic Feint' });
      }
    },
    {
      id: 'resonant-veil',
      name: 'Resonant Veil',
      description: 'Charged: apply slow and haste to self.',
      chargeLevel: 'charged',
      ceCost: 25,
      cooldown: 2,
      onUse: ({ actor, targets, log }) => {
        applyStatus(targets[0], 'slow', 2, 2);
        applyStatus(actor, 'haste', 2, 2);
        log({ type: 'skill', detail: 'Grace weaves a Resonant Veil' });
      }
    },
    {
      id: 'phantom-encore',
      name: 'Phantom Encore',
      description: 'Overcharged: echo allies and dodge.',
      chargeLevel: 'overcharged',
      ceCost: 60,
      cooldown: 3,
      onUse: ({ actor, state, log }) => {
        state.fighters.filter((f) => f.team === actor.team).forEach((ally) => applyStatus(ally, 'echo', 1, 2));
        applyStatus(actor, 'dodge', 2, 3);
        log({ type: 'skill', detail: 'Grace triggers Phantom Encore' });
      }
    }
  ],
  burst: {
    id: 'crescendo-mirage',
    name: 'Crescendo Mirage',
  description: 'Burst: illusions disorient enemies with bind and burn.',
  chargeLevel: 'burst',
  ceCost: 80,
  cooldown: 4,
  onUse: ({ actor, state, log }) => {
    state.fighters.filter((f) => f.team !== actor.team).forEach((enemy) => {
      applyStatus(enemy, 'bind', 1, 2);
      applyStatus(enemy, 'burn', 2, 2);
      applyStatus(enemy, 'timeline_freeze', 1, 1);
    });
    applyStatus(actor, 'dodge', 2, 3);
    log({ type: 'burst', detail: 'Grace reveals a Crescendo Mirage' });
  }
}
});

registerCharacter({
  id: 'nona',
  name: 'Nona',
  element: 'Nature',
  role: 'Wisdom',
  maxHealth: 125,
  baseDamage: 13,
  passive: 'Afterglow procs on heals, boosting CE.',
  skills: [
    {
      id: 'thorn-whisper',
      name: 'Thorn Whisper',
      description: 'Tap: burn and chip damage.',
      chargeLevel: 'tap',
      ceCost: 0,
      cooldown: 1,
      onUse: ({ actor, targets, log }) => {
        applyDamage(actor, targets[0], actor.character.baseDamage + 4, log);
        applyStatus(targets[0], 'burn', 1, 2);
        log({ type: 'skill', detail: 'Nona casts Thorn Whisper' });
      }
    },
    {
      id: 'grove-mending',
      name: 'Grove Mending',
      description: 'Charged: heals allies, adds afterglow.',
      chargeLevel: 'charged',
      ceCost: 25,
    cooldown: 2,
    onUse: ({ actor, state, log }) => {
      state.fighters.filter((f) => f.team === actor.team).forEach((ally) => {
        applyHealing(actor, ally, 18, log);
        applyStatus(ally, 'afterglow', 1, 3);
      });
      log({ type: 'skill', detail: 'Nona performs Grove Mending' });
    }
  },
    {
      id: 'crown-of-roots',
      name: 'Crown of Roots',
      description: 'Overcharged: bind and regen allies.',
      chargeLevel: 'overcharged',
      ceCost: 60,
      cooldown: 3,
      onUse: ({ actor, state, log }) => {
        state.fighters.filter((f) => f.team !== actor.team).forEach((enemy) => {
          applyStatus(enemy, 'bind', 1, 2);
          applyStatus(enemy, 'timeline_freeze', 1, 1);
        });
        state.fighters.filter((f) => f.team === actor.team).forEach((ally) => applyStatus(ally, 'regen', 2, 3));
        log({ type: 'skill', detail: 'Nona crowns the battlefield with roots' });
      }
    }
  ],
  burst: {
    id: 'verdant-oracle',
    name: 'Verdant Oracle',
    description: 'Burst: massive heal and regen, energize allies.',
    chargeLevel: 'burst',
    ceCost: 80,
    cooldown: 4,
    onUse: ({ actor, state, log }) => {
      state.fighters.filter((f) => f.team === actor.team).forEach((ally) => {
        applyHealing(actor, ally, 30, log);
        applyStatus(ally, 'regen', 3, 4);
        gainComboEnergy(ally, 20);
      });
      log({ type: 'burst', detail: 'Nona invokes the Verdant Oracle' });
    }
  }
});

registerCharacter({
  id: 'grandma',
  name: 'Grandma',
  element: 'Light',
  role: 'Healing',
  maxHealth: 130,
  baseDamage: 12,
  passive: 'Restores CE when healing.',
  skills: [
    {
      id: 'comforting-tap',
      name: 'Comforting Tap',
      description: 'Tap: light heal and CE share.',
      chargeLevel: 'tap',
      ceCost: 0,
    cooldown: 1,
    onUse: ({ actor, state, log }) => {
      const ally = state.fighters.find((f) => f.team === actor.team && f.health < f.character.maxHealth) || actor;
      applyHealing(actor, ally, 12, log);
      gainComboEnergy(ally, 5);
      log({ type: 'skill', detail: 'Grandma shares a comforting tap' });
    }
  },
    {
      id: 'lullaby-shield',
      name: 'Lullaby Shield',
      description: 'Charged: shields and regen.',
      chargeLevel: 'charged',
      ceCost: 25,
      cooldown: 2,
      onUse: ({ actor, state, log }) => {
        state.fighters.filter((f) => f.team === actor.team).forEach((ally) => {
          applyStatus(ally, 'shield', 2, 3);
          applyStatus(ally, 'regen', 1, 2);
        });
        log({ type: 'skill', detail: 'Grandma hums Lullaby Shield' });
      }
    },
    {
      id: 'radiant-embrace',
      name: 'Radiant Embrace',
      description: 'Overcharged: big heal and haste.',
      chargeLevel: 'overcharged',
      ceCost: 60,
      cooldown: 3,
      onUse: ({ actor, state, log }) => {
        state.fighters.filter((f) => f.team === actor.team).forEach((ally) => {
          applyHealing(actor, ally, 28, log);
          applyStatus(ally, 'haste', 2, 3);
        });
        log({ type: 'skill', detail: 'Grandma offers Radiant Embrace' });
      }
    }
  ],
  burst: {
    id: 'ancestral-light',
    name: 'Ancestral Light',
    description: 'Burst: full heal, afterglow, and cleanse bind.',
    chargeLevel: 'burst',
    ceCost: 80,
    cooldown: 4,
    onUse: ({ actor, state, log }) => {
        state.fighters.filter((f) => f.team === actor.team).forEach((ally) => {
          ally.health = ally.character.maxHealth;
          ally.statuses = ally.statuses.filter((s) => s.id !== 'bind');
          applyStatus(ally, 'afterglow', 2, 3);
        });
        log({ type: 'burst', detail: 'Grandma shines Ancestral Light' });
    }
  }
});

registerCharacter({
  id: 'liya',
  name: 'Liya',
  element: 'Wind',
  role: 'Illusion',
  maxHealth: 115,
  baseDamage: 15,
  passive: 'Applies dodge when combo chain ticks.',
  skills: [
    {
      id: 'whispered-blades',
      name: 'Whispered Blades',
      description: 'Tap: dual strike.',
      chargeLevel: 'tap',
      ceCost: 0,
      cooldown: 1,
      onUse: ({ actor, targets, log }) => {
        applyDamage(actor, targets[0], actor.character.baseDamage, log);
        applyDamage(actor, targets[0], actor.character.baseDamage, log);
        log({ type: 'skill', detail: 'Liya unleashes Whispered Blades' });
      }
    },
    {
      id: 'tempest-step',
      name: 'Tempest Step',
      description: 'Charged: haste and dodge, pushes CE.',
      chargeLevel: 'charged',
      ceCost: 25,
      cooldown: 2,
      onUse: ({ actor, log }) => {
        applyStatus(actor, 'haste', 2, 2);
        applyStatus(actor, 'dodge', 1, 2);
        gainComboEnergy(actor, 12);
        log({ type: 'skill', detail: 'Liya dances a Tempest Step' });
      }
    },
    {
      id: 'cyclone-veil',
      name: 'Cyclone Veil',
      description: 'Overcharged: slow enemies and dodge allies.',
      chargeLevel: 'overcharged',
      ceCost: 60,
      cooldown: 3,
      onUse: ({ actor, state, log }) => {
        state.fighters.filter((f) => f.team !== actor.team).forEach((enemy) => applyStatus(enemy, 'slow', 2, 2));
        state.fighters.filter((f) => f.team === actor.team).forEach((ally) => applyStatus(ally, 'dodge', 1, 2));
        log({ type: 'skill', detail: 'Liya spins Cyclone Veil' });
      }
    }
  ],
  burst: {
    id: 'storm-of-mirrors',
    name: 'Storm of Mirrors',
    description: 'Burst: echo allies and slow enemies.',
    chargeLevel: 'burst',
    ceCost: 80,
    cooldown: 4,
    onUse: ({ actor, state, log }) => {
      state.fighters.filter((f) => f.team === actor.team).forEach((ally) => applyStatus(ally, 'echo', 1, 3));
      state.fighters.filter((f) => f.team !== actor.team).forEach((enemy) => applyStatus(enemy, 'slow', 3, 3));
      log({ type: 'burst', detail: 'Liya conjures a Storm of Mirrors' });
    }
  }
});

registerCharacter({
  id: 'yohanna',
  name: 'Yohanna',
  element: 'Flame',
  role: 'Spirit',
  maxHealth: 120,
  baseDamage: 17,
  passive: 'Burned foes grant CE when struck.',
  skills: [
    {
      id: 'ember-dash',
      name: 'Ember Dash',
      description: 'Tap: ignite foes.',
      chargeLevel: 'tap',
      ceCost: 0,
      cooldown: 1,
      onUse: ({ actor, targets, log }) => {
        applyDamage(actor, targets[0], actor.character.baseDamage + 4, log);
        applyStatus(targets[0], 'burn', 2, 2);
        log({ type: 'skill', detail: 'Yohanna darts with Ember Dash' });
      }
    },
    {
      id: 'phoenix-rise',
      name: 'Phoenix Rise',
      description: 'Charged: heal self and burn foes.',
      chargeLevel: 'charged',
      ceCost: 25,
      cooldown: 2,
      onUse: ({ actor, targets, log }) => {
        applyStatus(actor, 'regen', 2, 2);
        targets.forEach((t) => applyStatus(t, 'burn', 1, 3));
        log({ type: 'skill', detail: 'Yohanna ascends with Phoenix Rise' });
      }
    },
    {
      id: 'inferno-barrier',
      name: 'Inferno Barrier',
      description: 'Overcharged: shield self and burn enemies.',
      chargeLevel: 'overcharged',
      ceCost: 60,
      cooldown: 3,
      onUse: ({ actor, state, log }) => {
        applyStatus(actor, 'shield', 3, 3);
        state.fighters.filter((f) => f.team !== actor.team).forEach((enemy) => applyStatus(enemy, 'burn', 3, 3));
        log({ type: 'skill', detail: 'Yohanna conjures Inferno Barrier' });
      }
    }
  ],
  burst: {
    id: 'spirit-conflagration',
    name: 'Spirit Conflagration',
    description: 'Burst: massive burn, haste allies.',
    chargeLevel: 'burst',
    ceCost: 80,
    cooldown: 4,
    onUse: ({ actor, state, log }) => {
      state.fighters.filter((f) => f.team !== actor.team).forEach((enemy) => {
        applyStatus(enemy, 'burn', 4, 4);
        applyStatus(enemy, 'ce_burn', 1, 2);
      });
      state.fighters.filter((f) => f.team === actor.team).forEach((ally) => applyStatus(ally, 'haste', 2, 2));
      log({ type: 'burst', detail: 'Yohanna ignites a Spirit Conflagration' });
    }
  }
});

registerCharacter({
  id: 'oliver',
  name: 'Oliver (Ascended)',
  element: 'Psychic / Electric',
  role: 'Ascended',
  maxHealth: 160,
  baseDamage: 20,
  passive: 'Omni gauge stores CE overflow; immune to CE drain and chain disruption.',
  skills: [
    {
      id: 'storm-lance',
      name: 'Storm Lance',
      description: 'Tap: true damage strike.',
      chargeLevel: 'tap',
      ceCost: 0,
      cooldown: 1,
      onUse: ({ actor, targets, log }) => {
        applyDamage(actor, targets[0], actor.character.baseDamage + 10, log);
        log({ type: 'skill', detail: 'Oliver pierces with Storm Lance' });
      }
    },
    {
      id: 'psyshock-barrier',
      name: 'Psyshock Barrier',
      description: 'Charged: shields and haste, immediate extra action.',
      chargeLevel: 'charged',
      ceCost: 25,
      cooldown: 1,
      onUse: ({ actor, log }) => {
        applyStatus(actor, 'shield', 3, 3);
        applyStatus(actor, 'haste', 2, 3);
        gainComboEnergy(actor, 20);
        log({ type: 'skill', detail: 'Oliver erects Psyshock Barrier and surges' });
      }
    },
    {
      id: 'omni-overdrive',
      name: 'Omni Overdrive',
      description: 'Overcharged: convert omni gauge into damage and shields.',
      chargeLevel: 'overcharged',
      ceCost: 60,
      cooldown: 2,
      onUse: ({ actor, state, targets, log }) => {
        const bonus = actor.omniGauge;
        actor.omniGauge = 0;
        applyDamage(actor, targets[0], actor.character.baseDamage + 25 + Math.floor(bonus / 2), log);
        state.fighters.filter((f) => f.team === actor.team).forEach((ally) => applyStatus(ally, 'shield', 3 + Math.floor(bonus / 50), 3));
        log({ type: 'skill', detail: 'Oliver triggers Omni Overdrive' });
      }
    }
  ],
  burst: {
    id: 'omniversal-break',
    name: 'Omniversal Break',
    description: 'Burst: true damage, refresh cooldowns, afterglow and haste.',
    chargeLevel: 'burst',
    ceCost: 80,
    cooldown: 3,
    onUse: ({ actor, state, log }) => {
      state.fighters.filter((f) => f.team !== actor.team).forEach((enemy) => applyDamage(actor, enemy, actor.character.baseDamage + 40, log));
      state.fighters.filter((f) => f.team === actor.team).forEach((ally) => {
        ally.cooldowns = {};
        applyStatus(ally, 'afterglow', 2, 3);
        applyStatus(ally, 'haste', 2, 3);
        applyStatus(ally, 'shield', 3, 3);
      });
      log({ type: 'burst', detail: 'Oliver unleashes Omniversal Break' });
    }
  }
});

export function getCharacter(id: string): CharacterDefinition | undefined {
  return characters.find((c) => c.id === id);
}

function initiativeScore(fighter: FighterState): number {
  const haste = fighter.statuses.find((s) => s.id === 'haste')?.stacks || 0;
  const slow = fighter.statuses.find((s) => s.id === 'slow')?.stacks || 0;
  const displace = fighter.statuses.find((s) => s.id === 'timeline_displace')?.stacks || 0;
  return 1 + haste * 0.2 - slow * 0.15 + displace * 0.5 + fighter.ceVolatility * 0.1;
}

function chooseSkill(actor: FighterState, state: BattleState): CharacterDefinition['burst'] | CharacterDefinition['skills'][number] {
  const available = [...actor.character.skills, actor.character.burst];
  const ordered = [...available].sort((a, b) => b.ceCost - a.ceCost);
  for (const skill of ordered) {
    const cd = actor.cooldowns[skill.id] || 0;
    if (cd === 0 && actor.comboEnergy >= skill.ceCost) {
      return skill;
    }
  }
  return actor.character.skills[0];
}

function isBound(fighter: FighterState): boolean {
  return fighter.statuses.some((s) => s.id === 'bind');
}

function isFrozen(fighter: FighterState): boolean {
  return fighter.statuses.some((s) => s.id === 'timeline_freeze');
}

function resolveEcho(state: BattleState, actor: FighterState, skillId: string, log: (e: MatchEvent) => void) {
  const echo = actor.statuses.find((s) => s.id === 'echo');
  if (echo && echo.stacks > 0) {
    echo.stacks -= 1;
    if (echo.stacks <= 0) {
      actor.statuses = actor.statuses.filter((s) => s.id !== 'echo');
    }
    log({ type: 'echo', detail: `${actor.character.name} echoes ${skillId}` });
    executeSkill(state, actor, skillId, log);
  }
}

function executeSkill(state: BattleState, actor: FighterState, skillId: string, log: (e: MatchEvent) => void) {
  const skill = actor.character.skills.find((s) => s.id === skillId) || actor.character.burst.id === skillId ? actor.character.burst : actor.character.skills[0];
  const targets = selectTargets(state, actor);
  const events: MatchEvent[] = [];
  if (actor.comboEnergy < skill.ceCost && skill.chargeLevel !== 'tap') {
    log({ type: 'skill', detail: `${actor.character.name} lacks CE for ${skill.name}` });
    return;
  }
  spendComboEnergy(actor, skill.ceCost);
  skill.onUse({ actor, targets, state, log: (e) => events.push(e) });
  putOnCooldown(actor, skill.id, skill.cooldown);
  if (skill.chargeLevel === 'overcharged' && actor.character.id === 'oliver') {
    log({ type: 'passive', detail: 'Oliver gains an extra action from overcharge' });
    actor.cooldowns[skill.id] = 0;
  }
  for (const ev of events) {
    log(ev);
  }
}

function evaluateWinner(state: BattleState): number | null {
  const aliveTeams = new Set(state.fighters.filter((f) => f.health > 0).map((f) => f.team));
  if (aliveTeams.size === 1) {
    return [...aliveTeams][0];
  }
  return null;
}

export function simulateBattle(teamA: CharacterDefinition[], teamB: CharacterDefinition[], seedString = config.seed): SimulationResult {
  const rng = createRng(seedString);
  const fighters: FighterState[] = [
    ...teamA.map((c) => createFighter(c, 0, rng)),
    ...teamB.map((c) => createFighter(c, 1, rng))
  ];
  const state: BattleState = {
    fighters,
    comboChain: { value: 0, decayTimer: 3 },
    turn: 0,
    rng
  };
  const events: MatchEvent[] = [];
  const snapshots = [snapshotState(state)];

  while (state.turn < 200 && evaluateWinner(state) === null) {
    state.turn += 1;
    const actingOrder = state.fighters
      .filter((f) => f.health > 0)
      .map((f, idx) => ({ f, idx }))
      .sort((a, b) => initiativeScore(b.f) - initiativeScore(a.f));
    for (const entry of actingOrder) {
      const fighter = entry.f;
      decrementCooldowns(fighter);
      tickStatuses(fighter, events);
      if (fighter.health <= 0) continue;
      if (isBound(fighter)) {
        pushStatus(events, `${fighter.character.name} is bound and misses a turn`);
        continue;
      }
      if (isFrozen(fighter)) {
        fighter.statuses = fighter.statuses.filter((s) => s.id !== 'timeline_freeze');
        pushStatus(events, `${fighter.character.name} is frozen in time and skips this turn`);
        continue;
      }
      if (fighter.ceVolatility > 0 && state.rng.next() < fighter.ceVolatility) {
        applyStatus(fighter, 'ce_burn', 1, 1);
        pushStatus(events, `${fighter.character.name}'s unstable CE crackles`, { volatility: fighter.ceVolatility });
      }
      const skill = chooseSkill(fighter, state);
      executeSkill(state, fighter, skill.id, (e) => events.push(e));
      resolveEcho(state, fighter, skill.id, (e) => events.push(e));
      if (state.comboChain.decayTimer <= 0) {
        state.comboChain.value = Math.max(0, state.comboChain.value - 1);
        state.comboChain.decayTimer = 3;
      } else {
        state.comboChain.decayTimer -= 1;
      }
    }
    const winner = evaluateWinner(state);
    if (winner !== null) {
      snapshots.push(snapshotState(state));
      return { events, winner, finalState: state, snapshots };
    }
    snapshots.push(snapshotState(state));
  }

  return { events, winner: evaluateWinner(state), finalState: state, snapshots };
}

export function getRoster(): CharacterDefinition[] {
  return characters;
}

export function getStoryWorld(world: number): CharacterDefinition[] {
  const index = world % characters.length;
  const boss = characters[(index + 3) % characters.length];
  return [boss, characters[index], characters[(index + 1) % characters.length]];
}

export function checkmatePvE(): SimulationResult {
  const oliver = getCharacter('oliver');
  if (!oliver) {
    throw new Error('Oliver missing');
  }
  const rng = createRng('checkmate');
  const state: BattleState = {
    fighters: [createFighter(oliver, 0, rng), createFighter(oliver, 1, rng)],
    comboChain: { value: 0, decayTimer: 3 },
    turn: 1,
    rng
  };
  const events: MatchEvent[] = [
    { type: 'skill', detail: 'Oliver invokes Checkmate, annihilating PvE foes' }
  ];
  state.fighters[1].health = 0;
  const snapshots = [snapshotState(state)];
  return { events, winner: 0, finalState: state, snapshots };
}
