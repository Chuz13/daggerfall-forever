import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  APOTHEOSIS_STAGES,
  APOTHEOSIS_QUEST_STEPS,
  APOTHEOSIS_SOURCES,
  REQUIRED_FATE_WEIGHT,
  ensureApotheosisState,
  evaluateMantellaFork,
  isApotheosisStormActive,
  startApotheosisQuestline,
  advanceApotheosisQuestStep,
  completeApotheosisQuestline,
  startApotheosisFromMantella,
  startApotheosisFromArtifacts,
  canStartApotheosisViaArtifacts,
  setMantellanCruxPresenceChecker,
  selectApotheosisPortfolio,
  setDebugFateWeight,
  resetApotheosisForDebug,
  grantArtifactPack,
  scanInventoryArtifactsForApotheosis,
} from '../../src/systems/apotheosis/apotheosisCore.js';
import {
  APOTHEOSIS_BASE_HP_BONUS,
  APOTHEOSIS_BASE_MP_BONUS,
  APOTHEOSIS_BASE_FATIGUE_POINTS,
  APOTHEOSIS_REBIRTH_MINUTES,
  SHADOW_DAMAGE_RESIST_MULT,
  isAscendedGod,
  apotheosisHpOf,
  apotheosisMpOf,
  apotheosisFatigueOf,
  computeApotheosisPortfolioMods,
  apotheosisWeaponDamageMod,
  computeShadowResistProfile,
  mitigateShadowDamage,
  setApotheosisRebirthHook,
  reconstituteAscendedGod,
  getApotheosisFlashState,
  tickApotheosisScreenFlash,
  setActiveApotheosisPlayer,
} from '../../src/systems/apotheosis/apotheosisLive.js';
import {
  DIRENNI_TOWER_MAP_ID,
  MANTELLAN_CRUX_MAP_ID,
  DIRENNI_SIEGE_TOTAL_WAVES,
  DIRENNI_SIEGE_FALLBACK_S,
  DIRENNI_SIEGE_MAX_DIST_M,
  isDirenniTowerLocation,
  isMantellanCruxLocation,
  isDirenniHardModeActive,
  rollDirenniForcedTraits,
  applyDirenniForcedTraits,
  handleMantellaCruxTouch,
  createDirenniSiegeController,
  pickZeroStoneSpot,
  createDirenniInteriorReinforcer,
  configureShadowEntity,
  describeShadowResistances,
  pickShadowMobileType,
  spawnShadowOfTheAgent,
  APOTHEOSIS_STORM_WEATHER_INTERVAL_SEC,
  APOTHEOSIS_STORM_WEATHERS,
  APOTHEOSIS_STORM_TIME_SPAN_MINUTES,
  pickNextApotheosisStormWeather,
  pickNextApotheosisStormMinutes,
  findSafeSiegeSpawnPos,
} from '../../src/systems/apotheosis/apotheosisStage1.js';
import {
  skyMinutes,
  worldMinutes,
  setWorldMinutes,
  setSkyMinutesOverride,
  getSkyMinutesOverride,
} from '../../src/systems/worldTick.js';
import { getTargets, PLAYER_TARGET } from '../../src/characters/enemy/enemyTargets.js';
import { selectApotheosisSection, releaseApotheosisPane } from '../../src/ui/apotheosisPane.js';
import { SKILLS } from '../../src/systems/skills.js';
import { defineLiveMaxHealth, defineLiveMaxMagicka } from '../../src/systems/chargen.js';
import { maxFatigue, FATIGUE_MULTIPLIER } from '../../src/systems/statMods.js';
import {
  computeEntityMods,
  entityStatMod,
  entitySkillMod,
  entityArmorPoints,
  entityResistMod,
  weaponDamageMods,
} from '../../src/systems/entityMods.js';
import { forcePlayerDeath, hurtPlayer, playerEntity } from '../../src/characters/playerEntity.js';
import { calculateAttackDamage, registerAttackResolutionListener } from '../../src/combat/formulas.js';
import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';
import { EQUIP_SLOTS, equipTableOf } from '../../src/systems/equip.js';
import {
  apotheosisOrreryLocation,
  isApotheosisOrrery,
  apotheosisOrrerySpawnPoints,
  apotheosisOrreryArena,
  apotheosisOrreryBlocks,
  apotheosisOrreryLights,
} from '../../src/world/superDungeon/sdRealm.js';
import { dungeonTierLabel } from '../../src/world/dungeon/dungeonLabel.js';
import { wildGiantSize } from '../../src/systems/wild/wildZone.js';
import { executeConsoleCommand, setDebugSceneContext } from '../../src/systems/consoleCommands.js';
import { _resetTextManagerForTests } from '../../src/systems/textManager.js';
import { _resetForTests as resetPrefs, setPref } from '../../src/systems/uiPrefs.js';
import { snapshotDiscovery, restoreDiscovery } from '../../src/systems/discovery.js';
import { createQuestBridge } from '../../src/scenes/quest/questBridge.js';
import { QUESTLINES_PREF } from '../../src/systems/questlines/qlLaw.js';
import { questSource, loadTables as loadPackTables } from '../qlSources.mjs';
import { readFileSync } from 'node:fs';
import { SHADOW_BOSS_SPELLS, enemySpellIndices } from '../../src/systems/enemySpells.js';
import { blowCooldown } from '../../src/ai/tells.js';
import { EnemyAI } from '../../src/characters/enemy/enemyMotor.js';

function makeActor(id = 'hero_st1') {
  const e = {
    isPlayer: true,
    name: 'Agent',
    characterId: id,
    level: 14,
    careerIndex: 12,
    career: { hitPointsPerLevel: 12, abilityFlagsAndSpellPointsBitfield: 0 },
    maxHealth: 200,
    rawMaxHealth: 200,
    health: 200,
    maxMagicka: 120,
    magicka: 120,
    fatigue: 2560,
    stats: {
      strength: 65,
      intelligence: 70,
      willpower: 60,
      agility: 65,
      endurance: 70,
      personality: 55,
      speed: 65,
      luck: 55,
    },
    skills: {
      [SKILLS.LongBlade]: 82,
      [SKILLS.Destruction]: 78,
      [SKILLS.Restoration]: 65,
    },
    items: [],
    activeEffects: [],
    spells: [],
    goldPieces: 0,
    bankAccounts: [],
    houses: [],
  };
  defineLiveMaxHealth(e);
  defineLiveMaxMagicka(e);
  return e;
}

let savedLocalStorageDescriptor;
let initialDiscoverySnap;

function installMemoryStorage() {
  const store = new Map();
  const mock = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mock, configurable: true, writable: true });
}

beforeEach(() => {
  savedLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  initialDiscoverySnap = snapshotDiscovery();
  installMemoryStorage();
  _resetTextManagerForTests();
  resetPrefs();
  setApotheosisRebirthHook(null);
  setActiveApotheosisPlayer(null);
});

afterEach(() => {
  setApotheosisRebirthHook(null);
  setActiveApotheosisPlayer(null);
  restoreDiscovery(initialDiscoverySnap);
  if (savedLocalStorageDescriptor) {
    Object.defineProperty(globalThis, 'localStorage', savedLocalStorageDescriptor);
  } else {
    delete globalThis.localStorage;
  }
});

test('Mantella fork gating, mutual exclusion, two-step DecisionBoxWindow, and storm activation', () => {
  const hero = makeActor('mantella_test');
  const cruxLoc = { mapTableData: { mapId: MANTELLAN_CRUX_MAP_ID }, name: 'Mantellan Crux' };
  assert.equal(isMantellanCruxLocation(cruxLoc), true);
  assert.equal(isDirenniTowerLocation(cruxLoc), false);

  // Fate Weight < 16 -> rejected
  assert.equal(evaluateMantellaFork(hero).eligible, false);
  assert.equal(evaluateMantellaFork(hero).reason, 'fate_weight');
  let blockedMsg = '';
  const rejected = handleMantellaCruxTouch({
    dfLocation: cruxLoc,
    playerEntity: hero,
    say: (m) => { blockedMsg = m; },
    presentWindow: () => { assert.fail('should not open modal when ineligible'); },
  });
  assert.equal(rejected, false);
  assert.ok(blockedMsg.includes('Fate Weight'));

  // With Fate Weight >= 16 -> opens two-step Yes -> OK modal -> usurps Mantella & starts Dragon Break storm
  setDebugFateWeight(hero, REQUIRED_FATE_WEIGHT);
  assert.equal(evaluateMantellaFork(hero).eligible, true);
  assert.equal(isApotheosisStormActive(hero), false);

  const windows = [];
  let usurpExited = false;
  const handled = handleMantellaCruxTouch({
    dfLocation: cruxLoc,
    playerEntity: hero,
    presentWindow: (w) => { windows.push(w); },
    onUsurpExit: () => { usurpExited = true; },
  });
  assert.equal(handled, true);
  assert.equal(windows.length, 1);

  // Choose YES -> spawns OK consequence window -> confirm exits cleanly into Dragon Break
  windows[0].answer(true);
  assert.equal(windows.length, 2);
  assert.equal(windows[1].ok, true);
  assert.equal(hero.apotheosis.stage, APOTHEOSIS_STAGES.QUESTLINE_ACTIVE);
  assert.equal(hero.apotheosis.source, APOTHEOSIS_SOURCES.MANTELLA);
  assert.equal(hero.apotheosis.questStep, APOTHEOSIS_QUEST_STEPS.DRAGON_BREAK);
  assert.equal(isApotheosisStormActive(hero), true);
  assert.equal(usurpExited, false);
  windows[1].answer(true);
  assert.equal(usurpExited, true);

  // Test NO branch -> returns Mantella cleanly via vanilla callback without starting Apotheosis
  resetApotheosisForDebug(hero);
  setDebugFateWeight(hero, REQUIRED_FATE_WEIGHT);
  const noWindows = [];
  let vanillaConfirmed = false;
  handleMantellaCruxTouch({
    dfLocation: cruxLoc,
    playerEntity: hero,
    presentWindow: (w) => { noWindows.push(w); },
    onVanillaConfirm: () => { vanillaConfirmed = true; },
  });
  noWindows[0].answer(false);
  assert.equal(noWindows.length, 2);
  assert.equal(vanillaConfirmed, false);
  noWindows[1].answer(true);
  assert.equal(vanillaConfirmed, true);
  assert.equal(hero.apotheosis.stage, APOTHEOSIS_STAGES.MORTAL);

  // Mutual exclusion: starting via 13 Artifacts blocks Mantella fork
  grantArtifactPack(hero, 15);
  const scan = scanInventoryArtifactsForApotheosis(hero);
  const sel = scan.distinctUnequippedSubTypes
    .slice(0, 13)
    .map((sub) => scan.unequippedEntries.find((x) => x.subType === sub).item);
  const artStart = startApotheosisFromArtifacts(hero, sel);
  assert.equal(artStart.ok, true);
  assert.equal(evaluateMantellaFork(hero).eligible, false);
  assert.equal(evaluateMantellaFork(hero).reason, 'exclusive');
  assert.equal(isApotheosisStormActive(hero), true);

  // Storm shuts off once questline completes (after Shadow defeat)
  advanceApotheosisQuestStep(hero, APOTHEOSIS_QUEST_STEPS.SHADOW_DUEL);
  assert.equal(isApotheosisStormActive(hero), true);
  completeApotheosisQuestline(hero);
  assert.equal(isApotheosisStormActive(hero), false);
  assert.equal(hero.apotheosis.stage, APOTHEOSIS_STAGES.AWAITING_PORTFOLIO);
});

test('13-Wave Direnni Siege: wave escalation, 35s fallback timer, >95m retreat cleanup, and 3x 3-phase boss', async () => {
  const hero = makeActor('siege_hero');
  setDebugFateWeight(hero, REQUIRED_FATE_WEIGHT);
  startApotheosisFromMantella(hero);

  let pos = [100, 10, 100];
  let mode = 'exterior';
  const spawned = [];
  const removed = [];
  let playerHurt = 0;

  const siege = createDirenniSiegeController({
    playerEntity: hero,
    getPlayerPos: () => pos,
    getPlayerMode: () => mode,
    groundAt: () => 10,
    spawnFoe: async (mobileType) => {
      const f = {
        mobileType,
        dead: false,
        _gone: false,
        hitFlash: 0,
        entity: {
          name: `Foe_${mobileType}`,
          health: 100,
          maxHealth: 100,
          damageScale: 1,
          items: [],
          activeEffects: [],
        },
      };
      spawned.push(f);
      return f;
    },
    removeFoe: (f) => {
      f._gone = true;
      removed.push(f);
    },
    hurtPlayer: (dmg) => { playerHurt += dmg; },
  });

  // Start Wave 1
  assert.equal(siege.start({ anchorPos: [100, 10, 100] }), true);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(siege.active, true);
  assert.equal(siege.wave, 1);
  assert.equal(hero.apotheosis.questStep, APOTHEOSIS_QUEST_STEPS.TOWER_SIEGE);
  assert.ok(spawned.length >= 3);

  // Fallback 35s timer advances to Wave 2 even if Wave 1 foes stay alive
  siege.tick(DIRENNI_SIEGE_FALLBACK_S + 0.1);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(siege.wave, 2);

  // Retreating >95m despawns all foes without killing them and resets siege
  pos = [100 + DIRENNI_SIEGE_MAX_DIST_M + 10, 10, 100];
  siege.tick(0.2);
  assert.equal(siege.active, false);
  assert.equal(hero.apotheosis.towerSiegeCleared, false);
  assert.equal(removed.length, spawned.length);
  assert.ok(removed.every((f) => f._gone && !f.dead), 'retreat uses removeFoe, not lethal kill');

  // Re-engage at Wave 13 -> spawns 3x-scale 3-phase Aspect of the Tower boss + ground telegraphs
  pos = [100, 10, 100];
  assert.equal(siege.start({ startWaveNum: DIRENNI_SIEGE_TOTAL_WAVES, anchorPos: [100, 10, 100] }), true);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(siege.wave, DIRENNI_SIEGE_TOTAL_WAVES);
  assert.ok(siege.bossFoe, 'Wave 13 boss spawned');
  assert.equal(siege.bossFoe.entity.sizeScale, 3);
  assert.equal(wildGiantSize(siege.bossFoe.entity), 3, 'wildZone scaling reads sizeScale = 3');
  assert.equal(siege.bossPhase, 1);

  // Advance timers to generate a ground telegraph and trigger phase 2 (66% HP) and phase 3 (33% HP)
  siege.tick(3.5);
  assert.ok(siege.getTelegraphDrawables().length >= 1, 'telegraph circles exposed for drawFoeTelegraphs');
  siege.tick(2.0);
  assert.ok(playerHurt > 0, 'detonating telegraph damages player standing inside AoE radius');

  siege.bossFoe.entity.health = Math.floor(siege.bossFoe.entity.maxHealth * 0.5);
  siege.tick(0.2);
  assert.equal(siege.bossPhase, 2);

  siege.bossFoe.entity.health = Math.floor(siege.bossFoe.entity.maxHealth * 0.2);
  siege.tick(0.2);
  assert.equal(siege.bossPhase, 3);

  // Killing the Aspect boss clears the siege and unseals Direnni Tower interior
  siege.bossFoe.entity.health = 0;
  siege.bossFoe.dead = true;
  siege.tick(0.1);
  assert.equal(siege.active, false);
  assert.equal(hero.apotheosis.towerSiegeCleared, true);
  assert.equal(hero.apotheosis.questStep, APOTHEOSIS_QUEST_STEPS.TOWER_INTERIOR);
});

test('Direnni Interior Hard-Mode: strict location+step scoping, forced traits (100% 1st / 50% 2nd), and periodic reinforcer', async () => {
  const hero = makeActor('direnni_int');
  const direnniLoc = { mapTableData: { mapId: DIRENNI_TOWER_MAP_ID }, name: 'Direnni Tower' };
  const otherDungeon = { mapTableData: { mapId: 12345 }, name: 'Privateer Hold' };

  assert.equal(isDirenniTowerLocation(direnniLoc), true);
  assert.equal(isDirenniHardModeActive(direnniLoc, hero), false);

  setDebugFateWeight(hero, REQUIRED_FATE_WEIGHT);
  startApotheosisFromMantella(hero);
  // During dragon_break / tower_siege, interior hard mode is NOT active yet
  assert.equal(isDirenniHardModeActive(direnniLoc, hero), false);

  advanceApotheosisQuestStep(hero, APOTHEOSIS_QUEST_STEPS.TOWER_INTERIOR, { towerSiegeCleared: true });
  assert.equal(isDirenniHardModeActive(direnniLoc, hero), true);
  assert.equal(isDirenniHardModeActive(otherDungeon, hero), false);

  // Forced traits: 100% 1 trait when roll >= 0.5, 2 traits when roll < 0.5
  const t1 = rollDirenniForcedTraits(() => 0.75);
  assert.equal(t1.length, 1);
  const t2 = rollDirenniForcedTraits(() => 0.25);
  assert.equal(t2.length, 2);

  const foeEnt = { name: 'Tower Guard', maxHealth: 100, health: 100, activeEffects: [] };
  const applied = applyDirenniForcedTraits(foeEnt, () => 0.2);
  assert.equal(applied.length, 2);
  assert.equal(foeEnt.direnniHardMode, true);
  assert.ok(foeEnt.health > 100);

  // Allies are never touched
  const ally = { name: 'Summon', allied: true, maxHealth: 100, health: 100 };
  assert.deepEqual(applyDirenniForcedTraits(ally), []);

  // Zero Stone placement prefers reachable 24..55m spot
  const stoneSpot = pickZeroStoneSpot([0, 0, 0], [{ x: 32, y: 2, z: 10 }, { x: 4, y: 0, z: 4 }]);
  assert.deepEqual(stoneSpot, [32, 2, 10]);

  // Periodic interior reinforcer only ticks when hard mode active
  let reinforcerSpawns = 0;
  const reinforcer = createDirenniInteriorReinforcer({
    isActive: () => isDirenniHardModeActive(direnniLoc, hero),
    getPlayerPos: () => [0, 0, 0],
    getFoes: () => [],
    spawnLooseFoe: async () => {
      reinforcerSpawns++;
      return { entity: { maxHealth: 80, health: 80 } };
    },
  });
  reinforcer.tick(30);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reinforcerSpawns, 1);

  completeApotheosisQuestline(hero);
  assert.equal(isDirenniHardModeActive(direnniLoc, hero), false);
});

test('Cut Clockwork Orrery & Shadow of the Agent: mirrored gear/stats and anti-abuse >100/top-skill 70% damage reduction', async () => {
  // Cut Orrery realm primitives
  const orreryLoc = apotheosisOrreryLocation({ regionIndex: 17, regionName: 'Isle of Balfiera' });
  assert.equal(isApotheosisOrrery(orreryLoc), true);
  assert.equal(dungeonTierLabel(orreryLoc), null);
  assert.equal(orreryLoc.dungeon.blocks.length, 1);
  const orreryBlocks = apotheosisOrreryBlocks();
  const blockIdx = orreryBlocks.getBlockIndex(orreryLoc.dungeon.blocks[0].blockName);
  assert.ok(blockIdx > 0);
  assert.equal(orreryBlocks.getBlock(blockIdx)?.name, 'APOORRERY.RDB');
  assert.equal(apotheosisOrreryLights().length, 8);

  const pts = apotheosisOrrerySpawnPoints();
  const arena = apotheosisOrreryArena();
  assert.equal(arena.clamp(pts.player, 0.45), null, 'Orrery bounds return null when player is already inside disc');
  const clamped = arena.clamp([pts.center[0] + 200, pts.player[1], pts.center[2]]);
  const distFromCenter = Math.hypot(clamped[0] - pts.center[0], clamped[1] - pts.center[2]);
  assert.ok(distFromCenter <= pts.radius + 0.01, 'Orrery circular bounds clamp player cleanly inside disc');

  // Shadow resistance snapshot: multi-mastery player with BOTH >100 martial skills & >100 magic skills
  const hybridHero = makeActor('hybrid_master');
  hybridHero.skills[SKILLS.LongBlade] = 125;
  hybridHero.skills[SKILLS.Axe] = 110;
  hybridHero.skills[SKILLS.Archery] = 104;
  hybridHero.skills[SKILLS.Destruction] = 130;
  hybridHero.skills[SKILLS.Mysticism] = 108;
  equipTableOf(hybridHero)[EQUIP_SLOTS.RightHand] = { name: 'Daedric Dai-Katana', templateIndex: 120, value: 5000 };

  const prof = computeShadowResistProfile(hybridHero);
  assert.deepEqual(
    prof.martialSkills.sort((a, b) => a - b),
    [SKILLS.LongBlade, SKILLS.Axe, SKILLS.Archery].sort((a, b) => a - b),
  );
  assert.deepEqual(
    prof.magicSchools.sort((a, b) => a - b),
    [SKILLS.Destruction, SKILLS.Mysticism].sort((a, b) => a - b),
  );
  assert.equal(prof.multiplier, SHADOW_DAMAGE_RESIST_MULT);

  const shadowEnt = { stats: { strength: 50, intelligence: 50, willpower: 50 }, equipTable: new Array(30).fill(null) };
  configureShadowEntity(shadowEnt, hybridHero);
  assert.equal(shadowEnt.shadowBoss, true);
  assert.ok(equipTableOf(shadowEnt)[EQUIP_SLOTS.RightHand], 'equipped gear cloned onto Shadow');
  assert.ok(describeShadowResistances(prof).length > 0);
  assert.equal(pickShadowMobileType(hybridHero), MOBILE_TYPES.Knight);

  // Even unequipping weapon before/during fight does NOT drop resistance: all >100 & top skills remain mitigated
  equipTableOf(hybridHero)[EQUIP_SLOTS.RightHand] = null;
  const reducedLongBlade = mitigateShadowDamage(100, { target: shadowEnt, skillId: SKILLS.LongBlade });
  const reducedAxe = mitigateShadowDamage(100, { target: shadowEnt, skillId: SKILLS.Axe });
  const reducedDestr = mitigateShadowDamage(100, { target: shadowEnt, schoolId: SKILLS.Destruction });
  const unresistedBlunt = mitigateShadowDamage(100, { target: shadowEnt, skillId: SKILLS.BluntWeapon });
  assert.equal(reducedLongBlade, 30);
  assert.equal(reducedAxe, 30);
  assert.equal(reducedDestr, 30);
  assert.equal(unresistedBlunt, 100);

  // Live combat formula integration (calculateAttackDamage reports notes.shadowResisted & cuts damage by 70%)
  const normalTarget = { stats: { strength: 50, intelligence: 50, willpower: 50 }, equipTable: new Array(30).fill(null) };
  const weapon = { name: 'Steel Claymore', templateIndex: 118, currentCondition: 500, maxCondition: 500, weight: 8 };
  let lastResolution = null;
  registerAttackResolutionListener('apo_stage1_test', (r) => { lastResolution = r; });
  try {
    const baselineDmg = calculateAttackDamage(hybridHero, normalTarget, { weapon, rolls: () => 0.1, dfRand: () => 5 });
    const shadowDmg = calculateAttackDamage(hybridHero, shadowEnt, { weapon, rolls: () => 0.1, dfRand: () => 5 });
    assert.ok(baselineDmg > 0, `expected baseline hit > 0, got ${baselineDmg}`);
    assert.equal(lastResolution?.shadowResisted, true);
    assert.equal(shadowDmg, Math.max(1, Math.round(baselineDmg * SHADOW_DAMAGE_RESIST_MULT)));
  } finally {
    registerAttackResolutionListener('apo_stage1_test', null);
  }

  // Spawn helper
  const spawnedShadow = await spawnShadowOfTheAgent({
    playerEntity: hybridHero,
    spawnPos: pts.boss,
    spawnLooseFoe: async () => ({
      hitFlash: 0,
      entity: { stats: { strength: 50, intelligence: 50, willpower: 50 }, equipTable: new Array(30).fill(null) },
    }),
  });
  assert.equal(spawnedShadow.entity.shadowBoss, true);
});

test('Ascended God Base Boons (+500 HP/MP/Fatigue), real Portfolio Passives, and Unconditional Rebirth (+1 Day & Foe Despawn)', () => {
  const god = makeActor('ascended_god');
  assert.equal(isAscendedGod(god), false);
  assert.equal(apotheosisHpOf(god), 0);
  assert.equal(apotheosisMpOf(god), 0);
  assert.equal(apotheosisFatigueOf(god), 0);

  const baseMaxHp = god.maxHealth;
  const baseMaxMp = god.maxMagicka;
  const baseFatigue = maxFatigue(god);

  setDebugFateWeight(god, REQUIRED_FATE_WEIGHT);
  startApotheosisFromMantella(god);
  completeApotheosisQuestline(god);
  selectApotheosisPortfolio(god, 'war', { nowMinutes: 50000 });
  defineLiveMaxHealth(god);
  defineLiveMaxMagicka(god);
  computeEntityMods(god);

  assert.equal(isAscendedGod(god), true);
  assert.equal(apotheosisHpOf(god), APOTHEOSIS_BASE_HP_BONUS);
  assert.equal(apotheosisMpOf(god), APOTHEOSIS_BASE_MP_BONUS);
  assert.equal(apotheosisFatigueOf(god), APOTHEOSIS_BASE_FATIGUE_POINTS * FATIGUE_MULTIPLIER);
  assert.equal(god.maxHealth, baseMaxHp + 500);
  assert.equal(god.maxMagicka, baseMaxMp + 500);
  // Portfolio of War also adds +15 STR and +15 END (+30 * FATIGUE_MULTIPLIER), reflected live in maxFatigue.
  assert.equal(maxFatigue(god), baseFatigue + (500 + 15 + 15) * FATIGUE_MULTIPLIER);

  // Portfolio of War passives + 15% weapon damage mod
  assert.equal(entityStatMod(god, 'strength'), 15);
  assert.equal(entityStatMod(god, 'endurance'), 15);
  assert.equal(entityArmorPoints(god, 0), 15);
  assert.equal(apotheosisWeaponDamageMod({}, 100, god), 115);
  assert.equal(weaponDamageMods({}, 100), 115);

  // Switch to Magic -> +20 INT/WIL, +250 extra MP, +25 magic skills, +25% magic resist
  selectApotheosisPortfolio(god, 'magic', { nowMinutes: 50010, free: true });
  computeEntityMods(god);
  defineLiveMaxMagicka(god);
  assert.equal(entityStatMod(god, 'intelligence'), 20);
  assert.equal(entitySkillMod(god, SKILLS.Destruction), 25);
  assert.equal(entityResistMod(god, ['magic']), 25);
  assert.ok(god.maxMagicka > baseMaxMp + 500);

  // Switch to Shadows -> +20 AGI/SPD, +25 stealth/backstab/crit/dodging
  selectApotheosisPortfolio(god, 'shadows', { nowMinutes: 50020, free: true });
  const shMods = computeApotheosisPortfolioMods(god);
  assert.equal(shMods.stats.agility, 20);
  assert.equal(shMods.skills[SKILLS.Backstabbing], 25);
  assert.equal(shMods.fallLess, 0.5);

  // Switch to Order -> +20 PER/LUC, +25% elemental/magic resist, +25 standing
  selectApotheosisPortfolio(god, 'order', { nowMinutes: 50030, free: true });
  computeEntityMods(god);
  assert.equal(entityStatMod(god, 'personality'), 20);
  assert.equal(entityResistMod(god, ['fire']), 25);
  assert.equal(entitySkillMod(god, SKILLS.Mercantile), 25);

  // Unconditional God Rebirth (works even when onlineRespawn pref is OFF!)
  setPref('onlineRespawn', false);
  let rebirthHookMinutes = 0;
  setApotheosisRebirthHook((_ent, info) => {
    rebirthHookMinutes += info.minutesAdvanced;
  });

  god.health = 25;
  god.magicka = 10;
  god.fatigue = 100;
  god.activeEffects.push({ kind: 'poison', ended: false });

  // Lethal blow through hurtPlayer intercepts death and heals to full on the spot
  const survivedCall = hurtPlayer(god, 99999, { bypassShield: true });
  assert.equal(survivedCall, false, 'God does not die from lethal hit');
  assert.equal(god.health, god.maxHealth);
  assert.equal(god.magicka, god.maxMagicka);
  assert.equal(god.activeEffects[0].ended, true, 'negative poison cured on rebirth');
  assert.equal(rebirthHookMinutes, APOTHEOSIS_REBIRTH_MINUTES);
  assert.equal(god.apotheosis.rebirthCount, 1);

  const flash = getApotheosisFlashState();
  assert.equal(flash.active, true);
  assert.equal(flash.alpha, 1);
  tickApotheosisScreenFlash(0.2);
  assert.equal(tickApotheosisScreenFlash(2.5), 0);

  // Direct forcePlayerDeath also reconstitutes rather than dying
  const deathResult = reconstituteAscendedGod(god);
  assert.equal(deathResult.reconstituted, true);
  assert.equal(deathResult.daysAdvanced, 1);
  assert.equal(forcePlayerDeath(god), false);
});

test('Stage 1 console commands (`apo quest`, `apo mantella usurp`, `apo rebirth`) drive full flow', async () => {
  const prev = {
    apotheosis: playerEntity.apotheosis ? structuredClone(playerEntity.apotheosis) : undefined,
    health: playerEntity.health,
    maxHealth: playerEntity.maxHealth,
  };
  try {
    await executeConsoleCommand('apo', ['reset']);
    const manMsg = await executeConsoleCommand('apo', ['mantella', 'usurp']);
    assert.match(manMsg, /Dragon Break/i);
    assert.equal(playerEntity.apotheosis.stage, APOTHEOSIS_STAGES.QUESTLINE_ACTIVE);

    const towerMsg = await executeConsoleCommand('apo', ['quest', 'tower']);
    assert.match(towerMsg, /Direnni Tower/i);
    assert.equal(playerEntity.apotheosis.towerSiegeCleared, true);
    assert.equal(playerEntity.apotheosis.questStep, APOTHEOSIS_QUEST_STEPS.TOWER_INTERIOR);

    const completeMsg = await executeConsoleCommand('apo', ['quest', 'complete']);
    assert.match(completeMsg, /Portfolio/i);
    assert.equal(playerEntity.apotheosis.stage, APOTHEOSIS_STAGES.AWAITING_PORTFOLIO);

    selectApotheosisPortfolio(playerEntity, 'war', { nowMinutes: 100 });
    const rbMsg = await executeConsoleCommand('apo', ['rebirth']);
    assert.match(rbMsg, /\+1 day/i);
    assert.ok(playerEntity.apotheosis.rebirthCount >= 1);

    // Stage 1 bugfix commands: apo mantella after artifacts path, apo tp mantella, apo tp zerostone
    let calls = [];
    setDebugSceneContext({
      apotheosisMantellaFork: () => { calls.push('fork'); return true; },
      apotheosisEnterMantellaCrux: async () => { calls.push('enterCrux'); return 'Entered Mantellan Crux.'; },
      apotheosisTeleportZeroStone: async () => { calls.push('tpZeroStone'); return 'At Zero Stone.'; },
    });
    await executeConsoleCommand('apo', ['reset']);
    await executeConsoleCommand('apo', ['fate', 'ready']);
    await executeConsoleCommand('apo', ['artifacts', '15']);
    const scan = scanInventoryArtifactsForApotheosis(playerEntity);
    const unequipped = scan.distinctUnequippedSubTypes
      .slice(0, 13)
      .map((sub) => scan.unequippedEntries.find((x) => x.subType === sub).item);
    startApotheosisFromArtifacts(playerEntity, unequipped);
    assert.equal(playerEntity.apotheosis.source, APOTHEOSIS_SOURCES.ARTIFACTS);

    const forkMsg = await executeConsoleCommand('apo', ['mantella']);
    assert.match(forkMsg, /Opened Mantellan Crux Apotheosis fork dialog/i);
    assert.equal(playerEntity.apotheosis.stage, APOTHEOSIS_STAGES.MORTAL);

    const cruxMsg = await executeConsoleCommand('apo', ['tp', 'mantella']);
    assert.match(cruxMsg, /Entered Mantellan Crux/i);

    const zeroMsg = await executeConsoleCommand('apo', ['tp', 'zerostone']);
    assert.match(zeroMsg, /At Zero Stone/i);
    assert.deepEqual(calls, ['fork', 'enterCrux', 'tpZeroStone']);
  } finally {
    setDebugSceneContext({});
    if (prev.apotheosis === undefined) delete playerEntity.apotheosis;
    else playerEntity.apotheosis = prev.apotheosis;
    playerEntity.maxHealth = prev.maxHealth;
    playerEntity.health = prev.health;
  }
});

test('Stage 1 bugfixes: 5s random Dragon Break weather rotation and LT-safe Direnni Siege spawner', () => {
  assert.equal(APOTHEOSIS_STORM_WEATHER_INTERVAL_SEC, 5);
  let cur = 'thunder';
  for (let i = 0; i < 20; i++) {
    const next = pickNextApotheosisStormWeather(cur, () => ((i * 0.37) % 1));
    assert.ok(APOTHEOSIS_STORM_WEATHERS.includes(next));
    assert.notEqual(next, cur, 'Dragon Break rotates to a different weather each 5s round');
    cur = next;
  }

  // Simulate blocking roofs at +X and walls nearby at baseAngle=0; must rotate to clear terrain
  const anchor = [100, 10, 100];
  const pos = findSafeSiegeSpawnPos(anchor, 12, 0, {
    groundAt: () => 10,
    raycastHit: (origin, dir) => {
      // Horizontal ray along +X hits tower wall very close (2m < 5.5m)
      if (Math.abs(dir[1]) < 0.1 && dir[0] > 0.7) {
        return { dist: 2.0, back: false };
      }
      // Roof over +Z
      if (dir[1] < -0.5 && origin[2] > 105) {
        return { dist: 4.0, back: false }; // surfaceY = 10 + 18 - 4 = 24 (> 10 + 0.85 -> roof!)
      }
      return null;
    },
    lodgedIn: (feet) => feet[0] > 102 && feet[2] > 102,
    freeLodgedFeet: () => false,
  });
  assert.ok(pos[0] < 105 && pos[2] <= 105, 'Avoided spawning under a roof or into the close tower wall/lodged quadrant');
});

test('Stage 1 temporal storm sky override, Siege team cohesion, Mantella negative/No exits, and portfolio preselect', async () => {
  const prevWorldMin = worldMinutes();
  const prevSkyOverride = getSkyMinutesOverride();
  try {
    // 1. Temporal Dragon Break storm time-of-day / calendar override (+-1 year) leaves worldMinutes untouched
    assert.equal(APOTHEOSIS_STORM_TIME_SPAN_MINUTES, 360 * 1440);
    setWorldMinutes(5_000_000);
    setSkyMinutesOverride(null);
    assert.equal(skyMinutes(), 5_000_000);

    const low = pickNextApotheosisStormMinutes(5_000_000, () => 0);
    const mid = pickNextApotheosisStormMinutes(5_000_000, () => 0.25);
    const high = pickNextApotheosisStormMinutes(5_000_000, () => 0.999999);
    assert.equal(low, 5_000_000 - APOTHEOSIS_STORM_TIME_SPAN_MINUTES);
    assert.ok(mid < 5_000_000);
    assert.ok(high > 5_000_000 && high <= 5_000_000 + APOTHEOSIS_STORM_TIME_SPAN_MINUTES);
    assert.ok(pickNextApotheosisStormMinutes(100, () => 0) >= 0, 'clamps at 0 classic minutes');

    setSkyMinutesOverride(5_300_000);
    assert.equal(getSkyMinutesOverride(), 5_300_000);
    assert.equal(skyMinutes(), 5_300_000);
    assert.equal(worldMinutes(), 5_000_000, 'simulation worldMinutes stays monotonic during temporal storm');

    const stormHero = makeActor('storm_hero');
    setDebugFateWeight(stormHero, REQUIRED_FATE_WEIGHT);
    startApotheosisFromMantella(stormHero);
    stormHero.apotheosis.stormStartMinutes = 5_000_000;
    completeApotheosisQuestline(stormHero);
    assert.equal(stormHero.apotheosis.stormStartMinutes, null);
    assert.equal(getSkyMinutesOverride(), null);
    assert.equal(skyMinutes(), 5_000_000);

    setSkyMinutesOverride(5_150_000);
    stormHero.apotheosis.stormStartMinutes = 5_000_000;
    resetApotheosisForDebug(stormHero);
    assert.equal(stormHero.apotheosis.stormStartMinutes, null);
    assert.equal(getSkyMinutesOverride(), null);
  } finally {
    setSkyMinutesOverride(prevSkyOverride);
    setWorldMinutes(prevWorldMin);
  }

  // 2. Direnni Siege mixed mobs share Daedra team & direnni_siege camp with suppressInfighting (no infighting)
  const siegeHero = makeActor('siege_coop');
  setDebugFateWeight(siegeHero, REQUIRED_FATE_WEIGHT);
  startApotheosisFromMantella(siegeHero);
  const siegeFoes = [];
  const siege = createDirenniSiegeController({
    playerEntity: siegeHero,
    getPlayerPos: () => [0, 10, 0],
    getPlayerMode: () => 'exterior',
    groundAt: () => 10,
    spawnFoe: async (mobileType, pos) => {
      const f = {
        mobileType,
        dead: false,
        hitFlash: 0,
        ai: {
          feet: [...(pos ?? [0, 10, 0])],
          isHostile: true,
          height: 1.8,
          centreOffset: 0.9,
          wouldBeSpawned: true,
          target: null,
        },
        entity: {
          name: `Siege_${mobileType}`,
          health: 200,
          maxHealth: 200,
          damageScale: 1,
          items: [],
          activeEffects: [],
        },
      };
      siegeFoes.push(f);
      return f;
    },
    removeFoe: () => {},
    hurtPlayer: () => {},
  });
  // Start at wave 13 so Aspect boss + mixed Daedra/Imps spawn, then damage boss to spawn phase adds too
  assert.equal(siege.start({ startWaveNum: DIRENNI_SIEGE_TOTAL_WAVES, anchorPos: [0, 10, 0] }), true);
  await new Promise((r) => setTimeout(r, 0));
  const boss = siegeFoes.find((f) => f.entity.apotheosisAspectBoss);
  assert.ok(boss, 'Wave 13 spawned Aspect boss');
  boss.entity.health = boss.entity.maxHealth * 0.5;
  siege.tick(0.1);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(siegeFoes.length >= 4, 'Spawned boss, wave foes, and phase adds');

  for (const f of siegeFoes) {
    assert.equal(f.campId, 'direnni_siege');
    assert.equal(f.entity.team, 'Daedra');
    assert.equal(f.entity.mobileTeam, 'Daedra');
    assert.equal(f.entity.campId, 'direnni_siege');
    assert.equal(f.entity.suppressInfighting, true);
  }
  const f0 = siegeFoes[0];
  const f1 = siegeFoes.find((f) => f.mobileType !== f0.mobileType) ?? siegeFoes[1];
  assert.equal(getTargets(f0, [f0, f1, PLAYER_TARGET], [0, 10, 12], { infighting: true }).target, PLAYER_TARGET);
  assert.equal(getTargets(f0, [f0, f1], [0, 10, 12], { infighting: true, noTargetMode: true }).target, null, 'Siege Daedra never infight');
  assert.notEqual(getTargets(f0, [f0, f1], [0, 10, 12], { infighting: true }).target, f1, 'Siege Daedra never pick another siege foe over player');
  siege.onModeOrWorldChange();

  // 3. Mantella <16 Fate Weight, exclusive Artifacts, and "No" choice call onVanillaConfirm cleanly
  const cruxLoc = { mapTableData: { mapId: MANTELLAN_CRUX_MAP_ID }, name: 'Mantellan Crux' };
  const negHero = makeActor('neg_mantella');
  let vanillaCalls = 0;
  const negWindows = [];
  const negOpened = handleMantellaCruxTouch({
    dfLocation: cruxLoc,
    playerEntity: negHero,
    presentWindow: (w) => negWindows.push(w),
    say: () => {},
    onVanillaConfirm: () => { vanillaCalls++; },
  });
  assert.equal(negOpened, false);
  assert.equal(negWindows.length, 0);
  assert.equal(vanillaCalls, 1, '<16 Fate Weight invokes onVanillaConfirm');
  assert.equal(negHero.apotheosis.mantellaVanillaChosen, false, 'Fate Weight rejection stays reversible');

  // After earning >=16 Fate Weight, choosing "No" marks mantellaVanillaChosen so re-touch exits directly
  setDebugFateWeight(negHero, REQUIRED_FATE_WEIGHT);
  const forkOpened = handleMantellaCruxTouch({
    dfLocation: cruxLoc,
    playerEntity: negHero,
    presentWindow: (w) => negWindows.push(w),
    say: () => {},
    onVanillaConfirm: () => { vanillaCalls++; },
  });
  assert.equal(forkOpened, true);
  assert.equal(negWindows.length, 1);
  negWindows[0].answer(false);
  assert.equal(negHero.apotheosis.mantellaVanillaChosen, true);
  assert.equal(negWindows.length, 2);
  negWindows[1].answer(true);
  assert.equal(vanillaCalls, 2);

  const reTouchOpened = handleMantellaCruxTouch({
    dfLocation: cruxLoc,
    playerEntity: negHero,
    presentWindow: (w) => negWindows.push(w),
    say: () => {},
    onVanillaConfirm: () => { vanillaCalls++; },
  });
  assert.equal(reTouchOpened, false);
  assert.equal(negWindows.length, 2, 'does not reopen modal after No choice');
  assert.equal(vanillaCalls, 3);

  const artHero = makeActor('art_mantella');
  setDebugFateWeight(artHero, REQUIRED_FATE_WEIGHT);
  grantArtifactPack(artHero, 15);
  const scan = scanInventoryArtifactsForApotheosis(artHero);
  const picked = scan.distinctUnequippedSubTypes
    .slice(0, 13)
    .map((sub) => scan.unequippedEntries.find((x) => x.subType === sub).item);
  startApotheosisFromArtifacts(artHero, picked);
  let artVanillaCalls = 0;
  const artOpened = handleMantellaCruxTouch({
    dfLocation: cruxLoc,
    playerEntity: artHero,
    presentWindow: () => assert.fail('exclusive should not open modal'),
    say: () => {},
    onVanillaConfirm: () => { artVanillaCalls++; },
  });
  assert.equal(artOpened, false);
  assert.equal(artVanillaCalls, 1, 'exclusive Artifact path triggers vanilla Mantella exit callback');

  // 4. Portfolio section pre-selection helper works headlessly
  assert.doesNotThrow(() => {
    selectApotheosisSection('portfolio');
    releaseApotheosisPane();
  });
});

test('Stage 1 story-flow: S0000016 usurpation records outcome "usurped" and sets GlobalVar 36 so storyAgainRefusal is "carried"', () => {
  loadPackTables();
  setPref(QUESTLINES_PREF, true);
  let now = 1000;
  const hero = makeActor('usurp_s16_hero');
  const bridge = createQuestBridge({
    data: {
      readListTable: () => null,
      getQuestSourceLines: (n) => questSource(n, true),
    },
    classicSeconds: () => now,
    nowSeconds: () => now,
    worldSeconds: () => now,
    playerEntity: { ...hero, career: { weaponArmorShieldsBitfield: 0, forbiddenMaterialsFlags: 0 }, skills: new Array(35).fill(30) },
    getReputation: () => 0,
    carriesQuestItem: () => false,
  });

  bridge.machine.globalVars.set(6, 1); // UnderkingGotTotem
  const s16 = bridge.machine.startQuestByName('S0000016', 0);
  assert.ok(s16, 'S0000016 starts with Totem GlobalVar seeded');
  for (const task of s16.tasks.values()) {
    for (const a of task.actions ?? []) {
      if (a?.typeName === 'TeleportPc') {
        a.setComplete?.();
        a.resumePending = false;
      }
    }
  }
  s16.update();
  assert.ok(s16.getLogMessages().length > 0, 'S0000016 logs step 0 on start');

  if (s16.ql && typeof s16.ql === 'object') {
    if (Array.isArray(s16.ql.done) && !s16.ql.done.includes('mantella')) {
      s16.ql.done.push('mantella');
    }
    s16.ql.outcome = 'usurped';
  }
  s16.questSuccess = true;
  s16.endQuest();
  if (!s16.questTombstoned) bridge.machine.tombstoneQuest(s16);
  bridge.machine.globalVars.set(36, 1);

  assert.equal(s16.ql?.outcome, 'usurped');
  assert.notEqual(s16.ql?.outcome, 'failed');
  const endedRow = bridge.questLog().ended.find((r) => r.questName === 'S0000016');
  assert.equal(endedRow?.ql?.outcome?.id, 'usurped');
  assert.equal(endedRow?.ql?.outcome?.failure, false);
  assert.equal(bridge.machine.storyAgainRefusal('S0000016'), 'carried');
});

test('Stage 1 story-flow: handleMantellaCruxTouch invokes onVanillaConfirm for all ineligible states and blocks 13-artifact ritual inside Crux', () => {
  const cruxLoc = { mapTableData: { mapId: MANTELLAN_CRUX_MAP_ID }, name: 'Mantellan Crux' };

  // Low Fate Weight calls onVanillaConfirm while keeping mantellaVanillaChosen reversible (false)
  const lowHero = makeActor('flow_low_fate');
  let lowCalls = 0;
  handleMantellaCruxTouch({
    dfLocation: cruxLoc,
    playerEntity: lowHero,
    presentWindow: () => assert.fail('low Fate Weight must not open choice window'),
    say: () => {},
    onVanillaConfirm: () => { lowCalls++; },
  });
  assert.equal(lowCalls, 1);
  assert.equal(lowHero.apotheosis.mantellaVanillaChosen, false);

  // Active Trial of Ascension calls onVanillaConfirm and marks mantellaVanillaChosen = true
  const activeHero = makeActor('flow_active');
  setDebugFateWeight(activeHero, REQUIRED_FATE_WEIGHT);
  startApotheosisQuestline(activeHero, { source: APOTHEOSIS_SOURCES.MANTELLA });
  let activeCalls = 0;
  handleMantellaCruxTouch({
    dfLocation: cruxLoc,
    playerEntity: activeHero,
    presentWindow: () => assert.fail('active trial must not open choice window'),
    say: () => {},
    onVanillaConfirm: () => { activeCalls++; },
  });
  assert.equal(activeCalls, 1);
  assert.equal(activeHero.apotheosis.mantellaVanillaChosen, true);

  // Already Ascended calls onVanillaConfirm and marks mantellaVanillaChosen = true
  const godHero = makeActor('flow_ascended');
  setDebugFateWeight(godHero, REQUIRED_FATE_WEIGHT);
  startApotheosisQuestline(godHero, { source: APOTHEOSIS_SOURCES.MANTELLA });
  completeApotheosisQuestline(godHero);
  selectApotheosisPortfolio(godHero, 'scholar');
  let godCalls = 0;
  handleMantellaCruxTouch({
    dfLocation: cruxLoc,
    playerEntity: godHero,
    presentWindow: () => assert.fail('ascended hero must not open choice window'),
    say: () => {},
    onVanillaConfirm: () => { godCalls++; },
  });
  assert.equal(godCalls, 1);
  assert.equal(godHero.apotheosis.mantellaVanillaChosen, true);

  // Exclusive 13-Artifact route marks mantellaVanillaChosen = true and invokes onVanillaConfirm
  const artHero = makeActor('flow_exclusive');
  setDebugFateWeight(artHero, REQUIRED_FATE_WEIGHT);
  grantArtifactPack(artHero, 14);
  const scan = scanInventoryArtifactsForApotheosis(artHero);
  const picked = scan.distinctUnequippedSubTypes
    .slice(0, 13)
    .map((sub) => scan.unequippedEntries.find((x) => x.subType === sub).item);
  startApotheosisFromArtifacts(artHero, picked);
  let artCalls = 0;
  handleMantellaCruxTouch({
    dfLocation: cruxLoc,
    playerEntity: artHero,
    presentWindow: () => assert.fail('exclusive route must not open choice window'),
    say: () => {},
    onVanillaConfirm: () => { artCalls++; },
  });
  assert.equal(artCalls, 1);
  assert.equal(artHero.apotheosis.mantellaVanillaChosen, true);

  // 13-Artifact ritual guard rejects inside Mantellan Crux (flag and presence predicate)
  const cruxRitualHero = makeActor('flow_crux_guard');
  setDebugFateWeight(cruxRitualHero, REQUIRED_FATE_WEIGHT);
  grantArtifactPack(cruxRitualHero, 14);
  assert.equal(canStartApotheosisViaArtifacts(cruxRitualHero).eligible, true);

  cruxRitualHero._inMantellanCrux = true;
  const blockedByFlag = canStartApotheosisViaArtifacts(cruxRitualHero);
  assert.equal(blockedByFlag.eligible, false);
  assert.match(blockedByFlag.reason ?? '', /Mantellan Crux/);

  resetApotheosisForDebug(cruxRitualHero);
  assert.equal(cruxRitualHero._inMantellanCrux, false);
  setDebugFateWeight(cruxRitualHero, REQUIRED_FATE_WEIGHT);
  assert.equal(canStartApotheosisViaArtifacts(cruxRitualHero).eligible, true);

  try {
    setMantellanCruxPresenceChecker((e) => e === cruxRitualHero);
    const blockedByChecker = canStartApotheosisViaArtifacts(cruxRitualHero);
    assert.equal(blockedByChecker.eligible, false);
    assert.match(blockedByChecker.reason ?? '', /Mantellan Crux/);
  } finally {
    setMantellanCruxPresenceChecker(null);
  }
  assert.equal(canStartApotheosisViaArtifacts(cruxRitualHero).eligible, true);
});

test('Shadow Boss enhancements (fearless, 3x damage, 3x special frequency, AoE spells) and Orrery Kill-Z void drop', () => {
  const hero = makeActor('shadow_buffs');
  const shadowEnt = { stats: { strength: 50, intelligence: 50, willpower: 50 }, equipTable: new Array(30).fill(null) };
  configureShadowEntity(shadowEnt, hero);

  assert.equal(shadowEnt.shadowBoss, true);
  assert.equal(shadowEnt.fearless, true);
  assert.ok(shadowEnt.damageScale >= 5.25, `expected damageScale >= 5.25 (3x of 1.75), got ${shadowEnt.damageScale}`);
  assert.ok(shadowEnt.maxMagicka >= 800);

  // AoE combat spells granted even when Shadow spawns as non-caster Knight archetype
  const spells = enemySpellIndices({ shadowBoss: true, isClass: true, basics: { castsMagic: false } });
  assert.deepEqual(spells, SHADOW_BOSS_SPELLS);
  assert.ok(spells.includes(0x08), 'Fireball included in Shadow spell list');
  assert.ok(spells.includes(0x0e), 'Ice Storm included in Shadow spell list');

  // Special attack cooldown is 3x shorter (1/3) for Shadow
  const normalCd = blowCooldown({ bossTraits: [] }, 0.5);
  const shadowCd = blowCooldown({ bossTraits: [], shadowBoss: true }, 0.5);
  assert.ok(Math.abs(shadowCd - normalCd / 3) < 1e-6);

  // EnemyAI.flee is completely ignored for shadowBoss / fearless
  const fakeAi = new EnemyAI(null, [0, 0, 0], 0, { vitals: () => ({ shadowBoss: true, fearless: true }) });
  fakeAi.flee([5, 0, 5], 8, 1);
  assert.equal(fakeAi.fleeLeft, 0);

  // WorldModes removed the broken apotheosisOrreryArena().clamp() call and kills player on -10m fall
  const wm = readFileSync(new URL('../../src/scenes/worldModes.js', import.meta.url), 'utf8');
  assert.equal(/apotheosisOrreryArena\(\)\.clamp/.test(wm), false);
  assert.match(wm, /player\.pos\[1\] <= floorY - 10/);
  assert.match(wm, /forcePlayerDeath\(playerEntity\)/);
});
