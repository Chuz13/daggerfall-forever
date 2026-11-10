// @ts-check
// ═══════════════════════════════════════════════════════════════════
// CHARGEN TOOLTIPS & COSTS - Dynamic tooltip generation and difficulty
// costs for attributes, skills, and special advantages / disadvantages.
//
// Leaf/cycle-safe module in systems/ - consumes combat formulas,
// special advantages difficulty table, and localization (t()).
// ═══════════════════════════════════════════════════════════════════

import { STAT_KEYS_ORDER } from './statMods.js';
import {
  damageModifier,
  maxEncumbrance,
  spellPointsFor,
  magicResist,
  toHitModifier,
  hitPointsModifier,
  healingRateModifier,
  handToHandMinDamage,
  handToHandMaxDamage,
} from '../combat/formulas.js';
import { SKILLS, SKILL_NAMES } from './skills.js';
import { advDisAdjustment, secondaryListFor, labelFor } from './specialAdvantages.js';
import { advancementMultiplier } from './customClass.js';
import { t } from './textManager.js';

/**
 * Governing attribute for each of the 35 skills in Daggerfall / DFU.
 * Used for tooltip information display.
 */
export const SKILL_GOVERNING_STAT = Object.freeze({
  [SKILLS.Medical]: 'intelligence',
  [SKILLS.Etiquette]: 'personality',
  [SKILLS.Streetwise]: 'personality',
  [SKILLS.Jumping]: 'strength',
  [SKILLS.Orcish]: 'intelligence',
  [SKILLS.Harpy]: 'intelligence',
  [SKILLS.Giantish]: 'intelligence',
  [SKILLS.Dragonish]: 'intelligence',
  [SKILLS.Nymph]: 'intelligence',
  [SKILLS.Daedric]: 'intelligence',
  [SKILLS.Spriggan]: 'intelligence',
  [SKILLS.Centaurian]: 'intelligence',
  [SKILLS.Impish]: 'intelligence',
  [SKILLS.Lockpicking]: 'agility',
  [SKILLS.Mercantile]: 'personality',
  [SKILLS.Pickpocket]: 'agility',
  [SKILLS.Stealth]: 'agility',
  [SKILLS.Swimming]: 'endurance',
  [SKILLS.Climbing]: 'strength',
  [SKILLS.Backstabbing]: 'agility',
  [SKILLS.Dodging]: 'agility',
  [SKILLS.Running]: 'speed',
  [SKILLS.Destruction]: 'willpower',
  [SKILLS.Restoration]: 'willpower',
  [SKILLS.Illusion]: 'willpower',
  [SKILLS.Alteration]: 'willpower',
  [SKILLS.Thaumaturgy]: 'willpower',
  [SKILLS.Mysticism]: 'willpower',
  [SKILLS.ShortBlade]: 'agility',
  [SKILLS.LongBlade]: 'agility',
  [SKILLS.HandToHand]: 'agility',
  [SKILLS.Axe]: 'strength',
  [SKILLS.BluntWeapon]: 'strength',
  [SKILLS.Archery]: 'agility',
  [SKILLS.CriticalStrike]: 'agility',
});

/**
 * Capitalized localized name of an attribute.
 */
export function statName(key) {
  if (!key) return '';
  const cap = key.charAt(0).toUpperCase() + key.slice(1);
  return t(`levelup.attr.${key}`, cap);
}

/**
 * Base explanation blurb for an attribute (from Port_Strings / levelup.blurb).
 */
export function statBaseBlurb(key) {
  switch (key) {
    case 'strength':
      return t('levelup.blurb.strength', 'Raises the damage of every hit you land and how much you can carry.');
    case 'intelligence':
      return t('levelup.blurb.intelligence', "Sets your maximum magicka: Intelligence times your class's multiplier.");
    case 'willpower':
      return t('levelup.blurb.willpower', 'Resists spells: a tenth of your Willpower is added to every saving throw.');
    case 'agility':
      return t('levelup.blurb.agility', "Raises your chance to hit and lowers the enemy's chance to hit you.");
    case 'endurance':
      return t('levelup.blurb.endurance', 'Raises the health you gain on every level-up, your starting health, and how fast you heal when resting.');
    case 'personality':
      return t('levelup.blurb.personality', 'Better prices, friendlier townspeople and better odds in court.');
    case 'speed':
      return t('levelup.blurb.speed', 'Makes you move and swing your weapon faster.');
    case 'luck':
      return t('levelup.blurb.luck', 'A gentle modifier on every roll in the game: hit chances, dodging, critical strikes, and saving throws.');
    default:
      return '';
  }
}

/**
 * Format a dynamic attribute tooltip combining base role and live values/thresholds.
 * @param {string} statKey
 * @param {number} value
 * @param {{ spellMultiplier?: number }} [options]
 */
export function statTooltip(statKey, value = 50, { spellMultiplier = 0.5 } = {}) {
  const v = Math.max(0, Math.min(100, Math.trunc(value)));
  const blurb = statBaseBlurb(statKey);
  const lines = [blurb];

  switch (statKey) {
    case 'strength': {
      const dmg = damageModifier(v);
      const enc = maxEncumbrance(v);
      const signedDmg = dmg > 0 ? `+${dmg}` : `${dmg}`;
      const nextThreshold = v < 100 ? 50 + (dmg + 1) * 5 : 100;
      let line = t('tooltip.stat.str.details', 'Damage mod: {dmg} | Max carry: {enc} kg', { dmg: signedDmg, enc });
      if (v < 100 && nextThreshold <= 100) {
        line += `\n` + t('tooltip.stat.str.next', 'Next +1 damage at {thresh} Strength', { thresh: nextThreshold });
      }
      lines.push(line);
      break;
    }
    case 'intelligence': {
      const sp = spellPointsFor(v, spellMultiplier);
      lines.push(t('tooltip.stat.int.details', 'Max Spell Points (SP): {sp} (multiplier x{mult})', { sp, mult: spellMultiplier }));
      break;
    }
    case 'willpower': {
      const mr = magicResist(v);
      lines.push(t('tooltip.stat.wil.details', 'Magic Resistance: +{mr}% to spell saving throws', { mr }));
      break;
    }
    case 'agility': {
      const hit = toHitModifier(v);
      const signedHit = hit > 0 ? `+${hit}` : `${hit}`;
      lines.push(t('tooltip.stat.agi.details', 'To-hit modifier: {hit}% | Dodging modifier: {hit}%', { hit: signedHit }));
      break;
    }
    case 'endurance': {
      const hpMod = hitPointsModifier(v);
      const healMod = healingRateModifier(v);
      const signedHp = hpMod > 0 ? `+${hpMod}` : `${hpMod}`;
      const signedHeal = healMod > 0 ? `+${healMod}` : `${healMod}`;
      lines.push(t('tooltip.stat.end.details', 'Health gain per level: {hp} HP | Resting heal rate: {heal}%', { hp: signedHp, heal: signedHeal }));
      break;
    }
    case 'speed':
    case 'personality':
    case 'luck':
      break;
  }

  return lines.join('\n\n');
}

/**
 * Fallback description for each skill.
 */
const SKILL_DESCRIPTIONS = Object.freeze({
  medical: 'Governs how effectively you heal injuries and wounds when resting or bandaging.',
  etiquette: 'Diplomatic speech with nobles, knights, scholars, and temple priests.',
  streetwise: 'Street-smart speech with criminals, rogues, thieves, and commoners.',
  jumping: 'Governs the maximum height and distance you can jump.',
  orcish: 'Language skill to pacify hostile Orcs upon entering combat.',
  harpy: 'Language skill to pacify hostile Harpies upon entering combat.',
  giantish: 'Language skill to pacify hostile Giants and Gargoyles upon entering combat.',
  dragonish: 'Language skill to pacify hostile Dragonlings upon entering combat.',
  nymph: 'Language skill to pacify hostile Nymphs upon entering combat.',
  daedric: 'Language skill to pacify hostile Daedra upon entering combat.',
  spriggan: 'Language skill to pacify hostile Spriggans upon entering combat.',
  centaurian: 'Language skill to pacify hostile Centaurs upon entering combat.',
  impish: 'Language skill to pacify hostile Imps upon entering combat.',
  lockpicking: 'Governs the chance to pick locked doors and treasure chests.',
  mercantile: 'Improves buying and selling prices at merchants and armorers.',
  pickpocket: 'Governs the chance to successfully steal items from NPCs without being caught.',
  stealth: 'Reduces enemy detection range and awareness when sneaking.',
  swimming: 'Increases swim speed and reduces fatigue loss while swimming or diving.',
  climbing: 'Governs the ability to scale steep surfaces, dungeon walls, and battlements.',
  backstabbing: 'Governs the chance to land a triple-damage (3x) critical strike from behind.',
  dodging: 'Lowers enemies chance to hit you in melee combat (reduces incoming hit rate).',
  running: 'Increases foot movement speed and reduces fatigue spent while running.',
  destruction: 'Reduces casting cost and increases success of offensive damaging spells.',
  restoration: 'Reduces casting cost and increases success of healing and curing spells.',
  illusion: 'Reduces casting cost and increases success of light, charm, and invisibility spells.',
  alteration: 'Reduces casting cost and increases success of shield, jumping, and water spells.',
  thaumaturgy: 'Reduces casting cost and increases success of levitation, pacify, and teleport spells.',
  mysticism: 'Reduces casting cost and increases success of spell reflection and absorption spells.',
  shortBlade: 'Governs hit chance with short blades: Daggers, Tantos, Shortswords, Wakizashis.',
  longBlade: 'Governs hit chance with long blades: Broadswords, Longswords, Sabers, Claymores, Katanas.',
  handToHand: 'Governs unarmed combat hit chance and fist damage.',
  axe: 'Governs hit chance with Battle Axes and War Axes.',
  bluntWeapon: 'Governs hit chance with Staves, Maces, Flails, and Warhammers.',
  archery: 'Governs hit chance and arrow accuracy with Short Bows and Long Bows.',
  criticalStrike: 'Adds a chance to land a critical strike (+skill/10 to-hit and bonus damage).',
});

/**
 * Returns localized skill description.
 * @param {number} skillId
 */
export function skillDescription(skillId) {
  const key = Object.keys(SKILLS).find((k) => SKILLS[k] === skillId);
  if (!key) return '';
  const lower = key.charAt(0).toLowerCase() + key.slice(1);
  const fallback = SKILL_DESCRIPTIONS[lower] ?? '';
  return t(`skill.desc.${lower}`, fallback);
}

/**
 * Full tooltip for a skill.
 * @param {number} skillId
 * @param {number} [skillValue]
 * @param {{ group?: string, career?: any }} [options]
 */
export function skillTooltip(skillId, skillValue = 0, { group = null, career = null } = {}) {
  const desc = skillDescription(skillId);
  const lines = [desc];

  // Governing attribute
  const govStat = SKILL_GOVERNING_STAT[skillId];
  if (govStat) {
    lines.push(t('tooltip.skill.governing', 'Governing Attribute: {stat}', { stat: statName(govStat) }));
  }

  // Leveling impact (Primary / Major / Minor / Misc)
  let effectiveGroup = group;
  if (!effectiveGroup && career) {
    if (career.primarySkills?.includes(skillId)) effectiveGroup = 'primary';
    else if (career.majorSkills?.includes(skillId)) effectiveGroup = 'major';
    else if (career.minorSkills?.includes(skillId)) effectiveGroup = 'minor';
    else effectiveGroup = 'misc';
  }
  if (effectiveGroup) {
    const g = effectiveGroup.toLowerCase();
    if (g === 'primary' || g === 'major') {
      lines.push(t('tooltip.skill.role.advancing', 'Class Skill ({group}): advances your character level.', { group: g.charAt(0).toUpperCase() + g.slice(1) }));
    } else if (g === 'minor') {
      lines.push(t('tooltip.skill.role.minor', 'Minor Skill: contributes to level-up progress when raised.'));
    } else if (g === 'misc') {
      lines.push(t('tooltip.skill.role.misc', 'Miscellaneous Skill: does not advance character level.'));
    }
  }

  // Dynamic skill-specific formulas
  if (skillId === SKILLS.HandToHand) {
    const minDmg = handToHandMinDamage(skillValue);
    const maxDmg = handToHandMaxDamage(skillValue);
    lines.push(t('tooltip.skill.h2h.damage', 'Unarmed damage at {skill}%: {min}\u2013{max}', { skill: skillValue, min: minDmg, max: maxDmg }));
  } else if (skillId === SKILLS.CriticalStrike) {
    const hitBonus = Math.floor(skillValue / 10);
    lines.push(t('tooltip.skill.crit.bonus', 'Critical chance: {skill}% (+{bonus}% to hit)', { skill: skillValue, bonus: hitBonus }));
  } else if (skillId === SKILLS.Backstabbing) {
    lines.push(t('tooltip.skill.backstab.bonus', 'Backstab multiplier: 3x damage on successful stealth hit'));
  } else if (skillId >= SKILLS.Destruction && skillId <= SKILLS.Mysticism) {
    const costMult = Math.max(0.1, 1.1 - skillValue / 100);
    const discount = Math.round((1 - costMult) * 100);
    if (discount > 0) {
      lines.push(t('tooltip.skill.magic.discount', 'Spell cost reduction at {skill}%: -{discount}% SP', { skill: skillValue, discount }));
    }
  }

  return lines.join('\n\n');
}

/**
 * Formatted difficulty points label for advantages / disadvantages.
 * e.g. "+10 pts" or "-14 pts".
 * @param {string} primary
 * @param {string} [secondary]
 */
export function advDisCost(primary, secondary = '') {
  const points = advDisAdjustment(primary, secondary);
  if (!points) return '0 pts';
  const prefix = points > 0 ? '+' : '';
  const unit = Math.abs(points) === 1 ? 'pt' : 'pts';
  return t('customclass.points.formatted', '{prefix}{points} {unit}', { prefix, points, unit });
}

/**
 * Returns cost range or exact cost for a primary item before secondary is chosen.
 * @param {string} primary
 */
export function advDisCostRange(primary) {
  const secondaries = secondaryListFor(primary);
  if (!secondaries || !secondaries.length) {
    return advDisCost(primary);
  }
  const costs = secondaries.map((sec) => advDisAdjustment(primary, sec));
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  if (min === max) {
    return advDisCost(primary, secondaries[0]);
  }
  const minPref = min > 0 ? '+' : '';
  const maxPref = max > 0 ? '+' : '';
  return `${minPref}${min}..${maxPref}${max} pts`;
}

/**
 * Fallback description for advantages / disadvantages.
 */
const ADVDIS_DESCRIPTIONS = Object.freeze({
  acuteHearing: 'Increases the distance at which you can hear monsters and footsteps behind doors and walls.',
  adrenalineRush: 'Grants combat bonuses to hit and dodge when your health drops below 1/8 (12.5%).',
  athleticism: 'Reduces fatigue spent when running, swimming, jumping, and climbing.',
  bonusToHit: 'Grants a +9% bonus to hit against enemies of the selected type.',
  expertiseIn: 'Grants +2 bonus damage and improved accuracy (+skill/10 to-hit) with the chosen weapon category.',
  immunity: 'Provides 100% immunity (automatic saving throw success) against the chosen effect.',
  increasedMagery: 'Multiplies your maximum spell points (magicka) pool based on your Intelligence.',
  rapidHealing: 'Accelerates natural health recovery rate while resting (2x to 3x normal rate).',
  regenerateHealth: 'Continuously regenerates health over time under the specified condition.',
  resistance: 'Grants a +50% bonus to saving throws against the chosen effect.',
  spellAbsorption: 'Grants a chance to absorb hostile incoming spells and refill your spell points.',
  criticalWeakness: 'Suffers guaranteed failure on saving throws and takes double damage from the chosen effect.',
  damage: 'Takes continuous damage over time under the specified condition.',
  darknessPoweredMagery: 'Spellcasting ability is lowered or completely disabled in daylight hours.',
  forbiddenArmorType: 'Prohibits equipping armor of the chosen weight category (Leather, Chain, or Plate).',
  forbiddenMaterial: 'Prohibits equipping weapons and armor forged from the chosen material.',
  forbiddenShieldTypes: 'Prohibits equipping shields of the chosen type.',
  forbiddenWeaponry: 'Prohibits equipping weapons of the chosen category.',
  inabilityToRegen: 'Spell points do not regenerate naturally during sleep (requires potions or absorption).',
  lightPoweredMagery: 'Spellcasting ability is lowered or completely disabled in darkness and night.',
  lowTolerance: 'Suffers a -50% penalty to saving throws against the chosen effect.',
  phobia: 'Suffers a -9% penalty to hit against enemies of the chosen type.',
});

/**
 * Full tooltip for an advantage or disadvantage.
 * @param {string} primary
 * @param {string} [secondary]
 */
export function advDisTooltip(primary, secondary = '') {
  const fallback = ADVDIS_DESCRIPTIONS[primary] ?? '';
  const desc = t(`advdis.desc.${primary}`, fallback);
  const lines = [desc];

  if (secondary) {
    const secName = labelFor(secondary) || secondary;
    lines.push(t('tooltip.advdis.target', 'Target / Condition: {target}', { target: secName }));
    const pts = advDisAdjustment(primary, secondary);
    const pref = pts > 0 ? '+' : '';
    const mult = advancementMultiplier(pts);
    const speedPct = Math.round((mult - 1) * 100);
    const speedStr = speedPct > 0 ? `+${speedPct}% slower leveling` : speedPct < 0 ? `${Math.abs(speedPct)}% faster leveling` : 'normal leveling rate';
    lines.push(t('tooltip.advdis.impact', 'Difficulty Dagger: {prefix}{pts} pts ({speed})', { prefix: pref, pts, speed: speedStr }));
  } else {
    const secondaries = secondaryListFor(primary);
    if (!secondaries || !secondaries.length) {
      const pts = advDisAdjustment(primary);
      const pref = pts > 0 ? '+' : '';
      lines.push(t('tooltip.advdis.impact.fixed', 'Difficulty Dagger: {prefix}{pts} pts', { prefix: pref, pts }));
    } else {
      lines.push(t('tooltip.advdis.impact.range', 'Difficulty Dagger: {range}', { range: advDisCostRange(primary) }));
    }
  }

  return lines.join('\n\n');
}
