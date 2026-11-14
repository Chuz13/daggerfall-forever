# Example Mods Walkthrough

Daggerfall Forever ships with **8 example mods** in `mods/examples/`. They demonstrate both pure JSON data overrides and scripted `plugin.js` gameplay systems.

---

## 1. `steel-and-sinew` (JSON Combat Override)
* **Files:** `manifest.json`, `combat.json`
* **What it does:** Adjusts armor-weight fatigue drain so heavy armor is more exhausting while light armor is more agile.
* **How it works:** Declares `"data": { "combat": "combat.json" }` with no `plugin.js`. `modDataSync.js` merges its multipliers (`heavyArmorFatigueMultiplier: 1.25`, `mediumArmorFatigueMultiplier: 1.05`, `lightArmorFatigueMultiplier: 0.85`) into the combat fatigue pipeline.

---

## 2. `apothecary-elixirs` (JSON Potion Recipes)
* **Files:** `manifest.json`, `potions.json`
* **What it does:** Adds two new brewable potions: **Pure Vigor Elixir** (price `95`, magnitude `40–80`) and **Frostward Cordial** (price `85`, `100%` base chance).
* **How it works:** Declares `"data": { "potions": "potions.json" }`. `potions.json` is an array of recipe objects specifying `name`, `displayName`, `price`, `ingredients` (template IDs), `effect`, `textureRecord`, and `settings`. On sync, `overridePotionRecipes` registers them into the alchemy table.

---

## 3. `desert-frost` (Scripted Environmental Hazard)
* **Files:** `manifest.json`, `plugin.js`
* **What it does:** Exposes outdoor adventurers in desert or mountain biomes at night to freezing winds that drain fatigue unless protected by frost resistance.
* **How it works:** Subscribes to `api.events.on('worldTick', ...)`, checks `api.world.isNight()`, `!api.world.isInterior()`, and `api.world.getCurrentBiome()`. If the player lacks `api.player.hasEffect('resistFrost')`, it calls `api.player.damageFatigue(5)`, tracks ticks in `api.storage`, and warns the player via `api.ui.notify` every 6 ticks.

---

## 4. `blood-tithe` (Scripted Unlockable Feat)
* **Files:** `manifest.json`, `plugin.js`
* **What it does:** Tracks melee kills; after slaying 5 enemies, unlocks the **Blood-Tithe** perk, which siphons `+15 HP` and `+30 SP` on every subsequent kill.
* **How it works:** Registers the perk metadata via `api.perks.register`, listens to `combat:enemyKill`, increments `slainCount` in `api.storage`, calls `api.perks.unlock('blood-tithe')` at 5 kills, and heals/restores fatigue on future kills whenever `api.perks.has('blood-tithe')` is true.

---

## 5. `heroic-feats` (Condition-Checked Milestone Perks)
* **Files:** `manifest.json`, `plugin.js`
* **What it does:** Introduces 5 milestone feats that automatically activate once character requirements are met:
  1. **Blade Mastery** — `+15%` damage and `+10%` crit chance with Long Blades (Requires Long Blade `>= 50`).
  2. **Arcane Reservoir** — `+25` Max Magicka (Requires Mysticism `>= 50`).
  3. **Shadow Step** — `40%` quieter stealth movement and `+25%` backstab damage (Requires Stealth `>= 50`).
  4. **Iron Constitution** — `-30%` disease/poison susceptibility and `+15` Max HP (Requires Level `>= 5`).
  5. **Treasure Hunter** — `+20%` gold in dungeon chests and corpses (Requires Mercantile `>= 40`).
* **How it works:** Each `api.perks.register` call includes a `check: (entity) => boolean` predicate evaluated against `entity.skills` / `entity.level`.

---

## 6. `duelists-flow` (Combo System + Perk + Localization)
* **Files:** `manifest.json`, `plugin.js`
* **What it does:** Adds a rhythmic combat combo system. Consecutive landed hits within `6000 ms` build a combo streak:
  * **3 hits (Flow State):** Restores `+12 FP`.
  * **5 hits (Deadly Precision):** Restores `+5 HP`, `+25 FP`, and unlocks the **Duelist's Trance** perk (`+5%` hit chance and halved combo-break fatigue penalty).
  * **7+ hits (odd streaks, Master Duelist):** Restores `+10 HP` and `+35 FP`.
  * **Missed swing (with streak >= 2):** Breaks flow and drains `10 FP` (`5 FP` with Duelist's Trance).
* **How it works:** Keeps ephemeral `currentStreak` in memory (avoiding save bloat), persists `bestStreak` in `api.storage`, uses `api.ui.showMidScreen` for the live combo counter, and localizes all messages via `api.ui.t`.

---

## 7. `items-quality` (Quality Tiers + Material Rebalance)
* **Files:** `manifest.json`, `quality.json`, `materials.json`, `plugin.js`
* **What it does:** Adds 5 craftsmanship quality tiers (**Crude**, **Standard**, **Fine**, **Superior**, **Masterwork**) to weapons and armor, modifying damage/armor (`-1` to `+3`), durability loss, max condition, and trade value (`0.6x` to `4.0x`), alongside flattened material scaling.
* **How it works:** Declares `"data": { "quality": "quality.json", "materials": "materials.json" }`. `modDataSync.js` reads these tables to enable quality rolls on loot and shop stock, while `plugin.js` logs initialization.

---

## 8. `weapons-reforged` (Material JSON + On-Hit Script Effects)
* **Files:** `manifest.json`, `materials.json`, `plugin.js`
* **What it does:** Gives high-tier weapon materials distinct combat identities on top of stat rebalancing:
  * **Adamantium (`6`):** `20%` chance on hit to sunder enemy armor (`-25` condition or `+2` armor penalty).
  * **Ebony (`7`):** Siphons `10` fatigue from the target and restores `10` fatigue to the player.
  * **Daedric (`9`):** Curses the wielder—missed swings drain `15` fatigue, and attacking below `25%` HP drains `5 HP`.
  * **Wall Clank:** Notifies the player when a swing strikes a stone wall (`weaponWallClank`).
* **How it works:** Combines `materials.json` data overrides with `combatAttackResolved` and `weaponWallClank` listeners in `plugin.js`.
