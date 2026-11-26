# Example Mods Walkthrough

Daggerfall Forever ships with **11 bundled example mods** in `mods/examples/` (automatically seeded into `<userData>/Mods/` in the packaged desktop app without overwriting existing folders). Together they demonstrate JSON overrides, custom content (`items`, `spells`, `legendaries`), live modifiers, HUD status chips, Mini-MCM settings, and 26-language localization.

---

## 1. `steel-and-sinew` (JSON Combat Override)
* **Files:** `manifest.json`, `combat.json`
* **What it does:** Adjusts armor-weight fatigue drain so heavy armor is more exhausting while light armor is more agile.
* **How it works:** Declares `"data": { "combat": "combat.json" }` with no `plugin.js`. `modDataSync.js` merges its multipliers (`heavyArmorFatigueMultiplier: 1.25`, `mediumArmorFatigueMultiplier: 1.05`, `lightArmorFatigueMultiplier: 0.85`) into the combat fatigue pipeline.

---

## 2. `apothecary-elixirs` (JSON Potion Recipes)
* **Files:** `manifest.json`, `potions.json`
* **What it does:** Adds two new brewable potions: **Pure Vigor Elixir** (price `95`, magnitude `40–80`) and **Frostward Cordial** (price `85`, `100%` base chance).
* **How it works:** Declares `"data": { "potions": "potions.json" }`. On sync, `overridePotionRecipes` registers them into the alchemy table.

---

## 3. `desert-frost` (Environmental Hazard + MCM)
* **Files:** `manifest.json`, `plugin.js`
* **What it does:** Exposes outdoor adventurers in desert or mountain biomes at night to freezing winds that drain fatigue unless protected by frost resistance.
* **How it works:** Subscribes to `worldTick`, checks `api.world.isNight()`, `!api.world.isInterior()`, and `api.world.getCurrentBiome()`, and reads `frostFatigueDrain` and `enableAlerts` from `api.settings`.

---

## 4. `blood-tithe` (Unlockable Feat + MCM)
* **Files:** `manifest.json`, `plugin.js`
* **What it does:** Tracks melee kills; after reaching the kill milestone (default `5`), unlocks the **Blood-Tithe** perk, siphoning HP and Stamina on every subsequent kill.
* **How it works:** Uses `api.perks.register` / `unlock`, `combat:enemyKill`, `api.storage`, and configurable `healOnKill`, `fatigueOnKill`, and `milestoneKills` in `manifest.json → settings`.

---

## 5. `heroic-feats` (Condition-Checked Milestone Perks)
* **Files:** `manifest.json`, `plugin.js`
* **What it does:** Introduces 5 milestone feats (**Blade Mastery**, **Arcane Reservoir**, **Shadow Step**, **Iron Constitution**, **Treasure Hunter**) evaluated dynamically via `check: (entity) => boolean` predicates against player skills and level.

---

## 6. `duelists-flow` (Combo System + HUD Chip + MCM + 26 Locales)
* **Files:** `manifest.json`, `locales.json`, `plugin.js`
* **What it does:** Adds a rhythmic combat combo system. Consecutive landed hits build flow:
  * **x1+:** Displays a live **Duelist's Flow** HUD chip with remaining combo timer.
  * **x3 (Flow State):** `+12 FP`.
  * **x5 (Deadly Precision):** `+5 HP`, `+25 FP`.
  * **x7+ (odd streaks, Master Duelist):** `+10 HP`, `+35 FP`.
  * **x10 (Duelist's Trance):** Permanently unlocks **Duelist's Trance** (`+5%` hit chance, halved miss penalty) and keeps a passive `+5%` HUD chip active even after the combo decays.
* **Console & MCM:** Includes `flow_set <0..12>`, `flow_status`, 26-language `locales.json`, and MCM settings (`decaySeconds`, `tranceThreshold`, `showChip`).

---

## 7. `items-quality` (Quality Tiers + Material Rebalance)
* **Files:** `manifest.json`, `quality.json`, `materials.json`, `plugin.js`
* **What it does:** Adds 5 craftsmanship quality tiers (**Crude**, **Standard**, **Fine**, **Superior**, **Masterwork**) to weapons and armor alongside flattened material scaling.

---

## 8. `weapons-reforged` (Material JSON + On-Hit Script Effects)
* **Files:** `manifest.json`, `materials.json`, `plugin.js`
* **What it does:** Gives **Adamantium** (armor sunder), **Ebony** (fatigue siphon), and **Daedric** (cursed swing penalties) distinct combat identities on top of material stat rebalancing.

---

## 9. `arcane-overload` (Spellcasting Modifiers + HUD Chip + MCM)
* **Files:** `manifest.json`, `locales.json`, `plugin.js`
* **What it does:** Each spell cast builds **Arcane Overload** stacks (up to `maxStacks`, default `4`), increasing spell power and cast speed at higher magicka cost until max stacks make the next spell **FREE** (0 Magicka) before discharging.
* **How it works:** Combines `api.modifiers.castSpeed`, `spellPower`, `spellCost`, and `spellFreeCast` with `playerCast`, `secondTick` decay, a live HUD chip (`FREE` blinking state), 26-language `locales.json`, MCM settings (`maxStacks`, `powerPerStack`, `showChip`), and `overload_set` / `overload_status` console commands.

---

## 10. `stealth-auto-steal` (Interaction Mode Hook + MCM)
* **Files:** `manifest.json`, `locales.json`, `plugin.js`
* **What it does:** Automatically switches the interaction mode to `steal` when crouching or sneaking, displays an **Auto-Steal** HUD chip, and restores the previous mode when standing up—while respecting manual `F1–F4` player overrides.
* **How it works:** Uses `player:crouchChanged`, `player:sneakChanged`, `player:interactionModeChanged`, `api.player.setInteractionMode`, MCM toggles (`enabledOnCrouch`, `restoreMode`, `showChip`), and `autosteal_status`.

---

## 11. `wayfarers-kit` (Full Content Mod: Items, Spells, Legendaries + MCM)
* **Files:** `manifest.json`, `items.json`, `spells.json`, `legendaries.json`, `locales.json`, `plugin.js`
* **What it does:** End-to-end showcase of Stage 3 content APIs:
  * **Wayfarer's Tonic** (`items.json` template `9101`): Usable inventory item (`api.items.onUse`) that consumes 1 charge (`ctx.consume()`), heals HP & Fatigue, grants `+15%` swing pace via `api.modifiers.swingPace`, and displays a timed HUD chip.
  * **Wayfarer's Stride** (`spells.json` spell `9101`): Custom spell (Heal Fatigue + Fortify Speed) merged into `SPELLS.STD` and granted via `api.spells.grant`.
  * **Wayfarer's Signet** (`legendaries.json` `wayfarers-signet`): Custom legendary ring with affixes, lore, and *Endless Road* haste power.
* **Console & MCM:** Includes `wayfarer_give`, `wayfarer_status`, 26-language `locales.json`, and MCM settings (`tonicFatigue`, `tonicHeal`, `buffDuration`, `showChip`).
