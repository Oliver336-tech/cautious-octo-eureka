import { CharacterId } from './types.js';

export type AugmentRarity = 'common' | 'rare' | 'epic' | 'legendary';
export interface Augment {
  id: string;
  name: string;
  rarity: AugmentRarity;
  tags: string[];
  description: string;
  characters?: CharacterId[];
}

export interface SkillEvolution {
  id: string;
  sourceSkill: string;
  evolvedName: string;
  requirements: string;
  effect: string;
  branch?: string;
}

export interface MythicModifier {
  id: string;
  name: string;
  description: string;
  unlock: string;
}

export const augments: Augment[] = [
  { id: 'shield_boost', name: 'Aegis Filament', rarity: 'common', tags: ['shield', 'guardian'], description: 'Shield skills grant +1 stack', characters: ['sophia'] },
  { id: 'logic_overclock', name: 'Logic Overclock', rarity: 'rare', tags: ['haste', 'combo'], description: 'Gains haste after using charged skill', characters: ['endrit'] },
  { id: 'illusion_echo', name: 'Phantom Sustainer', rarity: 'rare', tags: ['echo', 'illusion'], description: 'Echo stacks grant +1 duration', characters: ['grace', 'liya'] },
  { id: 'nature_resurge', name: 'Verdant Resurge', rarity: 'common', tags: ['regen'], description: 'Regen heals 10% more', characters: ['nona'] },
  { id: 'ancestral_light', name: 'Ancient Beacon', rarity: 'epic', tags: ['afterglow', 'healing'], description: 'Afterglow also grants +5 CE on trigger', characters: ['grandma'] },
  { id: 'wind_blades', name: 'Gale Edge', rarity: 'rare', tags: ['dodge', 'initiative'], description: 'Dodge also grants +5 initiative toward next turn', characters: ['liya'] },
  { id: 'flame_persistence', name: 'Phoenix Persistence', rarity: 'epic', tags: ['burn', 'haste'], description: 'Burned enemies grant 5 CE when damaged', characters: ['yohanna'] },
  { id: 'omni_reservoir', name: 'Omni Reservoir', rarity: 'legendary', tags: ['omni', 'ascended'], description: 'Oliver stores +50% more overflow into Omni Gauge', characters: ['oliver'] },
  { id: 'combo_surge', name: 'Combo Surge', rarity: 'common', tags: ['combo'], description: 'Combo chain decay timer +1' },
  { id: 'tempo_anchor', name: 'Tempo Anchor', rarity: 'rare', tags: ['timeline'], description: 'Reduces chance of volatility backlash by 20%' },
  { id: 'ce_locksmith', name: 'CE Locksmith', rarity: 'epic', tags: ['ce'], description: 'CE lock floor increases CE gain by 5%' },
  { id: 'vital_guard', name: 'Vital Guard', rarity: 'common', tags: ['shield'], description: 'Gain 5 shield when health first drops below 30%' },
  { id: 'momentum_reader', name: 'Momentum Reader', rarity: 'rare', tags: ['combo'], description: 'Combo chain grants +2 CE per link' },
  { id: 'burn_scatter', name: 'Scattered Embers', rarity: 'common', tags: ['burn'], description: 'Burn applies -1 dodge to enemies' },
  { id: 'regen_pulse', name: 'Pulse of Renewal', rarity: 'rare', tags: ['regen'], description: 'First regen tick each turn also grants +3 CE' },
  { id: 'bind_snap', name: 'Snap Trap', rarity: 'rare', tags: ['bind'], description: 'Bind also applies slow 1' },
  { id: 'haste_cycle', name: 'Cycling Haste', rarity: 'epic', tags: ['haste'], description: 'When haste expires, gain +5 CE' },
  { id: 'dodge_reflex', name: 'Reflex Loop', rarity: 'common', tags: ['dodge'], description: 'First dodge each battle refunds 5 CE' },
  { id: 'timeline_shifter', name: 'Timeline Shifter', rarity: 'legendary', tags: ['timeline'], description: 'Once per battle, immune to timeline freeze' },
  { id: 'ce_burn_resist', name: 'Flux Dampener', rarity: 'epic', tags: ['ce_burn'], description: 'CE burn loses 50% effectiveness' },
  { id: 'afterglow_prism', name: 'Prismatic Afterglow', rarity: 'legendary', tags: ['afterglow'], description: 'Afterglow grants haste 1' },
  { id: 'echo_duplicate', name: 'Echo Duplicate', rarity: 'epic', tags: ['echo'], description: 'Echo triggers twice but costs +5 CE' },
  { id: 'shield_return', name: 'Reflective Ward', rarity: 'rare', tags: ['shield'], description: 'When shield absorbed damage, deal 5 true damage' },
  { id: 'omni_momentum', name: 'Omni Momentum', rarity: 'legendary', tags: ['omni'], description: 'Omni gauge grants +1 shield per 20 stored when spending' },
  { id: 'ce_debt_broker', name: 'Debt Broker', rarity: 'epic', tags: ['ce_debt'], description: 'Borrowing CE costs 20% less debt' },
  { id: 'ce_lock_aegis', name: 'Lock Aegis', rarity: 'rare', tags: ['ce_lock'], description: 'CE lock also grants +5 shield at battle start' },
  { id: 'volatility_gamble', name: 'Gambler’s Edge', rarity: 'epic', tags: ['volatility'], description: 'Volatility backlash deals damage to enemies instead' },
  { id: 'combo_architect', name: 'Combo Architect', rarity: 'legendary', tags: ['combo'], description: 'Combo chain cannot decay below 3 while active' },
  { id: 'timeline_anchor', name: 'Chrono Anchor', rarity: 'epic', tags: ['timeline'], description: 'Timeline displacement cannot move you more than 1 slot' },
  { id: 'mythic_unlock', name: 'Mythic Insight', rarity: 'legendary', tags: ['mythic'], description: 'Enables mythic modifiers drop from boss rush' }
];

export const skillEvolutions: SkillEvolution[] = [
  { id: 'radiant_strike_plus', sourceSkill: 'radiant-strike', evolvedName: 'Radiant Strike+', requirements: 'Use Radiant Strike 10 times', effect: 'Adds CE Lock +5 on allies', branch: 'defense' },
  { id: 'logic_net_plus', sourceSkill: 'logic-net', evolvedName: 'Logic Net+', requirements: 'Bind enemies 8 times', effect: 'Adds timeline freeze 1' },
  { id: 'phantom_encore_split', sourceSkill: 'phantom-encore', evolvedName: 'Phantom Encore Split', requirements: 'Echo allies 5 times', effect: 'Echo duration +1 and adds CE gain', branch: 'offense' },
  { id: 'grove_mending_bloom', sourceSkill: 'grove-mending', evolvedName: 'Grove Mending Bloom', requirements: 'Heal 500 HP', effect: 'Afterglow stacks grant regen 1' },
  { id: 'tempest_step_gale', sourceSkill: 'tempest-step', evolvedName: 'Tempest Step Gale', requirements: 'Dodge 8 attacks', effect: 'Also applies timeline displacement' },
  { id: 'ember_dash_blaze', sourceSkill: 'ember-dash', evolvedName: 'Ember Dash Blaze', requirements: 'Apply burn 12 times', effect: 'Burn applies CE Burn 1' },
  { id: 'omni_overdrive_prism', sourceSkill: 'omni-overdrive', evolvedName: 'Omni Overdrive Prism', requirements: 'Spend 200 Omni', effect: 'Shields allies for +2 per 50 Omni' },
  { id: 'aegis_dawn_exalted', sourceSkill: 'aegis-dawn', evolvedName: 'Aegis Dawn Exalted', requirements: 'Win 5 battles without deaths', effect: 'Adds timeline freeze immunity' },
  { id: 'storm_lance_fracture', sourceSkill: 'storm-lance', evolvedName: 'Storm Lance Fracture', requirements: 'Critically wound 10 foes', effect: 'Chance to timeline displace target' }
];

export const mythicModifiers: MythicModifier[] = [
  { id: 'immortal_thread', name: 'Immortal Thread', description: 'Ignore death once per battle and restore to 30% HP', unlock: 'Post-story + 2000 trophies' },
  { id: 'chrono_loop', name: 'Chrono Loop', description: 'Once per battle rewind to last snapshot and cleanse debuffs', unlock: 'Boss Rush flawless run' },
  { id: 'omni_overcharge', name: 'Omni Overcharge', description: 'Omni gauge overflow grants +20% damage true', unlock: 'Ascended ladder completion' }
];

export const bossModifiers = ['enraged', 'mirror', 'corrupted', 'adaptive'] as const;
export type BossModifier = (typeof bossModifiers)[number];
