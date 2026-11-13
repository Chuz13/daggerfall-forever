// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LivingTamrielConfig,
  PRESENCE,
} from '../../src/systems/living/livingConfig.js';
import {
  getSocialRep,
  getFactionStanding,
  getReputationPriceModifier,
  evaluateHousePurchaseReputation,
  evaluateShipyardReputation,
  getTempleServiceAccessibility,
  isSoulGemPurchaseAllowed,
  getTavernReputationAdjustment,
  evaluateCheckpointInspection,
  inspectPlayerContraband,
  getCourtReputationBias,
  getReputationRumor,
  evaluateFactionNemesisArchetype,
  RARE_SOUL_PTS_THRESHOLD,
  MAGES_GUILD_FACTION_ID,
} from '../../src/systems/living/reputationConsequences.js';
import { SOCIAL_GROUPS, FACTION_TYPES } from '../../src/formats/factionFile.js';
import { THE_DARK_BROTHERHOOD, THE_THIEVES_GUILD, GENERIC_KNIGHTLY_ORDER, GENERIC_TEMPLE } from '../../src/systems/faction/factionRep.js';
import { playerEntity } from '../../src/characters/playerEntity.js';
import { rentalDecision } from '../../src/systems/tavern.js';
import { cureDiseaseOffer } from '../../src/systems/guild/guildServiceActions.js';
import { GUILDS } from '../../src/systems/guild/guilds.js';
import { startDisease, diseaseCount } from '../../src/systems/diseases.js';
import { HOLIDAY_DAYS_OF_YEAR } from '../../src/systems/holidays.js';
import { MINUTES_PER_DAY } from '../../src/systems/gameDate.js';
import { housePrice, shipPrice, buyShipDecision, SHIP_TYPES } from '../../src/systems/banking.js';
import { shipBuyPrice } from '../../src/systems/shipyards.js';
import { createShipyardHost } from '../../src/scenes/shipyardHost.js';
import { tradeCost } from '../../src/systems/tradeModes.js';
import { markStolen } from '../../src/systems/stolenGoods.js';
import { resolveCheckpointInteraction, hasRegionalCheckpointPass, CHECKPOINT_OUTCOME } from '../../src/systems/living/roadCheckpointHost.js';
import { determineNemesisArchetype, NEMESIS_ARCHETYPES } from '../../src/systems/living/nemesisHost.js';

test('RCF: Default presence tier is HIGH (3)', () => {
  assert.equal(LivingTamrielConfig.reputationConsequences, PRESENCE.HIGH);
});

test('RCF: When OFF (0), all selectors return neutral baseline values', () => {
  const orig = LivingTamrielConfig.reputationConsequences;
  LivingTamrielConfig.reputationConsequences = PRESENCE.OFF;

  const mockPlayer = {
    sGroupReputations: [-100, -100, -100, -100, 100, 0, -100],
    factionRep: { dict: new Map([[THE_DARK_BROTHERHOOD, { rep: -100 }]]) },
    items: [{ uid: '1', stolen: true }],
  };

  const pMod = getReputationPriceModifier(mockPlayer);
  assert.equal(pMod.buyMult, 1.0);
  assert.equal(pMod.sellMult, 1.0);
  assert.equal(pMod.fenceBonus, 0);

  assert.equal(evaluateHousePurchaseReputation(mockPlayer).refused, false);
  assert.equal(evaluateShipyardReputation(mockPlayer).refused, false);
  assert.equal(getTempleServiceAccessibility(mockPlayer).accessible, true);
  assert.equal(isSoulGemPurchaseAllowed(mockPlayer, 300).allowed, true);
  assert.equal(getTavernReputationAdjustment(mockPlayer).refused, false);
  assert.equal(evaluateCheckpointInspection(mockPlayer).demandInspection, false);
  assert.equal(getCourtReputationBias(mockPlayer, 0), 0);
  assert.equal(getReputationRumor(mockPlayer, 0), null);
  assert.equal(evaluateFactionNemesisArchetype(mockPlayer), null);

  LivingTamrielConfig.reputationConsequences = orig;
});

test('RCF Trade: Merchant social standing influences prices', () => {
  const orig = LivingTamrielConfig.reputationConsequences;
  LivingTamrielConfig.reputationConsequences = PRESENCE.MID;

  const reveredPlayer = { sGroupReputations: [0, 50, 0, 0, 0, 0, 0] };
  const reveredMod = getReputationPriceModifier(reveredPlayer);
  assert.ok(reveredMod.buyMult < 1.0, 'Buy multiplier should be discounted');
  assert.ok(reveredMod.sellMult > 1.0, 'Sell multiplier should be increased');

  const despisedPlayer = { sGroupReputations: [0, -50, 0, 0, 0, 0, 0] };
  const despisedMod = getReputationPriceModifier(despisedPlayer);
  assert.ok(despisedMod.buyMult > 1.0, 'Buy multiplier should be surcharged');
  assert.ok(despisedMod.sellMult < 1.0, 'Sell multiplier should be penalized');

  const roguePlayer = { sGroupReputations: [0, 0, 0, 0, 50, 0, 0] };
  const rogueMod = getReputationPriceModifier(roguePlayer);
  assert.ok(rogueMod.fenceBonus > 0, 'High Underworld should award fence bonus');

  LivingTamrielConfig.reputationConsequences = orig;
});

test('RCF Services: House, Shipyard, Temple, and Tavern refusals', () => {
  const orig = LivingTamrielConfig.reputationConsequences;
  LivingTamrielConfig.reputationConsequences = PRESENCE.HIGH;

  // 1. House refusal on low Nobility
  const outcastNoble = { sGroupReputations: [0, 0, 0, -30, 0, 0, 0] };
  assert.equal(evaluateHousePurchaseReputation(outcastNoble).refused, true);

  // 2. Shipyard refusal on low Merchants
  const piratePlayer = { sGroupReputations: [0, -40, 0, 0, 0, 0, 0] };
  assert.equal(evaluateShipyardReputation(piratePlayer).refused, true);

  // 3. Temple refusal on low Temple standing
  const hereticPlayer = {
    factionRep: { dict: new Map([[GENERIC_TEMPLE, { rep: -30 }]]) },
  };
  assert.equal(getTempleServiceAccessibility(hereticPlayer, GENERIC_TEMPLE).accessible, false);

  // 4. Soul gem tier restrictions
  const rogueMage = {
    factionRep: { dict: new Map([[MAGES_GUILD_FACTION_ID, { rep: 10 }]]) },
  };
  assert.equal(isSoulGemPurchaseAllowed(rogueMage, 100).allowed, true, 'Low soul pts allowed');
  assert.equal(isSoulGemPurchaseAllowed(rogueMage, 300).allowed, false, 'Rare/Daedric soul pts restricted');

  const outcastMage = {
    factionRep: { dict: new Map([[MAGES_GUILD_FACTION_ID, { rep: -10 }]]) },
  };
  assert.equal(isSoulGemPurchaseAllowed(outcastMage, 50).allowed, false, 'All gems locked for negative rep');

  // 5. Tavern refusal on low Commoners
  const hatedByPeasants = { sGroupReputations: [-40, 0, 0, 0, 0, 0, 0] };
  assert.equal(getTavernReputationAdjustment(hatedByPeasants).refused, true);

  LivingTamrielConfig.reputationConsequences = orig;
});

test('RCF Checkpoint: Contraband scanning and inspection triggers', () => {
  const orig = LivingTamrielConfig.reputationConsequences;
  LivingTamrielConfig.reputationConsequences = PRESENCE.HIGH;

  const rogue = {
    sGroupReputations: [0, 0, 0, 0, 35, 0, 0],
    items: [
      { uid: 'it-1', stolen: true },
      { uid: 'it-2', stolen: true },
      { uid: 'it-3' },
    ],
  };

  const checkpoint = evaluateCheckpointInspection(rogue, false);
  assert.equal(checkpoint.demandInspection, true, 'Inspection must be demanded for high underworld');

  const contraband = inspectPlayerContraband(rogue);
  assert.equal(contraband.stolenCount, 2);
  assert.equal(contraband.fineGold, 100);

  const nobleKnight = {
    sGroupReputations: [0, 0, 0, 30, 0, 0, 0],
  };
  const knightCheckpoint = evaluateCheckpointInspection(nobleKnight, true);
  assert.equal(knightCheckpoint.saluted, true, 'Knights/Nobles must be saluted');
  assert.equal(knightCheckpoint.demandInspection, false);

  LivingTamrielConfig.reputationConsequences = orig;
});

test('RCF Faction Retribution: Specialized Nemesis selection', () => {
  const orig = LivingTamrielConfig.reputationConsequences;
  LivingTamrielConfig.reputationConsequences = PRESENCE.HIGH;

  const dbTarget = {
    factionRep: { dict: new Map([[THE_DARK_BROTHERHOOD, { rep: -45 }]]) },
  };
  assert.equal(evaluateFactionNemesisArchetype(dbTarget), 'SHADOW_ASSASSIN');

  const tgTarget = {
    factionRep: { dict: new Map([[THE_THIEVES_GUILD, { rep: -50 }]]) },
  };
  assert.equal(evaluateFactionNemesisArchetype(tgTarget), 'GRUDGE_AVENGER');

  const magesTarget = {
    factionRep: { dict: new Map([[MAGES_GUILD_FACTION_ID, { rep: -45 }]]) },
  };
  assert.equal(evaluateFactionNemesisArchetype(magesTarget), 'ARCANE_RIVAL');

  const vampireTarget = {
    isVampire: true,
    sGroupReputations: [0, 0, 0, 0, 0, 0, -30],
  };
  assert.equal(evaluateFactionNemesisArchetype(vampireTarget), 'GLORY_CHALLENGER');

  LivingTamrielConfig.reputationConsequences = orig;
});

test('RCF Integration: Tavern rentalDecision default playerEntity refusal, surcharge, and discount', () => {
  const origTier = LivingTamrielConfig.reputationConsequences;
  const origSGroup = playerEntity.sGroupReputations;
  LivingTamrielConfig.reputationConsequences = PRESENCE.HIGH;
  try {
    const date = { year: 405, month: 3, day: 10 };
    playerEntity.sGroupReputations = [0, 0, 0, 0, 0, 0, 0];
    const base = rentalDecision('2', { date, nowMinutes: 0, quality: 10 });
    assert.equal(base.kind, 'offer');

    playerEntity.sGroupReputations = [-40, 0, 0, 0, 0, 0, 0];
    const refused = rentalDecision('2', { date, nowMinutes: 0, quality: 10 });
    assert.equal(refused.kind, 'refuse');

    playerEntity.sGroupReputations = [-15, 0, 0, 0, 0, 0, 0];
    const surcharged = rentalDecision('2', { date, nowMinutes: 0, quality: 10 });
    assert.equal(surcharged.kind, 'offer');
    assert.ok(surcharged.price > base.price, `Expected surcharge (${surcharged.price} > ${base.price})`);

    playerEntity.sGroupReputations = [30, 0, 0, 0, 0, 0, 0];
    const discounted = rentalDecision('2', { date, nowMinutes: 0, quality: 10 });
    assert.equal(discounted.kind, 'offer');
    assert.ok(discounted.price < base.price, `Expected discount (${discounted.price} < ${base.price})`);
  } finally {
    playerEntity.sGroupReputations = origSGroup;
    LivingTamrielConfig.reputationConsequences = origTier;
  }
});

test('RCF Integration: Temple cureDiseaseOffer refuses profane even when healthy or on holiday, and discounts honored', () => {
  const origTier = LivingTamrielConfig.reputationConsequences;
  LivingTamrielConfig.reputationConsequences = PRESENCE.HIGH;
  try {
    const profaneHealthy = {
      isPlayer: true,
      level: 2,
      activeEffects: [],
      factionRep: { dict: new Map([[GENERIC_TEMPLE, { rep: -25 }]]) },
      skills: { mercantile: 20 },
      stats: { live: { personality: 50 }, permanent: { personality: 50 } },
    };
    const resHealthy = cureDiseaseOffer(profaneHealthy, GUILDS.FightersGuild, null, { quality: 10 });
    assert.equal(resHealthy.kind, 'refused');

    const profaneHoliday = {
      ...profaneHealthy,
      activeEffects: [],
    };
    startDisease(profaneHoliday, 0, 0, () => 0);
    assert.equal(diseaseCount(profaneHoliday), 1);
    const southWindsMinutes = (HOLIDAY_DAYS_OF_YEAR[3] - 1) * MINUTES_PER_DAY;
    const resHoliday = cureDiseaseOffer(profaneHoliday, GUILDS.FightersGuild, null, {
      quality: 10,
      regionIndex: 0,
      nowClassicMinutes: southWindsMinutes,
    });
    assert.equal(resHoliday.kind, 'refused');

    const neutralSick = {
      isPlayer: true,
      level: 2,
      activeEffects: [],
      factionRep: { dict: new Map([[GENERIC_TEMPLE, { rep: 0 }]]) },
      skills: { mercantile: 20 },
      stats: { live: { personality: 50 }, permanent: { personality: 50 } },
    };
    startDisease(neutralSick, 0, 0, () => 0);
    assert.equal(diseaseCount(neutralSick), 1);
    const neutralOffer = cureDiseaseOffer(neutralSick, GUILDS.FightersGuild, null, { quality: 10, nowClassicMinutes: 0 });
    assert.equal(neutralOffer.kind, 'offer');

    const devoutSick = {
      isPlayer: true,
      level: 2,
      activeEffects: [],
      factionRep: { dict: new Map([[GENERIC_TEMPLE, { rep: 45 }]]) },
      skills: { mercantile: 20 },
      stats: { live: { personality: 50 }, permanent: { personality: 50 } },
    };
    startDisease(devoutSick, 0, 0, () => 0);
    assert.equal(diseaseCount(devoutSick), 1);
    const devoutOffer = cureDiseaseOffer(devoutSick, GUILDS.FightersGuild, null, { quality: 10, nowClassicMinutes: 0 });
    assert.equal(devoutOffer.kind, 'offer');
    assert.ok(devoutOffer.cost < neutralOffer.cost, `Expected temple discount (${devoutOffer.cost} < ${neutralOffer.cost})`);
  } finally {
    LivingTamrielConfig.reputationConsequences = origTier;
  }
});

test('RCF Integration: Banking house/ship discounts, ship refusal, and shipyard host refusal', () => {
  const origTier = LivingTamrielConfig.reputationConsequences;
  const origSGroup = playerEntity.sGroupReputations;
  LivingTamrielConfig.reputationConsequences = PRESENCE.HIGH;
  try {
    const noble = { sGroupReputations: [0, 0, 0, 45, 0, 0, 0] };
    const houseEval = evaluateHousePurchaseReputation(noble);
    assert.ok(houseEval.discountMult < 1.0);
    assert.equal(housePrice(10, noble), Math.trunc(12800 * houseEval.discountMult));

    const merchantEnemy = { sGroupReputations: [0, -30, 0, 0, 0, 0, 0] };
    const refused = buyShipDecision({ ownsShip: false, isPortTown: true, entity: merchantEnemy });
    assert.equal(refused.kind, 'refuse');
    assert.ok(Array.isArray(refused.lines) && refused.lines.length > 0);

    playerEntity.sGroupReputations = [0, -30, 0, 0, 0, 0, 0];
    const yardHost = createShipyardHost({
      fleet: () => null,
      naval: () => null,
      csa: () => ({}),
      gold: () => 500000,
      skills: () => ({ mercantile: 40, personality: 50 }),
    });
    const yardModel = yardHost.model({ townName: 'Daggerfall' }, { page: 'ships' });
    assert.ok(yardModel.ships.every((s) => typeof s.why === 'string' && s.why.length > 0), 'Every ship should show refusal reason');
    assert.equal(yardHost.act({ townName: 'Daggerfall' }, 'buy', 0).ok, false);

    const merchantHero = { sGroupReputations: [0, 40, 0, 0, 0, 0, 0] };
    const neutral = { sGroupReputations: [0, 0, 0, 0, 0, 0, 0] };
    const shipEval = evaluateShipyardReputation(merchantHero);
    assert.ok(shipEval.discountMult < 1.0);
    assert.equal(shipPrice(SHIP_TYPES.Small, merchantHero), Math.trunc(100000 * shipEval.discountMult));
    const sk = { mercantile: 40, personality: 50 };
    assert.ok(
      shipBuyPrice(4000, sk, { playerEntity: merchantHero }) < shipBuyPrice(4000, sk, { playerEntity: neutral }),
      'Shipyard buy price should be discounted for respected merchant allies',
    );
  } finally {
    playerEntity.sGroupReputations = origSGroup;
    LivingTamrielConfig.reputationConsequences = origTier;
  }
});

test('RCF Integration: Trade fenceBonus increases Sell and SellMagic payout for stolen items', () => {
  const origTier = LivingTamrielConfig.reputationConsequences;
  LivingTamrielConfig.reputationConsequences = PRESENCE.HIGH;
  try {
    const fenceHero = { sGroupReputations: [0, 0, 0, 0, 50, 0, 0] };
    const { fenceBonus } = getReputationPriceModifier(fenceHero);
    assert.ok(fenceBonus > 0);
    const honestSword = { uid: 's1', group: 'Weapons', templateIndex: 118, value: 1000, stackCount: 1, currentCondition: 100, maxCondition: 100 };
    const stolenSword = markStolen([{ ...honestSword, uid: 's2' }])[0];

    const honestSell = tradeCost('Sell', [honestSword], { quality: 10, priceAdjustment: 1000, entity: fenceHero }).cost;
    const stolenSell = tradeCost('Sell', [stolenSword], { quality: 10, priceAdjustment: 1000, entity: fenceHero }).cost;
    assert.ok(stolenSell > honestSell);
    assert.equal(stolenSell, Math.round(honestSell * (1 + fenceBonus)));

    const honestMagic = tradeCost('SellMagic', [honestSword], { quality: 10, priceAdjustment: 1000, entity: fenceHero }).cost;
    const stolenMagic = tradeCost('SellMagic', [stolenSword], { quality: 10, priceAdjustment: 1000, entity: fenceHero }).cost;
    assert.ok(stolenMagic > honestMagic);
    assert.equal(stolenMagic, Math.round(honestMagic * (1 + fenceBonus)));
  } finally {
    LivingTamrielConfig.reputationConsequences = origTier;
  }
});

test('RCF Integration: Road checkpoint knightly salute and contraband confiscation', () => {
  const origTier = LivingTamrielConfig.reputationConsequences;
  LivingTamrielConfig.reputationConsequences = PRESENCE.HIGH;
  try {
    const knightOrderAlly = {
      factionRep: { dict: new Map([[GENERIC_KNIGHTLY_ORDER, { rep: 25 }]]) },
      sGroupReputations: [0, 0, 0, 0, 0, 0, 0],
      regionalReputations: {},
    };
    const saluteRes = resolveCheckpointInteraction({
      playerEntity: knightOrderAlly,
      method: 'reputation',
      regionIndex: 41,
      nowMinutes: 5000,
    });
    assert.equal(saluteRes.outcome, CHECKPOINT_OUTCOME.PASSED_FREE);
    assert.equal(hasRegionalCheckpointPass(41, 5001), true);

    const smuggler = {
      sGroupReputations: [0, 0, 0, 0, 35, 0, 0],
      goldPieces: 300,
      items: [
        { uid: 'st1', stolen: true },
        { uid: 'st2', stolen: true },
        { uid: 'clean1' },
      ],
    };
    const inspRes = resolveCheckpointInteraction({
      playerEntity: smuggler,
      method: 'submit_inspection',
      regionIndex: 42,
      nowMinutes: 6000,
    });
    assert.equal(inspRes.outcome, CHECKPOINT_OUTCOME.TOLL_PAID);
    assert.equal(inspRes.finePaid, 100);
    assert.equal(inspRes.stolenConfiscated, 2);
    assert.equal(smuggler.goldPieces, 200);
    assert.equal(smuggler.items.length, 1);
    assert.equal(smuggler.items[0].uid, 'clean1');
    assert.equal(hasRegionalCheckpointPass(42, 6001), true);
  } finally {
    LivingTamrielConfig.reputationConsequences = origTier;
  }
});

test('RCF Integration: Nemesis archetype deterministically prioritizes hostile factions', () => {
  const origTier = LivingTamrielConfig.reputationConsequences;
  LivingTamrielConfig.reputationConsequences = PRESENCE.HIGH;
  try {
    const dbEnemy = { factionRep: { dict: new Map([[THE_DARK_BROTHERHOOD, { rep: -45 }]]) } };
    assert.equal(
      determineNemesisArchetype(dbEnemy, { legalReputation: -30, playerLevel: 10, hasGrudge: true, rng: () => 0.99 }),
      NEMESIS_ARCHETYPES.SHADOW_ASSASSIN,
    );

    const magesEnemy = { factionRep: { dict: new Map([[MAGES_GUILD_FACTION_ID, { rep: -45 }]]) } };
    assert.equal(
      determineNemesisArchetype(magesEnemy, { legalReputation: -30, playerLevel: 10, hasGrudge: true, rng: () => 0.99 }),
      NEMESIS_ARCHETYPES.ARCANE_RIVAL,
    );
  } finally {
    LivingTamrielConfig.reputationConsequences = origTier;
  }
});
