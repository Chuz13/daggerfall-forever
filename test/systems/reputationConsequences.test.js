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
