# Daggerfall Forever (DFF) — Modder's Handbook & API Manual

Welcome to the official Modding Manual for **Daggerfall Forever (DFF)**.

DFF features a native, lightweight, and modern JavaScript/TypeScript modding system. Unlike legacy Unity-based C# assemblies (`.dfmod`), DFF mods require **no compiler**, **no heavy development environment**, and **no binary patching**. Anyone can create mods using simple JSON files and standard ES JavaScript scripts that load instantly in-game.

---

## Table of Contents
1. [Core Architecture & Philosophy](#1-core-architecture--philosophy)
2. [Mod Directory & Structure](#2-mod-directory--structure)
3. [The Mod Manifest (`manifest.json`)](#3-the-mod-manifest-manifestjson)
4. [In-Game Mod Manager & Controls](#4-in-game-mod-manager--controls)
5. [Data-Driven Mods (JSON Overrides & Merging)](#5-data-driven-mods-json-overrides--merging)
   - [Combat & Armor Overrides (`combat.json`)](#combat--armor-overrides-combatjson)
   - [Potion Recipes & Alchemy (`potions.json`)](#potion-recipes--alchemy-potionsjson)
6. [Scripted Plugins (`plugin.js`) & Sandbox API](#6-scripted-plugins-pluginjs--sandbox-api)
   - [Plugin Entrypoint](#plugin-entrypoint)
   - [Event Bus (`api.events`)](#event-bus-apievents)
   - [Player State & Healing (`api.player`)](#player-state--healing-apiplayer)
   - [World & Environment (`api.world`)](#world--environment-apiworld)
   - [UI & HUD Notifications (`api.ui`)](#ui--hud-notifications-apiui)
   - [Save Data Persistence (`api.storage`)](#save-data-persistence-apistorage)
   - [Feats & Perks System (`api.perks`)](#feats--perks-system-apiperks)
7. [Full Walkthrough Examples](#7-full-walkthrough-examples)
   - [Example A: `steel-and-sinew` (Data Overhaul)](#example-a-steel-and-sinew-data-overhaul)
   - [Example B: `desert-frost` (Environmental Hazard)](#example-b-desert-frost-environmental-hazard)
   - [Example C: `blood-tithe` (Feat & Life Leech Perk)](#example-c-blood-tithe-feat--life-leech-perk)
8. [Safe-Save Doctrine & Best Practices](#8-safe-save-doctrine--best-practices)

---

## 1. Core Architecture & Philosophy

The DFF modding framework is built on three inviolable principles:

* **Zero-Crash Sandbox**: Any runtime exception thrown inside a mod is caught and isolated by the engine. A faulty mod will never crash the game loop or interrupt other active mods.
* **Safe-Save Doctrine**: Mod state is strictly partitioned inside `snapshotPlayer.modData[modId]`. Existing vanilla saves load cleanly without modifications. If a mod is uninstalled, its data is safely discarded on the next save, leaving no orphan bloat behind.
* **Instant Hot-Rescan**: You can add, edit, or remove files in your mod folder while the game is running, then click **Rescan** in the in-game Mod Manager to reload changes immediately without restarting.

---

## 2. Mod Directory & Structure

Every mod is an independent folder containing a `manifest.json` and optional data files (`.json`) or script files (`.js`).

### Installation Paths by Operating System:
* **Windows**: `%APPDATA%\Daggerfall Forever\Mods\<mod-id>\`
  *(e.g., `C:\Users\<Username>\AppData\Roaming\Daggerfall Forever\Mods\my-awesome-mod\`)*
* **Linux**: `~/.config/Daggerfall Forever/Mods/<mod-id>/`
* **macOS**: `~/Library/Application Support/Daggerfall Forever/Mods/<mod-id>/`

### Folder Layout:
```text
my-awesome-mod/
├── manifest.json       # Required: Mod metadata and entry points
├── combat.json         # Optional: Data override for combat/materials
├── potions.json        # Optional: Data override for alchemy/potions
└── plugin.js           # Optional: Scripted gameplay logic
```

---

## 3. The Mod Manifest (`manifest.json`)

The `manifest.json` file describes your mod to the engine.

### Schema & Fields:

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | **Yes** | Unique identifier (lowercase alphanumeric and dashes, e.g. `"blood-tithe"`). |
| `name` | `string` | **Yes** | Human-readable title displayed in the Mod Manager. |
| `version` | `string` | **Yes** | Semantic version string (e.g. `"1.0.0"`). |
| `author` | `string` | No | Name or handle of the author. |
| `description` | `string` | No | Summary of features and gameplay effects. |
| `entry` | `string` | No | Path to the script entry file relative to the mod folder (e.g. `"plugin.js"`). |
| `loadPriority`| `number` | No | Default load priority (higher = loads later, overriding conflicting values). Default is `100`. |

### Example `manifest.json`:
```json
{
  "id": "apothecary-elixirs",
  "name": "Apothecary's Secret Elixirs",
  "version": "1.2.0",
  "author": "13",
  "description": "Introduces powerful alchemical recipes and boosts stamina restoration potions.",
  "entry": "plugin.js",
  "loadPriority": 150
}
```

---

## 4. In-Game Mod Manager & Controls

DFF includes a built-in Mod Manager accessible from the **Main Menu** and the **In-Game Pause Menu**:

* **Enable / Disable Toggles**: Click the status badge (`[✔ ENABLED]` / `[DISABLED]`) to enable or disable any mod on the fly.
* **Load Order Reordering**: Use the **▲ Move Up** and **▼ Move Down** buttons on mod cards. When two mods modify the same game data, the mod positioned lower in the load order (loaded later) safely overrides earlier values.
* **Rescan Button**: Re-indexes the local Mods directory, detecting newly added mods or updated manifests without restarting the game.
* **Perks Display**: If a mod registers custom perks or feats, they are displayed directly on the mod's card in the Mod Manager (`★ Perk Name: Description`).
* **Error Indicators**: If a mod contains invalid JSON or a syntax error in its plugin, an error notice is displayed directly on the card in red without breaking the rest of the game.

---

## 5. Data-Driven Mods (JSON Overrides & Merging)

Data mods require **zero JavaScript**. You simply drop JSON files matching the engine's canonical data schemas into your mod folder. DFF merges them immutably using deep property overrides and keyed list appending.

### Combat & Armor Overrides (`combat.json`)

Controls stamina/fatigue loss based on armor class and material properties (damage, armor penetration, wear rate):

```json
{
  "armorFatigueLossMultiplier": {
    "plate": 1.45,
    "chain": 1.20,
    "leather": 0.95
  },
  "materialDamageMultipliers": {
    "iron": 0.90,
    "steel": 1.05,
    "silver": 1.15,
    "elven": 1.25,
    "mithril": 1.35,
    "ebony": 1.50,
    "orcish": 1.55,
    "daedric": 1.70
  },
  "materialArmorPenetration": {
    "silver": 5,
    "elven": 8,
    "ebony": 12,
    "daedric": 18
  },
  "materialConditionLoss": {
    "iron": 1.25,
    "steel": 1.00,
    "ebony": 0.60,
    "daedric": 0.35
  }
}
```

### Potion Recipes & Alchemy (`potions.json`)

Registers new potion recipes or adjusts recipe ingredients and effect multipliers:

```json
{
  "recipes": [
    {
      "id": "highlander-draught",
      "name": "Highlander's Draught",
      "ingredients": [72, 85, 93],
      "resultItemIndex": 284,
      "effectKey": "restoreFatigue",
      "magnitude": 80,
      "goldValue": 120
    }
  ]
}
```

---

## 6. Scripted Plugins (`plugin.js`) & Sandbox API

Scripted mods allow dynamic gameplay mechanics, custom events, environmental hazards, and perk milestones.

### Plugin Entrypoint

Your script must export a default initialization function that accepts the sandbox `api` object:

```javascript
// @ts-check

/**
 * Mod entrypoint called when active mods are loaded.
 * @param {import('dff-modding-api').ModPluginApi} api
 */
export default function init(api) {
  api.ui.notify(`Mod ${api.modId} initialized!`);
}
```

---

### Event Bus (`api.events`)

Subscribe to and handle game events with complete crash isolation.

```javascript
// Listen to an event
api.events.on(eventName, handler);

// Unsubscribe
api.events.off(eventName, handler);
```

#### Supported Core Events:

| Event Name | Payload Shape | Description |
| :--- | :--- | :--- |
| `worldTick` | `{ entity, gameMinutes, lastMinutes, nowMinutes, activity, sinks }` | Fires every game time advancement step. |
| `combat:playerHit` | `{ player, target, isCivilian, mobileType, isKill, nowMinutes }` | Fires whenever the player's weapon or arrow connects with an entity. |
| `combat:enemyKill` | `{ player, target, isCivilian, mobileType, nowMinutes }` | Fires whenever an enemy is slain by the player. |
| `perk:unlocked` | `{ modId, perkId }` | Fires when any perk is successfully unlocked. |

---

### Player State & Healing (`api.player`)

Safe methods to inspect and modify the active character:

* `api.player.heal(amount: number)`: Restores health points (clamped to `maxHealth`).
* `api.player.damageHealth(amount: number)`: Damages player health through the canonical combat hurt pipeline.
* `api.player.restoreFatigue(amount: number)`: Restores fatigue/stamina (clamped to `maxFatigue`).
* `api.player.damageFatigue(amount: number)`: Depletes fatigue points safely.
* `api.player.hasEffect(effectKey: string): boolean`: Checks if the player has an active magic effect or resistance (e.g. `'resistFrost'`).
* `api.player.getEntity(): object`: Returns read-only reference to the active player entity.

---

### World & Environment (`api.world`)

Inspect the state of the surrounding game world:

* `api.world.getGameMinutes(): number`: Returns current game clock in classic Daggerfall minutes.
* `api.world.isNight(): boolean`: Returns `true` if current local hour is between 20:00 (8 PM) and 06:00 (6 AM).
* `api.world.isInterior(): boolean`: Returns `true` inside buildings, shops, or dungeons.
* `api.world.getCurrentBiome(): string`: Returns biome name (e.g. `'desert'`, `'mountain'`, `'swamp'`, `'temperate'`).

---

### UI & HUD Notifications (`api.ui`)

* `api.ui.notify(text: string)`: Displays an immediate on-screen notification using DFF's enhanced HUD parchment box.

---

### Save Data Persistence (`api.storage`)

Store arbitrary mod data that travels seamlessly inside the player's save file:

* `api.storage.get(key: string, defaultValue = null): any`: Read a saved value.
* `api.storage.set(key: string, value: any)`: Write a value into the save file.

> **Save Safety Guarantee**: All storage data lives inside `snapshotPlayer.modData[modId]`. When the user saves their game, your data is written automatically. When they uninstall your mod, your data cleanly disappears without modifying any vanilla character records.

---

### Feats & Perks System (`api.perks`)

DFF provides an integrated **Feats & Perks** engine:

* `api.perks.register({ id, name, desc })`: Registers perk metadata.
* `api.perks.has(perkId): boolean`: Checks if the active character has unlocked the perk.
* `api.perks.unlock(perkId): boolean`: Unlocks the perk, plays the celebratory **Arena Fanfare** chime, saves the perk in `modData`, and fires `perk:unlocked`.
* `api.perks.getAll(): Array<{ id, name, desc, unlocked }>`: Retrieves all registered perks and their unlock status.

---

## 7. Full Walkthrough Examples

### Example A: `steel-and-sinew` (Data Overhaul)
**Goal**: Make heavy plate armor cost more stamina while sprinting, but make Daedric weapons ignore enemy armor.

* `manifest.json`:
```json
{
  "id": "steel-and-sinew",
  "name": "Steel and Sinew",
  "version": "1.0.0",
  "author": "13",
  "description": "Increases fatigue loss in heavy plate armor while granting Daedric gear superior penetration."
}
```

* `combat.json`:
```json
{
  "armorFatigueLossMultiplier": {
    "plate": 1.65,
    "chain": 1.25,
    "leather": 0.90
  },
  "materialArmorPenetration": {
    "ebony": 12,
    "daedric": 20
  }
}
```

---

### Example B: `desert-frost` (Environmental Hazard)
**Goal**: The Alik'r Desert becomes freezing cold at night. If outdoors without frost resistance, the player loses stamina and shivers.

* `manifest.json`:
```json
{
  "id": "desert-frost",
  "name": "Desert Frost (Freezing Alik'r Nights)",
  "version": "1.0.0",
  "author": "13",
  "description": "Causes freezing nights in desert biomes that drain stamina unless resisted.",
  "entry": "plugin.js"
}
```

* `plugin.js`:
```javascript
export default function init(api) {
  let lastCheckedHour = -1;

  api.events.on('worldTick', (evt) => {
    // Only applies outdoors in desert biomes at night
    if (api.world.isInterior()) return;
    if (api.world.getCurrentBiome() !== 'desert') return;
    if (!api.world.isNight()) return;

    // Check if player has frost resistance active
    if (api.player.hasEffect('resistFrost')) return;

    const currentHour = Math.floor((api.world.getGameMinutes() / 60) % 24);
    if (currentHour !== lastCheckedHour) {
      lastCheckedHour = currentHour;
      // Drain 15 stamina points and notify
      api.player.damageFatigue(15);
      api.ui.notify('The bitter desert night chill drains your strength.');
    }
  });
}
```

---

### Example C: `blood-tithe` (Feat & Life Leech Perk)
**Goal**: Track melee kills. After 5 kills, the player achieves the "Blood-Tithe" feat, unlocking life and stamina leech on every subsequent kill.

* `manifest.json`:
```json
{
  "id": "blood-tithe",
  "name": "Blood-Tithe",
  "version": "1.0.0",
  "author": "13",
  "description": "Martial Feat: Slaying 5 foes in combat unlocks the Blood-Tithe perk (+15 HP, +30 SP on kills).",
  "enabled": true,
  "entry": "plugin.js"
}
```

* `plugin.js`:
```javascript
function init(api) {
  // 1. Register perk metadata
  api.perks.register({
    id: 'blood-tithe',
    name: 'Blood-Tithe',
    desc: 'Finishing blows restore 15 Health and 30 Fatigue by siphoning enemy life force.'
  });

  // 2. React to enemy kills
  api.events.on('combat:enemyKill', (event) => {
    // If the feat is already unlocked:
    if (api.perks.has('blood-tithe')) {
      api.player.heal(15);
      api.player.restoreFatigue(30);
      api.ui.notify('The fallen foe\'s blood restores your vigor! (+15 HP, +30 SP)');
      return;
    }

    // Otherwise, increment feat progress in save storage:
    const kills = (api.storage.get('slainCount', 0)) + 1;
    api.storage.set('slainCount', kills);

    if (kills >= 5) {
      api.perks.unlock('blood-tithe');
      api.ui.notify('FEAT ACHIEVED: Perk "Blood-Tithe" unlocked!');
    } else {
      api.ui.notify(`Taste of blood: ${kills}/5 kills toward Feat.`);
    }
  });
}
```

---

## 8. Safe-Save Doctrine & Best Practices

1. **Never use global variables for state**: Always store mutable player or mod state via `api.storage.set(key, value)`. This guarantees your mod works across multiple character slots and survives game reloads.
2. **Keep event listeners lightweight**: The `worldTick` event runs frequently during travel and rest. Avoid expensive computations or tight loops inside tick callbacks.
3. **Gracefully handle missing stats**: Always use default fallbacks when reading state, e.g. `api.storage.get('myKey', 0)`.
4. **Localization friendly**: Where possible, provide clear descriptive strings so players across all 26 supported languages in DFF understand your mod's notifications.

Happy Modding in Tamriel!
