import test from 'node:test';
import assert from 'node:assert/strict';

import { ENTRY_WORDS } from '../../src/ui/hud/statusTips.js';
import {
  resolveUndeadControlTarget,
  castControlUndead,
} from '../../src/systems/necromancy/necromanticSpells.js';
import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';
import {
  isPlayerDisguised,
  applyLichdom,
  cureLichdom,
  applyAncientLichdom,
  cureAncientLichdom,
} from '../../src/systems/necromancy/lichdomStatus.js';
import { checkSettlementInfraction } from '../../src/systems/necromancy/cityLaw.js';
import { CRIMES } from '../../src/systems/crimes.js';
import { spawnMinion, dismissAllMinions, MINION_STANCES } from '../../src/systems/necromancy/minionController.js';
import { getConsoleCommand } from '../../src/systems/consoleCommands.js';

test('Bone Armor HUD Card: ENTRY_WORDS.boneArmor mirrors shield with real-time remaining values', () => {
  assert.equal(typeof ENTRY_WORDS.boneArmor, 'function');
  
  const buffWithHp = { kind: 'boneArmor', shieldRemaining: 150 };
  const tipWithHp = ENTRY_WORDS.boneArmor(buffWithHp);
  assert.match(tipWithHp, /Absorbs 150 more damage/);

  const buffZeroHp = { kind: 'boneArmor', shieldRemaining: 0 };
  const tipZeroHp = ENTRY_WORDS.boneArmor(buffZeroHp);
  assert.match(tipZeroHp, /Absorbs 0 more damage/);

  const buffNoHp = { kind: 'boneArmor' };
  const tipNoHp = ENTRY_WORDS.boneArmor(buffNoHp);
  assert.match(tipNoHp, /Absorbs damage/);
});

test('Control Undead Target Resolution: correctly maps DFU MOBILE_TYPES (Skeleton is 15, not Werewolf 9)', () => {
  // Skeleton
  const skel1 = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.SkeletalWarrior });
  assert.equal(skel1.type, 'skeleton');
  assert.equal(skel1.mobile, 15, 'SkeletalWarrior mobile type must be 15');

  const skelByName = resolveUndeadControlTarget({ name: 'Skeletal Warrior' });
  assert.equal(skelByName.type, 'skeleton');
  assert.equal(skelByName.mobile, 15, 'Skeleton fallback mobile must be 15, NOT Werewolf (9)');

  // Zombie
  const zombie = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.Zombie });
  assert.equal(zombie.type, 'zombie');
  assert.equal(zombie.mobile, 17);

  // Ghost
  const ghost = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.Ghost });
  assert.equal(ghost.type, 'ghost');
  assert.equal(ghost.mobile, 18);

  // Mummy
  const mummy = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.Mummy });
  assert.equal(mummy.type, 'mummy');
  assert.equal(mummy.mobile, 19);

  // Wraith
  const wraith = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.Wraith });
  assert.equal(wraith.type, 'wraith');
  assert.equal(wraith.mobile, 23);

  // Vampire
  const vamp = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.Vampire });
  assert.equal(vamp.type, 'vampire');
  assert.equal(vamp.mobile, 28);

  // Vampire Ancient
  const vampAncient = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.VampireAncient });
  assert.equal(vampAncient.type, 'vampire_ancient');
  assert.equal(vampAncient.mobile, 30);

  // Lich
  const lich = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.Lich });
  assert.equal(lich.type, 'lich');
  assert.equal(lich.mobile, 32);

  // Ancient Lich
  const ancientLich = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.AncientLich });
  assert.equal(ancientLich.type, 'ancient_lich');
  assert.equal(ancientLich.mobile, 33);
});

test('Control Undead Cast: converts existing targeted foe and pacifies AI/hostility', () => {
  const dummyPlayer = { isPlayer: true, name: 'Necromancer' };
  const hostileFoe = {
    name: 'Skeletal Warrior',
    mobileType: MOBILE_TYPES.SkeletalWarrior,
    isUndead: true,
    dead: false,
    entity: {
      team: 'PlayerEnemy',
      mobileTeam: 'PlayerEnemy',
      health: 80,
      maxHealth: 80,
    },
    ai: {
      isHostile: true,
      target: dummyPlayer,
      secondaryTarget: dummyPlayer,
      giveUpTimer: 10,
    },
  };

  const res = castControlUndead(dummyPlayer, hostileFoe, {
    magnitude: 100,
    duration: 20,
    chance: 100,
  });

  assert.equal(res.success, true);
  assert.ok(res.minion);
  assert.equal(hostileFoe.controlledUndead, true);
  assert.equal(hostileFoe.entity.team, 'PlayerAlly');
  assert.equal(hostileFoe.ai.isHostile, false, 'Controlled foe must not be hostile');
  assert.equal(hostileFoe.ai.target, null, 'Controlled foe target must be cleared');
  assert.equal(hostileFoe.ai.secondaryTarget, null);
  assert.equal(hostileFoe.ai.giveUpTimer, 0);
});

test('Guards & Lichdom/Minions Law: undisguised Lich and visible minions alert guards', () => {
  const player = {
    isPlayer: true,
    name: 'Necromancer',
    activeEffects: [],
    crimeCommitted: 0,
  };

  // 1. Mortal player without minions -> no infraction
  dismissAllMinions();
  cureLichdom(player);
  cureAncientLichdom(player);
  const cleanCheck = checkSettlementInfraction(player, { isInsideSettlement: true, regionName: 'Daggerfall' });
  assert.equal(cleanCheck.infraction, false);

  // 2. Undisguised Lich in Daggerfall -> Treason, hostile
  applyLichdom(player, { nowMinutes: 100 });
  assert.equal(isPlayerDisguised(player), false);
  const undisguisedLichCheck = checkSettlementInfraction(player, { isInsideSettlement: true, regionName: 'Daggerfall' });
  assert.equal(undisguisedLichCheck.infraction, true);
  assert.equal(undisguisedLichCheck.crime, CRIMES.Treason);
  assert.equal(undisguisedLichCheck.isHostile, true);

  // 3. Disguised Lich (Mortal Disguise active) -> passes peacefully
  player.activeEffects.push({ kind: 'disguise', roundsRemaining: 10, ended: false });
  assert.equal(isPlayerDisguised(player), true);
  const disguisedCheck = checkSettlementInfraction(player, { isInsideSettlement: true, regionName: 'Daggerfall' });
  assert.equal(disguisedCheck.infraction, false);

  // 4. Disguised Lich WITH visible minions -> Minions trigger infraction and hostility!
  spawnMinion({ type: 'skeleton', masterEntity: player, stance: MINION_STANCES.FOLLOW });
  const minionCheck = checkSettlementInfraction(player, { isInsideSettlement: true, regionName: 'Daggerfall' });
  assert.equal(minionCheck.infraction, true);
  assert.equal(minionCheck.crime, CRIMES.Criminal_Conspiracy);
  assert.equal(minionCheck.isHostile, true, 'Visible minions must cause guards to engage');

  // 5. Minions ordered to FEIGN_DEATH -> no visible minions -> passes peacefully
  dismissAllMinions();
  spawnMinion({ type: 'skeleton', masterEntity: player, stance: MINION_STANCES.FEIGN_DEATH });
  const feignCheck = checkSettlementInfraction(player, { isInsideSettlement: true, regionName: 'Daggerfall' });
  assert.equal(feignCheck.infraction, false);
});

test('Console Command necro control: works for both targeted live undead and standalone spawn', async () => {
  const necroCmd = getConsoleCommand('necro');
  assert.ok(necroCmd);

  // Test headless fallback
  const res = necroCmd.callback(['control', 'skeleton', '15']);
  assert.match(res, /Enslaved Controlled skeleton \(skeleton/);
  assert.match(res, /for 15 rounds/);
});

