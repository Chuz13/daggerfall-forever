// Runtime hook installer and live-toggle vital/mod recalculator for the racial overhaul.
// Imported by worldTick.js alongside installPcaao() (kept off main.js's static boot graph).

import {
  RACIAL_OVERHAUL_PREF,
  isRacialOverhaulEnabled,
  withRacialOverhaulState,
  isOverhaulPlayer,
  racialHpBonus,
  racialMpBonus,
  racialFatigueMult,
  racialNightVisionBoost,
} from './racialOverhaulData.js';
import { RACES } from './races.js';
import { SKILLS } from './skills.js';
import { WEAPONS, weaponSkillUsed } from '../characters/weapons.js';
import { isHandWraps } from '../characters/handWrapsIds.js';

const WEAPON_TYPE_BOW = 14; // WEAPON_TYPES.Bow (kept inline to avoid fpsWeapon -> weaponWidget cycle)
const TORCH_TEMPLATE = 247; // UselessItems2.Torch (kept inline to avoid handheldTorches -> weaponWidget -> fpsWeapon cycle)
import { EQUIP_SLOTS } from '../characters/paperdoll/paperdoll.js';
import { getItemHands, ITEM_HANDS } from './equip.js';
import { registerEntityFold, registerWeaponBlowMod, computeEntityMods } from './entityMods.js';
import { registerAbsorptionChance } from './absorption.js';
import { registerSpellCostMod, castSchool } from './spellcost.js';
import { registerSpellPowerMod } from './spell/spellPower.js';
import { registerCastSpeedMod } from './castSpeed.js';
import { registerSwingPaceMod } from '../characters/weaponStates.js';
import { setNightVisionReader } from '../render/renderer.js';
import { addPrefListener } from './uiPrefs.js';
import { keepFraction, offlineBaseMaxHealth } from './renownLayer.js';
import { maxFatigue } from './statMods.js';
import { applyDressStanding } from './clothingStanding.js';
import { playerEntity, surfacePlayer } from '../characters/playerEntity.js';
import { lanternAtWaist, LANTERN_TEMPLATE } from './playerTorch.js';

const SPELL_SCHOOL_RESTORATION = SKILLS.Restoration;
const SPELL_SCHOOL_ALTERATION = SKILLS.Alteration;
const SPELL_SCHOOL_MYSTICISM = SKILLS.Mysticism;
const SPELL_SCHOOL_DESTRUCTION = SKILLS.Destruction;

const BRETON_DISCOUNT_SCHOOLS = new Set([
  SPELL_SCHOOL_RESTORATION,
  SPELL_SCHOOL_ALTERATION,
  SPELL_SCHOOL_MYSTICISM,
]);

/** Dark Elf Spellsword Resonance: 1-handed non-bow weapon in one hand, other hand completely empty (no off-hand torch). */
export function isSpellswordStance(entity) {
  const slots = entity?.equip?.slots;
  if (!slots) return false;
  const light = entity.lightSource;
  if ((light?.templateIndex === TORCH_TEMPLATE || light?.templateIndex === LANTERN_TEMPLATE) && !lanternAtWaist(light)) return false;
  const right = slots[EQUIP_SLOTS.RightHand] ?? null;
  const left = slots[EQUIP_SLOTS.LeftHand] ?? null;
  const isOneHandedWeapon = (it) =>
    !!it &&
    (it.group === 'Weapons' || it.group === 3) &&
    !isHandWraps(it) &&
    getItemHands(it) !== ITEM_HANDS.Both &&
    it.templateIndex !== WEAPONS.Short_Bow &&
    it.templateIndex !== WEAPONS.Long_Bow;
  return (isOneHandedWeapon(right) && !left) || (isOneHandedWeapon(left) && !right);
}

function racialFold(entity) {
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(entity)) return null;
  switch (entity.raceId) {
    case RACES.Breton:
      return {
        skills: { [SKILLS.Etiquette]: 10, [SKILLS.Mysticism]: 10 },
      };
    case RACES.Redguard:
      return {
        fatigueLess: 25,
        heatDegrees: 10,
      };
    case RACES.Nord:
      return {
        resist: { frost: 20 },
        coldDegrees: 15,
        weightMult: 0.15,
      };
    case RACES.DarkElf:
      return {
        resist: { fire: 20 },
        skills: { [SKILLS.Destruction]: 5, [SKILLS.ShortBlade]: 5 },
      };
    case RACES.WoodElf:
      return {
        skills: { [SKILLS.Stealth]: 10 },
      };
    case RACES.Khajiit:
      return {
        fallLess: 50,
        stats: { speed: 5, agility: 5 },
        skills: { [SKILLS.Stealth]: 10, [SKILLS.Pickpocket]: 10, [SKILLS.CriticalStrike]: 10 },
      };
    case RACES.Argonian:
      return {
        resist: { disease: 20 },
        skills: { [SKILLS.Swimming]: 15 },
        armorParts: [5, 5, 5, 5, 5, 5, 5],
      };
    default:
      return null;
  }
}

function racialBlowMod(weapon, damage, attacker, _target, info) {
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(attacker) || !(damage > 0)) return damage;
  if (attacker.raceId === RACES.Nord) {
    const isBow = !!weapon && weaponSkillUsed(weapon.templateIndex) === SKILLS.Archery;
    const maxHp = attacker.maxHealth ?? 0;
    const hp = attacker.health ?? 0;
    if (!isBow && maxHp > 0 && hp / maxHp < 0.35) {
      return Math.round(damage * 1.25);
    }
  } else if (attacker.raceId === RACES.WoodElf) {
    if (info?.unaware === true) {
      return Math.round(damage * 1.25);
    }
  }
  return damage;
}

function racialAbsorb(entity) {
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(entity)) return 0;
  return entity.raceId === RACES.Breton ? 15 : 0;
}

function spellSchools(entity, spell) {
  const out = [];
  for (const e of spell?.effects ?? []) {
    if (e && e.type >= 0) out.push(castSchool(entity, spell, e));
  }
  return out;
}

function racialSpellCost(entity, sp, spell) {
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(entity) || !spell) return sp;
  const schools = spellSchools(entity, spell);
  if (!schools.length) return sp;
  if (entity.raceId === RACES.Breton) {
    if (schools.every((s) => BRETON_DISCOUNT_SCHOOLS.has(s))) {
      return Math.max(1, Math.round(sp * 0.85));
    }
  } else if (entity.raceId === RACES.DarkElf && isSpellswordStance(entity)) {
    if (schools.includes(SPELL_SCHOOL_DESTRUCTION)) {
      return Math.max(1, Math.round(sp * 0.80));
    }
  }
  return sp;
}

function racialSpellPower(caster, _target, opts) {
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(caster)) return 0;
  if (caster.raceId === RACES.HighElf) return 15;
  if (caster.raceId === RACES.DarkElf && isSpellswordStance(caster) && opts?.school === SPELL_SCHOOL_DESTRUCTION) {
    return 10;
  }
  return 0;
}

function racialCastSpeed(entity) {
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(entity)) return 0;
  if (entity.raceId === RACES.HighElf) return 12;
  if (entity.raceId === RACES.DarkElf && isSpellswordStance(entity)) return 10;
  return 0;
}

function racialSwingPace(ctx, w) {
  const entity = ctx?.entity;
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(entity)) return 0;
  if (entity.raceId !== RACES.WoodElf) return 0;
  const isBow = w?.family === 'archery' || ctx?.weaponType === WEAPON_TYPE_BOW;
  return isBow ? 10 : 0;
}

/**
 * Proportionally rescale live vitals & recompute entity modifiers/standing when `racialOverhaul` is toggled.
 * Exported for direct testing alongside `addPrefListener` live wiring.
 */
export function recalcEntityForRacialToggle(entity, prevEnabled, nextEnabled) {
  if (!entity || prevEnabled === nextEnabled) return;
  let prevMaxHp = 0;
  let prevMaxMp = 0;
  let prevMaxFat = 0;
  withRacialOverhaulState(prevEnabled, () => {
    prevMaxHp = entity.maxHealth ?? 0;
    prevMaxMp = entity.maxMagicka ?? 0;
    prevMaxFat = maxFatigue(entity);
  });

  withRacialOverhaulState(nextEnabled, () => {
    computeEntityMods(entity);
    if (entity.reactionMods && entity._dressStanding?.groups) {
      const prevGroups = entity._dressStanding.groups;
      for (let g = 0; g < prevGroups.length && g < entity.reactionMods.length; g++) {
        entity.reactionMods[g] -= prevGroups[g];
      }
    }
    applyDressStanding(entity);
    const nextMaxHp = entity.maxHealth ?? 0;
    const nextMaxMp = entity.maxMagicka ?? 0;
    const nextMaxFat = maxFatigue(entity);
    if (Number.isFinite(entity.health)) entity.health = keepFraction(entity.health, prevMaxHp, nextMaxHp);
    if (Number.isFinite(entity.magicka)) entity.magicka = keepFraction(entity.magicka, prevMaxMp, nextMaxMp);
    if (Number.isFinite(entity.fatigue)) entity.fatigue = keepFraction(entity.fatigue, prevMaxFat, nextMaxFat);
  });
}

/**
 * Helper used on save/load to compute base (un-overhauled) vs live max Health/Magicka/Fatigue cleanly.
 */
export function expandVitalsOnLoad(entity) {
  if (!entity || !isRacialOverhaulEnabled() || !isOverhaulPlayer(entity)) return;
  const offHp = offlineBaseMaxHealth(entity);
  const liveHp = entity.maxHealth ?? 0;
  if (liveHp > offHp && Number.isFinite(entity.health) && entity.health > 0) {
    entity.health = keepFraction(entity.health, offHp, liveHp);
  }
  const liveMp = entity.maxMagicka ?? 0;
  const mpBonus = racialMpBonus(entity, Math.max(0, liveMp));
  if (entity.raceId === RACES.HighElf && mpBonus > 0 && Number.isFinite(entity.magicka) && entity.magicka > 0) {
    // Reconstruct rawMp from liveMp = rawMp + trunc(rawMp * 0.25) + other terms; exact base is liveMp - bonus
    let baseMp = 0;
    withRacialOverhaulState(false, () => { baseMp = entity.maxMagicka ?? 0; });
    if (liveMp > baseMp) entity.magicka = keepFraction(entity.magicka, baseMp, liveMp);
  }
  if (entity.raceId === RACES.Redguard && racialFatigueMult(entity) !== 1 && Number.isFinite(entity.fatigue) && entity.fatigue > 0) {
    let baseFat = 0;
    withRacialOverhaulState(false, () => { baseFat = maxFatigue(entity); });
    const liveFat = maxFatigue(entity);
    if (liveFat > baseFat) entity.fatigue = keepFraction(entity.fatigue, baseFat, liveFat);
  }
}

let _installed = false;
let _lastEnabled = null;

/** Idempotently install all Racial Overhaul folds, combat/magic hooks, night vision, and live pref listener. */
export function installRacialOverhaul() {
  if (_installed) return;
  _installed = true;
  _lastEnabled = isRacialOverhaulEnabled();

  registerEntityFold('racialOverhaul', racialFold);
  registerWeaponBlowMod('racialOverhaul', racialBlowMod);
  registerAbsorptionChance('racialOverhaul', racialAbsorb);
  registerSpellCostMod('racialOverhaul', racialSpellCost);
  registerSpellPowerMod('racialOverhaul', racialSpellPower);
  registerCastSpeedMod('racialOverhaul', racialCastSpeed);
  registerSwingPaceMod('racialOverhaul', racialSwingPace);
  setNightVisionReader(() => racialNightVisionBoost(playerEntity));

  addPrefListener((key) => {
    if (key !== RACIAL_OVERHAUL_PREF && key !== '*') return;
    const next = isRacialOverhaulEnabled();
    if (next === _lastEnabled) return;
    const prev = _lastEnabled;
    _lastEnabled = next;
    const hpBefore = playerEntity.health ?? null;
    const mpBefore = playerEntity.magicka ?? null;
    const fatBefore = playerEntity.fatigue ?? null;
    let maxHpBefore = null;
    let maxMpBefore = null;
    let maxFatBefore = null;
    withRacialOverhaulState(prev, () => {
      maxHpBefore = playerEntity.maxHealth ?? null;
      maxMpBefore = playerEntity.maxMagicka ?? null;
      maxFatBefore = maxFatigue(playerEntity);
    });
    recalcEntityForRacialToggle(playerEntity, prev, next);
    surfacePlayer();
    const tlPayload = {
      cat: 'system',
      event: 'RACIAL_OVERHAUL_TOGGLED',
      sev: 'info',
      data: {
        from: prev,
        to: next,
        race: playerEntity.race ?? null,
        raceId: playerEntity.raceId ?? null,
        hpBefore,
        hpAfter: playerEntity.health ?? null,
        maxHpBefore,
        maxHpAfter: playerEntity.maxHealth ?? null,
        mpBefore,
        mpAfter: playerEntity.magicka ?? null,
        maxMpBefore,
        maxMpAfter: playerEntity.maxMagicka ?? null,
        fatBefore,
        fatAfter: playerEntity.fatigue ?? null,
        maxFatBefore,
        maxFatAfter: maxFatigue(playerEntity),
      },
    };
    if (typeof globalThis.__dffRecordTimelineEvent === 'function') {
      globalThis.__dffRecordTimelineEvent(tlPayload);
    } else {
      import('./diagnostics/eventTimeline.js').then((m) => m.recordTimelineEvent(tlPayload)).catch(() => {});
    }
  });
}

export { racialHpBonus, racialMpBonus };
