# Global Non-LT Changes

Beyond **Apotheosis**, **Living Tamriel**, and **Necromancy**, **Daggerfall Forever** introduces broad single-player, quality-of-life, and mechanical changes across the entire game compared to upstream DFO and vanilla Daggerfall Unity (DFU).

---

## Online Systems Brought Offline

* **Offline Player Housing & Shipyards (`offlineHomes.js`, `banking.js`):** Buy and sell DFO-style houses directly at the front door across all towns and hamlets, complete with chest storage, decor/yard placement, exterior look painting, NPC suppression, and heir inheritance - all without touching classic DFU bank housing when enabled. Also supports offline ship ownership and RCF reputation price/refusal integration.
* **Offline Firmament & Renown (`offlineFirmament.js`):** Use the Firmament star constellation passive tree and Renown progression offline, saved in `modData.firmament`. Applies a `1.5x` proportional offline XP boost (`OFFLINE_RENOWN_BOOST`) to kills and quests to compensate for missing online group/raid bonuses, with full respec for `500` gold.
* **Offline Professions & Gathering (`offlineProfessions.js`):** Enables mining, herbalism, logging, hunting, fishing, and crafting professions in single-player with local save persistence (`modData.professions`).
* **Unified Empire Bank (`banking.js`):** Unifies bank accounts across all 71 regions into a single global Empire account, toggleable and synchronized mid-game.
* **24/7 City Infrastructure (`buildingLocks.js`, `cityGate.js`):** Optional toggle that keeps city gates, shops, guild halls, banks, and libraries open 24/7.
* **Offline Online-Style Respawn (`deathRespawn.js`):** Optional toggle that replaces classic permadeath/reload with safe-spot waking (nearest temple, city, graveyard, or dungeon door) at `50%` HP, losing `10%` of carried gold and advancing `4–24` in-game hours.

---

## Visuals, Travel & Character Systems

* **Granular Morrowind Visual Toggles (`features.js`):** Splits DFO's unified Morrowind rendering into independent controls for **Morrowind Player Body**, **Inventory Player Figure** (`Follow`, `Always 3D`, `Always Paperdoll`), **Morrowind Item Icons**, **Morrowind Foes** (`Off`, `Near`, `All`), and **Morrowind NPCs**, plus restored 1st-person weapon sprite rendering.
* **Third-Person Static Paperdoll Mode (`skinCard.js`, `modSettings.js`):** Adds a `Paperdoll` option (`Graphics.Paperdoll`) to the Profile / Look selector alongside `Skins` and `Layered Gearing (WIP)`. Draws the player on foot in 3rd person using their cropped 2D character-sheet paperdoll (live gear, racial override heads, cape toggle, weapon glow, mounted skin on horseback) and automatically disables `mwPlayerBody`.
* **2D Inventory Paperdoll Cape Sync (`paperDoll.js`):** Syncs the cape visibility toggle directly to the 2D inventory paperdoll.
* **Post-Chargen Reflexes (`enhancedMenu.js`):** Allows changing the **Reflexes** setting (`Very High` to `Very Low`) on an active character from the pause menu under `Combat › Enemies`.
* **First-Person & Straight-Ahead Accelerated Travel (`modSettings.js`, `world.js`):** Enables `FirstPersonTravel` and `FirstPersonTravelFollowsRoads` by default. Holding **`Shift + FollowPaths`** (default `Shift+K`) outdoors triggers straight-ahead accelerated travel along your exact facing yaw without needing a road or destination, staying in first-person and honoring `LocationPause` and enemy proximity checks.
* **New-Game Campaign Cinematics & VID Overlay Hiding (`videoPlayer.js`):** Starting a new campaign plays the 3 classic intro cinematics (`ANIM0000.VID`, `ANIM0011.VID`, `DAG2.VID`, skippable with any key) before initial quests fire; DOM/HUD overlays hide cleanly and host loops pause during any queued quest video playback.
* **Death Screen Load & Dynamic QuickLoad Keybind (`deathRespawn.js`):** Clicking **Load last save** on the enhanced death screen loads `QuickSave` or falls back to the character's latest restorable save, displaying your actual `QuickLoad` keybind dynamically.
* **High-Contrast Town Quest Building Marker (`inkMap.js`, `inkTown.js`):** Recolors town ink map quest markers to vivid vermilion-orange with a larger pulsing radius (`9px`), thicker stroke (`3.5px`), and parchment halo.
* **Save Card Effective `maxHealth` & Vitals Scaling (`save.js`):** Save, Continue, and Load cards accurately reflect full effective HP/Max HP including Apotheosis, Lichdom, Perks, and Offline Firmament bonuses, while preserving `vitalBaseMax` across saves.
* **Dynasty Model Without Permadeath (`family.js`):** Adds the `Dynasty` model to Project Legacy with `tollShare = 0` - preserving family/retire mechanics without permadeath or lost years on death.
* **Character Creation Tooltips:** Adds hover tooltips for attributes, skills, and advantages/disadvantages showing exact difficulty point costs.

---

## Items, Economy & Combat Additions

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
* **UI, Colliders & Packaging Polish:** Enlarged desktop Pause window (`min(1340px, 94vw)` × `min(840px, calc(100dvh - 116px))`) with scroll preservation on repaints, solid mesh colliders for all tents (`41606`/`41607`) across camps and hideouts, Windows unsigned auto-update signature check disabled (`0.5.3`), and manual macOS release workflow support.
