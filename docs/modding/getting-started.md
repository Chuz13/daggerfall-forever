# How to Start Modding

Creating a native DFF mod requires only a text editor. Every mod lives in its own subfolder inside the game's `mods/` directory (for example, `mods/my-first-mod/`).

---

## 1. Folder Structure

A minimal mod contains a `manifest.json` and either one or more JSON data files, a `plugin.js` script, or both:

```text
mods/
└── my-first-mod/
    ├── manifest.json
    ├── combat.json      # optional data override
    └── plugin.js        # optional scripted plugin
```

---

## 2. The Mod Manifest (`manifest.json`)

Every mod must declare a `manifest.json` at its root:

```json
{
  "id": "my-first-mod",
  "name": "My First Mod",
  "version": "1.0.0",
  "author": "YourName",
  "description": "Short summary shown in the Mod Manager.",
  "enabled": true,
  "data": {
    "combat": "combat.json"
  },
  "entry": "plugin.js"
}
```

| Field | Required | Description |
| :--- | :---: | :--- |
| `id` | Yes | Unique lowercase identifier (used for load order and `modData[id]` save storage). |
| `name` | Yes | Display name in the in-game Mod Manager. |
| `version` | No | Semantic version string (e.g. `"1.0.0"`). |
| `author` | No | Author name or handle. |
| `description` | No | Summary displayed in the Mod Manager. |
| `enabled` | No | Default enabled state (`true` or `false`). |
| `data` | No | Map of data categories (`combat`, `potions`, `materials`, `quality`) to relative JSON paths. |
| `entry` | No | Relative path to the JS plugin entrypoint (e.g. `"plugin.js"`). |

---

## 3. Managing & Testing In-Game

1. Launch Daggerfall Forever and open the **Mod Manager** pane in the Enhanced settings menu.
2. Enable or disable mods and adjust their **load order** (later mods override earlier JSON keys via deep merge).
3. While iterating on a mod, edit your JSON or `plugin.js` file on disk and click **Rescan** in the Mod Manager to reload immediately without restarting the game.

---

## 4. Scripted Plugin Entrypoint (`plugin.js`)

A scripted mod exports an `init(api)` function (either `export default function init(api)`, `export function init(api)`, or `function init(api)`):

```javascript
export default function init(api) {
  api.events.on('combat:enemyKill', () => {
    api.player.restoreFatigue(10);
    api.ui.notify('Victory restores your stamina!');
  });
}
```

---

## 5. Sandbox API Reference (`api`)

### `api.events`
* `api.events.on(eventName, handler)` — Subscribe to engine events (e.g. `worldTick`, `combatAttackResolved`, `combat:enemyKill`, `weaponWallClank`, `perk:unlocked`).
* `api.events.off(eventName, handler)` — Unsubscribe a handler.

### `api.player`
* `api.player.getEntity()` — Returns the active player entity reference.
* `api.player.heal(amount)` / `api.player.damageHealth(amount)` — Restore or damage player HP.
* `api.player.restoreFatigue(amount)` / `api.player.damageFatigue(amount)` — Restore or drain fatigue (automatically scaled to the engine's fatigue multiplier).
* `api.player.restoreMagicka(amount)` / `api.player.damageMagicka(amount)` — Restore or drain magicka.
* `api.player.hasEffect(effectKey)` — Check if an active effect or resistance is present (e.g. `'resistFrost'`).

### `api.world`
* `api.world.getGameMinutes()` — Current world clock in in-game minutes.
* `api.world.isNight()` — `true` between `20:00` and `05:59`.
* `api.world.isInterior()` — `true` when inside a building or dungeon.
* `api.world.getCurrentBiome()` — Returns the current biome string (e.g. `'temperate'`, `'desert'`, `'mountain'`).

### `api.ui`
* `api.ui.notify(text)` — Shows a standard HUD notification.
* `api.ui.showMidScreen(message, durationSeconds = 1.5)` — Shows a prominent mid-screen banner.
* `api.ui.t(key, fallbackEn, vars)` — Translates a localization key across the engine's 26-language text core.

### `api.perks`
* `api.perks.register({ id, name, desc, icon?, check? })` — Registers a dynamic perk. If `check(entity)` is provided, the perk is evaluated dynamically against player stats/skills; otherwise it can be unlocked manually.
* `api.perks.has(perkId)` — Checks if the player has unlocked the perk.
* `api.perks.unlock(perkId)` — Unlocks the perk, plays the level-up fanfare, and emits `perk:unlocked`.
* `api.perks.getAll()` — Lists all perks registered by this mod with their unlock state.

### `api.storage`
* `api.storage.get(key, defaultValue = null)` — Reads a persistent value from `modData[modId]`.
* `api.storage.set(key, value)` — Writes a persistent value to `modData[modId]`, automatically saved and restored with the player's save file.
