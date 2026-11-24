# Console Commands Reference

This is the complete reference for all console commands currently implemented in **Daggerfall Forever**.

## Global Syntax Rules

* **Case-Insensitive:** Command names and most keywords are matched case-insensitively.
* **Leading `/`:** A leading `/` is automatically stripped if no `/`-prefixed command matches (e.g. `/tgm` works like `tgm`; `/tp` is also explicitly registered).
* **Command Chaining:** Use `;` to run multiple commands in one line (e.g. `tgm; heal; addgold 5000`). *(Blocked inside `apo aurbis`.)*
* **Setting Gate:** Console execution requires **Enhancements → Game Console** (`Enhancements/LypyL_GameConsole`) to be enabled.

---

## Partial Name Matching Quick Guide

| Command | Matching Behavior |
| :--- | :--- |
| `tele2loc`, `tp <locationName>` | **Folded exact → prefix → substring** (case-insensitive, strips apostrophes, collapses spaces/hyphens; shortest name wins within highest match tier). |
| `additem`, `item`, `rcf give_stolen` | **Substring match** (case-insensitive, ignores spaces/`_`/`-`) across item templates `0..287` and custom templates, plus material prefix/suffix splitting (`daedric_claymore`) and special aliases. |
| `set_attr`, `mod_attr`, `set`, `give_stat_gear` | **Prefix match** on attribute names (e.g. `str`, `int`, `wil`, `agi`, `end`, `per`, `spe`, `luc`). |
| `set_skill`, `mod_skill`, `set` | **Prefix match** (normalized, ignores spaces/`_`/`-`) on skill names. |
| `prof set`, `prof addxp` | Exact `id` or **prefix match** on profession display name. |
| `rcf set_sgroup` | Numeric `0..10` or **3-character prefix** (`com`, `mer`, `sch`, `nob`, `und`, `sup`). |
| `living adv setlevel`, `living adv summon`, `living adv settrait`, `living adv quote` | Numeric ID / array index, or case-insensitive **substring match** on adventurer name. |
| `finish_errand` | Exact `id` or case-insensitive **substring match** on revenant name. |
| `apo cult <key\|unlock\|clear\|consecrate\|upgrade\|branch> [site]` | Exact `siteKey`, keywords (`daedra`/`hatch`/`sanctuary`/`temple`), or case-insensitive **substring match** on `siteKey` (current city first, then all sites). |
| `apo pantheon log [filter] [search...]` | Case-insensitive **substring match** across chronicle text, deity name, and region name. |
| **Exact-only (no partial matching)** | `spawnfoe`/`spawn` (exact ID/name or short aliases `skeleton`, `bear`, `bat`, `tiger`, `scorpion`, `guard`), `testtrait <trait>`, `difficulty`/`lethality`/`risk`, `apo pantheon`/`apo war` `<godId>` (16 exact `snake_case` IDs), `living spawn skirmish <EVT_ID>`, `living spawn plea <TYPE\|alias>`, `perk unlock <id>`, `addspell <key>`, `crisis start\|stop`, `living roll <Skill>`. |

---

## 1. Core, Character & World Commands

| Command | Aliases | Syntax & Arguments | Behavior |
| :--- | :--- | :--- | :--- |
| `HELP` | - | `HELP [command]` | Lists all commands alphabetically, or prints usage for a specific command. |
| `tgm` | - | `tgm` | Toggles God Mode; restores Health to max when enabled. |
| `killall` | - | `killall` | Kills all hostile entities in the active scene (spares `divineChampion` / `noInstakill` targets). |
| `kill` | `suicide`, `killme` | `kill` | Disables God Mode and forces player death. |
| `heal` | `player_heal` | `heal` | Restores Health, Fatigue, and Magicka to max. |
| `sethp` | `player_hp` | `sethp <value \| N%>` | Sets player health (`>= 1`) for combat/surrender testing (e.g. `sethp 20`, `sethp 18%`). |
| `set_fatigue` | `setfatigue`, `fatigue` | `set_fatigue <amount\|percent%>` | Sets fatigue (`<n>%`, display points `<= STR+END`, or raw points). |
| `addgold` | - | `addgold <count>` | Adds `<count>` gold pieces. |
| `add_credit` | `addcredit`, `give_credit` | `add_credit <amount>` | Adds a Letter of Credit worth `<amount>` gold to inventory. |
| `teleport` | - | `teleport <x> <y> <z>` | Teleports to world coordinates `(x, y, z)`. |
| `tele2loc` | - | `tele2loc <locationName>` | Teleports to named location in world mode (folded exact/prefix/substring match). |
| `tp` | `/tp` | `tp <x> <y>` \| `tp <locationName>` | Teleports to map pixel `(x, y)` or named location (folded exact/prefix/substring match). |
| `spawnfoe` | `spawn` | `spawnfoe <id\|name> [count]` | Spawns `1..20` (default `1`) foes near player. Exact ID/name or short alias (`skeleton`, `bear`, `bat`, `tiger`, `scorpion`, `guard`). |
| `testtrait` | - | `testtrait <trait> [mob]` | Spawns an elite foe (default `warrior`) with a specific `BOSS_TRAITS` trait (`warded`, `flameproof`, `frostproof`, `venomproof`, `stormproof`, `spellproof`, `bladeturning`, `stoneskin`, `curbing`, `wrathful`, `thorned`). |
| `spawnlist` | - | `spawnlist` | Lists all monster (`0..42`) and class (`128..146`) IDs and names. |
| `difficulty` | - | `difficulty [status\|classic\|balanced\|veteran\|hardcore]` | Inspects or applies a modular difficulty preset across all 7 combat balance rows. |
| `lethality` | - | `lethality [status\|classic\|sharp\|lethal\|brutal]` | Inspects or sets offline Combat Lethality preset and prints active Hero Threat multipliers. |
| `risk` | - | `risk [status\|off\|standard\|harsh\|<regionIndex>]` | Inspects or sets Regional Risk Zones mode, or prints the threat tier and multipliers for any region (`0..70`). |
| `reflexes` | - | `reflexes [status\|0..4\|veryhigh\|high\|average\|low\|verylow]` | Inspects or sets player Reflexes live (`0..4` or aliases `vh`/`h`/`avg`/`normal`/`l`/`vl`), showing wind-up and cooldown multipliers. |
| `stagger` | - | `stagger [status\|me\|clear]` | Inspects, triggers, or clears hard player stagger state. |
| `encounter` | - | `encounter [random\|wild\|camp\|merchant\|adv\|bandit\|plea\|nemesis\|checkpoint\|skirmish [EVT_ID]\|war\|naval]` | Triggers a Living Tamriel encounter in exterior world mode (`skirmish` accepts an optional `EVT_ID`). |
| `tcl` | `noclip` | `tcl` | Toggles collision (`noclip` + `fly`). |
| `set_time` | `time` | `time <h> [m]` \| `time set <h> [m]` \| `time add <n>[m\|h\|d]` | Sets time of day or advances time (unitless `<100` = hours, `>=100` = minutes; also supports unit-first `time add days 3` and space-separated `time add 3 days`). |
| `date` | `calendar`, `get_time` | `date` | Prints Tamriel calendar date, time, year (`3E...`), and season. |
| `set_holiday` | `holiday` | `set_holiday <merchants\|none>` | Prints current holiday ID or jumps the calendar to Merchants Festival (`merchants`) / clears it (`none`). |
| `advance_time` | `advancetime`, `pass_time`, `passtime` | `advance_time <hours>` | Advances world clock by `<hours>`. |
| `advance_days` | `advancedays`, `pass_days` | `advance_days <days>` | Advances world clock by `<days>`. |
| `set_weather` | `weather` | `set_weather <0..6\|type>` | Pins a `180`-minute (3h) weather override (`sunny`/`clear`, `cloudy`/`clouds`, `overcast`, `fog`/`foggy`, `rain`/`rainy`, `thunder`/`thunderstorm`/`storm`, `snow`/`snowy`). |
| `additem` | `item` | `additem <id\|name> [count] [material]` | Adds item(s); material (`0..9`, `iron`..`daedric`, `elf`, `dwarf`, `adamantite`, `orc`, `daedra`, `leather`, `chain`) can also come first or combined (`daedric_claymore`). Supports substring matching + special aliases (`grimoire`/`grimoire_of_the_worm`/`necro_grimoire`/`tome_of_unlife`/`necro_book`/`book_of_unlife`, `elixir_unlife`/`elixir_of_unlife`, `lich_ingredients`/`elixir_reagents`, `skinning_knife`/`flaying_knife`, `dragon`/`dwarven_dragon`/`dwemer_dragon`). |
| `set_attr` | `set_stat`, `setstat`, `setattr`, `stat` | `set_attr <attrPrefix> <value>` | Sets an attribute (prefix match). |
| `mod_attr` | `mod_stat` | `mod_attr <attrPrefix> <delta>` | Modifies an attribute by `<delta>` (prefix match). |
| `give_stat_gear` | `stat_gear`, `overcap_gear` | `give_stat_gear [kit \| <attribute> [1..15]]` | Grants a 10-piece identified Stat Overcap QA Kit (non-overlapping slots) or a single stat ring (`1..15`) for testing `> 100` attribute overcap. |
| `set_skill` | `setskill`, `skill` | `set_skill <skillPrefix> <0..200>` | Sets skill (`> 100` enables mastery overcap; prefix match). |
| `mod_skill` | - | `mod_skill <skillPrefix> <delta>` | Modifies skill, clamped `0..200` (prefix match). |
| `set_level` | `setlevel`, `level` | `set_level <level>` | Sets player level (`>= 1`), recalculates HP floor, applies God/Lich/Firmament scaling, and preserves current HP percentage. |
| `set_max_magicka` | `max_magicka`, `setmaxmagicka`, `maxmagicka`, `set_mana`, `set_max_mana`, `max_mana` | `set_max_magicka <value\|reset>` | Overrides max magicka or resets (`reset`/`auto`/`default`). |
| `set` | - | `set <skill\|stat\|attr\|level\|maxmagicka\|max_magicka\|maxmana\|max_mana\|magicka\|mana> <name> [val]` | Unified setter; without keyword, tries skill prefix first, then attribute prefix. |
| `addspell` | - | `addspell <spellKey\|all_necro>` | Adds necromancy spell (`animate_dead`, `corpse_explosion`, `life_tap`, `bone_armor`, `suture_cadaver`/`cadaver`, `finger_of_death`, `arch_lichdom`/`archlich`, `paralyzing_touch`/`paralyze`, `dark_flight`/`levitate`/`necrolevitate`, `control_undead`, `disguise`/`mortaldisguise`, or `all_necro`/`all`/`necro` for 10 core spells excluding `finger_of_death`). |
| `perk` | `perks` | `perk <list \| unlock <id\|all> \| reset>` | Lists, unlocks (exact case-insensitive `id` or `all`), or resets dynamic perks. |
| `open_perks` | - | `open_perks` | Prints hint to open Esc → Growth. |
| `tdt` | - | `tdt` | Toggles Debug Text HUD (position, time, weather). |

---

## 2. DFF Systems, Living Tamriel & RCF Commands

| Command | Aliases | Syntax & Arguments | Behavior |
| :--- | :--- | :--- | :--- |
| `firmament` | `firm` | `firmament <status \| addstars <n> \| addpoints <n> \| addxp <n> \| reset>` | Inspects or modifies Offline Firmament progression. |
| `housing` | `house` | `housing <list \| buy [key] [mapId] [reg] \| inherit <mapId> <key> [reg] \| tp [key] \| clear>` | Manages offline player houses. |
| `prof` | `profession` | `prof <list \| set <name> <1..100> \| addxp <name> <amount>>` | Manages offline professions (prefix match on name). |
| `starfall` | - | `starfall <status \| spawn [heart] [fallen\|omen] \| clear>` | Inspects offline Starfall state, spawns a fallen/omen star (normal or Heart-Star), or clears the active star. |
| `relic` | `relics` | `relic <status\|embers\|starglass\|pellets\|set\|gilded\|gun\|lord\|card\|drink\|broker\|tp_coven\|roll>` | Inspects or grants offline pre-Apotheosis relics, Aetheric sets, Gilded weapons, Dwemer guns, Battlespire Lord arms, Boss Cards, Coven Sigil Broker access, and sigil XP. |
| `survival` | - | `survival <status \| tier <id> \| wildsleep <on\|off> \| need <hunger\|thirst\|sleep\|wet\|drunk> <val> \| drink <cat> \| hearty>` | Inspects or tests Climates & Calories tiers (`off`, `boons`, `casual`, `standard`, `veteran`, `hard`), wilderness sleep gate, needs, 5 drink buff categories, and Hearty Meal. |
| `addmats` | - | `addmats [ore\|ores\|ingot\|ingots\|herb\|herbs\|leather\|hides\|wood\|logs\|planks\|all\|key] [count]` | Adds crafting materials (default `all`, `5`) and ensures a Materials Bag. |
| `bank` | - | `bank <status \| deposit <n> \| withdraw <n> \| clearloans \| setloan <n>>` | Manages Unified Bank balance and loans. |
| `city247` | - | `city247 [on\|off\|toggle]` | Toggles 24/7 city infrastructure. |
| `bounty` | - | `bounty <get [reg] \| set <gold> [reg] \| clear [reg]>` | Gets, sets, or clears regional bounty. |
| `legalrep` | - | `legalrep <get [reg] \| set <-100..100> [reg] \| clear [reg]>` | Gets, sets, or clears regional legal reputation. |
| `dynasty` | - | `dynasty <status \| addchild \| retire \| addrenown <n> \| setmodel <dynasty\|enduring\|bloodline>>` | Inspects or modifies Project Legacy / Dynasty state. |
| `crisis` | - | `crisis <start <type\|FlagName> [reg] \| stop [type\|FlagName] [reg] \| status [reg] \| tp\|goto\|jump [type] [region\|province\|beyond] \| tick\|sim>` | Starts/stops macro crises (`war`, `plague`, `famine`, `civil_strife`, `strife`) or vanilla `REGION_FLAGS`, teleports (with optional region/province filter), or ticks 38 days (`crisis start war` also resets mundane war skirmish progress). |
| `telecrisis` | - | `telecrisis [type\|FlagName] [region\|province\|beyond]` | Teleports to a settlement with an active crisis (`war`, `plague`, `famine`, `crime`, `witch`, `ruler`, `holiday`, `strife`/`civil_strife`, `prices`/`tax`, or exact `REGION_FLAGS` name), optionally filtered by region, province, or `beyond`. |
| `living` | - | See subcommands below | In World Mode, exposes the full `executeLivingConsoleCommand` suite. *(Outside World Mode, supports `living adv\|adventurer <tick\|kill_in_dungeon\|setlevel\|settrait\|quote\|companion [status\|dismiss]\|list>`.)* |
| `rcf` | - | `rcf <status \| tier <0..3\|off\|light\|mid\|high> \| set_sgroup <0..10\|prefix> <n> \| set_faction <id\|alias> <n> \| give_stolen [item] \| test_rumor \| test_contraband>` | Inspects and tests Reputation Consequences Framework (`db`, `thieves`/`tg`, `knights`/`ko`, `mages`/`mg`, `fighters`/`fg`, `temple`, `arkay`, `julianos`, `kynareth`, `mara`, `stendarr`, `dibella`, `zenithar`, `akatosh`). |
| `raceaudit` | `racecheck` | `raceaudit [all [lvl]]` | Audits live Racial Overhaul state, saving throws, toggle `ON↔OFF` vital rescaling, and save/load round-trip invariants for the active character (or all 8 playable races at level `lvl`, default `10`). |
| `dumplog` / `dumpcombat` / `dumpspawns` / `dumpall` | - | `dumpall [reason]` | Dumps diagnostic telemetry logs to disk with optional `[reason]`. |

### `living` Subcommands (World Mode)
* `living status` - Prints current LT region state, tension, `cooldown=<N>m`, `prosperity=<delta>`, and subsystem status.
* `living prosperity [<-5..+5>|clear|status]` - Shows, sets, or clears the current settlement's local prosperity modifier (`-5..+5`) and combined shop quality shift.
* `living cooldown [2h|8h|24h|3d|clear|reset]` - Shows active settlement cooldowns or sets/clears the settlement event cooldown (`2h` `120m`, `8h` `480m`, `24h`/`1d` `1440m`, `3d`/`72h` `4320m`).
* `living scale [low|1|mid|2|high|3|4]` (alias `density`) - Sets encounter scale.
* `living loot [full|supplies|gold|zero|none]` - Sets urban/world loot policy.
* `living traits [dungeon|dungeons] [off|0|light|1|mid|2|high|3]` (alias `mobtraits`) - Sets wilderness or dungeon mob traits tier.
* `living crisis <TYPE> [PHASE]` - Forces a crisis type/phase.
* `living [site] spawn <KIND> [DETAIL]` (shorthand `living site <KIND> [DETAIL]`) - Spawns a specific LT encounter (`plea`, `checkpoint`, `camp`/`bandit`, `rest`/`merchant`/`caravan`, `quarantine`, `skirmish`/`urban`, `nemesis`, `meeting`, `adventurer`/`adv`, `naval`):
  * For `skirmish` / `urban`: optional `[DETAIL]` accepts any of the **41 exact `CRISIS_EVENTS` IDs** (e.g. `EVT_PLAGUE_RAT_SWARM`, `EVT_WAR_INTERPROVINCIAL`).
  * For `plea`: optional `[DETAIL]` spawns at `8m` using a short alias (`drunk`, `cart`, `hound`, `preacher`, `urchin`, `duelist`, `plague`, `famine`, `refugee`, `escort`) or exact `PLEA_TYPE`.
* `living encounter [kind]` - Triggers an LT wilderness encounter.
* `living quest` - Accepts or completes the regional crisis contract.
* `living formulas` / `living roll [Skill] [DC] [Formula]` (aliases `formula`, `check`) - Lists or tests LT roll formulas.
* `living adv list [region]` | `living adv tick <1..365>` | `living adv kill_in_dungeon [region]`
* `living adv setlevel <name|id|index> <1..45>` *(supports substring match)*
* `living adv settrait <name|id|index> <trait>` *(supports substring match; `HONORABLE`, `ARROGANT`, `ENVIOUS`, `CUTTHROAT`, `DUELIST`, `MERCENARY`, `CAUTIOUS`)*
* `living adv quote [name|id|index] [days]` *(supports substring match; `1..14` days)* - Prints full companion hire quote breakdown (base, haggled, Mercantile/Personality/Taint/Disguise/RCF/Festival/Wartime).
* `living adv companion [status|dismiss|kill]` - Inspects active companion contract, dismisses them, or strikes them down (zero-loot test).
* `living adv summon [nearest|random|<name|id|index>]` *(supports substring match)*

---

## 3. Necromancy Commands

* **`necro`** subcommands:
  * `necro status` | `necro menu` | `necro cmd <order>`
  * `necro disguise [on|off|toggle|<rounds>]`
  * `necro control [type] [rounds]` | `necro lose_control` (`release_control`, `release_controlled`)
  * `necro lich [on|off|toggle]` | `necro ancient_lich` (`ancientlich`, `archlich`, `arch_lich`) `[on|off|toggle]`
  * `necro taint [get | add <n> | set <n>]`
  * `necro spawn <skeleton|zombie|ghost|mummy|cadaver|flesh_colossus|lich|ancient_lich>` (or `necro <type>`)
  * `necro spawn corpse [mobType] [1..20]` (or `necro corpse [mobType|count] [count]`, supports 17 named mob specs)
  * `necro minions [list | follow | guard | attack | feign_death | recall | clear | dismiss | raise [type]]`
  * `necro harvest` | `necro detonate` | `necro elixir` | `necro ambush`
  * `necro test [kit|lich|archlich|arch_lich|harvest|synergy|cadaver]`
* **Standalone Necromancy Aliases:**
  * `necro_lich` / `lich [on|off]`
  * `necro_ancient_lich` / `ancient_lich` / `ancientlich` / `archlich` / `arch_lich` / `necro_archlich` / `necro_arch_lich [on|off|toggle]`
  * `necro_spawn <type>`, `necro_corpse [mob|count] [count]`, `necro_menu`
  * `necro_lose_control` / `lose_control` / `release_control`, `necro_disguise [on|off|rounds]`
  * `necro_spells` / `necrospells`
  * `give_dagger` (`givedagger`), `give_knife` (`giveknife`), `give_grimoire` (`givegrimoire`), `give_elixir` (`giveelixir`), `give_elixir_reagents` (`give_reagents`, `givereagents`)

---

## 4. Apotheosis, Miracles & Ascension Preset Commands

### Standalone Apotheosis & Miracle Commands

| Command | Aliases | Syntax | Behavior |
| :--- | :--- | :--- | :--- |
| `apotheosis` | `apo` | `apotheosis <subcommand> [...]` | Master Apotheosis debug, teleport, Pantheon, Cult, Siege, War, and Scroll of Aurbis suite. |
| `spellsword` | `apo_ready` | `spellsword` | Seeds the battle-ready **Level 35 Ascension Spellsword** preset (Panoply of the Aether, Shalidor's Brand, Ruhn's Gatecleaver, Bracelet of Free Action, 98 Firmament Stars, Fate Weight ready at Direnni Tower). |
| `portal` | - | `portal` | Opens the Portal Stone travel map without spending a Portal Stone (`120` Faith when invoked via Scroll of Aurbis). |
| `pacifyall` | `pacify_all`, `pacify` | `pacifyall` | Pacifies all non-protected hostiles in the active scene (`80` Faith via Scroll of Aurbis; `+20`/`+10` Order Faith bonus). |
| `summon_champion` | `champion`, `apotheosis_champion` | `summon_champion` | Summons 1 Faith-scaled Portfolio Divine Champion for 24h (`+1` extra if Allied deity exists). |
| `summon_champions` | `champion_party`, `champions`, `summon_champion_party` | `summon_champions` | Summons a party of 4 Faith-scaled Portfolio Divine Champions for 24h (`+1` extra if Allied deity exists). |
| `divine_shield` | `aegis`, `divine_aegis`, `apotheosis_shield` | `divine_shield` | Grants a 24h (`1,440`-round) Divine Aegis shield absorbing `Level × 50` HP. |

### `apotheosis` / `apo` Subcommands

| Subcommand | Aliases | Syntax & Arguments | Behavior |
| :--- | :--- | :--- | :--- |
| `status` *(default)* | - | `apo [status]` | Prints stage, questStep, siegeWave/13, portfolio, Faith/max, Fate Weight (`count/24`), unequipped artifacts, and all 24 triggers. |
| `spellsword` | `ready` | `apo spellsword` \| `apo ready` | Same as standalone `spellsword` / `apo_ready`. |
| `artifacts` | `arts` | `apo artifacts [1..23]` | Grants `n` (default `15`) distinct canonical artifacts to pack. |
| `fate` | - | `apo fate [ready\|full]` | Sets debug Fate Weight override: `ready` (`16/24`) or `full` (`24/24`). |
| `set` | - | `apo set <metric> [value]` | Sets a Fate Weight milestone (`kills`, `quests`, `nemesis`/`nemeses`, `books`, `discover`, `maxhp`/`hp`, `renown`, `stars`, `home`, `ship`, `skill200`, `spec`). |
| `faith` | - | `apo faith [get \| max \| <amount>]` | Inspects, fills, or sets Faith (`0..faithMax`). |
| `decay` | - | `apo decay [1..365]` | Simulates `n` days of Ascended Mythic Decay. |
| `witness` | - | `apo witness [0..999 \| clear\|auto\|live\|off\|none]` | Inspects, overrides, or clears Scroll of Aurbis witness count. |
| `aurbis` | - | `apo aurbis <command...>` | Executes a decree via the **Scroll of Aurbis** (spends Faith, applies witness reactions, blocks `;` chaining and cheat commands - see [Faith, Portfolios & Scroll of Aurbis](/apotheosis/faith-and-aurbis)). |
| `mantella` | - | `apo mantella [usurp]` | Prepares Fate Weight and opens Mantellan Crux fork dialog (or immediately usurps if `usurp` passed). |
| `tp` | - | `apo tp <dest> [holder]` | Teleports to `direnni`/`tower`, `mantella`/`crux` `[underking\|zurin\|gothryd\|worms\|gortwog\|akorithi\|eadwyre\|brisienna\|raw]`, `zerostone`/`zero`, `orrery`/`shadow`, `daedra`/`hatch`, `player`/`undercroft`, `temple`, `altar`, or `shrine`. |
| `quest` | - | `apo quest <start\|siege\|wave13\|tower\|zerostone\|shadow\|complete>` | Jumps the `_APOTHEO` trial to a specific stage. |
| `rebirth` | - | `apo rebirth` | Triggers Ascended God death and `+1` day Divine Rebirth on the spot. |
| `champion` | `champions` | `apo champion [party\|4\|status\|list\|clear\|dismiss]` | Summons 1 or 4 Champions, lists active Champions, or dismisses all. |
| `pantheon` | - | `apo pantheon [status \| <godId> \| tick [1..30] \| log [all\|my_cult\|against_me\|diplomacy\|regions] [search...] \| rep <godId> <delta> \| offer\|pact\|ally\|war\|truce <godId> \| discord <godA> <godB>]` | Inspects or manipulates the 16 Pantheon deities (diplomacy actions free; `log` search is substring match). Valid exact `<godId>` values: `akatosh`, `arkay`, `dibella`, `julianos`, `kynareth`, `mara`, `stendarr`, `zenithar`, `mehrunes_dagon`, `molag_bal`, `boethiah`, `mephala`, `nocturnal`, `hermaeus_mora`, `azura`, `sheogorath`. |
| `influence` | - | `apo influence [regionIndex]` \| `apo influence set <regionIndex> <player\|godId> <share%>` | Inspects or edits cult share (`0..100`) in any of the 71 regions (`0..70`). |
| `geopolitics` | - | `apo geopolitics <war\|peace> <regionA> <regionB>` | Ignites Divine War or enforces Divine Peace between two regions (free). |
| `cult` | - | `apo cult <status \| list [reg] \| tp <dest> \| found [mapId] \| key\|unlock\|clear\|consecrate\|upgrade\|branch [site] [opt] \| edict [reg] [prosperity\|crusade\|arcane\|shadow\|clear\|none]>` | Manages Cult Sanctuaries and Regional Edicts (free; `[site]` supports `daedra`/`hatch`/`sanctuary`/`temple` or substring match on `siteKey`). |
| `siege` | - | `apo siege <status \| start [siteKey\|-] [godId] \| defend\|win\|lose\|fail [siteKey]>` | Starts, deploys, or resolves Temple/Sanctuary sieges. |
| `war` | - | `apo war <status \| start\|here [godA] [godB] \| skirmish [divine\|mundane] [ask\|reset] \| support [godId] [warId] \| truce [all\|warId] \| clear \| stance <sideA\|sideB\|peace\|watch\|reset> \| pacify [triumph\|success\|partial\|fail\|critfail] \| cooldown [clear]>` | Manages Inter-Deity Wars and Wilderness War Skirmishes. |
| `reset` | - | `apo reset` | Resets Apotheosis back to mortal aspirant. |

---

## 5. Dragon Mount & Revenant Companion Commands

* **`give_dragon`** (`givedragon`, `dragon_mount`): `give_dragon [brass|blue|aether]` - Grants Dragon mount (`blue`/`aether`/`aetherbright` for Aetherbright look, else Brass).
* **`dragon`** (`dragon_ride`): `dragon [on|off|blue|brass|aether|aetherbright]` - Mounts, dismounts, or switches Dragon look while riding.
* **`add_revenant`** (`addrevenant`, `cheat_companion`, `revenant_add`): `add_revenant [type|rank] [rank 1..5]` - Adds a sworn revenant to your retinue (`random`, numeric `MOBILE_TYPES` ID, or 34 named types).
* **`spawn_revenant`** (`spawnrev`): `spawn_revenant [type=knight] [rank=1..5] [hp] [force]` - Mints and spawns a hostile hunting revenant in world or dungeon mode (`force` overrides the active hunting cap).
* **`list_revenants`** (`revenants`, `retinue`): Lists active retinue members.
* **`finish_errand`** (`finisherrand`, `complete_errands`): `finish_errand [id|name]` - Completes all active errands, or a specific one (supports substring match on name).
* **`spawn_spar`** (`spar_spawn`): `spawn_spar [wager=50] [level] [hp]` - Spawns an active wager-sparring duelist near the player.
* **`spar_debug`** (`foe_state`): `spar_debug [dot|poison]` - Inspects the nearest foe's spar/kneel/grace/actor state and active effects, or applies a test canonical DoT or poison.

---

## 6. Map & Mod-Specific Commands

* **Dungeon / Interior Automap:** `map_revealall`, `map_hideall`, `map_teleportmode` (Ctrl+Shift+LMB teleport).
* **Exterior Automap:** `map_revealbuildings`, `map_hidebuildings`.
* **Travel Map:** `map_reveallocations`, `map_hidelocations`, `map_reveallocation [regionName] [locationName]` (`_` converts to spaces).
* **Dynamic Snow** *(requires Enhanced + Dynamic Snow enabled)*: `snow_status`.
* **Windfall** *(requires Enhanced + Windfall enabled)*: `windfall <auto|normal|windy|storm|gust|bright|ruffle|leaves|status>`.
* **Foraging** *(requires Foraging enabled, offline only)*: `Foraging_Tools 0/1 n`.
* **Come Sail Away** *(requires CSA runtime active)*: `giveboat [hull] [variant]`, `placeboat [hull] [variant]`, `printboats`, `identifyboat`, `purgeboat [index]`.
* **Player View, Foe Bodies & Lycanthropy QA Helpers:**
  * `player_view` (`pview`): `player_view [status | fp <2d|3d> | tp <2d|3d> | <2d|3d> <2d|3d> | inv <follow|3d|paperdoll> | look <skins|layered|paperdoll> | toggle]` - Inspects or toggles independent 2D/3D First-Person/Third-Person rendering, inventory figure mode, Profile 2D look, and camera perspective.
  * `foe_bodies` (`fview`, `mwfoes`): `foe_bodies [status | 2d | 3d | off | near | all | toggle]` - Inspects or toggles Morrowind 3D foe bodies (`mwFoeBodies`).
  * `lycan` (`werewolf`, `wereboar`): `lycan [status | werewolf | wereboar | morph | unmorph | cure]` - Applies/switches lycanthropy, transforms/reverts, or cures the curse for rendering and combat checks.
