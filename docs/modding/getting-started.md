# How to Start Modding

Creating a native DFF mod requires only a text editor. In the packaged desktop app, mods live in `<userData>/Mods/<modId>/` (and the **11 bundled examples** are seeded there automatically on launch without overwriting existing folders); in source checkouts, they reside under `mods/` (for example, `mods/my-first-mod/`).

---

## 1. Folder Structure

A minimal mod contains a `manifest.json` and any combination of JSON data files, a `locales.json` translation dictionary, and a `plugin.js` script:

```text
mods/
└── my-first-mod/
    ├── manifest.json
    ├── locales.json     # optional 26-language dictionary
    ├── items.json       # optional custom item templates (index >= 9000)
    ├── combat.json      # optional combat multiplier overrides
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
  "locales": "locales.json",
  "data": {
    "combat": "combat.json",
    "items": "items.json"
  },
  "settings": [
    {
      "key": "bonusPct",
      "type": "number",
      "label": "Bonus %",
      "labelKey": "mfm.cfg.bonusPct",
      "min": 5,
      "max": 50,
      "step": 5,
      "default": 15
    },
    {
      "key": "showChip",
      "type": "boolean",
      "label": "Show HUD Status Chip",
      "default": true
    }
  ],
  "entry": "plugin.js"
}
```

| Field | Required | Description |
| :--- | :---: | :--- |
| `id` | Yes | Unique lowercase identifier (used for load order, `modData[id]` save storage, and settings keys). |
| `name` | Yes | Display name in the in-game Mod Manager. |
| `version` | No | Semantic version string (e.g. `"1.0.0"`). |
| `author` | No | Author name or handle. |
| `description` | No | Summary displayed in the Mod Manager. |
| `enabled` | No | Default enabled state (`true` or `false`). |
| `locales` | No | Relative path to an autonomous `locales.json` mapping language codes (`en`, `ru`, `de`, `ja`, etc.) to `{ key: text }`. |
| `data` | No | Map of data categories (`combat`, `potions`, `materials`, `quality`, `items`, `spells`, `legendaries`) to relative JSON paths. |
| `settings` | No | Array of Mini-MCM setting schemas (`boolean`, `number`, `select`) rendered under **⚙ Settings** in the Mod Manager. |
| `entry` | No | Relative path to the JS plugin entrypoint (e.g. `"plugin.js"`). |

### Data Categories (`manifest.json → data`)
* `combat` — `{ heavyArmorFatigueMultiplier, mediumArmorFatigueMultiplier, lightArmorFatigueMultiplier }`
* `potions` — Array of alchemy recipe definitions.
* `materials` — Material weapon/armor scaling overrides (`Iron`..`Daedric`).
* `quality` — Craftsmanship tiers (`crude`..`masterwork`).
* `items` — Array of custom item templates. **Custom `index` must be an integer `>= 9000`** (indices `< 9000` are reserved for vanilla and built-in DFF items and will be skipped). Supports `nameKey` and `loreKey`.
* `spells` — Array of `SpellRecords.json`-compatible spell definitions merged into `SPELLS.STD`. Supports `nameKey`.
* `legendaries` — Array of legendary item records (`id`, `name`, `group`, `templates`, `affixes`, `enchantment?`, `power?`, `lore?`). Supports `nameKey`, `loreKey`, and `power.nameKey`/`briefKey`/`textKey`.

### Mini-MCM Settings Schema (`manifest.json → settings`)
Each entry in `settings` supports:
* `key` (string, required), `type` (`"boolean" | "number" | "select"`), `default`
* `label` / `labelKey`, `description` / `descriptionKey`
* For `number`: `min`, `max`, `step` (values are clamped and snapped automatically)
* For `select`: `options: [{ value, label, labelKey? }]`

---

## 3. Managing, Debugging & Testing In-Game

1. Launch Daggerfall Forever and open the **Mods** pane in the Pause / Main Menu.
2. Enable or disable mods, adjust **load order** (later mods override earlier JSON keys), and click **⚙ Settings** on any mod that declares `settings`.
3. **Runtime Error Diagnostics:** If `plugin.js` throws during load or execution, the error is isolated (the game continues running) and displayed as a red `Script error: ...` banner directly on that mod's card.
4. **Hot-Rescan:** Edit JSON or `plugin.js` on disk and click **Rescan** to reload immediately without restarting.

---

## 4. Scripted Plugin Entrypoint (`plugin.js`)

A scripted mod defines `init(api)` (`export default function init(api)`, `export default async function init(api)`, `export function init(api)`, or `function init(api)`). Named `export const` / `export function` helpers are also supported.

Optionally, `init(api)` can **return a `cleanup()` function** (or call `api.onCleanup(fn)`) to tear down custom listeners/timers when the mod is disabled or rescanned:

```javascript
export default function init(api) {
  api.events.on('combat:enemyKill', () => {
    api.player.restoreFatigue(10);
    api.ui.notify('Victory restores your stamina!');
  });

  return function cleanup() {
    // Optional custom teardown on disable/rescan
  };
}
```

---

## 5. Sandbox API v2 Reference (`api`)

### `api.events`
* `api.events.on(eventName, handler)` — Subscribe to engine events. Returns an unsubscribe function.
* `api.events.off(eventName, handler)` — Unsubscribe a handler.
* **Available events:**
  * Tick & time: `worldTick`, `secondTick`, `magicRound`
  * Combat: `combatAttackResolved`, `combat:enemyKill`, `weaponWallClank`, `playerCast`, `spellLanded`, `playerKill`, `playerStruck`
  * Inventory & movement: `itemTaken`, `player:crouchChanged`, `player:sneakChanged`, `player:interactionModeChanged`
  * Perks: `perk:unlocked`

### `api.modifiers`
All registered modifiers are tracked per mod and **automatically removed** when the mod is disabled or unloaded:
* `api.modifiers.entityFold(name, fn)` — Fold stats/attributes onto an entity.
* `api.modifiers.weaponBlow(name, fn)` / `api.modifiers.blowTaken(name, fn)` — Adjust outgoing/incoming melee damage.
* `api.modifiers.swingPace(name, fn)` — Weapon swing speed multiplier (e.g. `1.15`).
* `api.modifiers.spellCost(name, fn)` / `api.modifiers.spellFreeCast(name, fn)` — Adjust spell magicka cost or grant free casts.
* `api.modifiers.spellPower(name, fn)` / `api.modifiers.spellPierce(name, fn)` / `api.modifiers.castSpeed(name, fn)` — Boost spell damage/magnitude, resistance pierce, and cast speed.
* `api.modifiers.absorption(name, fn)` — Spell absorption chance bonus.
* `api.modifiers.enemyLoot(name, fn)` / `api.modifiers.tabledLoot(name, fn)` / `api.modifiers.containerLoot(name, fn)` — Inject extra loot drops.
* `api.modifiers.preventRest(name, fn, message)` — Conditionally block resting with a custom message.

### `api.player`
* `api.player.getEntity()` — Active player entity reference.
* `api.player.getVitals()` — `{ health, maxHealth, fatigue, maxFatigue, rawFatigue, rawMaxFatigue, magicka, maxMagicka }`.
* `api.player.heal(amount)` / `api.player.damageHealth(amount)`
* `api.player.restoreFatigue(amount)` / `api.player.damageFatigue(amount)` (auto-scaled to engine fatigue multiplier and clamped to cap)
* `api.player.restoreMagicka(amount)` / `api.player.damageMagicka(amount)`
* `api.player.hasEffect(effectKey)` — Check active effects/resistances (e.g. `'resistFrost'`).
* `api.player.getStat(statName)` / `api.player.getSkill(skillId)` / `api.player.getEquipped()`
* `api.player.getGold()` / `api.player.addGold(amount)` / `api.player.giveItem(item)`
* `api.player.getInteractionMode()` / `api.player.setInteractionMode(mode, { notify? })` (`'steal'`, `'grab'`, `'info'`, `'talk'`)
* `api.player.isCrouching()` / `api.player.isSneaking()` / `api.player.isRunning()` / `api.player.getMovementState()`

### `api.world`
* `api.world.getGameMinutes()` / `api.world.isNight()` / `api.world.isInterior()`
* `api.world.getCurrentBiome()` / `api.world.getWeather()` / `api.world.isRaining()` / `api.world.isSnowing()` / `api.world.getSeason()`

### `api.ui`
* `api.ui.notify(text)` — Standard HUD popup message.
* `api.ui.showMidScreen(message, durationSeconds = 1.5)` — Prominent mid-screen banner.
* `api.ui.t(key, fallbackEn, vars)` — Translate a key across the 26-language text core (reads your mod's `locales.json` first).
* `api.ui.setStatusChip(chipId, { name, kind?, glyph?, foot?, blink?, meta?, lines?, tipFoot? })` — Render a live HUD status chip with hover tooltip. `kind`: `'buff' | 'debuff' | 'set' | 'warn' | 'danger'`.
* `api.ui.clearStatusChip(chipId)` — Remove a HUD status chip (also auto-cleared on mod unload).

### `api.audio`
* `api.audio.play(clipName, volume = 0.7)` — Play a built-in `SOUND` clip safely.

### `api.console`
* `api.console.register(name, description, usage, fn)` — Register a console command (auto-unregistered on mod unload).

### `api.settings`
* `api.settings.get(key)` / `api.settings.set(key, value)` / `api.settings.getAll()`
* `api.settings.onChange(keyOrFn, maybeFn)` — Subscribe to live Mini-MCM changes (`onChange(fn)` or `onChange('myKey', fn)`).

### `api.items` & `api.spells`
* `api.items.onUse(templateIndex, fn)` — Register a custom **Use** handler (`fn(item, collection, ctx)` where `ctx.consume()` decrements/removes the used item).
* `api.items.give(templateIndex, { count?, group? })` — Mint and give a template-backed item to the player.
* `api.items.giveLegendary(legendaryId, { templateIndex?, group?, material? })` — Mint and give a legendary item to the player.
* `api.spells.get(spellIndex)` / `api.spells.has(spellIndex)` / `api.spells.grant(spellIndexOrObj)`

### `api.files`
* `api.files.read(relPath)` — Read a UTF-8 file strictly inside this mod's folder (`..` and absolute paths are blocked).
* `api.files.readJson(relPath)` — Read and parse a JSON file strictly inside this mod's folder.

### `api.perks` & `api.storage` & `api.onCleanup`
* `api.perks.register({ id, name, desc, icon?, check? })` / `has(id)` / `unlock(id)` / `getAll()`
* `api.storage.get(key, defaultValue = null)` / `set(key, value)` — Isolated per-save persistence under `modData[modId]`.
* `api.onCleanup(fn)` — Register a custom teardown callback invoked on disable/unload/Rescan.
