# Modding System Overview

Daggerfall Forever (DFF) includes a **native JavaScript & JSON modding system (Mod API v2)** designed for speed, safety, and zero setup overhead. Unlike legacy Unity-based `.dfmod` C# assemblies, native DFF mods require **no compiler**, **no Unity SDK**, and **no binary patching**.

---

## What Native DFF Mods Can Do

Native mods live in `<userData>/Mods/<modId>/` in the packaged desktop app (or `mods/` in source checkouts) and are built from plain JSON files and standard ES JavaScript (`plugin.js`). On desktop launch, the **13 bundled mods** are automatically seeded into `<userData>/Mods/` and unmodified bundled mods are automatically updated when the client updates (preserving any local user edits and third-party mods):

* **Data-Driven JSON Overrides & Content (`data` in `manifest.json`):**
  * `combat` (`combat.json`) - Tune armor-class fatigue multipliers (`heavyArmorFatigueMultiplier`, `mediumArmorFatigueMultiplier`, `lightArmorFatigueMultiplier`).
  * `potions` (`potions.json`) - Add or override alchemy potion recipes (ingredients, effect IDs, price, texture record, magnitude/chance settings).
  * `materials` (`materials.json`) - Customize weapon/armor material scaling (`Iron` through `Daedric`: damage, swing speed, undead/werecreature multipliers, strength requirements).
  * `quality` (`quality.json`) - Define craftsmanship quality tiers (e.g., `crude` to `masterwork`) with damage, armor, condition, price, and spawn weight modifiers.
  * `items` (`items.json`) - Register new custom item templates (`index >= 9000`) with localized names, Info lore, weight, price, and icons.
  * `spells` (`spells.json`) - Add or patch standard spells in `SPELLS.STD` with localized names and effect records.
  * `legendaries` (`legendaries.json`) - Register new legendary items with affixes, enchantments, lore, and legendary powers.
* **Scripted Plugins (`entry: "plugin.js"`):**
  * Subscribe to gameplay events (`worldTick`, `secondTick`, `magicRound`, `combatAttackResolved`, `combat:enemyKill`, `playerCast`, `spellLanded`, `playerKill`, `playerStruck`, `itemTaken`, `player:crouchChanged`, `player:sneakChanged`, `player:interactionModeChanged`, `perk:unlocked`, etc.) via `api.events`.
  * Register live gameplay **Modifiers** (`castSpeed`, `spellPower`, `spellCost`, `spellFreeCast`, `spellPierce`, `swingPace`, `weaponBlow`, `blowTaken`, `absorption`, `entityFold`, `enemyLoot`, `tabledLoot`, `containerLoot`, `preventRest`) via `api.modifiers`.
  * Read and modify player vitals, stats, skills, gold, inventory, and interaction modes (`steal`, `grab`, `info`, `talk`) via `api.player`.
  * Query world state (time, night/day, interior/exterior, biome, weather, season) via `api.world`.
  * Display HUD notifications, mid-screen banners, **live HUD Status Chips** with hover tooltips (`api.ui.setStatusChip`), and 26-language translations (`api.ui.t`).
  * Register custom **Use handlers** (`api.items.onUse`), grant items/legendaries/spells (`api.items.give`, `api.spells.grant`), and read mod-local files (`api.files.read`, `api.files.readJson`).
  * Register and unlock **Dynamic Perks** via `api.perks` (shown automatically in the in-game Growth/Perks UI).
  * Declare **Mini-MCM Settings** in `manifest.json` (`settings`) and react live via `api.settings.get` / `onChange`.
  * Register custom **Console Commands** via `api.console.register`.
  * Persist mod-specific data safely per save via `api.storage` (`Safe-Save` isolation under `modData[modId]`).
* **Autonomous 26-Language Localization (`locales`):**
  * Bundle a `locales.json` alongside your mod covering any or all of DFF's 26 supported languages without touching engine CSV files.
* **Safe-Save, Diagnostics & Hot-Rescan:**
  * Runtime exceptions inside a mod are caught, isolated, and shown as a red `Script error:` banner directly on that mod's card in the Mod Manager without crashing the game loop.
  * Removing a mod unregisters its modifiers, HUD chips, items/spells/legendaries, and leaves vanilla saves clean without orphan save bloat.
  * Edit JSON or `plugin.js` while the game is running and click **Rescan** in the Mod Manager to reload immediately without restarting.

---

## Can Native Mods Replace Textures and Sounds?

**No - native JS/JSON mods (`mods/`) do not replace game texture assets or audio files.**

* A `plugin.js` script can trigger existing built-in engine audio clips (such as `ArenaFanfareLevelUp` or `PotionDrink`) via `api.audio.play`, but it cannot bundle custom `.png` textures or `.wav` sound files.
* **Texture, Sound, and Music Replacement** in DFF is handled by the separate **Replacement Packs** system:
  * **Textures (`.dfmod` Bundles):** DFF supports DFU `.dfmod` texture packs (such as *DREAM 90s* or *Vanilla Enhanced*, which ships with the port). They are indexed once at attach time and streamed on demand for world flats, walls, mobs, NPCs, item icons, paperdoll sprites, and billboard XML scales.
  * **Sounds & Music (Loose Packs):** Players can attach a sound folder containing loose `.wav` replacements named after `SoundClips` entries (e.g., `AmbientCrickets.wav`, `AmbientDistantHowl.wav`) or attach a custom music replacement pack through the Replacement Packs UI.

---

## Next Steps

* **[How to Start Modding](/modding/getting-started)** - Folder structure, `manifest.json` (`settings`, `locales`, `data`), and full Sandbox API v2 reference.
* **[Example Mods](/modding/examples)** - Detailed walkthrough of all 13 bundled mods in `mods/examples/`.
