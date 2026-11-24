import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CRISIS_EVENTS,
  ORSINIUM_REGION_INDEX,
  pickEnemyProvince,
  getEnemyProvinceName,
  matchLivingCrisisEvent,
} from '../../src/systems/living/crisisRegistry.js';
import { planUrbanSkirmish } from '../../src/systems/living/urbanDirector.js';
import {
  SKIRMISH_REP_MATRIX,
  getEventReputationSpec,
  applySkirmishReputationOutcome,
} from '../../src/systems/living/skirmishReputation.js';
import {
  getReputationPriceModifier,
  MAGES_GUILD_FACTION_ID,
  FIGHTERS_GUILD_FACTION_ID,
} from '../../src/systems/living/reputationConsequences.js';
import {
  THE_THIEVES_GUILD,
  THE_DARK_BROTHERHOOD,
  GENERIC_TEMPLE,
  GENERIC_KNIGHTLY_ORDER,
  getReputation,
} from '../../src/systems/faction/factionRep.js';
import { SOCIAL_GROUPS } from '../../src/formats/factionFile.js';
import { LivingTamrielConfig, PRESENCE } from '../../src/systems/living/livingConfig.js';
import { getConsoleCommand } from '../../src/systems/consoleCommands.js';

function makeFactionStore(ids = [40, 42, 107, 108, 450, 844]) {
  const dict = new Map();
  for (const id of ids) {
    dict.set(id, {
      id,
      rep: 0,
      parent: 0,
      children: [],
      ally1: 0,
      ally2: 0,
      ally3: 0,
      enemy1: 0,
      enemy2: 0,
      enemy3: 0,
      ggroup: 0,
      type: 12,
    });
  }
  return { dict };
}

function makePlayer(withFactionStore = true) {
  return {
    level: 8,
    goldPieces: 1000,
    currentRegionIndex: 17,
    legalRep: {},
    regionalReputations: {},
    sGroupReputations: new Array(11).fill(0),
    factionRep: withFactionStore ? makeFactionStore() : null,
  };
}

function targetSignature(t) {
  if (t.kind === 'legal') return `legal:${t.scope}`;
  if (t.kind === 'sgroup') return `sgroup:${t.group}`;
  return `faction:${t.factionId}`;
}

test('Block 5: SKIRMISH_REP_MATRIX covers all 41 CRISIS_EVENTS without f1/f2 target collisions', () => {
  assert.equal(CRISIS_EVENTS.length, 41);
  for (const evt of CRISIS_EVENTS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(SKIRMISH_REP_MATRIX, evt.id),
      `Missing SKIRMISH_REP_MATRIX entry for ${evt.id}`,
    );
    const spec = getEventReputationSpec(evt.id);
    const f1Set = new Set(spec.f1.map(targetSignature));
    for (const target of spec.f2) {
      assert.equal(
        f1Set.has(targetSignature(target)),
        false,
        `Collision between f1 and f2 on ${evt.id} for ${targetSignature(target)}`,
      );
    }
  }
});

test('Block 5: EVT_WAR_INTERPROVINCIAL routes f1 to Daggerfall legalRep+Nobility and f2 to enemyRegion legalRep (no -3 bug)', () => {
  const player = makePlayer();
  const res = applySkirmishReputationOutcome(player, {
    eventId: 'EVT_WAR_INTERPROVINCIAL',
    regionIndex: 17,
    enemyRegionIndex: 10,
    repF1Delta: 7,
    repF2Delta: -10,
  });

  assert.equal(player.legalRep[17], 7, 'Daggerfall legalRep must be +7, NOT +7 - 10 = -3');
  assert.equal(player.regionalReputations[17], 7);
  assert.equal(player.legalRep[10], -10, 'Enemy region (Bantha) legalRep must be -10');
  assert.equal(player.sGroupReputations[SOCIAL_GROUPS.Nobility], 4);
  assert.equal(res.netLocalLegalDelta, 7);
  assert.deepEqual(
    res.applied.map((e) => [e.targetKey, e.delta]),
    [
      ['legal:17', 7],
      ['sgroup:3', 4],
      ['legal:10', -10],
    ],
  );

  // Siding with attackers (f2): repF1=-12, repF2=+7
  const player2 = makePlayer();
  applySkirmishReputationOutcome(player2, {
    eventId: 'EVT_WAR_INTERPROVINCIAL',
    regionIndex: 17,
    enemyRegionIndex: 10,
    repF1Delta: -12,
    repF2Delta: 7,
  });
  assert.equal(player2.legalRep[17], -12);
  assert.equal(player2.legalRep[10], 7);
  assert.equal(player2.sGroupReputations[SOCIAL_GROUPS.Nobility], -6);
});

test('Block 5: EVT_WAR_RECRUITMENT_PRESSGANG routes recruiters vs reluctant peasants cleanly', () => {
  const evt = matchLivingCrisisEvent({ regionIndex: 17, locationType: 0, forcedEventId: 'evt_war_recruitment_pressgang' });
  assert.equal(evt?.id, 'EVT_WAR_RECRUITMENT_PRESSGANG');
  const choices = evt.getChoices('Daggerfall Recruiter', 'Reluctant Peasants');
  assert.equal(choices[0].repF1, 4);
  assert.equal(choices[0].repF2, -5);

  const p1 = makePlayer();
  applySkirmishReputationOutcome(p1, {
    eventId: evt.id,
    regionIndex: 17,
    repF1Delta: choices[0].repF1,
    repF2Delta: choices[0].repF2,
  });
  assert.equal(p1.legalRep[17], 4);
  assert.equal(p1.sGroupReputations[SOCIAL_GROUPS.Nobility], 2);
  assert.equal(p1.sGroupReputations[SOCIAL_GROUPS.Commoners], -5);

  const p2 = makePlayer();
  applySkirmishReputationOutcome(p2, {
    eventId: evt.id,
    regionIndex: 17,
    repF1Delta: choices[1].repF1,
    repF2Delta: choices[1].repF2,
  });
  assert.equal(p2.legalRep[17], -8);
  assert.equal(p2.sGroupReputations[SOCIAL_GROUPS.Nobility], -4);
  assert.equal(p2.sGroupReputations[SOCIAL_GROUPS.Commoners], 8);
});

test('Block 5: EVT_WAR_ORSINIUM_RAID targets Orsinium (26) for f2 and avoids collision if already in Orsinium', () => {
  const p = makePlayer();
  applySkirmishReputationOutcome(p, {
    eventId: 'EVT_WAR_ORSINIUM_RAID',
    regionIndex: 17,
    repF1Delta: 8,
    repF2Delta: -15,
  });
  assert.equal(p.legalRep[17], 8);
  assert.equal(p.sGroupReputations[SOCIAL_GROUPS.Commoners], 4);
  assert.equal(p.legalRep[ORSINIUM_REGION_INDEX], -15);

  const pInOrsinium = makePlayer();
  applySkirmishReputationOutcome(pInOrsinium, {
    eventId: 'EVT_WAR_ORSINIUM_RAID',
    regionIndex: ORSINIUM_REGION_INDEX,
    repF1Delta: 8,
    repF2Delta: -15,
  });
  assert.equal(pInOrsinium.legalRep[ORSINIUM_REGION_INDEX], 8);
});

test('Block 5: Crime, Arcane & Guild events mutate real factionRep & sGroupReputations and safely skip null factionRep', () => {
  const p = makePlayer(true);
  applySkirmishReputationOutcome(p, {
    eventId: 'EVT_CRIME_DAYLIGHT_HEIST',
    regionIndex: 17,
    repF1Delta: -8,
    repF2Delta: 8,
  });
  assert.equal(p.legalRep[17], -8);
  assert.equal(p.sGroupReputations[SOCIAL_GROUPS.Merchants], -4);
  assert.equal(p.sGroupReputations[SOCIAL_GROUPS.Underworld], 4);
  assert.equal(getReputation(p.factionRep, THE_THIEVES_GUILD), 8);

  applySkirmishReputationOutcome(p, {
    eventId: 'EVT_CRIME_BROTHERHOOD_CONTRACT',
    regionIndex: 17,
    repF1Delta: -15,
    repF2Delta: 10,
  });
  assert.equal(getReputation(p.factionRep, THE_DARK_BROTHERHOOD), 10);
  assert.equal(p.sGroupReputations[SOCIAL_GROUPS.Nobility], -15);

  applySkirmishReputationOutcome(p, {
    eventId: 'EVT_MAD_WIZARD_RAMPAGE',
    regionIndex: 17,
    repF1Delta: 10,
    repF2Delta: 0,
  });
  assert.equal(getReputation(p.factionRep, MAGES_GUILD_FACTION_ID), 10);
  assert.equal(p.sGroupReputations[SOCIAL_GROUPS.Scholars], 5);

  applySkirmishReputationOutcome(p, {
    eventId: 'EVT_TAVERN_CHESS_WAGER',
    regionIndex: 17,
    repF1Delta: 4,
    repF2Delta: -2,
  });
  assert.equal(getReputation(p.factionRep, FIGHTERS_GUILD_FACTION_ID), 4);
  assert.equal(p.sGroupReputations[SOCIAL_GROUPS.Scholars], 3);

  // Also test Temples & Knightly Orders
  applySkirmishReputationOutcome(p, {
    eventId: 'EVT_TEMPLE_PURGE_SIEGE',
    regionIndex: 17,
    repF1Delta: 10,
    repF2Delta: -12,
  });
  assert.equal(getReputation(p.factionRep, GENERIC_TEMPLE), 10);

  applySkirmishReputationOutcome(p, {
    eventId: 'EVT_NEW_RULER_CORONATION',
    regionIndex: 17,
    repF1Delta: -15,
    repF2Delta: 12,
  });
  assert.equal(getReputation(p.factionRep, GENERIC_KNIGHTLY_ORDER), 12);

  // Null factionRep guard: must not throw and must not emit fake faction notifications
  const pNoFaction = makePlayer(false);
  const noFacRes = applySkirmishReputationOutcome(pNoFaction, {
    eventId: 'EVT_CRIME_DAYLIGHT_HEIST',
    regionIndex: 17,
    repF1Delta: -8,
    repF2Delta: 8,
  });
  assert.equal(pNoFaction.sGroupReputations[SOCIAL_GROUPS.Underworld], 4);
  assert.equal(noFacRes.applied.some((e) => e.kind === 'faction'), false);
});

test('Block 5: EVT_PRICES_TAX_REVOLT Merchants delta visibly improves live getReputationPriceModifier', () => {
  const prevTier = LivingTamrielConfig.reputationConsequences;
  LivingTamrielConfig.reputationConsequences = PRESENCE.MID;
  try {
    const p = makePlayer(true);
    const before = getReputationPriceModifier(p);
    // Win several merchant-aligned outcomes (+30 Merchants)
    for (let i = 0; i < 4; i++) {
      applySkirmishReputationOutcome(p, {
        eventId: 'EVT_PRICES_TAX_REVOLT',
        regionIndex: 17,
        repF1Delta: -8,
        repF2Delta: 8,
      });
    }
    assert.equal(p.sGroupReputations[SOCIAL_GROUPS.Merchants], 32);
    const after = getReputationPriceModifier(p);
    assert.ok(after.buyMult < before.buyMult, `Expected buyMult to improve (${after.buyMult} < ${before.buyMult})`);
    assert.ok(after.sellMult > before.sellMult, `Expected sellMult to improve (${after.sellMult} > ${before.sellMult})`);
  } finally {
    LivingTamrielConfig.reputationConsequences = prevTier;
  }
});

test('Block 5: Monster/Beast/Undead NONE sides emit zero notifications and mutate nothing', () => {
  const monsterEvents = [
    'EVT_PLAGUE_RAT_SWARM',
    'EVT_FAMINE_PREDATOR_INVASION',
    'EVT_PLAGUE_PYRE_DESECRATION',
    'EVT_SCARY_NIGHT_HORROR',
    'EVT_WITCH_DAEDRA_PACT_SIGHTING',
    'EVT_MAD_WIZARD_RAMPAGE',
    'EVT_FARM_RUNAWAY_CATTLE',
  ];
  for (const eventId of monsterEvents) {
    const p = makePlayer(true);
    const res = applySkirmishReputationOutcome(p, {
      eventId,
      regionIndex: 17,
      repF1Delta: 0,
      repF2Delta: -10,
    });
    assert.equal(res.applied.length, 0, `${eventId} f2 must produce 0 applied entries`);
    assert.deepEqual(p.legalRep, {});
    assert.ok(p.sGroupReputations.every((v) => v === 0));
  }
});

test('Block 5: pickEnemyProvince & planUrbanSkirmish preserve distinct enemyRegionIndex', () => {
  const picked = pickEnemyProvince(17, () => 0);
  assert.ok(Number.isInteger(picked.regionIndex) && picked.regionIndex !== 17);
  assert.ok(picked.name.length > 0);
  assert.equal(getEnemyProvinceName(17, () => 0), picked.name);

  const plan = planUrbanSkirmish({
    centerX: 0,
    centerZ: 0,
    heightSampler: () => 0,
    rng: () => 0.1,
    regionIndex: 17,
    forcedEventId: 'EVT_WAR_INTERPROVINCIAL',
  });
  assert.ok(plan);
  assert.equal(plan.event?.id, 'EVT_WAR_INTERPROVINCIAL');
  assert.ok(Number.isInteger(plan.enemyRegionIndex) && plan.enemyRegionIndex !== 17);
});

test('Block 5: All 26 locales define all 14 living.repTarget.* keys', () => {
  const requiredKeys = [
    'living.repTarget.regionLaw',
    'living.repTarget.commoners',
    'living.repTarget.merchants',
    'living.repTarget.scholars',
    'living.repTarget.nobility',
    'living.repTarget.underworld',
    'living.repTarget.supernatural',
    'living.repTarget.guildMembers',
    'living.repTarget.magesGuild',
    'living.repTarget.thievesGuild',
    'living.repTarget.fightersGuild',
    'living.repTarget.darkBrotherhood',
    'living.repTarget.temples',
    'living.repTarget.knightlyOrders',
  ];
  const localesDir = path.resolve('locales');
  const dirs = fs.readdirSync(localesDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  assert.equal(dirs.length, 26);
  for (const dir of dirs) {
    const csvPath = path.join(localesDir, dir.name, 'Port_Strings.csv');
    const text = fs.readFileSync(csvPath, 'utf8');
    for (const key of requiredKeys) {
      assert.ok(text.includes(key), `Missing ${key} in ${csvPath}`);
    }
  }
});

test('Block 5: Console commands encounter [EVT_ID] and rcf status (Fighters Guild 107)', () => {
  const encCmd = getConsoleCommand('encounter');
  assert.ok(encCmd && typeof encCmd.callback === 'function');
  assert.ok(encCmd.description.includes('EVT_ID'));

  const rcfCmd = getConsoleCommand('rcf');
  assert.ok(rcfCmd && typeof rcfCmd.callback === 'function');
  const out = rcfCmd.callback(['status']);
  assert.ok(out.includes('Fighters Guild (107)'));
});
