# Modding System Overview

Daggerfall Forever (DFF) includes a **native JavaScript & JSON modding system** designed for speed, safety, and zero setup overhead. Unlike legacy Unity-based `.dfmod` C# assemblies, native DFF mods require **no compiler**, **no Unity SDK**, and **no binary patching**.

---

## What Native DFF Mods Can Do

Native mods live in the `mods/` directory and are built from plain JSON files and standard ES JavaScript (`plugin.js`):

* **Data-Driven JSON Overrides (`data` in `manifest.json`):**
  * `combat` (`combat.json`) — Tune armor-class fatigue multipliers (`heavyArmorFatigueMultiplier`, `mediumArmorFatigueMultiplier`, `lightArmorFatigueMultiplier`).
  * `potions` (`potions.json`) — Add or override alchemy potion recipes (ingredients, effect IDs, price, texture record, magnitude/chance settings).
  * `materials` (`materials.json`) — Customize weapon/armor material scaling (`Iron` through `Daedric`: damage, swing speed, undead/werecreature multipliers, strength requirements).
  * `quality` (`quality.json`) — Define craftsmanship quality tiers (e.g., `crude` to `masterwork`) with damage, armor, condition, price, and spawn weight modifiers.
* **Scripted Plugins (`entry: "plugin.js"`):**
  * Subscribe to gameplay events (`worldTick`, `combatAttackResolved`, `combat:enemyKill`, `weaponWallClank`, `perk:unlocked`, etc.) via `api.events`.
  * Read and modify player vitals (health, magicka, fatigue) and check active effects via `api.player`.
  * Query world state (game time, night/day, interior/exterior, biome) via `api.world`.
  * Register and unlock **Dynamic Perks** via `api.perks` (which appear automatically in the in-game Growth/Perks UI).
  * Persist mod-specific data safely per save via `api.storage` (`Safe-Save` isolation under `modData[modId]`).
  * Display HUD notifications, mid-screen combat text, and use the 26-language localization engine via `api.ui.t(key, fallbackEn, vars)`.
* **Safe-Save & Zero-Crash Isolation:**
  * Runtime exceptions inside a mod are caught and isolated so a faulty mod will not crash the game loop.
  * Removing a mod leaves vanilla saves clean without orphan save bloat.
* **Hot-Rescan:**
  * Edit or add mods while the game is running and click **Rescan** in the in-game Mod Manager to reload without restarting.

---

## Can Native Mods Replace Textures and Sounds?

**No — native JS/JSON mods (`mods/`) do not replace game texture assets or audio files.**

* A `plugin.js` script can trigger existing built-in engine audio clips (such as the level-up fanfare when unlocking a perk), but it cannot bundle custom `.png` textures or `.wav` sound files.
* **Texture, Sound, and Music Replacement** in DFF is handled by the separate **Replacement Packs** system:
  * **Textures (`.dfmod` Bundles):** DFF supports DFU `.dfmod` texture packs (such as *DREAM 90s* or *Vanilla Enhanced*, which ships with the port). They are indexed once at attach time and streamed on demand for world flats, walls, mobs, NPCs, item icons, paperdoll sprites, and billboard XML scales.
  * **Sounds & Music (Loose Packs):** Players can attach a sound folder containing loose `.wav` replacements named after `SoundClips` entries (e.g., `AmbientCrickets.wav`, `AmbientDistantHowl.wav`) or attach a custom music replacement pack through the Replacement Packs UI.

---

## Next Steps

* **[How to Start Modding](/modding/getting-started)** — Folder structure, `manifest.json`, load order, and Sandbox API reference.
* **[Example Mods](/modding/examples)** — Detailed breakdown of all 8 bundled example mods in `mods/examples/`.
