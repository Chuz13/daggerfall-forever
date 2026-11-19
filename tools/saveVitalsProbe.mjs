import { isMain } from './lib/isMain.mjs';
import {
  bootWorldPage,
  clickPauseTab,
  clickSystemRail,
  clickTileLoadButton,
  closePause,
  createCheckLedger,
  dismissNoticesAndDialogs,
  getLiveVitals,
  loadSlotViaUi,
  maybeShot,
  openPause,
  readContinueHealth,
  readOverwritePreviewHealth,
  readPauseCharacterHealth,
  readTileHealth,
  runDebugConsoleCommand,
  saveViaUi,
  startLiveSession,
  waitFrames,
  waitWorldReady,
} from './lib/liveE2e.mjs';

const WORLD_QUERY = '/play/?world&shot&play&region=Daggerfall&loc=Arkbridge&class=1&novideo&nofoes&grass=off&skin=enhanced';

async function setLivePlayerHealth(page, value) {
  await page.evaluate(async (hp) => {
    const { playerEntity } = await import('/src/characters/playerEntity.js');
    playerEntity.health = hp;
  }, value);
  await waitFrames(page, 2);
}

/** Verify save/load vitals scaling across Mortal, Ascension, Lich, Renown, and legacy saves. */
export async function runSaveVitalsProbe({ port = 5225, shotsDir = process.env.SHOTS?.trim() || null } = {}) {
  const { check, summary } = createCheckLedger();
  const session = await startLiveSession({ port, requireArena2: true, shotsDir });
  const worldUrl = `${session.baseUrl}${WORLD_QUERY}`;

  try {
    // Live world progression: set_level, Apotheosis UI, Ancient Lich, Firmament Renown, Save/Load cards
    const { context: ctx1, page } = await session.openPage({ viewport: { width: 1280, height: 800 } });

    console.log('\n=== SCENARIO 1: Live World Boot, Console set_level 25, Ascension UI, Ancient Lich, Renown ===');
    await bootWorldPage(page, worldUrl, { label: 'S1-world' });

    const mortalInit = await getLiveVitals(page);
    console.log('Initial Mortal vitals:', JSON.stringify(mortalInit));
    check('S1.0 Initial world boot ready', mortalInit.maxHealth > 0 && mortalInit.health > 0, JSON.stringify(mortalInit));

    const lvlRes = await runDebugConsoleCommand(page, 'set_level 25');
    console.log(`Console set_level 25 (${lvlRes.via}): ${lvlRes.output}`);
    const afterLvl = await getLiveVitals(page);
    check(
      'S1.1 Debug console set_level 25 updates rawMaxHealth & preserves 100% HP',
      lvlRes.via === 'ui' &&
        afterLvl.level === 25 &&
        afterLvl.rawMaxHealth > mortalInit.rawMaxHealth &&
        afterLvl.health === afterLvl.maxHealth,
      `via=${lvlRes.via} level=${afterLvl.level} rawMax=${mortalInit.rawMaxHealth}->${afterLvl.rawMaxHealth} hp=${afterLvl.health}/${afterLvl.maxHealth}`,
    );

    const apoQuestRes = await runDebugConsoleCommand(page, 'apo quest complete');
    console.log(`Console apo quest complete (${apoQuestRes.via}): ${apoQuestRes.output}`);

    await openPause(page, { shotsDir });
    await clickPauseTab(page, 'Apotheosis');
    const claimBtn = page.locator('#enhanced-pause button.apo-btn.primary').filter({ hasText: 'Claim Portfolio' }).first();
    await claimBtn.waitFor({ state: 'visible', timeout: 10000 });
    await claimBtn.click();
    await page.waitForTimeout(300);

    const afterAsc = await getLiveVitals(page);
    console.log('After First Ascension:', JSON.stringify(afterAsc));
    check(
      'S1.2 First Ascension via Pause UI adds >=500 maxHealth and fills HP & MP to new divine max',
      afterAsc.ascended &&
        afterAsc.maxHealth >= afterLvl.maxHealth + 500 &&
        afterAsc.health === afterAsc.maxHealth &&
        afterAsc.magicka === afterAsc.maxMagicka,
      `portfolio=${afterAsc.portfolio} hp=${afterAsc.health}/${afterAsc.maxHealth} mp=${afterAsc.magicka}/${afterAsc.maxMagicka} (before=${afterLvl.maxHealth})`,
    );
    await closePause(page);

    const lichRes = await runDebugConsoleCommand(page, 'necro ancient_lich');
    console.log(`Console necro ancient_lich (${lichRes.via}): ${lichRes.output}`);
    const firmRes = await runDebugConsoleCommand(page, 'firmament addxp 93778');
    console.log(`Console firmament addxp 93778 (${firmRes.via}): ${firmRes.output}`);
    const healRes = await runDebugConsoleCommand(page, 'heal');
    console.log(`Console heal (${healRes.via}): ${healRes.output}`);
    await waitFrames(page, 2);

    const fullLive = await getLiveVitals(page);
    console.log('Full God+AncientLich+Renown live vitals:', JSON.stringify(fullLive));
    check(
      'S1.3 God (+500) + Ancient Lich (+250) + Firmament Renown active & healed to 100%',
      fullLive.lich === 'ancient_lichdom' &&
        fullLive.health === fullLive.maxHealth &&
        fullLive.maxHealth > fullLive.rawMaxHealth + 750,
      `rawMax=${fullLive.rawMaxHealth}, live=${fullLive.health}/${fullLive.maxHealth}, lich=${fullLive.lich}`,
    );

    await saveViaUi(page, 'GodLichFull', { shotsDir });

    await openPause(page, { shotsDir });
    await clickPauseTab(page, 'Stats');
    const charStatsHealth = await readPauseCharacterHealth(page);
    await maybeShot(page, shotsDir, '01_pause_stats_god_lich.png');
    check(
      'S1.4 Pause -> Stats -> Character shows exact live health/maxHealth',
      charStatsHealth.health === fullLive.health && charStatsHealth.maxHealth === fullLive.maxHealth,
      `displayed="${charStatsHealth.text}" expected="${fullLive.health} / ${fullLive.maxHealth}"`,
    );

    await clickPauseTab(page, 'System');
    await clickSystemRail(page, 'Save Game');
    await page.locator('#enhanced-pause .svtile').first().waitFor({ state: 'visible', timeout: 10000 });
    const saveTileFull = await readTileHealth(page, 'GodLichFull');
    const saveInput = page.locator('#enhanced-pause .px-qdetail input[type="text"]').first();
    await saveInput.fill('GodLichFull');
    await page.waitForTimeout(100);
    const overwritePreview = await readOverwritePreviewHealth(page);
    await maybeShot(page, shotsDir, '02_pause_save_screen_full.png');
    check(
      'S1.5 Pause -> Save screen tile shows full scaled maxHealth (100%)',
      saveTileFull.health === fullLive.health && saveTileFull.maxHealth === fullLive.maxHealth,
      `tile="${saveTileFull.text}" expected="${fullLive.health} / ${fullLive.maxHealth}"`,
    );
    check(
      'S1.6 Pause -> Save screen "Overwrites..." preview shows full scaled maxHealth',
      overwritePreview.health === fullLive.health && overwritePreview.maxHealth === fullLive.maxHealth,
      `preview="${overwritePreview.text}" expected="${fullLive.health} / ${fullLive.maxHealth}"`,
    );

    await clickSystemRail(page, 'Load Game');
    await page.locator('#enhanced-pause .svtile').first().waitFor({ state: 'visible', timeout: 10000 });
    const loadTileFull = await readTileHealth(page, 'GodLichFull');
    await maybeShot(page, shotsDir, '03_pause_load_screen_full.png');
    check(
      'S1.7 Pause -> Load screen tile shows full scaled maxHealth (100%)',
      loadTileFull.health === fullLive.health && loadTileFull.maxHealth === fullLive.maxHealth,
      `tile="${loadTileFull.text}" expected="${fullLive.health} / ${fullLive.maxHealth}"`,
    );
    await closePause(page);

    // Injured save card, in-session load from 1 HP, and repeated save/load round-trip
    console.log('\n=== SCENARIO 2: 50% HP Save, HP=1, Real In-Session Load, Zero-Drift Round-Trip ===');
    const halfHp = Math.round(fullLive.maxHealth / 2);
    await setLivePlayerHealth(page, halfHp);
    await saveViaUi(page, 'GodLichHalf', { shotsDir });

    await openPause(page, { shotsDir });
    await clickPauseTab(page, 'System');
    await clickSystemRail(page, 'Load Game');
    await page.locator('#enhanced-pause .svtile').first().waitFor({ state: 'visible', timeout: 10000 });
    const loadTileHalf = await readTileHealth(page, 'GodLichHalf');
    await maybeShot(page, shotsDir, '04_pause_load_screen_half.png');
    check(
      'S2.1 Injured 50% save card shows full maxHealth and ~50% health',
      loadTileHalf.maxHealth === fullLive.maxHealth && Math.abs((loadTileHalf.health ?? 0) - halfHp) <= 1,
      `tile="${loadTileHalf.text}" expected="~${halfHp} / ${fullLive.maxHealth}"`,
    );
    await closePause(page);

    await setLivePlayerHealth(page, 1);
    const dropped = await getLiveVitals(page);
    check('S2.2 Dropped live HP to 1 before Load', dropped.health === 1, `hp=${dropped.health}`);

    await loadSlotViaUi(page, 'GodLichHalf', { shotsDir });
    const afterLoadHalf = await getLiveVitals(page);
    check(
      'S2.3 Real Load of GodLichHalf restores ~50% HP and preserves rawMaxHealth & maxHealth',
      afterLoadHalf.rawMaxHealth === fullLive.rawMaxHealth &&
        afterLoadHalf.maxHealth === fullLive.maxHealth &&
        Math.abs(afterLoadHalf.health - halfHp) <= 1,
      `rawMax=${afterLoadHalf.rawMaxHealth} (exp ${fullLive.rawMaxHealth}), hp=${afterLoadHalf.health}/${afterLoadHalf.maxHealth} (exp ~${halfHp}/${fullLive.maxHealth})`,
    );

    await loadSlotViaUi(page, 'GodLichFull', { shotsDir });
    const afterLoadFull = await getLiveVitals(page);
    check(
      'S2.4 Real Load of GodLichFull restores 100% HP without inflating rawMaxHealth',
      afterLoadFull.rawMaxHealth === fullLive.rawMaxHealth &&
        afterLoadFull.maxHealth === fullLive.maxHealth &&
        afterLoadFull.health === fullLive.maxHealth,
      `rawMax=${afterLoadFull.rawMaxHealth}, hp=${afterLoadFull.health}/${afterLoadFull.maxHealth}`,
    );

    await saveViaUi(page, 'GodLichFull2', { shotsDir });
    const full2Tile = await loadSlotViaUi(page, 'GodLichFull2', { shotsDir });
    const afterFull2 = await getLiveVitals(page);
    check(
      'S2.5 Repeated Save->Load round-trip (GodLichFull2) has zero drift',
      full2Tile.health === fullLive.maxHealth &&
        full2Tile.maxHealth === fullLive.maxHealth &&
        afterFull2.rawMaxHealth === fullLive.rawMaxHealth &&
        afterFull2.maxHealth === fullLive.maxHealth &&
        afterFull2.health === fullLive.maxHealth,
      `tile="${full2Tile.text}", live=${afterFull2.health}/${afterFull2.maxHealth}, rawMax=${afterFull2.rawMaxHealth}`,
    );

    // Legacy unscaled saves on Main Menu Continue/Load and fresh load into live world
    console.log('\n=== SCENARIO 3: Legacy Save Migration on Main Menu Continue & Load ===');
    const expectedLegacyCards = await page.evaluate(async () => {
      const { restorableSaves, saveSlot } = await import('/src/systems/save/saveSlots.js');
      const { savedVitalsOf } = await import('/src/systems/save/save.js');
      const baseEntry = restorableSaves().find((s) => s?.info?.saveName === 'GodLichFull');
      if (!baseEntry?.snap) throw new Error('GodLichFull snapshot not found in storage');

      const baseCareer = {
        name: 'CustomGod',
        hitPointsPerLevel: 30,
        abilityFlagsAndSpellPointsBitfield: 0x1000,
        primarySkills: [28, 30, 31],
        majorSkills: [29, 32, 33],
        minorSkills: [12, 13, 14, 15, 16, 17],
      };
      const baseStats = {
        strength: 55,
        intelligence: 100,
        willpower: 17,
        agility: 60,
        endurance: 53,
        personality: 48,
        speed: 85,
        luck: 59,
      };
      const firm = { xp: 93778, renown: 21, tree: 'st.start|st.c7.0,st.c7.1,st.s1,st.s2', said: 1 };

      const makeLegacy = ({ id, name, health, activeEffects }) => {
        const snap = JSON.parse(JSON.stringify(baseEntry.snap));
        delete snap.vitalBaseMax;
        snap.characterId = id;
        snap.name = name;
        snap.level = 25;
        snap.health = health;
        snap.maxHealth = 55;
        snap.career = { ...baseCareer };
        snap.stats = { ...baseStats };
        snap.activeEffects = activeEffects;
        snap.racialOverride = null;
        snap.apotheosis = { ascended: true, stage: 'ascended', portfolio: 'war', faith: 500 };
        snap.modData = { ...(snap.modData ?? {}), firmament: { ...firm } };
        return snap;
      };

      const now = Date.now() + 100000;
      const snapInjured = makeLegacy({
        id: 'legacy-god-injured-0002',
        name: 'Aurelius Injured',
        health: 27,
        activeEffects: [],
      });
      const snapLich = makeLegacy({
        id: 'legacy-god-lich-0003',
        name: 'Aurelius Archlich',
        health: 35,
        activeEffects: [{ kind: 'racialOverride', racial: 'ancient_lichdom', hpBonus: 250 }],
      });
      const snapFull = makeLegacy({
        id: 'legacy-god-full-0001',
        name: 'Aurelius Full',
        health: 55,
        activeEffects: [],
      });

      saveSlot(snapInjured.name, 'LegacyGodInjured', snapInjured, { now: now + 1000 });
      saveSlot(snapLich.name, 'LegacyGodLich', snapLich, { now: now + 2000 });
      saveSlot(snapFull.name, 'LegacyGodFull', snapFull, { now: now + 3000 });

      return {
        full: savedVitalsOf(snapFull),
        injured: savedVitalsOf(snapInjured),
        lich: savedVitalsOf(snapLich),
      };
    });
    console.log('Expected savedVitalsOf legacy cards:', JSON.stringify(expectedLegacyCards));

    await page.goto(`${session.baseUrl}/play/?nointro&novideo&nofoes&skin=enhanced`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#enhanced-menu .door-continue', { state: 'visible', timeout: 30000 });
    await page.locator('#enhanced-menu .door-continue').first().click();
    await page.waitForSelector('#enhanced-menu .card dl.stats', { state: 'visible', timeout: 15000 });

    const continueHealth = await readContinueHealth(page);
    await maybeShot(page, shotsDir, '05_main_menu_continue_legacy.png');
    check(
      'S3.1 Main Menu Continue card shows full scaled God maxHealth (>1100, 100% HP)',
      continueHealth.maxHealth > 1100 &&
        continueHealth.health === continueHealth.maxHealth &&
        continueHealth.maxHealth === expectedLegacyCards.full.maxHealth,
      `displayed="${continueHealth.text}" expected="${expectedLegacyCards.full.health} / ${expectedLegacyCards.full.maxHealth}"`,
    );

    const loadMenuBtn = page.locator('#enhanced-menu .railbtn').filter({ hasText: /Load Game/i }).first();
    await loadMenuBtn.click();
    await page.locator('#enhanced-menu .svtile').first().waitFor({ state: 'visible', timeout: 15000 });

    const cardLegacyFull = await readTileHealth(page, 'LegacyGodFull', '#enhanced-menu');
    const cardLegacyInjured = await readTileHealth(page, 'LegacyGodInjured', '#enhanced-menu');
    const cardLegacyLich = await readTileHealth(page, 'LegacyGodLich', '#enhanced-menu');
    await maybeShot(page, shotsDir, '06_main_menu_load_legacy_cards.png');

    const ratioInj = cardLegacyInjured.maxHealth ? cardLegacyInjured.health / cardLegacyInjured.maxHealth : 0;
    const ratioLich = cardLegacyLich.maxHealth ? cardLegacyLich.health / cardLegacyLich.maxHealth : 0;

    check(
      'S3.2 Main Menu Load card LegacyGodFull shows >1100 maxHealth & 100% HP',
      cardLegacyFull.maxHealth > 1100 && cardLegacyFull.health === cardLegacyFull.maxHealth,
      `displayed="${cardLegacyFull.text}"`,
    );
    check(
      'S3.3 Main Menu Load card LegacyGodInjured shows >1100 maxHealth & ~49% HP',
      cardLegacyInjured.maxHealth > 1100 && Math.abs(ratioInj - 27 / 55) < 0.02,
      `displayed="${cardLegacyInjured.text}" ratio=${ratioInj.toFixed(3)} (expected ${(27 / 55).toFixed(3)})`,
    );
    check(
      'S3.4 Main Menu Load card LegacyGodLich shows >1350 maxHealth & ~64% HP',
      cardLegacyLich.maxHealth > 1350 && Math.abs(ratioLich - 35 / 55) < 0.02,
      `displayed="${cardLegacyLich.text}" ratio=${ratioLich.toFixed(3)} (expected ${(35 / 55).toFixed(3)})`,
    );

    await clickTileLoadButton(page, 'LegacyGodFull', '#enhanced-menu');
    await page.waitForSelector('#enhanced-menu', { state: 'detached', timeout: 30000 });
    await waitWorldReady(page, { label: 'S3-main-menu-load' });
    await waitFrames(page, 6);
    await dismissNoticesAndDialogs(page, { label: 'S3' });

    const afterMainMenuLoad = await getLiveVitals(page);
    console.log('Live vitals after Main Menu LegacyGodFull Load:', JSON.stringify(afterMainMenuLoad));
    check(
      'S3.5 Loading LegacyGodFull from Main Menu keeps rawMaxHealth=55, matches card maxHealth, and loads at 100% HP',
      afterMainMenuLoad.rawMaxHealth === 55 &&
        afterMainMenuLoad.maxHealth === cardLegacyFull.maxHealth &&
        afterMainMenuLoad.health === afterMainMenuLoad.maxHealth,
      `rawMax=${afterMainMenuLoad.rawMaxHealth}, live=${afterMainMenuLoad.health}/${afterMainMenuLoad.maxHealth}, card=${cardLegacyFull.text}`,
    );

    await openPause(page, { shotsDir });
    await clickPauseTab(page, 'Stats');
    const postLoadStatsHealth = await readPauseCharacterHealth(page);
    await maybeShot(page, shotsDir, '07_after_main_menu_legacy_load_stats.png');
    check(
      'S3.6 Pause -> Stats after Main Menu Legacy Load matches full scaled Health',
      postLoadStatsHealth.health === afterMainMenuLoad.maxHealth &&
        postLoadStatsHealth.maxHealth === afterMainMenuLoad.maxHealth,
      `displayed="${postLoadStatsHealth.text}" expected="${afterMainMenuLoad.maxHealth} / ${afterMainMenuLoad.maxHealth}"`,
    );
    await closePause(page);
    await ctx1.close();

    // Plain mortal non-regression in a clean browser context
    console.log('\n=== SCENARIO 4: Mortal Regression Check ===');
    const { context: ctx2, page: page2 } = await session.openPage({ viewport: { width: 1280, height: 800 } });
    await bootWorldPage(page2, worldUrl, { label: 'S4-mortal-world' });

    const mortalBefore = await getLiveVitals(page2);
    console.log('Clean Mortal vitals:', JSON.stringify(mortalBefore));
    await saveViaUi(page2, 'MortalCheck', { shotsDir });

    const hasVitalBaseMax = await page2.evaluate(async () => {
      const { restorableSaves, loadSlot } = await import('/src/systems/save/saveSlots.js');
      const entry = restorableSaves().find((s) => s?.info?.saveName === 'MortalCheck');
      const snap = entry ? loadSlot(entry.key) : null;
      return snap ? 'vitalBaseMax' in snap : null;
    });
    check('S4.1 Plain Mortal save does NOT stamp vitalBaseMax', hasVitalBaseMax === false, `hasVitalBaseMax=${hasVitalBaseMax}`);

    await openPause(page2, { shotsDir });
    await clickPauseTab(page2, 'System');
    await clickSystemRail(page2, 'Save Game');
    await page2.locator('#enhanced-pause .svtile').first().waitFor({ state: 'visible', timeout: 10000 });
    const mortalSaveCard = await readTileHealth(page2, 'MortalCheck');

    await clickSystemRail(page2, 'Load Game');
    await page2.locator('#enhanced-pause .svtile').first().waitFor({ state: 'visible', timeout: 10000 });
    const mortalLoadCard = await readTileHealth(page2, 'MortalCheck');
    check(
      'S4.2 Mortal Save & Load cards match live health/maxHealth',
      mortalSaveCard.health === mortalBefore.health &&
        mortalSaveCard.maxHealth === mortalBefore.maxHealth &&
        mortalLoadCard.health === mortalBefore.health &&
        mortalLoadCard.maxHealth === mortalBefore.maxHealth,
      `saveCard="${mortalSaveCard.text}", loadCard="${mortalLoadCard.text}", live=${mortalBefore.health}/${mortalBefore.maxHealth}`,
    );
    await closePause(page2);

    await setLivePlayerHealth(page2, 5);
    await loadSlotViaUi(page2, 'MortalCheck', { shotsDir });
    const mortalAfterLoad = await getLiveVitals(page2);
    check(
      'S4.3 Loading MortalCheck restores exact Mortal HP & maxHealth',
      mortalAfterLoad.health === mortalBefore.health && mortalAfterLoad.maxHealth === mortalBefore.maxHealth,
      `live=${mortalAfterLoad.health}/${mortalAfterLoad.maxHealth} (exp ${mortalBefore.health}/${mortalBefore.maxHealth})`,
    );
    await ctx2.close();

    check('E1 Zero uncaught pageerror events', session.pageErrors.length === 0, `count=${session.pageErrors.length}`);
    check('E2 Zero unexpected console.error events', session.consoleErrors.length === 0, `count=${session.consoleErrors.length}`);

    const report = summary();
    console.log(`\nSUMMARY: ${report.passed}/${report.total} checks passed.`);
    if (report.failed) {
      console.log('FAILED CHECKS:');
      for (const failure of report.failures) {
        console.log(`  - ${failure.label}: ${failure.detail}`);
      }
    }
    return report;
  } finally {
    await session.close();
  }
}

if (isMain(import.meta.url)) {
  runSaveVitalsProbe()
    .then((report) => {
      if (report.failed) process.exit(1);
    })
    .catch((err) => {
      console.error('FATAL:', err);
      process.exit(1);
    });
}
