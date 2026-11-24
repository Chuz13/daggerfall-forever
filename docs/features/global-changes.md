# Global Non-LT Changes

Beyond **Apotheosis**, **Living Tamriel**, and **Necromancy**, **Daggerfall Forever** introduces broad single-player, quality-of-life, and mechanical changes across the entire game compared to upstream DFO and vanilla Daggerfall Unity (DFU).

---

## Online Systems Brought Offline

* **Offline Starfall Encounters & Morwen Questline (`offlineStarfall.js`, `offlineStarfallLoot.js`, `starfallHost.js`):** Adapts DFO's falling-star encounters for single-player (`Off` / `Rare` / `Normal` default / `Frequent`) with pause-safe dual-clock pacing (`20m` hold window, `>= 12m` preserved across nearby Fast Travel), violet sky omens, indoor tremors, tavern rumors, notice board notes, map search rings, solo-tuned combat (`1.5x` foe HP, 4 waves + Master finale), **Heart-Stars** (`2x` gold & Starfall Glass, guaranteed Lv `12+` Starspun Weave piece), Lv `1+` Starfall Glass & Lv `12+` Starspun Weave (`70%` unfound Codex bias) spoils, offline Renown XP, and Morwen's 4-part questline (`QLTF01–04`) awarding the **Starwarden** title.
* **Offline Player Housing & Shipyards (`offlineHomes.js`, `banking.js`):** Buy and sell DFO-style houses directly at the front door across all towns and hamlets, complete with chest storage, decor/yard placement (`0.25m` **Grid Snapping ON by default** in both interiors and yards, persisting toggles within a decorating session and resetting to ON upon exit), exterior look painting, NPC suppression, and heir inheritance - all without touching classic DFU bank housing when enabled. Also supports offline ship ownership and RCF reputation price/refusal integration.
* **Offline Firmament & Renown (`offlineFirmament.js`):** Use the Firmament star constellation passive tree and Renown progression offline, saved in `modData.firmament`. Applies a `1.5x` proportional offline XP boost (`OFFLINE_RENOWN_BOOST`) to kills and quests to compensate for missing online group/raid bonuses, with full respec for `500` gold.
* **Offline Professions & Gathering (`offlineProfessions.js`):** Enables mining, herbalism, logging, hunting, fishing, and crafting professions in single-player with local save persistence (`modData.professions`).
* **Unified Empire Bank (`banking.js`):** Unifies bank accounts across all 71 regions into a single global Empire account, toggleable and synchronized mid-game.
* **24/7 City Infrastructure (`buildingLocks.js`, `cityGate.js`):** Optional toggle that keeps city gates, shops, guild halls, banks, and libraries open 24/7.
* **Offline Online-Style Respawn (`deathRespawn.js`):** Optional toggle that replaces classic permadeath/reload with safe-spot waking (nearest temple, city, graveyard, or dungeon door) at `50%` HP, losing `10%` of carried gold and advancing `4–24` in-game hours.

---

## Visuals, Travel & Character Systems

* **Granular Morrowind Visual Toggles (`features.js`):** Splits DFO's unified Morrowind rendering into independent controls for **Player Character (First Person)** (`2D` / `3D`), **Player Character (Third Person)** (`2D` / `3D`), **Inventory Player Figure** (`Follow Third Person`, `Always 3D`, `Always Paperdoll`), **Morrowind Item Icons**, **Morrowind Foes** (`Off`, `Near`, `All`), and **Morrowind NPCs**, with automatic fallback to 2D / Profile 2D look when Morrowind data is absent.
* **Third-Person Static Paperdoll Mode (`skinCard.js`, `modSettings.js`):** Adds a `Paperdoll` option (`Graphics.Paperdoll`) to the Profile / Look selector alongside `Skins` and `Layered Gearing (WIP)`. Draws the player on foot in 3rd person using their cropped 2D character-sheet paperdoll (live gear, racial override heads, cape toggle, weapon glow, mounted skin on horseback) whenever Third Person uses the 2D look.
* **2D Inventory Paperdoll Cape Sync (`paperDoll.js`):** Syncs the cape visibility toggle directly to the 2D inventory paperdoll.
* **Post-Chargen Reflexes (`enhancedMenu.js`, `tells.js`):** Allows changing the **Reflexes** setting (`Very High` to `Very Low`) on an active character from the pause menu under `Combat › Enemies` (or via `reflexes`), dynamically scaling telegraphed blow wind-ups (`0.88x`–`1.12x`) and cooldowns (`0.84x`–`1.16x`).
* **Lore-Accurate Tamriel Geography & Full Offline Parity (`tamrielGeography.js`, `travelPaths.js`, `provinceDungeonPool.js`, `tavernMenu.js`):** Relocates 32 cities and 3 mountain spines to lore-accurate Elder Scrolls positions; adds curved-road `Follow Paths` outside the Iliac Bay, real on-map province dungeons for adventurers, province-specific tavern menus, harbours, and live paperdoll context backgrounds across all 71 regions.
* **Wager Sparring Surrender Polish (`sparSurrender.js`):** Defeated sparring duelists cleanly exit combat (clearing active DoTs, poisons, and ally targets), drop into a 2D/3D surrender kneel pose (with non-biped 3D guard), and receive a `5s` grace protection window.
* **First-Person & Straight-Ahead Accelerated Travel (`modSettings.js`, `world.js`):** Enables `FirstPersonTravel` and `FirstPersonTravelFollowsRoads` by default. Holding **`Shift + FollowPaths`** (default `Shift+K`) outdoors triggers straight-ahead accelerated travel along your exact facing yaw without needing a road or destination, staying in first-person and honoring `LocationPause` and enemy proximity checks.
* **New-Game Campaign Cinematics & VID Overlay Hiding (`videoPlayer.js`):** Starting a new campaign plays the 3 classic intro cinematics (`ANIM0000.VID`, `ANIM0011.VID`, `DAG2.VID`, skippable with any key) before initial quests fire; DOM/HUD overlays hide cleanly and host loops pause during any queued quest video playback.
* **NWN-Style Combat & Event Log (`gameLog.js`, `gameLogPane.js`, `enhancedDeath.js`):** Dedicated **`Log`** tab in the Enhanced Pause menu plus a **Combat Log** modal on the Death Screen, storing up to `400` entries and `12` grouped encounters per session with encounter summaries (hits, crits, backstabs, damage dealt/taken, shield blocks, armor mitigation, spell resolutions), expandable CRPG roll & body-part breakdowns, category/actor/miss filters, text search, and clipboard copy across all 26 languages.
* **Climates & Calories Intermediate Tiers, Drink Buffs, Sheet Penalties & Rest/Travel QoL (`difficulty.js`, `needs.js`, `restWindow.js`, `temperatureCard.js`):** Expands C&C to 6 tiers (`Off`, `Boons`, `Casual`, `Standard`, `Veteran` *(default)*, `Hard`), adds 5 tavern drink buff categories (`3h`: *Nourishing*, *Invigorating*, *Hearty Brew*, *Fine Wine*, *Firewater*), optional `No wilderness sleep without camp` gate, Inn fast-travel need/boon alignment, travel **Wild Beasts** and **Weather Hazard** storm choices (checking Camping Equipment), a live **Penalties** section in the Character Sheet & Stats Card (survival drains, stiffness, drunkenness, diseases, poisons, attribute drains, and Lich/Vampire/curse penalties) plus net survival stat summaries in HUD Boon tooltips across 26 languages, and Rest Window QoL (`2h` Short Rest on hotkey `4`, live current-time readout in both the main Rest selection menu and resting screen, and pre-filled max Loiter hours).
* **Racial Overhaul (`racialOverhaul.js`, `racialOverhaulData.js`):** Optional, live-toggleable overhaul (`On` by default under `Settings → DFF → Races & Character`) giving all 8 playable races level-scaled favored weapon bonuses, updated resistances/immunities, and lore passives with proportional `ON ↔ OFF` vital rescaling — see [Racial Overhaul](/racial-overhaul/).
* **Death Screen Load, Combat Log & Dynamic QuickLoad Keybind (`deathRespawn.js`):** Clicking **Load last save** on the enhanced death screen loads `QuickSave` or falls back to the character's latest restorable save, displaying your actual `QuickLoad` keybind dynamically alongside a **Combat Log** button to inspect the fight and killing blow.
* **High-Contrast Town Quest Building Marker (`inkMap.js`, `inkTown.js`):** Recolors town ink map quest markers to vivid vermilion-orange with a larger pulsing radius (`9px`), thicker stroke (`3.5px`), and parchment halo.
* **Save Card Effective `maxHealth`, Slot Layout & Vitals Scaling (`save.js`, `saveTile.js`):** Save, Continue, and Load cards accurately reflect full effective HP/Max HP including Apotheosis, Lichdom, Racial Overhaul, Perks, and Offline Firmament bonuses, preserve `vitalBaseMax` across saves, and render the save slot name on its own line beneath the character name so multi-word names never clip it.
* **Dynasty Model Without Permadeath (`family.js`):** Adds the `Dynasty` model to Project Legacy with `tollShare = 0` - preserving family/retire mechanics without permadeath or lost years on death.
* **Character Creation Tooltips:** Adds hover tooltips for attributes, skills, and advantages/disadvantages showing exact difficulty point costs.

---

## Items, Economy & Combat Additions

* **Combat Balance & Modular Difficulty Overhaul (`difficultyPresets.js`, `combatLethality.js`, `regionRisk.js`, `heroThreat.js`, `blowEffects.js`, `tacticalPacks.js`):** Introduces 4 Difficulty Presets (`Classic DFU`, `Balanced DFF`, `Veteran`, `Hardcore`), Combat Lethality tiers, 4-tier Regional Risk Zones across 71 regions, Early Hero Threat Scaling (Lv.5+), Hard Player Stagger & Lv.5+ tells, role-balanced Tactical Enemy Packs, revamped `BOSS_TRAITS`, and a 3-Tier Nemesis overhaul — see [Combat Balance & Difficulty](/balance/).
* **Gear, Set & Passive Stat Overcap (>100):** Equipment stat affixes, Aetheric/item sets, racial passives, and seat edicts can push effective attributes above the classic `100` cap across combat, magic, and derived calculations.
* **Portable Alchemy Kit (`mortarAndPestle.js`):** Adds **Mortar and Pestle** (`586`, `MiscItems`), stocked by General Stores and Alchemists. Using it opens the Alchemy screen anywhere with free crafting (no gold fee or guild rank gate).
* **Item Quality & Shop Quality Rolls (`modDataSync.js`, `shopStock.js`):** With the bundled `items-quality` mod, weapons and armor roll across 5 craftsmanship tiers (**Crude** to **Masterwork**), and shop stock quality is weighted by each shop's quality rating (`0–20`).
* **Dynamic Perks System (`perkRegistry.js`):** Adds a Perks button and screen to the Character stats rail, supporting both condition-checked and unlockable mod perks.
* **Dragon Mount & Shoulder Shock Cannons (`staffDragon.js`):** Unlocks the dragon mount (`give_dragon` / `dragon` console commands) and shoulder shock cannons in offline mode.

---

## Removal of Monetization & Live-Service Tails

* **Disabled Live-Service Features (`forkFlags.js`):** Permanently disables `ENABLE_ARMORY` (Aura Armory), `ENABLE_SHOP`, `ENABLE_ACCOUNT`, `ENABLE_ONLINE_PLAY`, `ENABLE_CLOUD_SAVES`, `ENABLE_SEASONAL_EVENTS`, and `ENABLE_ONLINE_SALE_CAP`.
* **Cleaned UI & Mechanics:** Removes the Event Board HUD, online relay/server UI, Trade/LFG chat toggles, peer context menus, PvP Cyrodiil zone banners, Party/Guild waypoints, `[mine]` container tags, resale anti-arbitrage caps, tavern chips (gold-only), and physical world notice boards (preserving bounty boards).
* **Isolated Dev Storage & Overcap Support:** Unpackaged dev builds use an isolated `Daggerfall Forever Dev` `userData` folder, and console commands support skill/stat overcapping above `100`.

---

## Test Room Presets & Desktop Polish

* **Ascension Test Room Presets (`testRoom.js`):**
  * **`Ascended God` (`test:god`):** Level 35 Nord Warrior, newly ascended with Portfolio of War, outdoors in Chesterwark (Daggerfall).
  * **`Ascension Challenger (Spellsword)` (`test:ascension`):** Level 35 Breton Spellsword (`3x` INT magicka, Battlemage & Warblade paths, Long Blade 200 / Destruction 150 / Alteration 140, 8pc Panoply of the Aether, Shalidor's Brand + Ruhn's Gatecleaver, 6 Legendary jewelry + **Bracelet of Free Action**, 98 unspent Firmament Stars, Fate Weight ready) outdoors at Direnni Tower (also accessible via `spellsword` / `apo_ready`).
  * **8-Race Quick Start (`test:race-<RaceKey>-<1|10>`):** Spawn any of the 8 playable races at Level `1` or `10` outdoors in Gothway Garden with starter weapons, Leather armor, Hand Wraps, Torch, empty off-hand, and starter spells for rapid Racial Overhaul testing.
* **UI, Colliders & Packaging Polish:** Enlarged desktop Pause window (`min(1340px, 94vw)` × `min(840px, calc(100dvh - 116px))`) with scroll preservation on repaints, new **Infinity App Icon** across PWA icons, Electron windows/launcher, and embedded Windows `.exe` (`app/afterPack.cjs`, `app/main.cjs`), solid mesh colliders for all tents (`41606`/`41607`) across camps and hideouts, Windows unsigned auto-update signature check disabled (`0.5.3`), and manual macOS release workflow support.
