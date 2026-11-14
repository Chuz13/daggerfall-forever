# Console Commands Reference

This is the complete reference for all console commands currently implemented in **Daggerfall Forever**.

## Global Syntax Rules

* **Case-Insensitive:** Command names and most keywords are matched case-insensitively.
* **Leading `/`:** A leading `/` is automatically stripped if no `/`-prefixed command matches (e.g. `/tgm` works like `tgm`; `/tp` is also explicitly registered).
* **Command Chaining:** Use `;` to run multiple commands in one line (e.g. `tgm; heal; addgold 5000`).
* **Setting Gate:** Console execution requires **Enhancements → Game Console** (`Enhancements/LypyL_GameConsole`) to be enabled.

---

## Partial Name Matching Quick Guide

| Command | Matching Behavior |
| :--- | :--- |
| `additem`, `rcf give_stolen` | **Substring match** (case-insensitive, ignores spaces/`_`/`-`) across item templates `0..287` and custom templates. |
| `set_attr`, `mod_attr`, `set` | **Prefix match** on attribute names (e.g. `str`, `int`, `wil`, `agi`, `end`, `per`, `spe`, `luc`). |
| `set_skill`, `mod_skill`, `set` | **Prefix match** (normalized, ignores spaces/`_`/`-`) on skill names. |
| `prof set`, `prof addxp` | Exact `id` or **prefix match** on profession name. |
| `rcf set_sgroup` | Numeric `0..10` or **3-character prefix** (`com`, `mer`, `sch`, `nob`, `und`, `sup`). |
| `living adv setlevel`, `living adv summon` | Numeric ID / array index, or case-insensitive **substring match** on adventurer name. |
| `finish_errand` | Exact `id` or case-insensitive **substring match** on revenant name. |
| `spawnfoe` | **Exact match only** (numeric ID, exact normalized `MOBILE_TYPES` name, or short aliases `skeleton`, `bear`, `bat`, `tiger`, `scorpion`, `guard`). |

---

## 1. Core, Character & World Commands

| Command | Aliases | Syntax & Arguments | Behavior |
| :--- | :--- | :--- | :--- |
| `HELP` | — | `HELP [command]` | Lists all commands alphabetically, or prints usage for a specific command. |
| `tgm` | — | `tgm` | Toggles God Mode; restores Health to max when enabled. |
| `killall` | — | `killall` | Kills all hostile entities in the active scene. |
| `kill` | `suicide`, `killme` | `kill` | Disables God Mode and forces player death. |
| `heal` | `player_heal` | `heal` | Restores Health, Fatigue, and Magicka to max. |
| `set_fatigue` | `setfatigue`, `fatigue` | `set_fatigue <amount\|percent%>` | Sets fatigue (`<n>%`, display points `<= STR+END`, or raw points). |
| `addgold` | — | `addgold <count>` | Adds `<count>` gold pieces. |
| `teleport` | — | `teleport <x> <y> <z>` | Teleports to world coordinates `(x, y, z)`. |
| `tele2loc` | — | `tele2loc <locationName>` | Teleports to named location in world mode. |
| `tp` | `/tp` | `tp <x> <y>` \| `tp <locationName>` | Teleports to map pixel `(x, y)` or named location. |
| `spawnfoe` | `spawn` | `spawnfoe <id\|name> [count]` | Spawns `1..20` (default `1`) foes near player. Exact ID/name or short alias (`skeleton`, `bear`, `bat`, `tiger`, `scorpion`, `guard`). |
| `spawnlist` | — | `spawnlist` | Lists all monster (`0..42`) and class (`128..146`) IDs and names. |
| `encounter` | — | `encounter [random\|wild\|camp\|merchant\|adv\|bandit\|plea\|naval]` | Triggers a wilderness encounter in exterior world mode. |
| `tcl` | `noclip` | `tcl` | Toggles collision (`noclip` + `fly`). |
| `set_time` | `time` | `time <h> [m]` \| `time set <h> [m]` \| `time add <n>[m\|h\|d]` | Sets time of day or advances time (`<100` unitless = hours, `>=100` = minutes). |
| `date` | `calendar`, `get_time` | `date` | Prints Tamriel calendar date, time, year (`3E...`), and season. |
| `advance_time` | `advancetime`, `pass_time`, `passtime` | `advance_time <hours>` | Advances world clock by `<hours>`. |
| `advance_days` | `advancedays`, `pass_days` | `advance_days <days>` | Advances world clock by `<days>`. |
| `set_weather` | `weather` | `set_weather <0..6\|type>` | Sets weather (`sunny`/`clear`, `cloudy`, `overcast`, `fog`, `rain`, `thunder`/`storm`, `snow`). |
| `additem` | `item` | `additem <id\|name> [count] [material]` | Adds item(s); material can also come first (`additem daedric claymore`) or combined (`daedric_claymore`). Supports substring matching + special aliases (`grimoire`, `elixir_unlife`, `lich_ingredients`, `skinning_knife`, `dragon`). |
| `set_attr` | `set_stat`, `setstat`, `setattr`, `stat` | `set_attr <attrPrefix> <value>` | Sets an attribute (prefix match). |
| `mod_attr` | `mod_stat` | `mod_attr <attrPrefix> <delta>` | Modifies an attribute by `<delta>` (prefix match). |
| `set_skill` | `setskill`, `skill` | `set_skill <skillPrefix> <0..200>` | Sets skill (`> 100` enables mastery overcap; prefix match). |
| `mod_skill` | — | `mod_skill <skillPrefix> <delta>` | Modifies skill, clamped `0..200` (prefix match). |
| `set_level` | `setlevel`, `level` | `set_level <level>` | Sets player level (`>= 1`). |
| `set_max_magicka` | `max_magicka`, `setmaxmagicka`, `maxmagicka`, `set_mana`, `set_max_mana`, `max_mana` | `set_max_magicka <value\|reset>` | Overrides max magicka or resets (`reset`/`auto`/`default`). |
| `set` | — | `set <skill\|stat\|attr\|level\|maxmagicka> <name> [val]` | Unified setter; without keyword, tries skill prefix first, then attribute prefix. |
| `addspell` | — | `addspell <spellKey\|all_necro>` | Adds necromancy spell (`animate_dead`, `corpse_explosion`, `life_tap`, `bone_armor`, `suture_cadaver`, `finger_of_death`, `arch_lichdom`, `paralyzing_touch`, `dark_flight`, `control_undead`, `disguise`, or `all_necro`/`all`/`necro`). |
| `perk` | `perks` | `perk <list \| unlock <id\|all> \| reset>` | Lists, unlocks, or resets dynamic perks. |
| `open_perks` | — | `open_perks` | Prints hint to open Esc → Growth. |
| `tdt` | — | `tdt` | Toggles Debug Text HUD (position, time, weather). |

---

## 2. DFF Systems, Living Tamriel & RCF Commands

| Command | Aliases | Syntax & Arguments | Behavior |
| :--- | :--- | :--- | :--- |
| `firmament` | `firm` | `firmament <status \| addstars <n> \| addpoints <n> \| addxp <n> \| reset>` | Inspects or modifies Offline Firmament progression. |
| `housing` | `house` | `housing <list \| buy [key] [mapId] [reg] \| inherit <mapId> <key> [reg] \| tp [key] \| clear>` | Manages offline player houses. |
| `prof` | `profession` | `prof <list \| set <name> <1..100> \| addxp <name> <amount>>` | Manages offline professions (prefix match on name). |
| `addmats` | — | `addmats [ore\|ingot\|herb\|leather\|wood\|all\|key] [count]` | Adds crafting materials (default `all`, `5`) and ensures a Materials Bag. |
| `bank` | — | `bank <status \| deposit <n> \| withdraw <n> \| clearloans \| setloan <n>>` | Manages Unified Bank balance and loans. |
| `city247` | — | `city247 [on\|off\|toggle]` | Toggles 24/7 city infrastructure. |
| `bounty` | — | `bounty <get [reg] \| set <gold> [reg] \| clear [reg]>` | Gets, sets, or clears regional bounty. |
| `legalrep` | — | `legalrep <get [reg] \| set <-100..100> [reg] \| clear [reg]>` | Gets, sets, or clears regional legal reputation. |
| `dynasty` | — | `dynasty <status \| addchild \| retire \| addrenown <n> \| setmodel <dynasty\|enduring\|bloodline>>` | Inspects or modifies Project Legacy / Dynasty state. |
| `crisis` | — | `crisis <start <type\|FlagName> [reg] \| stop [type\|FlagName] [reg] \| status [reg] \| tp [type] \| tick>` | Starts/stops macro crises (`war`, `plague`, `famine`, `civil_strife`, `strife`) or vanilla `REGION_FLAGS`, teleports, or ticks 38 days. |
| `telecrisis` | — | `telecrisis [type]` | Teleports to a settlement with an active crisis (`war`, `plague`, `famine`, `crime`, `witch`, `ruler`, `holiday`). |
| `living` | — | See subcommands below | In World Mode, `living` exposes the full `executeLivingConsoleCommand` suite. |
| `rcf` | — | `rcf <status \| tier <0..3\|off\|light\|mid\|high> \| set_sgroup <0..10\|prefix> <n> \| set_faction <id\|alias> <n> \| give_stolen [item] \| test_rumor \| test_contraband>` | Inspects and tests Reputation Consequences Framework (`db`, `thieves`/`tg`, `knights`/`ko`, `mages`/`mg`, `temple`, `arkay`, `julianos`, `kynareth`, `mara`, `stendarr`, `dibella`, `zenithar`, `akatosh`). |
| `dumplog` / `dumpcombat` / `dumpspawns` / `dumpall` | — | `dumpall [reason]` | Dumps diagnostic telemetry logs to disk. |

### `living` Subcommands (World Mode)
* `living status` — Prints current LT region state, tension, and subsystem status.
* `living scale [low|1|mid|2|high|3|4]` (alias `density`) — Sets encounter scale.
* `living loot [full|supplies|gold|zero|none]` — Sets urban/world loot policy.
* `living traits [dungeon|dungeons] [off|0|light|1|mid|2|high|3]` (alias `mobtraits`) — Sets wilderness or dungeon mob traits tier.
* `living crisis <TYPE> [PHASE]` — Forces a crisis type/phase.
* `living [site] spawn <KIND>` — Spawns a specific LT encounter (`plea`, `checkpoint`, `camp`/`bandit`, `rest`/`merchant`/`caravan`, `quarantine`, `skirmish`, `nemesis`, `meeting`, `adventurer`/`adv`, `naval`).
* `living encounter [kind]` — Triggers an LT wilderness encounter.
* `living quest` — Accepts or completes the regional crisis contract.
* `living formulas` / `living roll [Skill] [DC] [Formula]` (aliases `formula`, `check`) — Lists or tests LT roll formulas.
* `living adv list [region]` | `living adv tick <1..365>` | `living adv kill_in_dungeon [region]`
* `living adv setlevel <name|id|index> <1..45>` *(supports substring match)*
* `living adv summon [nearest|random|<name|id|index>]` *(supports substring match)*

---

## 3. Necromancy Commands

* **`necro`** subcommands:
  * `necro status` | `necro menu` | `necro cmd <order>`
  * `necro disguise [on|off|toggle|<rounds>]`
  * `necro control [type] [rounds]` | `necro lose_control` (`release_control`, `release_controlled`)
  * `necro lich [on|off|toggle]` | `necro ancient_lich [on|off|toggle]` (`ancientlich`)
  * `necro taint [get | add <n> | set <n>]`
  * `necro spawn <skeleton|zombie|ghost|mummy|cadaver|flesh_colossus|lich|ancient_lich>` (or `necro <type>`)
  * `necro spawn corpse [mobType] [1..20]` (or `necro corpse [mobType|count] [count]`)
  * `necro minions [list | follow | guard | attack | feign_death | recall | clear | dismiss | raise [type]]`
  * `necro harvest` | `necro detonate` | `necro elixir` | `necro ambush`
  * `necro test [kit|lich|archlich|arch_lich|harvest|synergy|cadaver]`
* **Standalone Necromancy Aliases:**
  * `necro_lich` / `lich [on|off]`, `necro_ancient_lich` / `ancient_lich` / `ancientlich [on|off]`
  * `necro_spawn <type>`, `necro_corpse [mob] [count]`, `necro_menu`
  * `necro_lose_control` / `lose_control` / `release_control`, `necro_disguise [on|off|rounds]`
  * `necro_spells` / `necrospells`
  * `give_dagger` (`givedagger`), `give_knife` (`giveknife`), `give_grimoire` (`givegrimoire`), `give_elixir` (`giveelixir`), `give_elixir_reagents` (`give_reagents`, `givereagents`)

---

## 4. Dragon Mount & Revenant Companion Commands

* **`give_dragon`** (`givedragon`, `dragon_mount`): `give_dragon [brass|blue|aether]` — Grants Dragon mount (`blue`/`aether`/`aetherbright` for Aetherbright look, else Brass).
* **`dragon`** (`dragon_ride`): `dragon [on|off|blue|brass]` — Mounts, dismounts, or switches Dragon look while riding.
* **`add_revenant`** (`addrevenant`, `cheat_companion`, `revenant_add`): `add_revenant [type|rank] [rank 1..5]` — Adds a sworn revenant to your retinue.
* **`list_revenants`** (`revenants`, `retinue`): Lists active retinue members.
* **`finish_errand`** (`finisherrand`, `complete_errands`): `finish_errand [id|name]` — Completes all active errands, or a specific one (supports substring match on name).

---

## 5. Map & Mod-Specific Commands

* **Dungeon / Interior Automap:** `map_revealall`, `map_hideall`, `map_teleportmode` (Ctrl+Shift+LMB teleport).
* **Exterior Automap:** `map_revealbuildings`, `map_hidebuildings`.
* **Travel Map:** `map_reveallocations`, `map_hidelocations`, `map_reveallocation [regionName] [locationName]` (`_` converts to spaces).
* **Dynamic Snow** *(requires Enhanced + Dynamic Snow enabled)*: `snow_status`.
* **Windfall** *(requires Enhanced + Windfall enabled)*: `windfall <auto|normal|windy|storm|gust|bright|ruffle|leaves|status>`.
* **Foraging** *(requires Foraging enabled, offline only)*: `Foraging_Tools 0/1 n`.
* **Come Sail Away** *(requires CSA runtime active)*: `giveboat [hull] [variant]`, `placeboat [hull] [variant]`, `printboats`, `identifyboat`, `purgeboat [index]`.
