// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// TACTICAL PACK COMPOSITION (Balance Roadmap — Block 4)
//
// Pure role-based pack composers for Living Tamriel sites, Urban Skirmishes,
// War Skirmishes, Nemesis squads, and Crisis Forts.
// Every mobileType emitted here is a verified spawnable ID from MOBILE_TYPES:
//   - Archers (`Archer`, `Ranger`) have `hasBowAttack === true`
//   - Casters (`Battlemage`, `Spellsword`, `Nightblade`, `Mage`, `Healer`,
//     `OrcShaman`, `Ghost`, `Wraith`, `Lich`, `FireDaedra`, `FrostDaedra`,
//     `DaedraSeducer`) have `castsMagic: true` or `MONSTER_SPELL_LISTS`
//   - Tanks/Commanders (`Warrior`, `Barbarian`, `Knight`, `OrcSergeant`,
//     `OrcWarlord`, `SkeletalWarrior`, `Mummy`, `Daedroth`) hold the frontline.
// ═══════════════════════════════════════════════════════════════════════════════

import { MOBILE_TYPES } from '../../characters/mobile/mobileTypes.js';

/** @type {Set<number>} */
const CASTER_CLASS_SET = new Set([
  MOBILE_TYPES.Mage,
  MOBILE_TYPES.Spellsword,
  MOBILE_TYPES.Battlemage,
  MOBILE_TYPES.Healer,
  MOBILE_TYPES.Nightblade,
]);

/** @type {Set<number>} */
const ORC_FAMILY = new Set([
  MOBILE_TYPES.Orc,
  MOBILE_TYPES.OrcSergeant,
  MOBILE_TYPES.OrcShaman,
  MOBILE_TYPES.OrcWarlord,
]);

/** @type {Set<number>} */
const UNDEAD_FAMILY = new Set([
  MOBILE_TYPES.SkeletalWarrior,
  MOBILE_TYPES.Zombie,
  MOBILE_TYPES.Ghost,
  MOBILE_TYPES.Mummy,
  MOBILE_TYPES.Wraith,
  MOBILE_TYPES.Vampire,
  MOBILE_TYPES.VampireAncient,
  MOBILE_TYPES.Lich,
  MOBILE_TYPES.AncientLich,
]);

/** @type {Set<number>} */
const DAEDRA_FAMILY = new Set([
  MOBILE_TYPES.FrostDaedra,
  MOBILE_TYPES.FireDaedra,
  MOBILE_TYPES.Daedroth,
  MOBILE_TYPES.DaedraSeducer,
  MOBILE_TYPES.DaedraLord,
]);

/**
 * Composes role-balanced Bandit Camp subordinates (tank + archer + caster + bruiser).
 * @param {number} count
 * @param {number} [playerLevel=1]
 * @returns {Array<{ mobileType: number, name: string, tacticalRole: string }>}
 */
export function composeBanditCampSubordinates(count, playerLevel = 1) {
  const n = Math.max(0, Math.floor(count));
  const lvl = Math.max(1, Math.floor(playerLevel || 1));
  const pool = [
    { mobileType: MOBILE_TYPES.Warrior, name: 'Deserter Cutthroat', tacticalRole: 'tank' },
    { mobileType: MOBILE_TYPES.Archer, name: 'Outlaw Marksman', tacticalRole: 'archer' },
    {
      mobileType: lvl >= 4 ? MOBILE_TYPES.Nightblade : MOBILE_TYPES.Rogue,
      name: lvl >= 4 ? 'Brigand Hexblade' : 'Bandit Cutpurse',
      tacticalRole: lvl >= 4 ? 'caster' : 'skirmisher',
    },
    { mobileType: MOBILE_TYPES.Barbarian, name: 'Marauder Raider', tacticalRole: 'tank' },
    {
      mobileType: lvl >= 7 ? MOBILE_TYPES.Battlemage : MOBILE_TYPES.Spellsword,
      name: lvl >= 7 ? 'Outlaw Battlemage' : 'Rogue Spellsword',
      tacticalRole: 'caster',
    },
    { mobileType: MOBILE_TYPES.Ranger, name: 'Outlaw Scout', tacticalRole: 'archer' },
  ];
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
  return out;
}

/**
 * Composes role-balanced Checkpoint guards (commander + frontline + crossbow + battlemage).
 * @param {number} count
 * @param {number} [playerLevel=1]
 * @returns {Array<{ mobileType: number, name: string, tacticalRole: string }>}
 */
export function composeCheckpointGuards(count, playerLevel = 1) {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const lvl = Math.max(1, Math.floor(playerLevel || 1));
  /** @type {Array<{ mobileType: number, name: string, tacticalRole: string }>} */
  const out = [{ mobileType: MOBILE_TYPES.Knight, name: 'Checkpoint Captain', tacticalRole: 'commander' }];
  const subs = [
    { mobileType: MOBILE_TYPES.Warrior, name: 'Provincial Watchman', tacticalRole: 'tank' },
    { mobileType: MOBILE_TYPES.Archer, name: 'Watch Crossbowman', tacticalRole: 'archer' },
    {
      mobileType: lvl >= 5 ? MOBILE_TYPES.Battlemage : MOBILE_TYPES.Spellsword,
      name: lvl >= 5 ? 'Watch Battlemage' : 'Watch Spellsword',
      tacticalRole: 'caster',
    },
    { mobileType: MOBILE_TYPES.Knight, name: 'Vanguard Halberdier', tacticalRole: 'tank' },
  ];
  for (let i = 1; i < n; i++) out.push(subs[(i - 1) % subs.length]);
  return out;
}

/**
 * Composes role-balanced Nemesis hunter minions complementing the leader's archetype.
 * @param {number} count
 * @param {number} [playerLevel=1]
 * @param {number} [leaderMobileType=MOBILE_TYPES.Assassin]
 * @returns {Array<{ mobileType: number, tacticalRole: string }>}
 */
export function composeNemesisMinions(count, playerLevel = 1, leaderMobileType = MOBILE_TYPES.Assassin) {
  const n = Math.max(0, Math.floor(count));
  const lvl = Math.max(1, Math.floor(playerLevel || 1));
  const leaderIsCaster = CASTER_CLASS_SET.has(leaderMobileType);
  const pool = leaderIsCaster
    ? [
        { mobileType: lvl >= 10 ? MOBILE_TYPES.Knight : MOBILE_TYPES.Warrior, tacticalRole: 'tank' },
        { mobileType: MOBILE_TYPES.Archer, tacticalRole: 'archer' },
        { mobileType: MOBILE_TYPES.Barbarian, tacticalRole: 'tank' },
        { mobileType: MOBILE_TYPES.Rogue, tacticalRole: 'skirmisher' },
      ]
    : [
        { mobileType: lvl >= 10 ? MOBILE_TYPES.Knight : MOBILE_TYPES.Warrior, tacticalRole: 'tank' },
        { mobileType: MOBILE_TYPES.Archer, tacticalRole: 'archer' },
        { mobileType: lvl >= 7 ? MOBILE_TYPES.Battlemage : MOBILE_TYPES.Nightblade, tacticalRole: 'caster' },
        { mobileType: MOBILE_TYPES.Rogue, tacticalRole: 'skirmisher' },
      ];
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
  return out;
}

/**
 * Composes role-balanced War Skirmish squad roles for Side A / Side B.
 * @param {number} count
 * @param {{ warKind?: string, godKind?: string|null, isSideB?: boolean, playerLevel?: number }} [opts]
 * @returns {Array<{ mobileType: number, tacticalRole: string }>}
 */
export function composeWarSquadRoles(count, { warKind = 'mundane', godKind = null, isSideB = false, playerLevel = 1 } = {}) {
  const n = Math.max(0, Math.floor(count));
  const lvl = Math.max(1, Math.floor(playerLevel || 1));
  let pool;
  if (warKind === 'divine' && godKind === 'daedra') {
    pool = [
      { mobileType: MOBILE_TYPES.Daedroth, tacticalRole: 'tank' },
      { mobileType: MOBILE_TYPES.DaedraSeducer, tacticalRole: 'caster' },
      { mobileType: MOBILE_TYPES.Battlemage, tacticalRole: 'caster' },
      { mobileType: MOBILE_TYPES.Spellsword, tacticalRole: 'tank' },
    ];
  } else if (warKind === 'divine' && godKind) {
    pool = [
      { mobileType: MOBILE_TYPES.Knight, tacticalRole: 'commander' },
      { mobileType: MOBILE_TYPES.Archer, tacticalRole: 'archer' },
      { mobileType: MOBILE_TYPES.Battlemage, tacticalRole: 'caster' },
      { mobileType: MOBILE_TYPES.Spellsword, tacticalRole: 'tank' },
    ];
  } else if (isSideB) {
    pool = [
      { mobileType: MOBILE_TYPES.Barbarian, tacticalRole: 'commander' },
      { mobileType: MOBILE_TYPES.Warrior, tacticalRole: 'tank' },
      { mobileType: MOBILE_TYPES.Archer, tacticalRole: 'archer' },
      { mobileType: lvl >= 5 ? MOBILE_TYPES.Nightblade : MOBILE_TYPES.Spellsword, tacticalRole: 'caster' },
    ];
  } else {
    pool = [
      { mobileType: MOBILE_TYPES.Knight, tacticalRole: 'commander' },
      { mobileType: MOBILE_TYPES.Warrior, tacticalRole: 'tank' },
      { mobileType: MOBILE_TYPES.Archer, tacticalRole: 'archer' },
      { mobileType: lvl >= 5 ? MOBILE_TYPES.Battlemage : MOBILE_TYPES.Spellsword, tacticalRole: 'caster' },
    ];
  }
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
  return out;
}

/**
 * Enriches purely humanoid Urban Skirmish pools (count >= 3) so packs carry tank + archer + caster.
 * Monster / swarm pools are returned untouched.
 * @param {number[]} basePool
 * @param {number} count
 * @param {{ side?: string, playerLevel?: number }} [opts]
 * @returns {number[]}
 */
export function enrichHumanoidSkirmishPool(basePool, count, { side = 'guards', playerLevel = 1 } = {}) {
  const n = Math.max(0, Math.floor(count));
  const list = Array.isArray(basePool) && basePool.length ? basePool : [MOBILE_TYPES.Warrior];
  const allClass = list.every((id) => Number.isInteger(id) && id >= 128);
  const lvl = Math.max(1, Math.floor(playerLevel || 1));
  if (!allClass || n < 3) {
    return Array.from({ length: n }, (_, i) => list[i % list.length]);
  }
  const commander = list[0];
  const tank = side === 'rebels' ? MOBILE_TYPES.Barbarian : MOBILE_TYPES.Warrior;
  const archer = MOBILE_TYPES.Archer;
  const caster = lvl >= 5
    ? (side === 'rebels' ? MOBILE_TYPES.Nightblade : MOBILE_TYPES.Battlemage)
    : MOBILE_TYPES.Spellsword;
  const roster = [commander, tank, archer, caster];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(i < roster.length ? roster[i] : list[i % list.length]);
  }
  return out;
}

/**
 * Composes a role-balanced garrison for Bounty / Crisis Forts while staying within the same enemy family.
 * @param {number} baseMobileType
 * @param {number} count
 * @param {number} [playerLevel=1]
 * @returns {number[]}
 */
export function composeFortPack(baseMobileType, count, playerLevel = 1) {
  const n = Math.max(0, Math.floor(count));
  if (n <= 1) return n === 1 ? [baseMobileType] : [];
  const lvl = Math.max(1, Math.floor(playerLevel || 1));

  if (baseMobileType >= 128 && baseMobileType !== MOBILE_TYPES.Knight_CityWatch) {
    const template = [
      baseMobileType,
      MOBILE_TYPES.Warrior,
      MOBILE_TYPES.Archer,
      lvl >= 5 ? MOBILE_TYPES.Battlemage : MOBILE_TYPES.Spellsword,
      MOBILE_TYPES.Barbarian,
      MOBILE_TYPES.Ranger,
    ];
    return Array.from({ length: n }, (_, i) => template[i % template.length]);
  }

  if (ORC_FAMILY.has(baseMobileType)) {
    const cmd = lvl >= 10 ? MOBILE_TYPES.OrcWarlord : (lvl >= 4 ? MOBILE_TYPES.OrcSergeant : baseMobileType);
    const bruiser = lvl >= 4 ? MOBILE_TYPES.OrcSergeant : MOBILE_TYPES.Orc;
    const shaman = lvl >= 6 ? MOBILE_TYPES.OrcShaman : MOBILE_TYPES.Orc;
    const template = [cmd, bruiser, shaman, MOBILE_TYPES.Orc];
    return Array.from({ length: n }, (_, i) => template[i % template.length]);
  }

  if (UNDEAD_FAMILY.has(baseMobileType)) {
    const caster = lvl >= 10 ? MOBILE_TYPES.Wraith : MOBILE_TYPES.Ghost;
    const template = [baseMobileType, MOBILE_TYPES.SkeletalWarrior, caster, MOBILE_TYPES.Mummy];
    return Array.from({ length: n }, (_, i) => template[i % template.length]);
  }

  if (DAEDRA_FAMILY.has(baseMobileType)) {
    const template = [baseMobileType, MOBILE_TYPES.Daedroth, MOBILE_TYPES.FireDaedra, MOBILE_TYPES.FrostDaedra, MOBILE_TYPES.DaedraSeducer];
    return Array.from({ length: n }, (_, i) => template[i % template.length]);
  }

  return Array(n).fill(baseMobileType);
}
