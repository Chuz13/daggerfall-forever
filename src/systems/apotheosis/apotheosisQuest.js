/**
 * QuestMachine runtime integration, QBN trigger (`apotheosis ...`),
 * localized QRC/sheet text registration, and dungeon objective markers
 * for the Apotheosis main-quest journal entry (`_APOTHEO`).
 */

import { ActionTemplate } from '../quest/actions.js';
import { t } from '../textManager.js';
import { registerPortQuestLocalization } from '../quest/localizedQuest.js';
import { APOTHEOSIS_QUEST_NAME, isApotheosisQuestName } from './apotheosisQuestIds.js';

const TARGET_RANK = Object.freeze({
  siege: 1,
  interior: 2,
  shadow: 3,
  portfolio: 4,
  ascended: 5,
});

const MACRO_OR_SPACE_RE = /((?:_{1,4}|={1,2})[A-Za-z0-9.]+_|%[a-zA-Z0-9]+)/g;

/**
 * Maps `playerEntity.apotheosis` progression to a monotonic rank in `[-1..5]`.
 * Returns `-1` when Apotheosis has not begun (or was reset in debug).
 * @param {any} state
 * @returns {number}
 */
export function apotheosisPhaseRank(state) {
  if (!state || typeof state !== 'object') return -1;
  if (state.stage === 'ascended' || state.ascended === true) return 5;
  if (state.stage === 'awaiting_portfolio' || state.questStep === 'completed') return 4;
  if (state.questStep === 'shadow_duel') return 3;
  if (state.questStep === 'tower_interior') return 2;
  if (state.questStep === 'tower_siege') return 1;
  if (state.questStep === 'dragon_break' || state.stage === 'questline_active') return 0;
  return -1;
}

/**
 * QBN trigger condition reading live `playerEntity.apotheosis` phase:
 *   apotheosis source artifacts | mantella
 *   apotheosis at siege | interior | shadow | portfolio | ascended
 */
export class ApotheosisState extends ActionTemplate {
  static typeName = 'ApotheosisState';

  get saveShape() {
    return [['mode'], ['target']];
  }

  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    /** @type {'source'|'at'} */
    this.mode = 'at';
    /** @type {string} */
    this.target = '';
  }

  get pattern() {
    return /^\s*apotheosis\s+(?:(?<modeSource>source)\s+(?<targetSource>artifacts|mantella)|(?<modeAt>at)\s+(?<targetAt>siege|interior|shadow|portfolio|ascended))\s*$/i;
  }

  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const g = match.groups ?? {};
    const action = new ApotheosisState(parentQuest);
    if (g.modeSource) {
      action.mode = 'source';
      action.target = g.targetSource.toLowerCase();
    } else {
      action.mode = 'at';
      action.target = g.targetAt.toLowerCase();
    }
    return action;
  }

  checkTrigger(caller) {
    if (caller.getTriggerValue()) return true;
    const state = this.parentQuest?.hooks?.playerEntity?.()?.apotheosis ?? null;
    const rank = apotheosisPhaseRank(state);
    if (rank < 0) return false;
    if (this.mode === 'source') {
      return this.target === 'mantella' ? state?.source === 'mantella' : state?.source !== 'mantella';
    }
    const need = TARGET_RANK[this.target];
    return Number.isFinite(need) && rank >= need;
  }
}

export const apotheosisActionTemplates = () => [new ApotheosisState(null)];

/**
 * Splits a long unspaced word (e.g. CJK prose) into atomic tokens while keeping
 * QRC macro tokens (`__tower_`, `____tower_`, `%s`) intact as single units.
 * @param {string} word
 * @returns {string[]}
 */
function splitAtomicWord(word) {
  const tokens = [];
  let last = 0;
  MACRO_OR_SPACE_RE.lastIndex = 0;
  let m;
  while ((m = MACRO_OR_SPACE_RE.exec(word)) !== null) {
    if (m.index > last) {
      for (const ch of word.slice(last, m.index)) tokens.push(ch);
    }
    tokens.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < word.length) {
    for (const ch of word.slice(last)) tokens.push(ch);
  }
  return tokens;
}

/**
 * Formats a localized log paragraph into QRC `%qdt:` block lines with 1-space indent,
 * wrapping around `maxCols` without ever breaking inside `__tower_` or `____tower_` macros.
 * @param {string} text
 * @param {number} [maxCols]
 * @returns {string[]}
 */
export function wrapQuestLogLines(text, maxCols = 44) {
  const raw = String(text ?? '').trim();
  if (!raw) return ['%qdt:'];
  const words = raw.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const word of words) {
    if (word.length > maxCols) {
      const units = splitAtomicWord(word);
      let needSpace = cur.length > 0;
      for (const unit of units) {
        const sep = needSpace ? ' ' : '';
        if (cur && cur.length + sep.length + unit.length > maxCols) {
          lines.push(` ${cur}`);
          cur = unit;
        } else {
          cur = cur ? `${cur}${sep}${unit}` : unit;
        }
        needSpace = false;
      }
      continue;
    }
    if (!cur) {
      cur = word;
    } else if (cur.length + 1 + word.length <= maxCols) {
      cur = `${cur} ${word}`;
    } else {
      lines.push(` ${cur}`);
      cur = word;
    }
  }
  if (cur) lines.push(` ${cur}`);
  return ['%qdt:', ...lines];
}

const LOG_MESSAGES = Object.freeze({
  1010: () => t('apotheosis.quest.log.artifacts', 'Your shattering of thirteen Daedric artifacts has provoked a Dragon Break. __tower_ in ____tower_ is besieged by the forces of the Tower. Travel to __tower_ and shatter the siege.'),
  1011: () => t('apotheosis.quest.log.mantella', 'Your usurpation of the Mantella has provoked a Dragon Break. __tower_ in ____tower_ is besieged by the forces of the Tower. Travel to __tower_ and shatter the siege.'),
  1012: () => t('apotheosis.quest.log.siege', 'Thirteen waves of defenders surround __tower_ in ____tower_. Break the siege and defeat the Aspect of the Tower to unseal the gates.'),
  1013: () => t('apotheosis.quest.log.interior', 'The Aspect of the Tower has fallen and the seals of __tower_ are open. Enter __tower_ and descend to the Zero Stone within.'),
  1014: () => t('apotheosis.quest.log.shadow', 'You have passed through the Zero Stone into the Clockwork Sanctum. Confront and defeat the Shadow of the Agent to claim sovereign divinity.'),
  1015: () => t('apotheosis.quest.log.portfolio', 'The Shadow of the Agent has fallen. Step into the Ascension Conduit or open the Apotheosis menu to choose your Divine Portfolio.'),
  1016: () => t('apotheosis.quest.log.ascended', 'You have ascended beyond the Wheel and claimed your Divine Portfolio. Your name is written into the Dream.'),
});

const SHEET_MESSAGES = Object.freeze({
  'o.reachTower': () => t('apotheosis.quest.obj.reachTower', 'Travel to __tower_ in ____tower_ and face the Dragon Break'),
  'o.breakSiege': () => t('apotheosis.quest.obj.breakSiege', 'Break all 13 waves of the siege and defeat the Aspect of the Tower at __tower_'),
  'o.zeroStone': () => t('apotheosis.quest.obj.zeroStone', 'Enter __tower_ and find the Zero Stone within its depths'),
  'o.shadow': () => t('apotheosis.quest.obj.shadow', 'Defeat the Shadow of the Agent within the Clockwork Sanctum'),
  'o.portfolio': () => t('apotheosis.quest.obj.portfolio', 'Step into the Ascension Conduit and claim your Divine Portfolio'),
  'r.ascended': () => t('apotheosis.quest.out.ascended', 'You have ascended beyond the Wheel and claimed your Divine Portfolio.'),
  'r.failed': () => t('apotheosis.quest.out.failed', 'The Path of CHIM remains unfinished.'),
});

registerPortQuestLocalization(APOTHEOSIS_QUEST_NAME, {
  displayName: () => t('apotheosis.quest.title', 'Apotheosis - Path of CHIM'),
  message: (id) => {
    const fn = LOG_MESSAGES[id];
    return fn ? wrapQuestLogLines(fn()) : null;
  },
  sheet: (rest) => SHEET_MESSAGES[rest]?.(),
});

export const apotheosisZeroStoneMarkName = () => t('apotheosis.quest.mark.zeroStone', 'Zero Stone');
export const apotheosisShadowMarkName = () => t('apotheosis.quest.mark.shadow', 'Shadow of the Agent');
export const apotheosisConduitMarkName = () => t('apotheosis.quest.mark.conduit', 'Ascension Conduit');

/**
 * Exact-tier dungeon & Orrery marks for Direnni Tower (Zero Stone) and Clockwork Sanctum.
 * @param {{ state?: any, inOrrery?: boolean, zeroStonePos?: ReadonlyArray<number>|null, foes?: ReadonlyArray<any>|null, orreryCenter?: ReadonlyArray<number>|null, followed?: boolean }} o
 * @returns {Array<{ at: [number, number, number], name: string, followed: boolean }>}
 */
export function buildApotheosisDungeonMarks({
  state = null,
  inOrrery = false,
  zeroStonePos = null,
  foes = [],
  orreryCenter = null,
  followed = false,
} = {}) {
  if (!state || state.stage === 'mortal' || state.stage === 'ascended' || state.ascended) return [];
  const isFollowed = !!followed;
  if (!inOrrery) {
    if (
      state.stage === 'questline_active' &&
      !state.shadowDefeated &&
      (state.questStep === 'tower_interior' || state.questStep === 'shadow_duel') &&
      Array.isArray(zeroStonePos) &&
      zeroStonePos.length >= 3 &&
      Number.isFinite(zeroStonePos[0]) &&
      Number.isFinite(zeroStonePos[1]) &&
      Number.isFinite(zeroStonePos[2])
    ) {
      return [{
        at: [zeroStonePos[0], zeroStonePos[1], zeroStonePos[2]],
        name: apotheosisZeroStoneMarkName(),
        followed: isFollowed,
      }];
    }
    return [];
  }
  if (!state.shadowDefeated && state.questStep === 'shadow_duel') {
    const shadowFoe = (foes ?? []).find(
      (f) =>
        f &&
        !f.dead &&
        f.entity?.shadowBoss === true &&
        Array.isArray(f.ai?.feet) &&
        f.ai.feet.length >= 3 &&
        Number.isFinite(f.ai.feet[0]) &&
        Number.isFinite(f.ai.feet[1]) &&
        Number.isFinite(f.ai.feet[2]),
    );
    if (shadowFoe) {
      const feet = shadowFoe.ai.feet;
      return [{
        at: [feet[0], feet[1], feet[2]],
        name: apotheosisShadowMarkName(),
        followed: isFollowed,
      }];
    }
    return [];
  }
  if (
    (state.stage === 'awaiting_portfolio' || state.shadowDefeated) &&
    Array.isArray(orreryCenter) &&
    orreryCenter.length >= 3 &&
    Number.isFinite(orreryCenter[0]) &&
    Number.isFinite(orreryCenter[1]) &&
    Number.isFinite(orreryCenter[2])
  ) {
    return [{
      at: [orreryCenter[0], orreryCenter[1], orreryCenter[2]],
      name: apotheosisConduitMarkName(),
      followed: isFollowed,
    }];
  }
  return [];
}

/** @type {{ getMachine?: () => any, getPlayer?: () => any } | null} */
let _host = null;

/** Wires live `QuestMachine` and `playerEntity` accessors from `scenes/world.js`. */
export function setApotheosisQuestHost(host) {
  _host = host ?? null;
}

/** Returns the active (not completed, not tombstoned) `_APOTHEO` quest in `machine`, or `null`. */
export function findActiveApotheosisQuest(machine) {
  if (!machine?.quests) return null;
  for (const q of machine.quests.values()) {
    if (isApotheosisQuestName(q.questName) && !q.questComplete && !q.questTombstoned) return q;
  }
  return null;
}

/** Returns any `_APOTHEO` quest instance in `machine` (active or tombstoned), or `null`. */
export function findAnyApotheosisQuest(machine) {
  if (!machine?.quests) return null;
  for (const q of machine.quests.values()) {
    if (isApotheosisQuestName(q.questName)) return q;
  }
  return null;
}

function advanceAndSettle(machine, quest, state) {
  quest.update?.();
  for (let i = 0; i < 4 && !quest.questComplete && (quest.ticksToEnd ?? 0) > 0; i++) {
    quest.update?.();
  }
  if (quest.questComplete && !quest.questTombstoned) {
    state.journalAscendedSynced = true;
    machine.tombstoneQuest?.(quest);
  }
}

/**
 * Synchronizes `_APOTHEO` in `machine` with `entity.apotheosis` (purge on reset,
 * start/advance active steps, and backfill/guard completed ascension).
 * @param {any} machine
 * @param {any} entity
 */
export function syncApotheosisQuests(machine, entity) {
  if (!machine?.quests || !entity?.apotheosis) return null;
  const state = entity.apotheosis;
  const rank = apotheosisPhaseRank(state);

  if (rank < 0) {
    for (const q of [...machine.quests.values()]) {
      if (isApotheosisQuestName(q.questName)) machine.removeQuest?.(q);
    }
    return null;
  }

  const active = findActiveApotheosisQuest(machine);
  if (active) {
    advanceAndSettle(machine, active, state);
    return active;
  }

  const existing = findAnyApotheosisQuest(machine);
  if (existing) {
    if (rank >= 5) state.journalAscendedSynced = true;
    return existing;
  }

  if (rank >= 5 && state.journalAscendedSynced) return null;

  const quest = machine.startQuestByName?.(APOTHEOSIS_QUEST_NAME) ?? null;
  if (!quest) return null;
  advanceAndSettle(machine, quest, state);
  return quest;
}

/** Synchronizes the live host's `_APOTHEO` quest after any `apotheosisCore` transition. */
export function notifyApotheosisQuestSync(entity = null) {
  if (!_host) return null;
  const machine = _host.getMachine?.() ?? null;
  const target = entity ?? _host.getPlayer?.() ?? null;
  if (!machine || !target) return null;
  return syncApotheosisQuests(machine, target);
}
