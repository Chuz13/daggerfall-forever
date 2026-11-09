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
    t('living.naval.choiceLaw', 'Stand with the Crown fleet! (+Regional renown, fight pirates)'),
  navalChoicePirates: () =>
    t('living.naval.choicePirates', 'Join the pirates! (+Pirate ally, -Regional renown)'),
  navalChoiceNeutral: () =>
    t('living.naval.choiceNeutral', 'Remain neutral and observe. (No intervention)'),

  // Urban Skirmishes
  urbanSkirmishStart: () =>
    t('living.urban.skirmishStart', 'A skirmish erupts in the streets! Townsfolk flee for cover.'),
  urbanSkirmishPrompt: () =>
    t('living.urban.skirmishPrompt', 'A violent skirmish erupts in the streets! Watchmen clash with Insurgents.'),
  urbanSkirmishOptionWatch: () =>
    t('living.urban.optionWatch', 'Stand with the City Watch (+5 Rep, Watchmen allied, Insurgents hostile)'),
  urbanSkirmishOptionRebels: () =>
    t('living.urban.optionRebels', 'Join the Insurgents (-15 Rep, +10 Underworld, Insurgents allied, Watch hostile)'),
  urbanSkirmishOptionChaos: () =>
    t('living.urban.optionChaos', 'Chaos Mode / Remain Neutral (Both sides damagable, no friendly fire bounty)'),
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
  economyPlaguePotions: () =>
    t('living.economy.plaguePotions', 'Remedies and alchemy ingredients are in high demand due to the plague.'),

  // Regional Crisis Status Lines (Map Hover & Town Panel)
  crisisStatusWarStart: () =>
    t('living.crisis.status.warStart', 'Crisis: Border Skirmishes (War brewing)'),
  crisisStatusWarMid: () =>
    t('living.crisis.status.warMid', 'Crisis: Open Warfare (Martial Law)'),
  crisisStatusWarEnd: () =>
    t('living.crisis.status.warEnd', 'Crisis: Fragile Truce (War subsiding)'),
  crisisStatusPlagueStart: () =>
    t('living.crisis.status.plagueStart', 'Crisis: Fever Outbreak (Early signs)'),
  crisisStatusPlagueMid: () =>
    t('living.crisis.status.plagueMid', 'Crisis: Plague Quarantine (Gates barred)'),
  crisisStatusPlagueEnd: () =>
    t('living.crisis.status.plagueEnd', 'Crisis: Fading Contagion (Quarantine lifting)'),
  crisisStatusFamineStart: () =>
    t('living.crisis.status.famineStart', 'Crisis: Crop Blight (Food scarce)'),
  crisisStatusFamineMid: () =>
    t('living.crisis.status.famineMid', 'Crisis: Severe Famine (Rationing)'),
  crisisStatusFamineEnd: () =>
    t('living.crisis.status.famineEnd', 'Crisis: Relief Caravans (Famine easing)'),
  crisisStatusStrifeStart: () =>
    t('living.crisis.status.strifeStart', 'Crisis: Civil Unrest (Protests & riots)'),
  crisisStatusStrifeMid: () =>
    t('living.crisis.status.strifeMid', 'Crisis: Armed Insurrection (Street clashes)'),
  crisisStatusStrifeEnd: () =>
    t('living.crisis.status.strifeEnd', 'Crisis: Order Restoring (Unrest subsiding)'),

  // Settlement Entry Notifications
  crisisEntryWar: (town) =>
    t('living.crisis.entry.war', '{town} is under martial law as war rages across the region.', { town }),
  crisisEntryPlague: (town) =>
    t('living.crisis.entry.plague', 'Fever warnings hang at the gates of {town}. Plague stalks the region.', { town }),
  crisisEntryFamine: (town) =>
    t('living.crisis.entry.famine', 'Gaunt townsfolk line the streets of {town}. Famine grips the region.', { town }),
  crisisEntryStrife: (town) =>
    t('living.crisis.entry.strife', 'Armed patrols march through {town} amid civil strife.', { town }),

  // Regional Crisis Rumors (Notice Boards & NPC Rumors)
  rumorWarStart: (region) =>
    t('living.rumor.warStart', 'Scouts report border clashes in {region}. Smiths are already raising prices on steel.', { region }),
  rumorWarMid: (region) =>
    t('living.rumor.warMid', 'Open war engulfs {region}! Soldiers inspect travelers at road checkpoints and blades cost a fortune.', { region }),
  rumorWarEnd: (region) =>
    t('living.rumor.warEnd', 'A fragile truce holds in {region}, though bands of deserters still roam the highways.', { region }),
  rumorPlagueStart: (region) =>
    t('living.rumor.plagueStart', 'Healers warn of a dark fever spreading through {region}. Best stock up on potions.', { region }),
  rumorPlagueMid: (region) =>
    t('living.rumor.plagueMid', 'Plague has locked the city gates of {region} under strict quarantine! Only relief tents stand outside.', { region }),
  rumorPlagueEnd: (region) =>
    t('living.rumor.plagueEnd', 'The worst of the plague in {region} has passed, and the quarantine cordons are finally lifting.', { region }),
  rumorFamineStart: (region) =>
    t('living.rumor.famineStart', 'Blighted harvests in {region} have driven up the cost of grain and tavern meals.', { region }),
  rumorFamineMid: (region) =>
    t('living.rumor.famineMid', 'Severe famine starves {region}! Granaries are empty and desperate beggars plead for coin on every road.', { region }),
  rumorFamineEnd: (region) =>
    t('living.rumor.famineEnd', 'Relief caravans have reached {region}, easing the famine at last.', { region }),
  rumorStrifeStart: (region) =>
    t('living.rumor.strifeStart', 'Angry mobs and agitators stir unrest in the streets of {region}.', { region }),
  rumorStrifeMid: (region) =>
    t('living.rumor.strifeMid', 'Insurgents clash openly with the city watch across {region}!', { region }),
  rumorStrifeEnd: (region) =>
    t('living.rumor.strifeEnd', 'The city watch has quelled the worst of the uprising in {region}.', { region }),

  // Adventurers 2.0 (Duels, Dares, Rivalry, Quest Interceptions)
  adventurerDuelChallenge: () =>
    t('living.adventurer.duelChallenge', 'I challenge thee to single combat to test thy blade!'),
  adventurerDareChallenge: (gold) =>
    t('living.adventurer.dareChallenge', 'Think you have what it takes? {gold} gold says you cannot best me in a duel!', { gold }),
  adventurerEnviousTaunt: () =>
    t('living.adventurer.enviousTaunt', 'Another strutting \'hero\' thinking they own Tamriel. Step aside before I make you!'),
  adventurerDuelWon: () =>
    t('living.adventurer.duelWon', 'A well-fought contest! You have earned my respect and the wager.'),
  adventurerDuelLost: () =>
    t('living.adventurer.duelLost', 'Yield! Better luck next time, wanderer. The gold stays with me.'),
  adventurerQuestIntercepted: () =>
    t('living.adventurer.questIntercepted', 'A rival adventurer cleared the dungeon ahead of you and claimed the objective!'),
  adventurerReclaimSuccess: () =>
    t('living.adventurer.reclaimSuccess', 'You have successfully recovered the quest objective from your rival!'),
  adventurerReclaimFailed: () =>
    t('living.adventurer.reclaimFailed', 'The rival adventurer refused to yield the prize and walked away.'),

  // Nemesis 2.0 (Motives & Reactions)
  nemesisMotiveBounty: () =>
    t('living.nemesis.motive.bounty', 'There is a fat bounty on your head, criminal. Dead or alive, I collect!'),
  nemesisMotiveAssassin: () =>
    t('living.nemesis.motive.assassin', 'The Dark Brotherhood sends its regards. You were marked for death.'),
  nemesisMotiveGlory: () =>
    t('living.nemesis.motive.glory', 'They say you are the fiercest warrior in the land. Let us see if you bleed like one!'),
  nemesisMotiveGrudge: () =>
    t('living.nemesis.motive.grudge', 'Remember me?! You humiliated me, and now I have returned to pay the blood debt!'),
  nemesisMotiveArcane: () =>
    t('living.nemesis.motive.arcane', 'Such powerful artifacts belong in the hands of a master, not an ignorant amateur!'),
  nemesisMotiveMarauder: () =>
    t('living.nemesis.motive.marauder', 'Drop your weapons and empty your purse, traveler! Every coin or your life!'),
  nemesisTauntSuccess: () =>
    t('living.nemesis.tauntSuccess', 'The rival sneers and waves their retinue back: \'Stay out of this, fools! This dog is mine alone!\''),
  nemesisIntimidated: () =>
    t('living.nemesis.intimidated', 'The challenger shrinks back before your grim gaze and reconsiders their life choices.'),

  // Plea Encounters (NPCs asking for help)
  pleaPlague: () =>
    t('living.plea.plague', 'Merciful traveler! My kin is burning with the plague fever. Do you have a healing remedy to spare?'),
  pleaFamine: () =>
    t('living.plea.famine', 'Alms, kind stranger! The granaries are empty and my children weep from hunger. Spare a coin for bread?'),
  pleaWar: () =>
    t('living.plea.war', 'The village was put to the torch by marauders! Please, help us with passage far from this bloodshed!'),
  pleaEscort: () =>
    t('living.plea.escort', 'The roads crawl with bandits. Might an able blade walk with me to the next crossroads?'),
  pleaHelped: () =>
    t('living.plea.helped', 'Blessings of the Divines upon you! Tamriel still knows true virtue.'),
  pleaParted: () =>
    t('living.plea.parted', 'May Stendarr watch over your journey nonetheless.'),
  pleaRebuffed: () =>
    t('living.plea.rebuffed', 'Curse your cold heart! May misfortune dog your footsteps!'),

  // Wandering Road & Wilderness Adventurers (Non-Seeking)
  roadAdvTraveling: (name) =>
    t('living.roadAdv.traveling', '{name} nods along the highway: "Bound for the next dungeon. Keep your steel sharp on these roads."', { name }),
  roadAdvCamp: (name) =>
    t('living.roadAdv.camp', '{name} tends a roadside campfire: "Rest your feet by the embers, traveler, if you come in peace."', { name }),
  roadAdvSkirmish: (name) =>
    t('living.roadAdv.skirmish', '{name} wipes blood from their blade: "Well met! These beasts nearly had the drop on me!"', { name }),
  roadAdvSpoils: (name) =>
    t('living.roadAdv.spoils', '{name} guards a heavy chest of dungeon spoils: "Cleared the crypt ahead. A profitable day for bold steel!"', { name }),
  roadAdvOptionIntel: () =>
    t('living.roadAdv.optionIntel', 'Trade road news, dungeon intel, and share the camp.'),
  roadAdvOptionRecruit: (gold) =>
    t('living.roadAdv.optionRecruit', 'Hire to travel and fight alongside you ({gold}g retainer).', { gold }),
  roadAdvOptionSpar: (gold) =>
    t('living.roadAdv.optionSpar', 'Propose a friendly wager match of blades ({gold}g).', { gold }),
  roadAdvOptionExtort: () =>
    t('living.roadAdv.optionExtort', 'Intimidate (Streetwise + Personality roll): demand a share of their dungeon spoils.'),
  roadAdvIntelShared: () =>
    t('living.roadAdv.intelShared', 'You exchange maps and road warnings over the fire, feeling refreshed for the journey ahead.'),
  roadAdvRecruited: (name) =>
    t('living.roadAdv.recruited', '{name} salutes and falls in beside you: "My blade is with you along this road!"', { name }),
  roadAdvNoGold: (gold) =>
    t('living.roadAdv.noGold', 'I cannot pledge my blade without the retainer fee ({gold} gold).', { gold }),
  roadAdvExpired: (name) =>
    t('living.roadAdv.contractExpired', "Your contracted companion's 24-hour service has expired. They bid you farewell and return to the road.", { name }),
  roadAdvExtorted: (name) =>
    t('living.roadAdv.extorted', '{name} backs down with a scowl and tosses you a pouch of dungeon spoils.', { name }),
  roadAdvDeclined: () =>
    t('living.roadAdv.declined', '"I walk my own path today, wanderer. Perhaps when your purse or renown is heavier."'),
  roadAdvParted: () =>
    t('living.roadAdv.parted', 'You exchange a respectful nod and continue along the road.'),

  // Stealth Ambush Detection
  travelStealthSpotted: () =>
    t('living.travel.stealthSpotted', 'Your keen stealth spots highwaymen lying in ambush ahead before they notice you!'),
  travelStealthEvadeOption: () =>
    t('living.travel.stealthEvadeOption', 'Slip past the ambush undetected through the brush (Stealth).'),
  travelStealthSurpriseOption: () =>
    t('living.travel.stealthSurpriseOption', 'Strike first from the shadows! (Surprise bonus)'),
  travelStealthEvaded: () =>
    t('living.travel.stealthEvaded', 'You slip silently around the highwaymen without a sound.'),

  // Crisis Radiant Contracts & Naval Salvage
  crisisContractWarTitle: () =>
    t('living.contract.warTitle', 'Regional Contract: Eliminate the Deserter Warlord'),
  crisisContractPlagueTitle: () =>
    t('living.contract.plagueTitle', 'Regional Contract: Recover Stolen Plague Remedies'),
  crisisContractFamineTitle: () =>
    t('living.contract.famineTitle', 'Regional Contract: Seize Black-Market Grain Cache'),
  crisisContractStrifeTitle: () =>
    t('living.contract.strifeTitle', 'Regional Contract: Suppress Insurgent Ringleader'),
  crisisContractOptionAccept: (title, gold) =>
    t('living.contract.optionAccept', 'Accept regional crisis contract ({gold}g reward): {title}', { title, gold }),
  crisisContractAccepted: (title) =>
    t('living.contract.accepted', 'Crisis contract accepted: {title}. Track the target in regional camps or dungeons.', { title }),
  crisisContractCompleted: (gold) =>
    t('living.contract.completed', 'Crisis contract fulfilled! Earned {gold}g, regional renown, and eased tensions across the land.', { gold }),
  navalScavenged: (gold) =>
    t('living.naval.scavenged', 'You salvage {gold}g worth of floating cargo from the naval wreckage.', { gold }),

  // Composite helpers for 3D scene interactions (ChoiceWindow)
  urbanSkirmishAlert: () => LIVING_WORDS.urbanSkirmishStart(),
  checkpointOptionKnight: () =>
    t('living.checkpoint.optKnight', 'Present Knight credentials or Regional renown (Etiquette + Personality roll if unranked)'),
  checkpointOptionToll: (gold = 50) =>
    t('living.checkpoint.optToll', 'Pay wartime transit toll of {gold}g (+Safe passage)', { gold }),
  checkpointOptionDiplomacy: () =>
    t('living.checkpoint.optDiplomacy', 'Persuade the guard (Etiquette + Personality + Luck roll)'),
  checkpointOptionForce: () =>
    t('living.checkpoint.optForce', 'Refuse authorization and draw weapon (+Fight guards)'),
  checkpointCompromise: (gold = 25) =>
    t('living.checkpoint.compromise', 'The guard sighs: "Your story barely holds, but pay a reduced toll ({gold}g) and move along."', { gold }),
  nemesisMotive: (archetype) => {
    if (archetype === 'SHADOW_ASSASSIN') return LIVING_WORDS.nemesisMotiveAssassin();
    if (archetype === 'GLORY_CHALLENGER') return LIVING_WORDS.nemesisMotiveGlory();
    if (archetype === 'GRUDGE_AVENGER') return LIVING_WORDS.nemesisMotiveGrudge();
    if (archetype === 'ARCANE_RIVAL') return LIVING_WORDS.nemesisMotiveArcane();
    if (archetype === 'CHAOTIC_MARAUDER') return LIVING_WORDS.nemesisMotiveMarauder();
    return LIVING_WORDS.nemesisMotiveBounty();
  },
  nemesisOptionTaunt: () =>
    t('living.nemesis.optTaunt', 'Taunt rival into single combat (Streetwise + Personality roll, minions stay back)'),
  nemesisOptionEtiquette: () =>
    t('living.nemesis.optEtiquette', 'Appeal to warrior honor (Etiquette + Personality + Luck roll to pacify)'),
  nemesisOptionStreetwise: () =>
    t('living.nemesis.optStreetwise', 'Bargain or intimidate (Streetwise + Personality roll, discount or stand-down)'),
  nemesisOptionFight: () =>
    t('living.nemesis.optFight', 'Draw steel and attack! (+Immediate battle)'),
  adventurerGreeting: (trait, gold = 50) => {
    if (trait === 'ENVIOUS' || trait === 'CUTTHROAT') return LIVING_WORDS.adventurerEnviousTaunt();
    if (trait === 'ARROGANT' || trait === 'MERCENARY') return LIVING_WORDS.adventurerDareChallenge(gold);
    return LIVING_WORDS.adventurerDuelChallenge();
  },
  adventurerOptionDuel: (gold = 50) =>
    t('living.adventurer.optDuel', 'Accept wager duel for {gold}g (+Combat & Luck roll)', { gold }),
  adventurerOptionEtiquette: () =>
    t('living.adventurer.optEtiquette', 'Propose fellowship / peace (Etiquette + Personality roll to recruit)'),
  adventurerOptionIntimidate: () =>
    t('living.adventurer.optIntimidate', 'Intimidate to back down (Streetwise + Personality roll)'),
  adventurerOptionDecline: () =>
    t('living.adventurer.optDecline', 'Politely decline and walk away (Leave peacefully)'),
  adventurerOutcome: (outcome, _name, _gold) => {
    if (outcome === 'PLAYER_WON' || outcome === 'LUCK_REVERSAL' || outcome === 'DIPLOMACY_PEACE') {
      return LIVING_WORDS.adventurerDuelWon();
    }
    if (outcome === 'PLAYER_LOST') return LIVING_WORDS.adventurerDuelLost();
    if (outcome === 'HOSTILE_DRAW') return LIVING_WORDS.adventurerEnviousTaunt();
    return LIVING_WORDS.adventurerReclaimFailed();
  },
  roadAdvExtortPartial: (name = 'Adventurer') =>
    t('living.roadAdv.extortPartial', '{name} tosses a small pouch of coins to avoid bloodshed, keeping the main spoils.', { name }),
  pleaPrompt: (type, _gold) => {
    if (type === 'PLAGUE_CURE') return LIVING_WORDS.pleaPlague();
    if (type === 'FAMINE_BREAD') return LIVING_WORDS.pleaFamine();
    if (type === 'WAR_REFUGEE') return LIVING_WORDS.pleaWar();
    return LIVING_WORDS.pleaEscort();
  },
  pleaOptionHelp: (gold = 25) =>
    t('living.plea.optHelp', 'Offer assistance and alms (-{gold}g, +Renown, +Virtue)', { gold }),
  pleaOptionPolite: () =>
    t('living.plea.optPolite', 'Politely decline assistance (Etiquette + Personality + Luck roll)'),
  pleaOptionRude: () =>
    t('living.plea.optRude', 'Bruskly brush them off (Risk provoking confrontation)'),
  pleaOutcome: (outcome) => {
    if (outcome === 'HELPED') return LIVING_WORDS.pleaHelped();
    if (outcome === 'PARTED_PEACEFULLY') return LIVING_WORDS.pleaParted();
    return LIVING_WORDS.pleaRebuffed();
  },

  // Typed Roleplay Roll Degree Outcomes (Crisis & Encounter Checks)
  rollTriumph: (score = 80, dc = 50, xp = 150) =>
    t('living.roll.triumph', '[Triumph: {score} vs {dc}] Brilliant mastery! Conflict resolved with honor and bonus renown! (+{xp} XP)', { score, dc, xp }),
  rollSuccess: (score = 60, dc = 50, xp = 100) =>
    t('living.roll.success', '[Success: {score} vs {dc}] Negotiations succeeded peacefully! (+{xp} XP)', { score, dc, xp }),
  rollPartial: (score = 45, dc = 50, xp = 50) =>
    t('living.roll.partial', '[Partial Success: {score} vs {dc}] Bloodshed averted through a hard compromise. (+{xp} XP)', { score, dc, xp }),
  rollFailure: (score = 30, dc = 50) =>
    t('living.roll.failure', '[Check Failed: {score} vs {dc}] Neither side heeds your words; the clash continues without you.', { score, dc }),
  rollCriticalFailure: (score = 10, dc = 50) =>
    t('living.roll.criticalFailure', '[Critical Failure: {score} vs {dc}] Your words enrage both factions — they turn their weapons on you!', { score, dc }),
});

