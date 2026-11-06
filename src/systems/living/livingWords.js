// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// LIVING TAMRIEL LOCALIZATION WORDS (L10N)
//
// Centralized text accessors for Living Tamriel notifications and dialogue lines.
// All strings route through the text core (t(), Port_Strings) with English fallbacks.
// ═══════════════════════════════════════════════════════════════════════════════

import { t } from '../textManager.js';

export const LIVING_WORDS = Object.freeze({
  // Quarantine & Gates
  quarantineGateClosed: () =>
    t('living.quarantine.gateClosed', 'The city gates are barred due to an outbreak of plague.'),
  quarantineReliefTent: () =>
    t('living.quarantine.reliefTent', 'A relief healer tent stands outside the locked walls.'),

  // Travel Interruption Events
  travelCaravan: () =>
    t('living.travel.caravan', 'A traveling caravan has made camp along the road.'),
  travelAmbush: () =>
    t('living.travel.ambush', 'You are ambushed along the road!'),
  travelDilemma: () =>
    t('living.travel.dilemma', 'A stranded traveler waves for assistance.'),

  // Nemesis Rival
  nemesisApproach: () =>
    t('living.nemesis.approach', 'A grim hunter confronts you, holding a contract with your name.'),
  nemesisHonor: () =>
    t('living.nemesis.honor', 'Honor prevails today; our paths may cross again under fairer stars.'),
  nemesisBribe: () =>
    t('living.nemesis.bribe', 'Gold speaks louder than blood today. Watch your back.'),

  // Naval Encounters
  navalBattleNotice: () =>
    t('living.naval.battleNotice', 'A naval skirmish rages between patrol ships and pirates!'),
  navalChoiceLaw: () =>
    t('living.naval.choiceLaw', 'Stand with the Crown fleet!'),
  navalChoicePirates: () =>
    t('living.naval.choicePirates', 'Join the pirates!'),
  navalChoiceNeutral: () =>
    t('living.naval.choiceNeutral', 'Remain neutral and observe.'),

  // Urban Skirmishes
  urbanSkirmishStart: () =>
    t('living.urban.skirmishStart', 'A skirmish erupts in the streets! Townsfolk flee for cover.'),
  urbanOrderRestored: () =>
    t('living.urban.orderRestored', 'The guards have restored order in the district.'),

  // Road Checkpoints
  checkpointHalt: () =>
    t('living.checkpoint.halt', 'Halt! State your business at this military checkpoint.'),
  checkpointKnightPass: () =>
    t('living.checkpoint.knightPass', 'Hail, noble Knight! The road is yours; pass freely.'),
  checkpointTollDemand: (gold) =>
    t('living.checkpoint.tollDemand', 'Wartime transit requires an inspection toll of {gold} gold.', { gold }),
  checkpointPassed: () =>
    t('living.checkpoint.passed', 'Papers are in order. Move along, traveller.'),
  checkpointRefused: () =>
    t('living.checkpoint.refused', 'Halt! You shall not pass without authorization!'),

  // Regional Economy
  economyWarShortage: () =>
    t('living.economy.warShortage', 'Weapons and armor are in short supply due to the ongoing conflict.'),
  economyFamineFood: () =>
    t('living.economy.famineFood', 'Grain is scarce and provisions fetch a heavy price this season.'),
});

