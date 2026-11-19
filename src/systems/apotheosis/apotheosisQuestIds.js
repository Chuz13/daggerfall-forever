/**
 * Pure identifiers for the Apotheosis main-quest journal entry (`_APOTHEO`).
 * Kept dependency-free so `quest/machine.js`, `quest/questLists.js`, and
 * `questlines/qlFamilies.js` can reference it without circular imports.
 */

export const APOTHEOSIS_QUEST_NAME = '_APOTHEO';

export const APOTHEOSIS_QUEST_NAMES = Object.freeze([APOTHEOSIS_QUEST_NAME]);

export const isApotheosisQuestName = (questName) => questName === APOTHEOSIS_QUEST_NAME;
