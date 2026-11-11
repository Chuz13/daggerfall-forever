import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bossTraitsOf, maybeApplyMobTraits } from '../../src/systems/bossTraits.js';
import { LivingTamrielConfig } from '../../src/systems/living/livingConfig.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

test('DUNGEON FOES: dungeonContext.js imports bossTraitsOf and has no undefined references', () => {
  const dCtxSrc = fs.readFileSync(path.join(ROOT, 'src/scenes/dungeonContext.js'), 'utf8');
  
  // Verify bossTraitsOf is explicitly imported from bossTraits.js
  const importMatch = dCtxSrc.match(/import\s*\{[^}]*bossTraitsOf[^}]*\}\s*from\s*['"]\.\.\/systems\/bossTraits\.js['"]/);
  assert.ok(importMatch, 'dungeonContext.js must import bossTraitsOf from ../systems/bossTraits.js');

  // Verify the call sites in buildFoeAt for both class and monster mobs
  const callSites = dCtxSrc.match(/bossTraitsOf\(entity\)/g);
  assert.ok(callSites && callSites.length >= 2, 'Must have at least 2 call sites for bossTraitsOf(entity)');
});

test('DUNGEON FOES: mob traits evaluation on mock dungeon monster does not throw ReferenceError', () => {
  const mockEntity = {
    mobileType: 1, // Rat
    level: 1,
    health: 10,
    maxHealth: 10,
    skills: new Array(35).fill(30),
    career: { skills: [] }
  };

  assert.doesNotThrow(() => {
    const traits = bossTraitsOf(mockEntity);
    assert.deepEqual(traits, []);
    
    // Simulate line 1681 of dungeonContext.js:
    if (!mockEntity.eliteFoe && !mockEntity.allied && !bossTraitsOf(mockEntity).length) {
      maybeApplyMobTraits(mockEntity, {
        playerLevel: 1,
        tier: LivingTamrielConfig.dungeonMobTraits,
        puppet: false,
        allied: false,
        seed: 12345
      });
    }
  });
});
