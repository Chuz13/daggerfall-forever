// @ts-check
// Session combat & event log ring buffer (max 400 entries, 12 encounters).
// Strict Acyclic Import Law: imports ONLY `modEventBus.js`.

import { onModEvent } from './mods/modEventBus.js';

export const GAME_LOG_MAX_ENTRIES = 400;
export const GAME_LOG_MAX_ENCOUNTERS = 12;
export const ENCOUNTER_INACTIVITY_MS = 8000;
export const ENCOUNTER_VICTORY_GRACE_MS = 2500;

let _seq = 0;
let _encSeq = 0;
let _activeEncounter = null;
let _inactivityTimer = null;
let _victoryTimer = null;

/** @type {Array<Record<string, any>>} */
const _entries = [];
/** @type {Array<Record<string, any>>} */
const _encounters = [];
/** @type {Set<() => void>} */
const _listeners = new Set();
/** @type {Map<string, number>} */
const _suppressedHud = new Map();

let _ctx = {
  worldMinutes: null,
  locationName: null,
  player: null,
};

/**
 * Registers runtime context readers (called once by worldTick.js).
 * @param {{ worldMinutes?: (() => number)|null, locationName?: (() => string|null)|null, player?: (() => any)|null }} ctx
 */
export function setGameLogContext(ctx = {}) {
  _ctx = {
    worldMinutes: typeof ctx.worldMinutes === 'function' ? ctx.worldMinutes : _ctx.worldMinutes,
    locationName: typeof ctx.locationName === 'function' ? ctx.locationName : _ctx.locationName,
    player: typeof ctx.player === 'function' ? ctx.player : _ctx.player,
  };
}

function safeGameMinutes() {
  try {
    const m = _ctx.worldMinutes?.();
    return Number.isFinite(m) ? m : null;
  } catch {
    return null;
  }
}

function safeLocation() {
  try {
    const loc = _ctx.locationName?.();
    return typeof loc === 'string' && loc.trim() ? loc.trim() : null;
  } catch {
    return null;
  }
}

function notifyListeners() {
  for (const fn of [..._listeners]) {
    try {
      fn();
    } catch {
      /* listener isolation */
    }
  }
}

/**
 * Subscribe to log changes. Returns unsubscribe function.
 * @param {() => void} fn
 * @returns {() => void}
 */
export function onGameLogChange(fn) {
  if (typeof fn !== 'function') return () => {};
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * Snapshot a combatant for language-agnostic display.
 * @param {any} entity
 */
function combatantSnapshot(entity) {
  if (!entity || typeof entity !== 'object') return { isPlayer: false, name: null, mobileType: null, careerIndex: null, level: null };
  if (entity.isPlayer && !entity.peer) {
    return {
      isPlayer: true,
      name: entity.name || null,
      mobileType: null,
      careerIndex: null,
      level: entity.level ?? 1,
    };
  }
  return {
    isPlayer: false,
    isPeer: Boolean(entity.peer),
    name: entity.name || entity.basics?.name || null,
    mobileType: entity.mobileType ?? null,
    careerIndex: entity.careerIndex ?? null,
    level: entity.level ?? null,
    elite: Boolean(entity.eliteFoe),
  };
}

function foeKey(snap) {
  if (!snap || snap.isPlayer) return null;
  return `${snap.mobileType ?? 'x'}:${snap.careerIndex ?? 'x'}:${snap.name ?? 'foe'}`;
}

function weaponSnapshot(weapon, attacker) {
  if (weapon && typeof weapon === 'object') {
    return {
      name: weapon.name || null,
      templateIndex: Number.isInteger(weapon.templateIndex) ? weapon.templateIndex : null,
      material: weapon.material ?? null,
      quality: weapon.quality ?? null,
      group: weapon.group || 'Weapons',
      artifact: Boolean(weapon.artifact),
      identified: weapon.identified,
      flags: weapon.flags,
      rarity: weapon.rarity ?? null,
      legendary: Boolean(weapon.legendary),
      aetheric: Boolean(weapon.aetheric),
      gilded: Boolean(weapon.gilded),
      qlNamed: Boolean(weapon.qlNamed),
      heirloom: weapon.heirloom?.house ? { house: weapon.heirloom.house } : null,
    };
  }
  return {
    name: null,
    templateIndex: null,
    material: null,
    quality: null,
    unarmed: true,
    isMonster: Boolean(attacker && !attacker.isPlayer && attacker.isClass === false),
  };
}

function clearInactivityTimer() {
  if (_inactivityTimer) {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = null;
  }
}

function clearVictoryTimer() {
  if (_victoryTimer) {
    clearTimeout(_victoryTimer);
    _victoryTimer = null;
  }
}

function armVictoryTimer() {
  clearVictoryTimer();
  _victoryTimer = setTimeout(() => {
    _victoryTimer = null;
    if (_activeEncounter && _activeEncounter.outcome === 'active') {
      endActiveEncounter('victory');
    }
  }, ENCOUNTER_VICTORY_GRACE_MS);
  if (typeof _victoryTimer === 'object' && typeof _victoryTimer?.unref === 'function') {
    _victoryTimer.unref();
  }
}

function armInactivityTimer() {
  clearInactivityTimer();
  clearVictoryTimer();
  _inactivityTimer = setTimeout(() => {
    endActiveEncounter(_activeEncounter?._pendingVictory ? 'victory' : 'ended');
  }, ENCOUNTER_INACTIVITY_MS);
  if (typeof _inactivityTimer === 'object' && typeof _inactivityTimer?.unref === 'function') {
    _inactivityTimer.unref();
  }
}

function ensureEncounter() {
  if (_activeEncounter && _activeEncounter.outcome === 'active') {
    _activeEncounter._pendingVictory = false;
    armInactivityTimer();
    return _activeEncounter;
  }
  const now = Date.now();
  const enc = {
    id: ++_encSeq,
    startWallTime: now,
    endWallTime: null,
    startGameMinutes: safeGameMinutes(),
    location: safeLocation(),
    outcome: 'active',
    foes: [],
    _foeKeys: new Set(),
    _aliveFoeRefs: new Set(),
    _deadFoeRefs: new Set(),
    _pendingVictory: false,
    summary: {
      playerAttacks: 0,
      playerHits: 0,
      playerCrits: 0,
      playerBackstabs: 0,
      playerSpecialHits: 0,
      playerDamageDealt: 0,
      playerDamageTaken: 0,
      enemyAttacks: 0,
      enemyHits: 0,
      shieldBlocks: 0,
      armorMitigated: 0,
      enemyShieldBlocks: 0,
      enemyArmorMitigated: 0,
      spellsCast: 0,
      spellsResisted: 0,
      spellsAbsorbed: 0,
      spellsReflected: 0,
      enemiesDefeated: [],
      fatalEntryId: null,
    },
  };
  _activeEncounter = enc;
  _encounters.push(enc);
  if (_encounters.length > GAME_LOG_MAX_ENCOUNTERS) {
    _encounters.shift();
  }
  armInactivityTimer();
  return enc;
}

function registerFoeInEncounter(enc, entity, snap) {
  if (!enc || !entity || snap?.isPlayer) return;
  const k = foeKey(snap);
  if (k && !enc._foeKeys.has(k)) {
    enc._foeKeys.add(k);
    enc.foes.push(snap);
  }
  if (enc._deadFoeRefs.has(entity)) return;
  if ((entity.health ?? 1) > 0) enc._aliveFoeRefs.add(entity);
  else enc._aliveFoeRefs.delete(entity);
}

function markFoeDeadInEncounter(enc, entity, snap) {
  if (!enc || snap?.isPlayer) return false;
  if (entity && enc._deadFoeRefs.has(entity)) return false;
  if (entity) enc._deadFoeRefs.add(entity);
  let removed = entity ? enc._aliveFoeRefs.delete(entity) : false;
  if (!removed && enc._aliveFoeRefs.size > 0) {
    const targetKey = foeKey(snap);
    for (const ref of enc._aliveFoeRefs) {
      if ((snap?.mobileType != null && ref?.mobileType === snap.mobileType) || foeKey(combatantSnapshot(ref)) === targetKey) {
        enc._aliveFoeRefs.delete(ref);
        enc._deadFoeRefs.add(ref);
        removed = true;
        break;
      }
    }
  }
  enc.summary.enemiesDefeated.push(snap);
  if (enc._foeKeys.size > 0 && enc._aliveFoeRefs.size === 0 && enc.outcome === 'active') {
    enc._pendingVictory = true;
    armVictoryTimer();
  }
  return true;
}

/**
 * Closes the active encounter with a given outcome.
 * @param {'victory'|'death'|'ended'} [outcome='ended']
 */
export function endActiveEncounter(outcome = 'ended') {
  clearInactivityTimer();
  clearVictoryTimer();
  if (!_activeEncounter) return null;
  _activeEncounter.outcome = outcome;
  _activeEncounter.endWallTime = Date.now();
  const closed = _activeEncounter;
  _activeEncounter = null;
  notifyListeners();
  return closed;
}

/**
 * Suppresses an exact HUD text string briefly so a structured log entry is not duplicated by HudText.
 * @param {string} text
 * @param {number} [ttlMs=300]
 */
export function suppressHudTextOnce(text, ttlMs = 300) {
  const s = String(text ?? '').trim();
  if (!s) return;
  const now = Date.now();
  if (_suppressedHud.size >= 32) {
    for (const [k, exp] of _suppressedHud) {
      if (exp <= now) _suppressedHud.delete(k);
    }
  }
  _suppressedHud.set(s, now + ttlMs);
}

function takeSuppressed(text) {
  const s = String(text ?? '').trim();
  if (!s) return false;
  const until = _suppressedHud.get(s);
  if (until == null) return false;
  _suppressedHud.delete(s);
  return Date.now() <= until;
}

/**
 * Core push into the session ring buffer.
 * @param {{ cat: 'combat'|'magic'|'character'|'world', kind: string, tone: string, encounterId?: number|null, data?: Record<string, any> }} spec
 */
export function recordGameLog({ cat, kind, tone, encounterId = null, data = {} }) {
  const entry = {
    id: ++_seq,
    wallTime: Date.now(),
    gameMinutes: safeGameMinutes(),
    location: safeLocation(),
    cat,
    kind,
    tone,
    encounterId,
    repeatCount: 1,
    data,
  };
  _entries.push(entry);
  if (_entries.length > GAME_LOG_MAX_ENTRIES) {
    _entries.shift();
  }
  notifyListeners();
  return entry;
}

/**
 * Records a physical/weapon/unarmed attack resolution from `combatAttackResolved`.
 * @param {any} res
 */
export function recordCombatAttack(res) {
  if (!res || !res.attacker || !res.target) return null;
  const { attacker, target, weapon, damage = 0, hit, critical, backstab, ineffective, diag } = res;
  if (attacker.isPlayer && attacker.peer) return null;
  const atkSnap = combatantSnapshot(attacker);
  const tgtSnap = combatantSnapshot(target);
  const involvesPlayer = atkSnap.isPlayer || tgtSnap.isPlayer;
  const tracksActive = Boolean(
    _activeEncounter
    && _activeEncounter.outcome === 'active'
    && (_activeEncounter._aliveFoeRefs.has(attacker) || _activeEncounter._aliveFoeRefs.has(target)
      || _activeEncounter._foeKeys.has(foeKey(atkSnap)) || _activeEncounter._foeKeys.has(foeKey(tgtSnap))),
  );
  const enc = (involvesPlayer || tracksActive) ? ensureEncounter() : null;
  if (enc) {
    registerFoeInEncounter(enc, attacker, atkSnap);
    registerFoeInEncounter(enc, target, tgtSnap);
  }

  const dmgDiag = diag?.damage || {};
  const toHit = diag?.toHit || null;
  const shieldBlocked = Boolean(dmgDiag.shieldBlocked);
  const mitigated = Number(dmgDiag.mitigated) || 0;
  const hpBefore = Number.isFinite(diag?.targetHpBefore) ? diag.targetHpBefore : (target.health ?? null);
  const hpAfter = hpBefore != null ? Math.max(0, hpBefore - Math.max(0, damage)) : null;

  if (enc) {
    if (atkSnap.isPlayer) {
      enc.summary.playerAttacks++;
      if (hit) enc.summary.playerHits++;
      if (critical) enc.summary.playerCrits++;
      if (backstab) enc.summary.playerBackstabs++;
      if (critical || backstab) enc.summary.playerSpecialHits++;
      enc.summary.playerDamageDealt += Math.max(0, damage);
    } else if (tgtSnap.isPlayer) {
      enc.summary.enemyAttacks++;
      if (hit) enc.summary.enemyHits++;
      enc.summary.playerDamageTaken += Math.max(0, damage);
    }
    if (tgtSnap.isPlayer) {
      if (shieldBlocked) enc.summary.shieldBlocks++;
      if (mitigated > 0) enc.summary.armorMitigated += mitigated;
    } else {
      if (shieldBlocked) enc.summary.enemyShieldBlocks++;
      if (mitigated > 0) enc.summary.enemyArmorMitigated += mitigated;
    }
  }

  let tone = 'miss';
  if (ineffective || !hit || (shieldBlocked && damage === 0)) {
    tone = 'miss';
  } else if (atkSnap.isPlayer) {
    tone = critical || backstab ? 'player-crit' : 'player-hit';
  } else if (tgtSnap.isPlayer) {
    tone = 'enemy-hit';
  } else {
    tone = 'player-hit';
  }

  return recordGameLog({
    cat: 'combat',
    kind: 'attack',
    tone,
    encounterId: enc?.id ?? null,
    data: {
      attacker: atkSnap,
      target: tgtSnap,
      weapon: weaponSnapshot(weapon, attacker),
      damage: Math.max(0, Math.round(damage)),
      hit: Boolean(hit),
      critical: Boolean(critical),
      backstab: Boolean(backstab),
      ineffective: Boolean(ineffective),
      shadowResisted: Boolean(res.shadowResisted),
      hpBefore,
      hpAfter,
      diag: diag ? {
        core: diag.core || 'classic',
        attackSkill: diag.attackSkill ?? null,
        weaponMaterial: diag.weaponMaterial ?? null,
        minMetalToHit: diag.minMetalToHit ?? -1,
        struckPart: toHit?.struckPart ?? diag.struckPart ?? -1,
        reflexEvaded: Boolean(diag.reflexEvaded),
        toHit: toHit ? {
          chanceToHitMod: toHit.chanceToHitMod ?? 0,
          rawChance: toHit.rawChance ?? toHit.finalChance ?? 0,
          finalChance: toHit.finalChance ?? 0,
          hitRoll: toHit.hitRoll ?? 0,
          isHit: Boolean(toHit.isHit),
          modifiers: toHit.modifiers ? { ...toHit.modifiers } : {},
          parts: diag.toHitParts ? { ...diag.toHitParts } : null,
        } : null,
        damage: { ...dmgDiag },
      } : null,
    },
  });
}

/**
 * Records a spell resolution from `combatSpellResolved`.
 * @param {any} payload
 */
export function recordSpellEvent(payload) {
  if (!payload || !payload.target) return null;
  const { spell, casterLevel = 1, target, caster, out = {}, diag = null } = payload;
  const casterEntity = caster?.entity || caster || null;
  const hasEffect =
    (out.damage ?? 0) > 0 ||
    (out.healed ?? 0) > 0 ||
    (out.absorbed ?? 0) > 0 ||
    (out.reflected ?? 0) > 0 ||
    (out.resisted ?? 0) > 0 ||
    (out.saved ?? 0) > 0 ||
    (out.chanceFailed ?? 0) > 0 ||
    (out.paralyzed ?? 0) > 0 ||
    (out.drained ?? 0) > 0 ||
    (out.fortified ?? 0) > 0 ||
    (out.buffs ?? 0) > 0 ||
    (out.cured ?? 0) > 0 ||
    (out.continuous ?? 0) > 0 ||
    (out.disintegrated ?? 0) > 0 ||
    (out.fatigueDrained ?? 0) > 0 ||
    (out.magickaDrained ?? 0) > 0 ||
    (out.magickaHealed ?? 0) > 0 ||
    Boolean(out.teleport) ||
    (out.attrHealed ?? 0) > 0 ||
    (out.fatigueHealed ?? 0) > 0 ||
    (out.animateDead ?? 0) > 0 ||
    (out.massAnimateDead ?? 0) > 0 ||
    (out.corpseExplosion ?? 0) > 0 ||
    (out.controlUndead ?? 0) > 0 ||
    (out.sutureCadaver ?? 0) > 0 ||
    Boolean(out.armed) ||
    Boolean(out.dispelMagic) ||
    Boolean(out.dispel) ||
    Boolean(out.pacify) ||
    (out.swayRefused ?? 0) > 0 ||
    Boolean(out.createItem) ||
    Boolean(out.identify) ||
    Boolean(out.trapAlert);
  if (!hasEffect) return null;

  const casterSnap = combatantSnapshot(casterEntity);
  const tgtSnap = combatantSnapshot(target);
  const isHostile =
    (out.damage ?? 0) > 0 ||
    (out.paralyzed ?? 0) > 0 ||
    (out.drained ?? 0) > 0 ||
    (out.disintegrated ?? 0) > 0 ||
    (out.fatigueDrained ?? 0) > 0 ||
    (out.magickaDrained ?? 0) > 0 ||
    (out.resisted ?? 0) > 0 ||
    (out.reflected ?? 0) > 0 ||
    (out.saved ?? 0) > 0 ||
    (out.swayRefused ?? 0) > 0;

  const involvesPlayer = casterSnap.isPlayer || tgtSnap.isPlayer;
  const enc = (isHostile && involvesPlayer)
    ? ensureEncounter()
    : (_activeEncounter && _activeEncounter.outcome === 'active' ? _activeEncounter : null);
  if (enc) {
    if (isHostile) {
      registerFoeInEncounter(enc, casterEntity, casterSnap);
      registerFoeInEncounter(enc, target, tgtSnap);
    }
    enc.summary.spellsCast++;
    if ((out.resisted ?? 0) > 0) enc.summary.spellsResisted++;
    if ((out.absorbed ?? 0) > 0) enc.summary.spellsAbsorbed++;
    if ((out.reflected ?? 0) > 0) enc.summary.spellsReflected++;
    if ((out.damage ?? 0) > 0) {
      if (casterSnap.isPlayer && !tgtSnap.isPlayer) enc.summary.playerDamageDealt += out.damage;
      else if (tgtSnap.isPlayer && !casterSnap.isPlayer) enc.summary.playerDamageTaken += out.damage;
    }
  }

  let tone = 'magic';
  if ((out.healed ?? 0) > 0 || (out.cured ?? 0) > 0) tone = 'heal';
  else if (tgtSnap.isPlayer && ((out.damage ?? 0) > 0 || (out.paralyzed ?? 0) > 0 || (out.drained ?? 0) > 0)) tone = 'enemy-hit';

  const hpBefore = Number.isFinite(diag?.targetHpBefore) ? diag.targetHpBefore : null;
  let hpAfter = Number.isFinite(diag?.targetHpAfter) ? Math.max(0, diag.targetHpAfter) : null;
  if (hpAfter == null && hpBefore != null) {
    if ((out.damage ?? 0) > 0) hpAfter = Math.max(0, hpBefore - out.damage);
    else if ((out.healed ?? 0) > 0) {
      const next = hpBefore + out.healed;
      hpAfter = Number.isFinite(target.maxHealth) ? Math.min(target.maxHealth, next) : next;
    }
  }

  const spellEntry = recordGameLog({
    cat: 'magic',
    kind: 'spell',
    tone,
    encounterId: enc?.id ?? null,
    data: {
      caster: casterSnap,
      target: tgtSnap,
      casterLevel,
      spell: {
        name: spell?.name || null,
        index: Number.isInteger(spell?.index) ? spell.index : null,
        element: spell?.element ?? diag?.element ?? null,
        rangeType: spell?.rangeType ?? diag?.rangeType ?? 0,
      },
      out: { ...out },
      hpBefore,
      hpAfter,
      effectKinds: Array.isArray(diag?.effectKinds) ? [...diag.effectKinds] : [],
    },
  });

  if (!tgtSnap.isPlayer && ((hpBefore != null && hpBefore > 0 && (hpAfter ?? target.health ?? 1) <= 0) || (out.disintegrated ?? 0) > 0)) {
    const newlyDead = enc ? markFoeDeadInEncounter(enc, target, tgtSnap) : true;
    if (newlyDead) {
      recordGameLog({
        cat: 'combat',
        kind: 'kill',
        tone: 'player-crit',
        encounterId: enc?.id ?? null,
        data: {
          killer: casterSnap,
          target: tgtSnap,
          isCivilian: false,
        },
      });
    }
  }

  return spellEntry;
}

/**
 * Records an enemy kill from `combat:enemyKill`.
 * @param {any} payload
 */
export function recordEnemyKill(payload) {
  const { player, target, isCivilian = false, mobileType = null } = payload || {};
  const enc = _activeEncounter;
  if (enc && target && enc._deadFoeRefs?.has(target)) return null;
  const tgtSnap = combatantSnapshot(target || { mobileType });
  if (enc) {
    const marked = markFoeDeadInEncounter(enc, target, tgtSnap);
    if (!marked && target) return null;
  }
  return recordGameLog({
    cat: 'combat',
    kind: 'kill',
    tone: 'player-crit',
    encounterId: enc?.id ?? null,
    data: {
      killer: combatantSnapshot(player),
      target: tgtSnap,
      isCivilian: Boolean(isCivilian),
    },
  });
}

/**
 * Records player death and closes any active encounter with `'death'`.
 * @param {{ goldLoss?: number }} [info]
 */
export function recordPlayerDeath(info = {}) {
  const enc = _activeEncounter;
  const entry = recordGameLog({
    cat: 'combat',
    kind: 'death',
    tone: 'danger',
    encounterId: enc?.id ?? null,
    data: {
      goldLoss: Number(info?.goldLoss) || 0,
    },
  });
  if (enc) {
    enc.summary.fatalEntryId = entry.id;
    endActiveEncounter('death');
  }
  return entry;
}

/**
 * @param {number} skillId
 * @param {number} newValue
 */
export function recordSkillAdvance(skillId, newValue) {
  return recordGameLog({
    cat: 'character',
    kind: 'skill',
    tone: 'world',
    encounterId: null,
    data: { skillId, newValue },
  });
}

/**
 * @param {number} level
 */
export function recordLevelUp(level) {
  return recordGameLog({
    cat: 'character',
    kind: 'levelUp',
    tone: 'player-crit',
    encounterId: null,
    data: { level },
  });
}

/**
 * @param {string} itemName
 * @param {boolean} [isPlayerOwner=true]
 */
export function recordItemBroken(itemName, isPlayerOwner = true) {
  return recordGameLog({
    cat: isPlayerOwner ? 'character' : 'combat',
    kind: 'itemBreak',
    tone: isPlayerOwner ? 'danger' : 'world',
    encounterId: _activeEncounter?.id ?? null,
    data: { itemName: String(itemName || ''), isPlayerOwner: Boolean(isPlayerOwner) },
  });
}

/**
 * @param {{ diseaseType?: number|null, contracted?: boolean, resisted?: boolean }} info
 */
export function recordDiseaseEvent({ diseaseType = null, contracted = false, resisted = false } = {}) {
  return recordGameLog({
    cat: 'magic',
    kind: 'disease',
    tone: contracted ? 'danger' : 'magic',
    encounterId: _activeEncounter?.id ?? null,
    data: { diseaseType, contracted: Boolean(contracted), resisted: Boolean(resisted) },
  });
}

/**
 * @param {{ poisonType?: number|null, inflicted?: boolean, resisted?: boolean }} info
 */
export function recordPoisonEvent({ poisonType = null, inflicted = false, resisted = false } = {}) {
  return recordGameLog({
    cat: 'magic',
    kind: 'poison',
    tone: inflicted ? 'danger' : 'magic',
    encounterId: _activeEncounter?.id ?? null,
    data: { poisonType, inflicted: Boolean(inflicted), resisted: Boolean(resisted) },
  });
}

/**
 * Records quick-loot pickups (item names/rarities/counts/gold).
 * @param {Array<{ name?: string, gold?: boolean, count?: number, rarity?: string|null }>} entries
 */
export function recordLootPickup(entries) {
  if (!Array.isArray(entries) || !entries.length) return null;
  const items = entries
    .filter((e) => e && (e.count ?? 0) > 0)
    .map((e) => ({ name: String(e.name || 'Item'), gold: Boolean(e.gold), count: e.count, rarity: e.rarity ?? null }));
  if (!items.length) return null;
  return recordGameLog({
    cat: 'character',
    kind: 'loot',
    tone: 'world',
    encounterId: null,
    data: { items },
  });
}

/**
 * Records Ambient Text (kept in original English as requested).
 * @param {string} text
 */
export function recordAmbientText(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  return recordGameLog({
    cat: 'world',
    kind: 'ambient',
    tone: 'world',
    encounterId: null,
    data: { rawText: s },
  });
}

/**
 * Records a world event notice.
 * @param {string} eventKind
 * @param {string} text
 */
export function recordWorldEvent(eventKind, text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  return recordGameLog({
    cat: 'world',
    kind: 'worldEvent',
    tone: 'world',
    encounterId: null,
    data: { eventKind: String(eventKind || 'world'), rawText: s },
  });
}

/**
 * Records a generic HUD message unless suppressed by a richer structured producer,
 * collapsing consecutive identical messages into `repeatCount`.
 * @param {string} text
 * @param {string|null} [rawText=null]
 */
export function recordHudMessage(text, rawText = null) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  if (takeSuppressed(s) || (rawText && rawText !== text && takeSuppressed(rawText))) return null;

  const last = _entries[_entries.length - 1];
  if (last && last.kind === 'hud' && last.data?.rawText === s) {
    last.repeatCount = (last.repeatCount || 1) + 1;
    last.wallTime = Date.now();
    notifyListeners();
    return last;
  }

  return recordGameLog({
    cat: 'world',
    kind: 'hud',
    tone: 'world',
    encounterId: _activeEncounter?.id ?? null,
    data: { rawText: s },
  });
}

/** @returns {Array<Record<string, any>>} */
export function getGameLogEntries() {
  return [..._entries];
}

/** @returns {Array<Record<string, any>>} */
export function getGameLogEncounters() {
  return [..._encounters];
}

/** @returns {Record<string, any>|null} */
export function getLatestEncounter() {
  return _encounters.length ? _encounters[_encounters.length - 1] : null;
}

/** Clears the session log (called on save load / new character / Clear button). */
export function clearGameLog() {
  clearInactivityTimer();
  clearVictoryTimer();
  _entries.length = 0;
  _encounters.length = 0;
  _activeEncounter = null;
  _suppressedHud.clear();
  notifyListeners();
}

// Subscribe to core combat & spell events
onModEvent('combatAttackResolved', (res) => {
  recordCombatAttack(res);
}, 'dff_game_log');

onModEvent('combatSpellResolved', (payload) => {
  recordSpellEvent(payload);
}, 'dff_game_log');

onModEvent('combat:enemyKill', (payload) => {
  recordEnemyKill(payload);
}, 'dff_game_log');
