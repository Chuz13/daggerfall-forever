// Racial Overhaul diagnostic audit, toggle/save round-trip verifier, and all-races matrix runner.

import { RACES, RACE_TEMPLATES } from '../races.js';
import { SKILLS, skillValue } from '../skills.js';
import { EQUIP_SLOTS } from '../../characters/paperdoll/paperdoll.js';
import { createEquipTable } from '../../characters/equipTable.js';
import {
  isRacialOverhaulEnabled,
  withRacialOverhaulState,
  isOverhaulPlayer,
  FAVORED_WEAPON_SKILLS,
  overhaulRacialCombatMods,
  effectiveRaceTemplate,
  racialHpBonus,
  racialMpBonus,
  racialFatigueMult,
  racialStandingBonus,
  racialSwimSpeedMult,
  racialRestSpMult,
  racialNightVisionBoost,
} from '../racialOverhaulData.js';
import { isSpellswordStance, recalcEntityForRacialToggle } from '../racialOverhaul.js';
import { savingChance, ELEMENTS, EFFECT_FLAGS } from '../spellcast.js';
import { isEntityImmuneToParalysis } from '../effects.js';
import { spellPowerMult } from '../spell/spellPower.js';
import { castRate } from '../castSpeed.js';
import { spellPointRecoveryRate } from '../rest/rest.js';
import { swingPacePct } from '../../characters/weaponStates.js';
import { maxFatigue, maxFatigueBase, liveStat } from '../statMods.js';
import { dressStandingBreakdown } from '../clothingStanding.js';
import { computeEntityMods } from '../entityMods.js';
import { defineLiveMaxHealth, defineLiveMaxMagicka } from '../chargen.js';
import { snapshotPlayer, restorePlayer, savedVitalsOf } from '../save/save.js';
import { offlineFirmamentHpOfSnap } from '../offlineFirmament.js';
import { renownHpOf } from '../renownLayer.js';

const WEAPON_SKILLS = Object.freeze([
  ['ShortBlade', SKILLS.ShortBlade],
  ['LongBlade', SKILLS.LongBlade],
  ['Axe', SKILLS.Axe],
  ['BluntWeapon', SKILLS.BluntWeapon],
  ['Archery', SKILLS.Archery],
  ['HandToHand', SKILLS.HandToHand],
]);

/** Shallow-clones an entity safely for non-destructive toggle / save-load verification. */
function cloneEntityForCheck(entity) {
  const copy = {
    isPlayer: entity?.isPlayer !== false,
    raceId: entity?.raceId ?? RACES.Breton,
    race: entity?.race,
    gender: entity?.gender ?? 'male',
    faceIndex: entity?.faceIndex ?? 0,
    level: entity?.level ?? 1,
    name: entity?.name ?? 'Audit',
    stats: { ...(entity?.stats ?? {}) },
    skills: Array.isArray(entity?.skills) ? [...entity.skills] : new Array(35).fill(35),
    skillUses: Array.isArray(entity?.skillUses) ? [...entity.skillUses] : new Array(35).fill(0),
    career: entity?.career ? { ...entity.career } : { abilityFlagsAndSpellPointsBitfield: 0x1000, hitPointsPerLevel: 10 },
    reactionMods: Array.isArray(entity?.reactionMods) ? [...entity.reactionMods] : new Array(11).fill(0),
    activeEffects: Array.isArray(entity?.activeEffects) ? entity.activeEffects.map((e) => ({ ...e })) : [],
    items: Array.isArray(entity?.items) ? entity.items.map((it) => ({ ...it })) : [],
    equip: createEquipTable(),
    lightSource: entity?.lightSource ?? null,
    rawMaxHealth: entity?.rawMaxHealth ?? entity?.maxHealth ?? 35,
    maxHealth: entity?.maxHealth ?? 35,
    health: entity?.health ?? 35,
    magicka: entity?.magicka ?? 30,
    fatigue: entity?.fatigue ?? 100,
    maxHealthLimiter: entity?.maxHealthLimiter,
    maxMagickaOverride: entity?.maxMagickaOverride,
    chargenDone: entity?.chargenDone ?? true,
  };
  const srcSlots = entity?.equip?.slots;
  if (srcSlots) {
    for (let i = 0; i < copy.equip.slots.length; i++) {
      copy.equip.slots[i] = srcSlots[i] ? { ...srcSlots[i] } : null;
    }
  }
  defineLiveMaxHealth(copy);
  defineLiveMaxMagicka(copy);
  computeEntityMods(copy);
  return copy;
}

/**
 * Inspects an entity's live Racial Overhaul state, combat/magic modifiers, resistances, and invariant anomalies.
 * Read-only on `entity`.
 */
export function auditRacialOverhaulState(entity) {
  const overhaulEnabled = isRacialOverhaulEnabled();
  const eligible = isOverhaulPlayer(entity);
  const tpl = effectiveRaceTemplate(entity);
  const maxHp = Number(entity?.maxHealth) || 0;
  const maxMp = Number(entity?.maxMagicka) || 0;
  const maxFat = maxFatigue(entity) || 0;
  const baseFat = maxFatigueBase(entity) || 0;

  const favoredIds = eligible ? (FAVORED_WEAPON_SKILLS[entity.raceId] ?? []) : [];
  const favoredMods = {};
  for (const [label, sk] of WEAPON_SKILLS) {
    favoredMods[label] = overhaulRacialCombatMods(entity, {}, sk);
  }

  const savingThrows = {
    magic: savingChance(ELEMENTS.Magic, EFFECT_FLAGS.Magic, entity),
    fire: savingChance(ELEMENTS.Fire, EFFECT_FLAGS.Fire, entity),
    frost: savingChance(ELEMENTS.Frost, EFFECT_FLAGS.Frost, entity),
    shock: savingChance(ELEMENTS.Shock, EFFECT_FLAGS.Shock, entity),
    poison: savingChance(ELEMENTS.DiseaseOrPoison, EFFECT_FLAGS.Poison, entity),
    disease: savingChance(ELEMENTS.DiseaseOrPoison, EFFECT_FLAGS.Disease, entity),
    paralysisImmune: isEntityImmuneToParalysis(entity),
  };

  const standingBreakdown = dressStandingBreakdown(entity);
  const passives = {
    hpBonus: racialHpBonus(entity, entity?.rawMaxHealth ?? maxHp),
    mpBonus: racialMpBonus(entity, maxMp),
    fatigueMult: racialFatigueMult(entity),
    swimSpeedMult: racialSwimSpeedMult(entity),
    restSpMult: racialRestSpMult(entity),
    restSpRate: spellPointRecoveryRate(entity),
    nightVisionBoost: racialNightVisionBoost(entity),
    spellswordStance: isSpellswordStance(entity),
    spellPowerDestr: spellPowerMult(entity, { isPlayer: false }, { school: SKILLS.Destruction }),
    castRate: castRate(entity),
    bowSwingPacePct: swingPacePct({ entity, weaponType: 14 }, null),
    racialStanding: racialStandingBonus(entity),
    dressStanding: standingBreakdown,
  };

  const anomalies = [];
  const hp = entity?.health ?? 0;
  const mp = entity?.magicka ?? 0;
  const fat = entity?.fatigue ?? 0;

  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || !Number.isFinite(mp) || !Number.isFinite(maxMp) || !Number.isFinite(fat) || !Number.isFinite(maxFat)) {
    anomalies.push('vitals_nan');
  }
  if ((maxHp > 0 && hp > maxHp) || (maxMp > 0 && mp > maxMp) || (maxFat > 0 && fat > maxFat)) {
    anomalies.push('vitals_over_max');
  }

  if (eligible && entity?.career) {
    if (!entity._mods) {
      anomalies.push('mods_missing');
    }
    if (entity.maxHealthLimiter == null && entity.chargenDone !== false) {
      let hpOn = 0;
      let hpOff = 0;
      withRacialOverhaulState(true, () => { hpOn = entity.maxHealth ?? 0; });
      withRacialOverhaulState(false, () => { hpOff = entity.maxHealth ?? 0; });
      const expectedHpDelta = overhaulEnabled ? racialHpBonus(entity, hpOff) : 0;
      const actualHpDelta = overhaulEnabled ? (hpOn - hpOff) : 0;
      if (overhaulEnabled && Math.abs(actualHpDelta - expectedHpDelta) > 1) {
        anomalies.push('hp_bonus_mismatch');
      }
    }
    if (entity.maxMagickaOverride == null && entity.chargenDone !== false) {
      let mpOn = 0;
      let mpOff = 0;
      withRacialOverhaulState(true, () => { mpOn = entity.maxMagicka ?? 0; });
      withRacialOverhaulState(false, () => { mpOff = entity.maxMagicka ?? 0; });
      if (overhaulEnabled && entity.raceId === RACES.HighElf && mpOn <= mpOff) {
        anomalies.push('mp_bonus_mismatch');
      }
    }
    if (overhaulEnabled && entity.raceId === RACES.Redguard && maxFat <= baseFat) {
      anomalies.push('fatigue_mult_mismatch');
    }
    if (overhaulEnabled && entity.raceId === RACES.Breton && standingBreakdown.racialGroups[2] !== 10 && standingBreakdown.racialGroups[3] !== 10) {
      anomalies.push('reaction_mods_drift');
    }
    // Verify Nord Frost / Argonian Disease / Dark Elf Fire cap at <=95% and do not falsely report immune: true.
    const careerImm = entity.career?.immunityFlags ?? 0;
    if (overhaulEnabled && entity.raceId === RACES.Nord && !(careerImm & EFFECT_FLAGS.Frost) && savingThrows.frost.immune) {
      anomalies.push('false_100_resist');
    }
    if (overhaulEnabled && entity.raceId === RACES.Argonian && !(careerImm & EFFECT_FLAGS.Disease) && savingThrows.disease.immune) {
      anomalies.push('false_100_resist');
    }
    if (overhaulEnabled && entity.raceId === RACES.DarkElf && !(careerImm & EFFECT_FLAGS.Fire) && savingThrows.fire.immune) {
      anomalies.push('false_100_resist');
    }
  }

  return {
    overhaulEnabled,
    eligible,
    race: tpl?.key ?? entity?.race ?? null,
    raceId: entity?.raceId ?? tpl?.id ?? null,
    level: entity?.level ?? 1,
    vitals: {
      health: hp,
      maxHealth: maxHp,
      rawMaxHealth: entity?.rawMaxHealth ?? maxHp,
      magicka: mp,
      maxMagicka: maxMp,
      fatigue: fat,
      maxFatigue: maxFat,
      maxFatigueBase: baseFat,
    },
    stats: {
      strength: liveStat(entity, 'strength'),
      intelligence: liveStat(entity, 'intelligence'),
      willpower: liveStat(entity, 'willpower'),
      agility: liveStat(entity, 'agility'),
      endurance: liveStat(entity, 'endurance'),
      personality: liveStat(entity, 'personality'),
      speed: liveStat(entity, 'speed'),
      luck: liveStat(entity, 'luck'),
    },
    skills: {
      Etiquette: skillValue(entity, SKILLS.Etiquette),
      Mysticism: skillValue(entity, SKILLS.Mysticism),
      Destruction: skillValue(entity, SKILLS.Destruction),
      ShortBlade: skillValue(entity, SKILLS.ShortBlade),
      Stealth: skillValue(entity, SKILLS.Stealth),
      Pickpocket: skillValue(entity, SKILLS.Pickpocket),
      CriticalStrike: skillValue(entity, SKILLS.CriticalStrike),
      Swimming: skillValue(entity, SKILLS.Swimming),
    },
    favoredSkills: favoredIds,
    favoredMods,
    effectiveFlags: tpl
      ? {
          resistanceFlags: tpl.resistanceFlags ?? 0,
          immunityFlags: tpl.immunityFlags ?? 0,
          lowToleranceFlags: tpl.lowToleranceFlags ?? 0,
        }
      : null,
    savingThrows,
    passives,
    mods: entity?._mods
      ? {
          resist: { ...(entity._mods.resist ?? {}) },
          fatigueLess: entity._mods.fatigueLess ?? 0,
          fallLess: entity._mods.fallLess ?? 0,
          weightMult: entity._mods.weightMult ?? 0,
          heatDegrees: entity._mods.heatDegrees ?? 0,
          coldDegrees: entity._mods.coldDegrees ?? 0,
          armorParts: Array.isArray(entity._mods.armorParts) ? [...entity._mods.armorParts] : [],
        }
      : null,
    anomalies,
  };
}

/**
 * Verifies live toggle ON -> OFF -> ON on a cloned copy of `entity`.
 */
export function verifyRacialToggleRoundTrip(entity) {
  const copy = cloneEntityForCheck(entity);
  const anomalies = [];
  let onVitals = null;
  let offVitals = null;
  let restoredVitals = null;

  withRacialOverhaulState(true, () => {
    computeEntityMods(copy);
    if (copy.health <= 0 && copy.maxHealth > 0) copy.health = copy.maxHealth;
    onVitals = { hp: copy.health, maxHp: copy.maxHealth, mp: copy.magicka, maxMp: copy.maxMagicka, fat: copy.fatigue, maxFat: maxFatigue(copy) };
  });

  recalcEntityForRacialToggle(copy, true, false);
  withRacialOverhaulState(false, () => {
    offVitals = { hp: copy.health, maxHp: copy.maxHealth, mp: copy.magicka, maxMp: copy.maxMagicka, fat: copy.fatigue, maxFat: maxFatigue(copy) };
  });

  recalcEntityForRacialToggle(copy, false, true);
  withRacialOverhaulState(true, () => {
    restoredVitals = { hp: copy.health, maxHp: copy.maxHealth, mp: copy.magicka, maxMp: copy.maxMagicka, fat: copy.fatigue, maxFat: maxFatigue(copy) };
  });

  if (!Number.isFinite(offVitals.hp) || !Number.isFinite(offVitals.mp) || !Number.isFinite(offVitals.fat)) {
    anomalies.push('toggle_off_nan');
  }
  if (Math.abs(restoredVitals.maxHp - onVitals.maxHp) > 1 || Math.abs(restoredVitals.maxMp - onVitals.maxMp) > 1 || Math.abs(restoredVitals.maxFat - onVitals.maxFat) > 1) {
    anomalies.push('toggle_rescale_drift');
  }
  if (Math.abs(restoredVitals.hp - onVitals.hp) > 1 || Math.abs(restoredVitals.mp - onVitals.mp) > 1) {
    anomalies.push('toggle_rescale_drift');
  }

  return { ok: anomalies.length === 0, anomalies: [...new Set(anomalies)], onVitals, offVitals, restoredVitals };
}

/**
 * Verifies save snapshot + OFF/ON restore + triple quickload stability on a cloned copy of `entity`.
 */
export function verifyRacialSaveRoundTrip(entity) {
  const anomalies = [];
  const copy = cloneEntityForCheck(entity);
  const snap = snapshotPlayer(copy, {});
  const savedVitals = savedVitalsOf(snap);
  const expectedSavedMax = (copy.maxHealth ?? 0) - renownHpOf(copy) + offlineFirmamentHpOfSnap(snap);
  const expectedSavedHp = (copy.maxHealth ?? 0) > 0
    ? Math.max(copy.health > 0 ? 1 : 0, Math.round((copy.health / copy.maxHealth) * expectedSavedMax))
    : 0;

  if (Math.abs(savedVitals.maxHealth - expectedSavedMax) > 1 || Math.abs(savedVitals.health - expectedSavedHp) > 1) {
    anomalies.push('save_roundtrip_hp_drift');
  }

  let offVitals = null;
  withRacialOverhaulState(false, () => {
    const tOff = cloneEntityForCheck(copy);
    restorePlayer(tOff, snap);
    offVitals = { hp: tOff.health, maxHp: tOff.maxHealth, mp: tOff.magicka, maxMp: tOff.maxMagicka };
  });

  let onVitals = null;
  let tripleLoadReactionMods = null;
  withRacialOverhaulState(true, () => {
    const tOn = cloneEntityForCheck(copy);
    restorePlayer(tOn, snap);
    restorePlayer(tOn, snap);
    restorePlayer(tOn, snap);
    onVitals = { hp: tOn.health, maxHp: tOn.maxHealth, mp: tOn.magicka, maxMp: tOn.maxMagicka };
    tripleLoadReactionMods = tOn.reactionMods ? [...tOn.reactionMods] : [];
    if (copy.raceId === RACES.Breton && (tOn.reactionMods?.[2] !== 10 || tOn.reactionMods?.[3] !== 10)) {
      anomalies.push('save_roundtrip_reaction_stack');
    }
    if (Math.abs((tOn.maxHealth ?? 0) - (copy.maxHealth ?? 0)) > 1 || Math.abs((tOn.maxMagicka ?? 0) - (copy.maxMagicka ?? 0)) > 1) {
      anomalies.push('save_roundtrip_mp_drift');
    }
  });

  return {
    ok: anomalies.length === 0,
    anomalies: [...new Set(anomalies)],
    savedVitals,
    offVitals,
    onVitals,
    tripleLoadReactionMods,
  };
}

/**
 * Audits all 8 playable races at `level` across live invariants, toggle ON<->OFF, and save/load round-trips.
 */
export function runAllRacesMatrixAudit(level = 10) {
  const lvl = Math.max(1, Math.min(35, Math.trunc(Number(level) || 10)));
  const results = [];
  for (const tpl of RACE_TEMPLATES) {
    const e = cloneEntityForCheck({
      isPlayer: true,
      raceId: tpl.id,
      race: tpl.key,
      level: lvl,
      stats: {
        strength: 60,
        intelligence: 60,
        willpower: 50,
        agility: 50,
        endurance: 60,
        personality: 50,
        speed: 50,
        luck: 50,
      },
      skills: new Array(35).fill(35),
      career: { name: 'Spellsword', abilityFlagsAndSpellPointsBitfield: 0x1000, hitPointsPerLevel: 12 },
      rawMaxHealth: 40 + (lvl - 1) * 8,
      maxHealth: 40 + (lvl - 1) * 8,
    });
    // Equip a 1H weapon in RightHand so Dark Elf Spellsword Resonance is exercised cleanly.
    e.equip.slots[EQUIP_SLOTS.RightHand] = { group: 'Weapons', templateIndex: 118 };
    e.equip.slots[EQUIP_SLOTS.LeftHand] = null;

    let liveOn = null;
    let liveOff = null;
    withRacialOverhaulState(true, () => {
      computeEntityMods(e);
      e.health = e.maxHealth;
      e.magicka = e.maxMagicka;
      e.fatigue = maxFatigue(e);
      liveOn = auditRacialOverhaulState(e);
    });
    withRacialOverhaulState(false, () => {
      computeEntityMods(e);
      liveOff = auditRacialOverhaulState({ ...e, health: e.maxHealth, magicka: e.maxMagicka, fatigue: maxFatigue(e) });
    });
    computeEntityMods(e);
    e.health = e.maxHealth;
    e.magicka = e.maxMagicka;
    e.fatigue = maxFatigue(e);

    const toggle = verifyRacialToggleRoundTrip(e);
    const saveRt = verifyRacialSaveRoundTrip(e);
    const anomalies = [...new Set([...liveOn.anomalies, ...liveOff.anomalies, ...toggle.anomalies, ...saveRt.anomalies])];
    results.push({
      race: tpl.key,
      raceId: tpl.id,
      ok: anomalies.length === 0,
      anomalies,
      liveOn,
      toggle,
      saveRt,
    });
  }
  const passed = results.filter((r) => r.ok).length;
  return {
    ok: passed === results.length,
    level: lvl,
    passed,
    total: results.length,
    results,
  };
}
