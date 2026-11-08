import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  newLivingSaveData,
  getLivingSaveData,
  restoreLivingSaveData,
} from '../../src/systems/living/livingDirector.js';
import { resetLivingConfig } from '../../src/systems/living/livingConfig.js';
import {
  getRegionState,
  setRegionCrisis,
  tickAllRegions,
  tickRegionDay,
} from '../../src/systems/living/regionState.js';
import {
  tickAdventurerSimulation,
  ensureAdventurerPool,
  isDungeonInCooldown,
  claimFallenAdventurerRemains,
  getDungeonActiveAdventurer,
  getAdventurerSimRegistry,
  ROAD_ADVENTURER_SITUATION,
  WANDERING_OUTCOME,
  getRoadAdventurerSiteChance,
  getRoadAdventurerAmbientShare,
  resolveWanderingAdventurerInteraction,
  recruitAdventurerCompanion,
  getActiveAdventurerCompanion,
  dismissAdventurerCompanion,
  COMPANION_DURATION_MINUTES,
} from '../../src/systems/living/adventurerSim.js';
import { LivingTamrielConfig, PRESENCE } from '../../src/systems/living/livingConfig.js';
import { hasRegionalCheckpointPass } from '../../src/systems/living/roadCheckpointHost.js';
import { getNemesisMemory, resolveNemesisConfrontation, createNemesisHunter, NEMESIS_ARCHETYPES, recordAdventurerGrudge } from '../../src/systems/living/nemesisHost.js';
import { resolvePleaResponse, PLEA_TYPE } from '../../src/systems/living/pleaHost.js';
import {
  getRegionCrisisLines,
  getSettlementEntryNotification,
  getRegionCrisisRumor,
  getRegionCrisisBulletinTokens,
  CRISIS_QUEST_TYPE,
  offerRegionalCrisisContract,
  acceptRegionalCrisisContract,
  getActiveCrisisContract,
  completeRegionalCrisisContract,
  getLivingQuestLogEntries,
} from '../../src/systems/living/crisisPresenter.js';
import { getBuildingCrisisFactor } from '../../src/systems/living/regionEconomy.js';
import { makeCityGate, updateCityGate } from '../../src/world/city/cityGate.js';
import { spawnNavalSquadronShips } from '../../src/scenes/naval/navalSquadronBridge.js';
import { createTownEcon } from '../../src/systems/town/townEcon.js';
import { RumorMill } from '../../src/systems/rumorMill.js';
import { rentalDecision } from '../../src/systems/tavern.js';
import { CATEGORIES } from '../../src/ui/settings/settingsMap.js';
import { setPref } from '../../src/systems/uiPrefs.js';
import { CLIMATES } from '../../src/formats/mapsFile.js';
import { SEASONS } from '../../src/systems/gameDate.js';
import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';
import {
  LIVING_MODELS,
  LIVING_FLATS,
  LIVING_SITE_KINDS,
  getWildernessReplacementShare,
  buildEcologicalCandidatePool,
  rollLivingWildernessEncounter,
  rollLivingChunkCampRoster,
  buildLivingSiteBlueprint,
  createLivingSceneHost,
  buildDungeonAdventurerChoiceSpec,
  executeLivingConsoleCommand,
  LIVING_SOUNDS,
} from '../../src/systems/living/livingWorldSpawner.js';

describe('Living Tamriel Playable Beta — Steps 1–3 Wiring', () => {
  beforeEach(() => {
    restoreLivingSaveData(null);
    resetLivingConfig();
    setPref('livingPolitical', 'Mid');
    setPref('livingQuarantine', 'Mid');
    setPref('livingAdventurers', 'Mid');
    setPref('livingAllowQuestCompetition', true);
  });

  it('Step 1a: tickAllRegions covers all 71 regions and tension scales crisis outbreak probability including CIVIL_STRIFE', () => {
    const reg68 = getRegionState(68);
    assert.ok(reg68, 'region 68 should be initialized');
    reg68.tension = 100;
    // Probability with tension=100 is min(0.25, 0.015 + 0.15) = 0.165.
    // Roll = 0.10 triggers outbreak; index Roll = 0.90 selects CIVIL_STRIFE (> 0.85).
    let call = 0;
    const rolls = [0.10, 0.90];
    tickRegionDay(reg68, () => rolls[call++] ?? 0.5);
    assert.equal(getRegionState(68).crisis, 'CIVIL_STRIFE');
    assert.equal(getRegionState(68).phase, 'START');

    // Verify tickAllRegions ticks region 70
    setRegionCrisis(70, 'WAR', 'START');
    const beforeDays = getRegionState(70).phaseDaysRemaining;
    tickAllRegions(() => 0.99);
    assert.equal(getRegionState(70).phaseDaysRemaining, beforeDays - 1);
  });

  it('Step 1b: updateCityGate physically locks gates at midday during PLAGUE.MID quarantine', () => {
    setRegionCrisis(17, 'PLAGUE', 'MID');
    const gate = makeCityGate(446);
    updateCityGate(gate, false, { online: false, region: 17 });
    assert.equal(gate.isOpen, false, 'gate should lock during daytime when region 17 is under PLAGUE.MID');

    setRegionCrisis(17, 'PEACE', 'NONE');
    updateCityGate(gate, false, { online: false, region: 17 });
    assert.equal(gate.isOpen, true, 'gate should open during daytime when region 17 returns to PEACE');
  });

  it('Step 1c: dungeon numeric mapId matches deterministic regional dungeon slots and prunes previous-day DEAD adventurers', () => {
    const pool = ensureAdventurerPool();
    pool[0].status = 'DELVING';
    pool[0].targetLocationId = 'dungeon_0_3';
    pool[0].daysRemainingInAction = 1;

    // Resolve delve with roll = 0.99 (> baseSuccess so adventurer dies and leaves remains in dungeon_0_3)
    tickAdventurerSimulation({ rng: () => 0.99 });

    assert.equal(pool[0].status, 'DEAD', 'adventurer should fall on failed delve roll');
    const numericMapId = 5003; // 5003 % 10 === 3 -> matches dungeon_0_3 in region 0

    const claimed = claimFallenAdventurerRemains(numericMapId, 0);
    assert.ok(Array.isArray(claimed) && claimed.length === 1, 'numeric mapId in region 0 should match fallen adventurer slot');
    assert.equal(claimed[0].adventurerName, pool[0].name);

    // Next day: prune previous-day DEAD records and succeed delve on dungeon_0_7
    const nextAdv = ensureAdventurerPool().find((a) => a.currentRegion === 0 && a.status !== 'DEAD');
    nextAdv.status = 'DELVING';
    nextAdv.targetLocationId = 'dungeon_0_7';
    nextAdv.daysRemainingInAction = 1;
    tickAdventurerSimulation({ rng: () => 0.01 });

    const allAfterClear = ensureAdventurerPool();
    assert.equal(allAfterClear.length, 13 * 62, `total pool size should stay at 806 without dead bloat (got ${allAfterClear.length})`);
    assert.equal(allAfterClear.filter((a) => a.status === 'DEAD').length, 0, 'previous-day DEAD records should be pruned');
    assert.equal(isDungeonInCooldown(9007, 0), true, 'numeric mapId 9007 should match dungeon cooldown slot 7 in region 0');
  });

  it('Step 1d: savestate round-trips nemesis, allowQuestCompetition, and pleas state', () => {
    const raw = newLivingSaveData();
    raw.config.nemesis = 3;
    raw.config.allowQuestCompetition = false;
    raw.subsystems.pleas = { lastPleaMinute: 4321 };
    restoreLivingSaveData(raw);

    const saved = getLivingSaveData();
    assert.equal(saved.config.nemesis, 3);
    assert.equal(saved.config.allowQuestCompetition, false);
    assert.equal(saved.subsystems.pleas?.lastPleaMinute, 4321);
  });

  it('Step 2a: Crisis Presenter & TownEcon surface crisis status in Settlement Banner, Town Panel, and Map Hover (online & offline)', () => {
    assert.deepEqual(getRegionCrisisLines(17), []);
    assert.equal(getSettlementEntryNotification(17, 'Daggerfall'), null);

    setRegionCrisis(17, 'WAR', 'MID');
    const lines = getRegionCrisisLines(17);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /Open Warfare/i);
    assert.match(lines[1], /Weapons and armor/i);

    const banner = getSettlementEntryNotification(17, 'Daggerfall');
    assert.match(banner, /Daggerfall.*martial law/i);

    // Offline TownEcon still shows regional crisis lines on hover and Town Panel!
    const econOffline = createTownEcon({
      online: () => false,
      townOf: () => ({ name: 'Daggerfall', type: 0, region: 17 }),
      nowMs: () => 1000,
    });
    const offlineTip = econOffline.tipAt(100);
    assert.ok(offlineTip && offlineTip.lines.some((l) => /Open Warfare/i.test(l)));
    assert.equal(econOffline.panelLinesAt(100).length, 2);
    assert.equal(typeof econOffline.tipFnAt(100), 'function');
  });

  it('Step 2b: RumorMill connects spoken NPC rumors and bulletin boards to active regional crises', () => {
    setRegionCrisis(17, 'PLAGUE', 'MID');
    const rm = new RumorMill({
      currentRegionIndex: () => 17,
      rolls: () => 0.01,
    });

    const rumor = rm.getNewsOrRumors();
    assert.match(rumor, /Plague has locked the city gates of Daggerfall/i);

    const boardTokens = rm.getNewsOrRumorsForBulletinBoard();
    assert.ok(Array.isArray(boardTokens) && boardTokens.length > 0);
    assert.match(boardTokens[0].text, /Plague has locked the city gates of Daggerfall/i);

    assert.ok(getRegionCrisisRumor(17));
    assert.ok(getRegionCrisisBulletinTokens(17));
  });

  it('Step 3: Regional Crisis Economy scales shop building factors, tavern room prices, and settings labels', () => {
    setRegionCrisis(17, 'WAR', 'MID');
    assert.equal(getBuildingCrisisFactor('WeaponSmith', 17), 1.35);
    assert.equal(getBuildingCrisisFactor(2, 17), 1.35);

    setRegionCrisis(17, 'PLAGUE', 'MID');
    assert.equal(getBuildingCrisisFactor('Alchemist', 17), 1.4);
    assert.equal(getBuildingCrisisFactor(0, 17), 1.4);

    setRegionCrisis(17, 'FAMINE', 'MID');
    assert.equal(getBuildingCrisisFactor('GeneralStore', 17), 1.5);
    assert.equal(getBuildingCrisisFactor(6, 17), 1.5);

    const baseQuote = rentalDecision('1', { quality: 10, date: { month: 1, day: 1 }, regionIndex: 0 });
    const famineQuote = rentalDecision('1', { quality: 10, date: { month: 1, day: 1 }, regionIndex: 17 });
    assert.ok(famineQuote.price > baseQuote.price, `famine tavern price (${famineQuote.price}) should exceed peace price (${baseQuote.price})`);

    const dffTab = CATEGORIES.find((tab) => tab.id === 'dff');
    assert.ok(dffTab);
    const livingSec = dffTab.sections.find((s) => s.id === 'living');
    assert.ok(livingSec);
    assert.equal(livingSec.title, 'Living Tamriel (Experimental, pre-alpha)');
  });

  it('Step 4: Wilderness & Road Ecological Spawner complements or replaces vanilla spawns across Climate, Biome, Season, Day/Night, Road, and Crisis', () => {
    setPref('livingWilderness', 'Off');
    assert.equal(getWildernessReplacementShare(), 0);
    setPref('livingWilderness', 'Light');
    assert.equal(getWildernessReplacementShare(), 0.30);
    setPref('livingWilderness', 'Mid');
    assert.equal(getWildernessReplacementShare(), 0.65);
    setPref('livingWilderness', 'High');
    assert.equal(getWildernessReplacementShare(), 1.0);

    // 1. Crisis-driven road pool (WAR)
    setRegionCrisis(17, 'WAR', 'MID');
    const warPool = buildEcologicalCandidatePool(
      { climateIndex: CLIMATES.Woodlands, season: SEASONS.Summer, isDay: true, onRoad: true, regionIndex: 17, playerLevel: 12 },
      () => 0.1,
    );
    assert.equal(warPool.crisisDriven, true);
    assert.equal(warPool.ecologicalTag, 'crisis:war');
    assert.ok(warPool.pool.includes(MOBILE_TYPES.OrcWarlord));

    // 2. Mountain Winter Night pool (FrostDaedra / IceAtronach)
    setRegionCrisis(17, 'PEACE', 'NONE');
    const winterMtn = buildEcologicalCandidatePool(
      { climateIndex: CLIMATES.Mountain, season: SEASONS.Winter, isDay: false, onRoad: false, regionIndex: 17, playerLevel: 10 },
      () => 0.8,
    );
    assert.equal(winterMtn.crisisDriven, false);
    assert.match(winterMtn.ecologicalTag, /wild:mountain:s3:night/);
    assert.ok(winterMtn.pool.includes(MOBILE_TYPES.FrostDaedra));

    // 3. Desert Summer Day pool
    const desertDay = buildEcologicalCandidatePool(
      { climateIndex: CLIMATES.Desert, season: SEASONS.Summer, isDay: true, onRoad: false, regionIndex: 0, playerLevel: 10 },
      () => 0.8,
    );
    assert.match(desertDay.ecologicalTag, /wild:desert:s2:day/);
    assert.ok(desertDay.pool.includes(MOBILE_TYPES.GiantScorpion));
    assert.ok(desertDay.pool.includes(MOBILE_TYPES.FireDaedra));

    // 4. rollLivingWildernessEncounter on 12-minute cadence window
    setRegionCrisis(17, 'PLAGUE', 'MID');
    const enc = rollLivingWildernessEncounter(
      {
        gameMinutes: 144, // 144 / 12 = 12 -> 12 % 12 === 0
        skyMinutes: 120,  // Night (02:00)
        inside: false,
        inDungeon: false,
        inLocationRect: false,
        onRoad: false,
        climateIndex: CLIMATES.Swamp,
        regionIndex: 17,
        playerLevel: 10,
        preventEnemySpawns: false,
      },
      () => 0.0, // passes share check, rollMax==0 check, crisis check
    );
    assert.ok(enc, 'should return a Living Tamriel wilderness encounter decision');
    assert.equal(enc.crisisDriven, true);
    assert.equal(enc.ecologicalTag, 'crisis:plague');
    assert.equal(enc.extraCount, 1);

    // 5. rollLivingChunkCampRoster replaces chunk-load camp group roster
    const campRoster = rollLivingChunkCampRoster(
      { climateIndex: CLIMATES.Woodlands, skyMinutes: 720, regionIndex: 17, playerLevel: 8 },
      () => 0.1,
    );
    assert.ok(campRoster && campRoster.mobileTypes.length >= 2);
  });

  it('Step 5: 3D Scene & Actor Host spawns real 3D meshes, billboard flats, lights, NPCs, and opens roleplay ChoiceWindows', async () => {
    setPref('livingCamps', 'High');
    setPref('livingQuarantine', 'High');
    setPref('livingNemesis', 'High');
    setPref('livingAdventurers', 'High');

    const heightAt = () => 10;
    const player = {
      level: 10,
      goldPieces: 500,
      skills: { Etiquette: 75, Streetwise: 70 },
      stats: { Personality: 70, Luck: 65, Strength: 70 },
      regionalReputations: { 17: -40 },
      guildMemberships: { 10: { rank: 2 } },
    };

    // Verify all 7 blueprints generate valid 3D meshes, flats, and actors
    for (const kind of Object.values(LIVING_SITE_KINDS)) {
      const bp = buildLivingSiteBlueprint({
        kind,
        centerX: 100,
        centerZ: 200,
        heightAt,
        regionIndex: 17,
        playerEntity: player,
        nowMinutes: 1000,
        rng: () => 0.2,
      });
      assert.equal(bp.kind, kind);
      assert.ok(bp.actors.length > 0, `${kind} should spawn at least 1 actor`);
    }

    const spawnedFoes = [];
    const choicesOpened = [];
    const messages = [];
    let drawnMeshes = 0;

    const host = createLivingSceneHost({
      feet: () => [100, 10, 192], // 8m from (100, 10, 200) -> within SITE_INTERACT_DISTANCE_M (14m)
      ready: () => true,
      clock: () => 1000,
      regionIndex: () => 17,
      inLocationRect: () => false,
      onRoad: () => true,
      heightAt,
      playerEntity: () => player,
      spawn: async (mobileType, feet, opts) => {
        const rec = {
          mobileType,
          feet,
          opts,
          dead: false,
          entity: { name: '', team: null },
          ai: { isHostile: true },
        };
        spawnedFoes.push(rec);
        return rec;
      },
      remove: (rec) => {
        const idx = spawnedFoes.indexOf(rec);
        if (idx >= 0) spawnedFoes.splice(idx, 1);
      },
      inPool: (rec) => spawnedFoes.includes(rec),
      say: (msg) => messages.push(msg),
      openChoice: (spec) => choicesOpened.push(spec),
      renderer: {
        drawMesh: () => {
          drawnMeshes++;
        },
        createBillboardBatch: (archive, record, sz, positions) => ({ archive, record, sz, positions }),
        destroyBillboardBatch: () => {},
      },
      meshes: {
        getGpuMesh: async (id) => ({ id, bounds: { center: [0, 0, 0], radius: 3 } }),
      },
      getTexture: async () => ({
        getFrameCount: () => 1,
        getSize: () => ({ width: 2, height: 2 }),
      }),
      uploadRecordFrame: () => {},
      rng: () => 0.3,
    });

    // Stand a CHECKPOINT site and verify 3D models, lights, billboards, and ChoiceWindow interaction
    const checkpointBp = buildLivingSiteBlueprint({
      kind: LIVING_SITE_KINDS.CHECKPOINT,
      centerX: 100,
      centerZ: 200,
      heightAt,
      regionIndex: 17,
      playerEntity: player,
      nowMinutes: 1000,
      rng: () => 0.2,
    });
    assert.ok(checkpointBp.meshes.some((m) => m.modelId === LIVING_MODELS.BANNER));
    assert.ok(checkpointBp.flats.some((f) => f.archive === LIVING_FLATS.BRAZIER.archive));

    host.standBlueprint(checkpointBp);
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(spawnedFoes.length, checkpointBp.actors.length);
    assert.equal(spawnedFoes[0].ai.isHostile, false, 'checkpoint guards start non-hostile until dialogue resolves');
    assert.ok(host.lights().length >= 1, 'brazier should emit a dynamic point light');
    assert.ok(host.batches().length >= 1, 'brazier & weapon rack should produce billboard batches');
    assert.ok(host.draw({ drawMesh: () => { drawnMeshes++; } }) >= 1, 'should draw 3D meshes');

    // Tick frame at 8m distance -> triggers interactive ChoiceWindow
    host.frame(1.1);
    assert.equal(choicesOpened.length, 1, 'approaching checkpoint within 14m should open ChoiceWindow');
    assert.equal(choicesOpened[0].options.length, 4);

    // Choose option 2 (Pay Toll)
    const goldBefore = player.goldPieces;
    choicesOpened[0].options[1].action();
    assert.ok(player.goldPieces < goldBefore, 'paying checkpoint toll should deduct gold from playerEntity');
    assert.equal(spawnedFoes[0].ai.isHostile, false, 'guards remain peaceful when toll is paid');

    // Test Floating Origin shift
    host.offsetAll([50, 0, -50]);
    assert.equal(host.shown().center[0], 150);
    assert.equal(host.shown().center[2], 150);

    // Stand a NEMESIS_AMBUSH site with minions and test Taunt -> 1v1 Duel (removes minions!)
    const nemesisBp = buildLivingSiteBlueprint({
      kind: LIVING_SITE_KINDS.NEMESIS_AMBUSH,
      centerX: 100,
      centerZ: 195,
      heightAt,
      regionIndex: 17,
      playerEntity: player,
      nowMinutes: 1000,
      rng: () => 0.1, // guarantees minions and successful taunt
    });
    host.standBlueprint(nemesisBp);
    await new Promise((r) => setTimeout(r, 10));

    const totalNemesisFoes = spawnedFoes.length;
    assert.ok(totalNemesisFoes >= 2, 'high-level nemesis should spawn with retinue minions');

    host.frame(1.1);
    const nemChoice = choicesOpened[choicesOpened.length - 1];
    // Option 1: Taunt into 1v1 solo duel
    nemChoice.options[0].action();
    assert.equal(spawnedFoes.length, 1, 'taunting nemesis into 1v1 duel should dismiss minions from the scene');
    assert.equal(spawnedFoes[0].ai.isHostile, true, 'nemesis leader becomes hostile for the 1v1 duel');

    host.clear();
    assert.equal(host.shown(), null);
  });

  it('Step 6 (Stage 4): Potion/Blessing Pleas, 24h Checkpoint Passes, Nemesis Bribe & Memory, and In-Dungeon Rival / Quest Interception ChoiceWindow', () => {
    const player = {
      level: 10,
      health: 50,
      maxHealth: 100,
      goldPieces: 1000,
      items: [{ group: 'Potions', shortName: 'Potion of Healing' }],
      skills: { Etiquette: 80, Streetwise: 85 },
      stats: { Personality: 75, Luck: 70 },
      regionalReputations: { 17: 0 },
    };

    // 1. Plea consumes healing potion instead of gold, blesses player health (+15), and lowers regional tension
    const reg17 = getRegionState(17);
    reg17.tension = 40;
    const pleaRes = resolvePleaResponse({
      plea: { type: PLEA_TYPE.PLAGUE_CURE, requiredGold: 35, messageKey: 'living.plea.plague' },
      playerEntity: player,
      regionIndex: 17,
      response: 'HELP',
      goldOffered: player.goldPieces,
      nowMinutes: 2000,
    });
    assert.equal(pleaRes.potionUsed, true, 'should consume healing potion from inventory');
    assert.equal(pleaRes.goldSpent, 0, 'no gold spent when potion is used');
    assert.equal(player.items.length, 0, 'potion removed from player inventory');
    assert.equal(player.health, 65, 'player blessed with +15 health');
    assert.equal(player.regionalReputations[17], 3, '+3 regional reputation');
    assert.equal(reg17.tension, 36, 'regional tension lowered by 4');

    // Rude refusal triggers spawnMugger when rng < 0.40
    const rudeRes = resolvePleaResponse({
      plea: { type: PLEA_TYPE.FAMINE_BREAD, requiredGold: 15, messageKey: 'living.plea.famine' },
      playerEntity: player,
      regionIndex: 17,
      response: 'REFUSE_RUDE',
      nowMinutes: 3000,
      rng: () => 0.1,
    });
    assert.equal(rudeRes.spawnMugger, true);
    assert.equal(player.regionalReputations[17], 1, '-2 regional reputation on rude refusal');

    // 2. Nemesis Streetwise bribe & persistent memory in SaveData
    const nemesis = createNemesisHunter(8, { archetype: NEMESIS_ARCHETYPES.BOUNTY_HUNTER, rng: () => 0.2 });
    const bribeRes = resolveNemesisConfrontation(player, nemesis, 'streetwise', () => 0.8);
    assert.equal(bribeRes.resolution, 'BRIBED');
    assert.ok(bribeRes.bribeGold >= 50);
    const nemMem = getNemesisMemory();
    assert.equal(nemMem.encounters, 1);
    assert.equal(nemMem.escapedCount, 1);
    assert.equal(nemMem.lastNemesisName, nemesis.name);
    assert.equal(getLivingSaveData().subsystems.nemesis.escapedCount, 1);

    // 3. In-Dungeon Delving Rival Adventurer -> Etiquette turns rival into PlayerAlly in the dungeon!
    const pool = ensureAdventurerPool();
    const delver = pool.find((a) => a.currentRegion === 17);
    delver.status = 'DELVING';
    delver.targetLocationId = 'dungeon_17_4';
    delver.trait = 'HONORABLE';

    const activeHit = getDungeonActiveAdventurer(8004, 17); // 8004 % 10 === 4 -> dungeon_17_4
    assert.ok(activeHit && activeHit.adv.id === delver.id);
    assert.equal(activeHit.intercepted, null);

    const foeRecord = {
      entity: { name: delver.name, team: 'Enemy', mobileTeam: 'Enemy', items: [] },
      ai: { isHostile: false, detected: false },
    };
    const delverSpec = buildDungeonAdventurerChoiceSpec({
      adv: activeHit.adv,
      intercepted: null,
      locationId: 8004,
      regionIndex: 17,
      playerEntity: player,
      foeRecord,
      rng: () => 0.1,
    });
    // Option 2: Appeal to Etiquette -> becomes PlayerAlly in the dungeon
    delverSpec.options[1].action();
    assert.equal(foeRecord.entity.team, 'PlayerAlly', 'convinced dungeon rival should join PlayerAlly team');

    // 4. In-Dungeon Intercepted Quest Rival -> Buyout reclaims quest trophy into player.items!
    const reg = getAdventurerSimRegistry();
    reg.interceptedQuests['dungeon_17_4'] = {
      questId: 8004,
      locationId: 'dungeon_17_4',
      adventurerId: delver.id,
      adventurerName: delver.name,
      adventurerClass: delver.className,
      adventurerLevel: 5,
      adventurerTrait: 'MERCENARY',
      recovered: false,
      claimedByAdventurer: true,
    };

    const interceptedHit = getDungeonActiveAdventurer(8004, 17);
    assert.ok(interceptedHit && interceptedHit.intercepted);

    const interceptSpec = buildDungeonAdventurerChoiceSpec({
      adv: interceptedHit.adv,
      intercepted: interceptedHit.intercepted,
      locationId: 8004,
      regionIndex: 17,
      playerEntity: player,
      foeRecord,
      rng: () => 0.2,
    });
    const goldBeforeBuyout = player.goldPieces;
    // Option 2: Buyout with gold
    interceptSpec.options[1].action();
    assert.ok(player.goldPieces < goldBeforeBuyout, 'buying out intercepted quest should deduct gold');
    assert.equal(reg.interceptedQuests['dungeon_17_4'].recovered, true, 'intercepted quest marked recovered');
    assert.ok(
      player.items.some((it) => it.group === 'QuestItems'),
      'reclaimed quest trophy added to player inventory',
    );
  });

  it('Step 7: Non-Seeking Wandering Road Adventurers (4-Tier Setting, 4 Situations, 5 Interactions), Stealth Ambush Evade, Urban Skirmish Resolution, and Naval Side Choice', async () => {
    // 1. 4-tier setting scaling for roadAdventurers
    LivingTamrielConfig.roadAdventurers = PRESENCE.OFF;
    assert.equal(getRoadAdventurerSiteChance(LivingTamrielConfig.roadAdventurers), 0);
    assert.equal(getRoadAdventurerAmbientShare(LivingTamrielConfig.roadAdventurers), 0);

    LivingTamrielConfig.roadAdventurers = PRESENCE.LIGHT;
    assert.equal(getRoadAdventurerSiteChance(LivingTamrielConfig.roadAdventurers), 0.12);
    assert.equal(getRoadAdventurerAmbientShare(LivingTamrielConfig.roadAdventurers), 0.06);

    LivingTamrielConfig.roadAdventurers = PRESENCE.MID;
    assert.equal(getRoadAdventurerSiteChance(LivingTamrielConfig.roadAdventurers), 0.24);
    assert.equal(getRoadAdventurerAmbientShare(LivingTamrielConfig.roadAdventurers), 0.14);

    LivingTamrielConfig.roadAdventurers = PRESENCE.HIGH;
    assert.equal(getRoadAdventurerSiteChance(LivingTamrielConfig.roadAdventurers), 0.40);
    assert.equal(getRoadAdventurerAmbientShare(LivingTamrielConfig.roadAdventurers), 0.25);

    // 2. Blueprint generation for WANDERING_ADVENTURER across situations
    const player = {
      level: 8,
      health: 50,
      maxHealth: 100,
      fatigue: 30,
      maxFatigue: 100,
      goldPieces: 500,
      skills: { Etiquette: 75, Streetwise: 80 },
      stats: { Personality: 70, Luck: 65, Strength: 65, Agility: 65 },
      regionalReputations: { 17: 0 },
    };

    // Nighttime -> ROADSIDE_CAMP (tent + campfire + non-hostile adventurer)
    const campBp = buildLivingSiteBlueprint({
      kind: LIVING_SITE_KINDS.WANDERING_ADVENTURER,
      centerX: 10,
      centerZ: 20,
      heightAt: () => 4,
      regionIndex: 17,
      playerEntity: player,
      nowMinutes: 23 * 60, // Night -> ROADSIDE_CAMP
      onRoad: true,
      rng: () => 0.65,
    });
    assert.equal(campBp.meta.situation, ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP);
    assert.ok(campBp.meshes.some((m) => m.modelId === LIVING_MODELS.TENT));
    assert.ok(campBp.flats.some((f) => f.lightRadius > 0));
    assert.equal(campBp.actors.length, 1);
    assert.equal(campBp.actors[0].hostile, false);

    // Daytime skirmish roll -> SKIRMISH_WITH_MONSTERS (allied adventurer + 2 hostile monsters)
    const skirmishBp = buildLivingSiteBlueprint({
      kind: LIVING_SITE_KINDS.WANDERING_ADVENTURER,
      centerX: 10,
      centerZ: 20,
      heightAt: () => 4,
      regionIndex: 17,
      playerEntity: player,
      nowMinutes: 12 * 60, // Noon
      onRoad: false,
      rng: () => 0.15, // < 0.30 -> SKIRMISH_WITH_MONSTERS
    });
    assert.equal(skirmishBp.meta.situation, ROAD_ADVENTURER_SITUATION.SKIRMISH_WITH_MONSTERS);
    assert.equal(skirmishBp.actors.length, 3);
    const advActor = skirmishBp.actors.find((a) => a.role === 'wandering_adventurer');
    assert.equal(advActor.allied, true);
    assert.equal(advActor.team, 'PlayerAlly');

    // 3. Wandering Adventurer ChoiceWindow interactions (SHARE_INTEL, RECRUIT_ALLY, EXTORT_SPOILS)
    const intelRes = resolveWanderingAdventurerInteraction({
      adv: campBp.meta.adv,
      situation: ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP,
      playerEntity: player,
      action: 'SHARE_INTEL',
      regionIndex: 17,
    });
    assert.equal(intelRes.outcome, WANDERING_OUTCOME.INTEL_SHARED);
    assert.equal(intelRes.healed, true);
    assert.equal(player.health, 65, 'sharing camp restores +15 health');

    const spawnedFoes = [];
    let choiceSpec = null;
    let playerPos = [0, 4, 0];
    let afloat = false;
    const host = createLivingSceneHost({
      feet: () => playerPos,
      ready: () => true,
      clock: () => 12 * 60,
      regionIndex: () => 17,
      inLocationRect: () => false,
      onRoad: () => true,
      afloat: () => afloat,
      heightAt: () => 4,
      playerEntity: () => player,
      spawn: async (type, feet, opts) => {
        const rec = {
          mobileType: type,
          feet,
          opts,
          dead: false,
          entity: { name: '', team: opts.team, currentHealth: 80 },
          ai: { isHostile: !opts.allied, detected: false },
        };
        spawnedFoes.push(rec);
        return rec;
      },
      remove: (rec) => {
        rec.dead = true;
      },
      inPool: (rec) => !rec.dead,
      say: () => {},
      openChoice: (spec) => {
        choiceSpec = spec;
      },
    });

    host.standBlueprint(campBp);
    await new Promise((r) => setTimeout(r, 5));
    playerPos = [10, 4, 15];
    host.frame(1.1);
    assert.ok(choiceSpec, 'Approaching wandering adventurer opens 5-option ChoiceWindow');
    assert.equal(choiceSpec.options.length, 5);
    // Option 2: Recruit ally
    choiceSpec.options[1].action();
    const stoodAdv = spawnedFoes.find((f) => f.livingRole === 'recruited_companion' || f.livingRole === 'wandering_adventurer');
    assert.equal(stoodAdv.entity.team, 'PlayerAlly', 'recruited road adventurer joins PlayerAlly');

    // 4. Stealth-detected BANDIT_CAMP ambush ChoiceWindow
    choiceSpec = null;
    spawnedFoes.length = 0;
    const stealthBanditBp = buildLivingSiteBlueprint({
      kind: LIVING_SITE_KINDS.BANDIT_CAMP,
      centerX: 10,
      centerZ: 20,
      heightAt: () => 4,
      regionIndex: 17,
      playerEntity: player,
      nowMinutes: 12 * 60,
      ambushDetectedByStealth: true,
    });
    assert.equal(stealthBanditBp.actors.every((a) => a.hostile === false), true, 'stealth-detected bandits start non-hostile');
    host.standBlueprint(stealthBanditBp);
    await new Promise((r) => setTimeout(r, 5));
    host.frame(1.1);
    assert.ok(choiceSpec, 'Stealth-detected ambush opens ChoiceWindow');
    assert.equal(choiceSpec.options.length, 2);
    // Option 2: Surprise attack reduces bandit HP by 25% and turns them hostile
    choiceSpec.options[1].action();
    assert.equal(spawnedFoes[0].entity.currentHealth, 60, 'surprise attack reduces bandit HP from 80 to 60');
    assert.equal(spawnedFoes[0].ai.isHostile, true);

    // 5. Naval Squadron side choice when afloat
    host.clear();
    choiceSpec = null;
    afloat = true;
    setRegionCrisis(17, 'WAR', 'MID');
    host.frame(1.1);
    assert.ok(choiceSpec, 'Sailing in a crisis region triggers Naval Squadron ChoiceWindow');
    assert.equal(choiceSpec.options.length, 3);
    const repBefore = player.regionalReputations[17] || 0;
    choiceSpec.options[0].action(); // Join Navy
    assert.ok(player.regionalReputations[17] > repBefore, 'Joining Provincial Navy grants positive regional reputation');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 8: Post-Beta 1.1 Polish (3D Naval Squadron, Persistent 24h Companion,
  //         Regional Crisis Radiant Contracts, Audio Accents & /living Console)
  // ═══════════════════════════════════════════════════════════════════════════

  it('Step 8: materializes 3D naval squadrons, persists 24h recruited companions, runs crisis contracts, and executes /living commands', async () => {
    // 1. 3D Naval Squadron blueprint & culling at 450m
    setRegionCrisis(17, 'WAR', 'MID');
    const navalBp = buildLivingSiteBlueprint({
      kind: LIVING_SITE_KINDS.NAVAL_SQUADRON,
      centerX: 100,
      centerZ: 100,
      heightAt: () => 0,
      regionIndex: 17,
      playerEntity: { level: 6 },
      nowMinutes: 600,
      rng: () => 0.4,
    });
    assert.equal(navalBp.kind, LIVING_SITE_KINDS.NAVAL_SQUADRON);
    assert.ok(navalBp.meshes.length >= 2, 'Naval squadron spawns floating crate/box wreckage props');
    assert.ok(navalBp.actors.some((a) => a.role === 'naval_law'), 'Naval squadron spawns Crown Marines');
    assert.ok(navalBp.actors.some((a) => a.role === 'naval_pirate'), 'Naval squadron spawns Bay Pirates');

    // 1b. Materialize real Come Sail Away 3D warship squadron via navalSquadronBridge
    const launchedShips = [];
    const mockNaval = {
      launchShip: (spec) => {
        const entry = { id: `ship_${launchedShips.length}`, ship: { ...spec, target: null, mode: null } };
        launchedShips.push(entry);
        return entry;
      },
    };
    const { lawShips, pirateShips } = spawnNavalSquadronShips({
      naval: mockNaval,
      squadron: navalBp.meta.squadron,
      playerLevel: 6,
      regionIndex: 17,
    });
    assert.ok(lawShips.length >= 1, 'Spawns at least 1 Law warship');
    assert.ok(pirateShips.length >= 1, 'Spawns at least 1 Pirate corsair');
    assert.equal(lawShips[0].ship.classId, 'warGalley', 'Scales to warGalley at lvl 6');
    assert.equal(pirateShips[0].ship.classId, 'pirateBrigantine', 'Scales to pirateBrigantine at lvl 6');
    assert.equal(lawShips[0].ship.mode, 'engage', 'Warship set to engage mode');
    assert.equal(pirateShips[0].ship.mode, 'engage', 'Pirate ship set to engage mode');

    // 2. Persistent 24h Recruited Adventurer Companion
    dismissAdventurerCompanion();
    assert.equal(getActiveAdventurerCompanion(100), null);
    const comp = recruitAdventurerCompanion(
      { id: 42, name: 'Cyrus', className: 'Rogue', level: 8, trait: 'HONORABLE' },
      1000,
    );
    assert.equal(comp.name, 'Cyrus');
    assert.equal(comp.expiresAtMinutes, 1000 + COMPANION_DURATION_MINUTES);
    assert.ok(getActiveAdventurerCompanion(1500), 'Companion remains active within 24 in-game hours');
    assert.equal(
      getActiveAdventurerCompanion(1000 + COMPANION_DURATION_MINUTES + 1),
      null,
      'Companion automatically expires after 24 in-game hours',
    );

    // 3. Regional Crisis Radiant Contracts (offer, accept, complete, tension reduction)
    setRegionCrisis(20, 'PLAGUE', 'MID');
    const reg20 = getRegionState(20);
    reg20.tension = 0.85;
    const offer = offerRegionalCrisisContract(20, 5);
    assert.ok(offer);
    assert.equal(offer.questType, CRISIS_QUEST_TYPE.PLAGUE_SMUGGLED_CURE);
    assert.equal(offer.rewardGold, 250 + 5 * 40);

    const accepted = acceptRegionalCrisisContract(20, 5, 1200);
    assert.ok(accepted);
    assert.equal(getActiveCrisisContract(20)?.status, 'ACTIVE');

    const contractPlayer = { goldPieces: 100, regionalReputations: { 20: 0 } };
    const completed = completeRegionalCrisisContract(20, contractPlayer);
    assert.ok(completed?.completed);
    assert.equal(contractPlayer.goldPieces, 100 + offer.rewardGold);
    assert.equal(contractPlayer.regionalReputations[20], 5);
    assert.ok(reg20.tension < 0.85, 'Completing a crisis contract reduces regional crisis tension');
    assert.equal(getActiveCrisisContract(20), null, 'Completed contract is no longer active');

    // 4. Audio Accents & Companion HUD hook in createLivingSceneHost + /living Console Command
    const soundsPlayed = [];
    const companionEvents = [];
    const spawned = [];
    let playerFeet = [0, 0, 0];
    recruitAdventurerCompanion({ id: 77, name: 'Barenziah', className: 'Nightblade', level: 7 }, 2000);

    const host = createLivingSceneHost({
      feet: () => playerFeet,
      ready: () => true,
      clock: () => 2010,
      regionIndex: () => 17,
      inLocationRect: () => false,
      onRoad: () => true,
      afloat: () => false,
      heightAt: () => 0,
      playerEntity: () => ({ level: 5, goldPieces: 500, regionalReputations: { 17: 0 } }),
      spawn: async (type, feet, opts) => {
        const rec = {
          mobileType: type,
          feet,
          opts,
          dead: false,
          entity: { name: '', team: opts.team },
          ai: { isHostile: !opts.allied, detected: false },
        };
        spawned.push(rec);
        return rec;
      },
      remove: (rec) => {
        rec.dead = true;
      },
      inPool: (rec) => !rec.dead,
      say: () => {},
      openChoice: () => {},
      playSound: (id) => soundsPlayed.push(id),
      onCompanionChanged: (c) => companionEvents.push(c),
    });

    host.frame(1.1);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(companionEvents.length, 1, 'onCompanionChanged fires when companion is active');
    assert.equal(companionEvents[0]?.name, 'Barenziah');
    assert.ok(
      spawned.some((f) => f.livingRole === 'recruited_companion' && f.entity.team === 'PlayerAlly'),
      'Recruited companion spawns beside player outdoors',
    );

    const statusOut = executeLivingConsoleCommand(['status'], {
      regionIndex: 17,
      nowMinutes: 2010,
    });
    assert.ok(statusOut.includes('Region 17'));
    assert.ok(statusOut.includes('Barenziah'));

    const crisisOut = executeLivingConsoleCommand(['crisis', 'FAMINE', 'START'], {
      regionIndex: 17,
    });
    assert.ok(crisisOut.includes('FAMINE (START)'));
    assert.equal(getRegionState(17).crisis, 'FAMINE');

    const questAcceptOut = executeLivingConsoleCommand(['quest'], {
      regionIndex: 17,
      playerEntity: contractPlayer,
      nowMinutes: 2010,
    });
    assert.ok(questAcceptOut.includes('Accepted crisis contract'));
    assert.ok(getActiveCrisisContract(17));

    // Verify 'site spawn' alias support
    const siteSpawnOut = executeLivingConsoleCommand(['site', 'spawn', 'roadside_plea'], {
      regionIndex: 17,
      playerFeet: [0, 0, 0],
      sceneHost: host,
    });
    assert.ok(siteSpawnOut.includes('Spawned PLEA_ENCOUNTER'));
    assert.equal(host.shown()?.kind, LIVING_SITE_KINDS.PLEA_ENCOUNTER);

    // Verify encounter console command
    let encounterTriggered = null;
    const encounterOut = executeLivingConsoleCommand(['encounter', 'pack'], {
      regionIndex: 17,
      triggerEncounter: (k) => { encounterTriggered = k; return 'Encounter triggered: pack'; },
    });
    assert.equal(encounterTriggered, 'pack');
    assert.ok(encounterOut.includes('Encounter triggered'));

    const spawnOut = executeLivingConsoleCommand(['spawn', 'checkpoint'], {
      regionIndex: 17,
      playerFeet: [0, 0, 0],
      sceneHost: host,
    });
    assert.ok(spawnOut.includes('Spawned CHECKPOINT'));
    assert.equal(host.shown()?.kind, LIVING_SITE_KINDS.CHECKPOINT);

    // Move close to checkpoint to trigger halt sound
    playerFeet = [16, 0, 16];
    host.frame(1.1);
    assert.ok(soundsPlayed.includes(LIVING_SOUNDS.HALT), 'Approaching checkpoint plays HALT sound clip');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 9: Post-Beta 1.2 End-to-End Audit Fixes (Quest Log Q Integration,
  //         Street-Safe Town Plea, Quarantine Healer Cure, Checkpoint 24h Pass,
  //         Bandit Camp Contract Clear, Exact Single Gold Delta & Grudge -> Nemesis)
  // ═══════════════════════════════════════════════════════════════════════════

  it('Step 9: wires Quest Log (Q) entries, street-safe town pleas, quarantine healer service, 24h checkpoint pass bypass, bandit camp contract completion, and grudge-to-nemesis loop', async () => {
    // 1. Quest Log (Q) entries for active Crisis Contracts and Intercepted Quests
    setRegionCrisis(17, 'WAR', 'MID');
    acceptRegionalCrisisContract(17, 6, 1000);
    const simReg = getAdventurerSimRegistry();
    simReg.interceptedQuests['dungeon_17_3'] = {
      questId: 9003,
      locationId: 'dungeon_17_3',
      adventurerId: 12,
      adventurerName: 'Gortwog',
      adventurerClass: 'Warrior',
      adventurerLevel: 7,
      recovered: false,
      claimedByAdventurer: true,
    };
    const logEntries = getLivingQuestLogEntries(1050);
    assert.ok(logEntries.some((q) => q.questId === 'living_crisis_17'), 'Active regional crisis contract appears in Quest Log');
    assert.ok(logEntries.some((q) => String(q.questId).includes('living_intercept_')), 'Unrecovered rival quest interception appears in Quest Log');

    // 2. Street-safe PLEA_ENCOUNTER blueprint (no street-blocking tents/wagons)
    const pleaBp = buildLivingSiteBlueprint({
      kind: LIVING_SITE_KINDS.PLEA_ENCOUNTER,
      centerX: 10,
      centerZ: 10,
      heightAt: () => 0,
      regionIndex: 17,
      playerEntity: { level: 5 },
      nowMinutes: 1100,
    });
    assert.equal(pleaBp.meshes.length, 0, 'Town street PLEA_ENCOUNTER has zero 3D tents/wagons');
    assert.equal(pleaBp.actors.length, 1, 'Town street PLEA_ENCOUNTER spawns a single supplicant NPC');

    // 3. QUARANTINE_TENT field physician cure & heal option
    setRegionCrisis(20, 'PLAGUE', 'MID');
    const player = {
      level: 6,
      health: 20,
      currentHealth: 20,
      maxHealth: 100,
      isDiseased: true,
      isPoisoned: true,
      goldPieces: 500,
      skills: { Etiquette: 75, Streetwise: 80 },
      stats: { Personality: 70, Luck: 70, Strength: 75, Agility: 75 },
      regionalReputations: { 17: 0, 20: 0 },
    };

    let choiceSpec = null;
    const messages = [];
    const spawned = [];
    let playerFeet = [10, 0, 10];
    let currentReg = 20;

    const host = createLivingSceneHost({
      feet: () => playerFeet,
      ready: () => true,
      clock: () => 1200,
      regionIndex: () => currentReg,
      inLocationRect: () => false,
      onRoad: () => true,
      afloat: () => false,
      heightAt: () => 0,
      playerEntity: () => player,
      spawn: async (type, feet, opts) => {
        const rec = {
          mobileType: type,
          feet,
          opts,
          dead: false,
          entity: { name: '', team: opts.team, currentHealth: 50 },
          ai: { isHostile: !opts.allied, detected: false },
        };
        spawned.push(rec);
        return rec;
      },
      remove: (rec) => {
        rec.dead = true;
      },
      inPool: (rec) => !rec.dead,
      say: (msg) => messages.push(msg),
      openChoice: (spec) => {
        choiceSpec = spec;
      },
    });

    const quarBp = buildLivingSiteBlueprint({
      kind: LIVING_SITE_KINDS.QUARANTINE_TENT,
      centerX: 12,
      centerZ: 12,
      heightAt: () => 0,
      regionIndex: 20,
      playerEntity: player,
      nowMinutes: 1200,
    });
    host.standBlueprint(quarBp);
    await new Promise((r) => setTimeout(r, 5));
    host.frame(1.1);
    assert.ok(choiceSpec, 'Quarantine tent opens ChoiceWindow');
    const cureOption = choiceSpec.options.find((o) => o.label.includes('100g'));
    assert.ok(cureOption, 'Quarantine tent ChoiceWindow includes Field Physician Cure (100g) option');
    cureOption.action();
    assert.equal(player.isDiseased, false, 'Field physician cures disease');
    assert.equal(player.isPoisoned, false, 'Field physician cures poison');
    assert.equal(player.health, 100, 'Field physician restores full HP');
    assert.equal(player.goldPieces, 400, 'Field physician deducts 100g');

    // 4. CHECKPOINT 24h Pass Auto-Bypass when contract is already active
    currentReg = 17;
    choiceSpec = null;
    const cpBp = buildLivingSiteBlueprint({
      kind: LIVING_SITE_KINDS.CHECKPOINT,
      centerX: 12,
      centerZ: 12,
      heightAt: () => 0,
      regionIndex: 17,
      playerEntity: player,
      nowMinutes: 1200,
    });
    host.standBlueprint(cpBp);
    await new Promise((r) => setTimeout(r, 5));
    host.frame(1.1);
    assert.ok(choiceSpec, 'First checkpoint visit opens ChoiceWindow');
    // Pay toll to acquire 24h pass
    choiceSpec.options[1].action();
    assert.equal(hasRegionalCheckpointPass(17, 1250), true, 'Paying toll grants 24h regional pass');

    // Second checkpoint in same region with active contract auto-waves player through without modal
    choiceSpec = null;
    host.standBlueprint(cpBp);
    await new Promise((r) => setTimeout(r, 5));
    host.frame(1.1);
    assert.equal(choiceSpec, null, 'Second checkpoint with active 24h pass auto-waves player through without modal');

    // 5. BANDIT_CAMP clear completes active Regional Crisis Contract
    spawned.length = 0;
    const banditBp = buildLivingSiteBlueprint({
      kind: LIVING_SITE_KINDS.BANDIT_CAMP,
      centerX: 12,
      centerZ: 12,
      heightAt: () => 0,
      regionIndex: 17,
      playerEntity: player,
      nowMinutes: 1250,
    });
    host.standBlueprint(banditBp);
    await new Promise((r) => setTimeout(r, 5));
    const goldBeforeBandits = player.goldPieces;
    for (const f of spawned) f.dead = true;
    host.frame(1.1);
    assert.ok(player.goldPieces > goldBeforeBandits, 'Clearing BANDIT_CAMP awards active Crisis Contract gold');
    assert.equal(getActiveCrisisContract(17), null, 'Active Crisis Contract completed by clearing bandit camp');

    // 6. WANDERING_ADVENTURER single gold mutation + Grudge -> Nemesis Avenger + Nemesis defeat bounty
    const roadBp = buildLivingSiteBlueprint({
      kind: LIVING_SITE_KINDS.WANDERING_ADVENTURER,
      centerX: 12,
      centerZ: 12,
      heightAt: () => 0,
      regionIndex: 17,
      playerEntity: player,
      nowMinutes: 1300,
      onRoad: true,
      rng: () => 0.9,
    });
    roadBp.meta.adv.level = 2; // Ensure player wins wager spar
    const expectedWager = Math.max(25, roadBp.meta.adv.level * 15);
    choiceSpec = null;
    host.standBlueprint(roadBp);
    await new Promise((r) => setTimeout(r, 5));
    host.frame(1.1);
    const goldBeforeSpar = player.goldPieces;
    choiceSpec.options[2].action(); // Option 3: Wager Spar
    assert.equal(
      player.goldPieces - goldBeforeSpar,
      expectedWager,
      'Wager spar applies exact single wager delta (no double mutation)',
    );
    assert.equal(getNemesisMemory().hasGrudge, true, 'Winning duel records adventurer grudge in Nemesis memory');
    assert.equal(getNemesisMemory().lastNemesisName, roadBp.meta.adv.name);

    // Spawn NEMESIS_AMBUSH -> uses GRUDGE_AVENGER with the defeated rival's name, and pays bounty when slain
    spawned.length = 0;
    const nemBp = buildLivingSiteBlueprint({
      kind: LIVING_SITE_KINDS.NEMESIS_AMBUSH,
      centerX: 12,
      centerZ: 12,
      heightAt: () => 0,
      regionIndex: 17,
      playerEntity: player,
      nowMinutes: 1350,
      rng: () => 0.1,
    });
    assert.equal(nemBp.meta.nemesis.archetype, NEMESIS_ARCHETYPES.GRUDGE_AVENGER);
    assert.equal(nemBp.meta.nemesis.name, roadBp.meta.adv.name);

    host.standBlueprint(nemBp);
    await new Promise((r) => setTimeout(r, 5));
    const goldBeforeNemKill = player.goldPieces;
    for (const f of spawned) {
      if (f.livingRole === 'nemesis_leader') f.dead = true;
    }
    host.frame(1.1);
    assert.equal(
      player.goldPieces,
      goldBeforeNemKill + nemBp.meta.nemesis.contractBounty,
      'Slaying Nemesis leader awards contractBounty gold',
    );
    assert.equal(getNemesisMemory().hasGrudge, false, 'Slaying Nemesis leader clears active grudge');
  });
});
