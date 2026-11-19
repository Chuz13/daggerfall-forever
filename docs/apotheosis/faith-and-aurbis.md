# Stage 2: Faith, Portfolios & Scroll of Aurbis

Once you claim a **Divine Portfolio**, mortal gold is only half your power. Your reality-warping miracles, Divine Champions, cult expansion, and immortal rebirths are fueled by **Faith**.

---

## Faith Economy & Mythic Decay

### Capacity & Multipliers
* **Initial Faith:** **`500`** upon claiming your first Portfolio.
* **Max Faith Cap:** Base **`1,000`** + bonuses from your owned Cult Sanctuaries (`+100` Tier I, `+250` Tier II, `+500` Tier III, and `+150` for the Oracle Reliquary branch).
* **Gain Multiplier:** Non-raw Faith gains scale with **Faith Gain Multiplier** (`apotheosisFaithGainMult`, default `1.0x`).

### Mythic Decay
* On any in-game day where you perform **no active Faith-generating deeds** (`lastFaithGainDay < currentDay`), you suffer **`-15` Faith/day** Mythic Decay (scaled by `apotheosisFaithDecayMult`, default `1.0x`; set to `Off (0x)` in settings to disable).
* **Important:** Passive daily Faith from owned Cult Sanctuaries and Regional Edicts does **not** reset `lastFaithGainDay` and does not prevent Mythic Decay on idle days.
* **Order Lawful Daily Bonus:** With the **Order** Portfolio, having **`0` regional bounty** and **legal reputation `>= 15`** grants **`+10` Faith/day**.

### How to Earn Faith
* **Portfolio Deeds:**
  * **War:** Non-spell kills (`+5` normal, `+15` elite/boss/level `>= 15`); Bounty contracts (`+15 × tier`); Fighters Guild quests (`+30`).
  * **Magic:** Real mana-cost spell casts (`clamp(floor(cost / 15), 2, 25)`, excludes item procs); spell kills (`+10` normal, `+20` elite); potion/spell/enchant crafting (`+10 / +14 / +18`, plus up to `+10` per `500g` spent); Mages Guild quests (`+30`).
  * **Shadows:** Stealth/unaware kills (`+12` normal, `+20` elite); Lockpicking (`+12`); Pickpocketing (`+10`); generic stealth (`+8`); Thieves Guild & Dark Brotherhood quests (`+30`).
  * **Order:** Bounty contracts (`+25 × tier`); Temple donations `>= 100g` (`min(40, floor(gold / 50))`, capped at **`60` Faith/day**); Temple & Knightly Order quests (`+35`); Lawful daily bonus (`+10/day`); `pacifyall` (`+20` if hostiles calmed, `+10` if `0`).
* **Witnesses (`25m` Radius):**
  * Casting any non-free **Scroll of Aurbis** decree near non-hostile NPCs or guards awards **`+15` Faith** if the decree aligns with your Portfolio (capped at **`3` times/day = `+45` Faith/day**) or costs **`-20` Faith** if opposed (uncapped).
  * Champion summons (`summon_champion` / `summon_champions`) are **always** witness-aligned for all Portfolios.
* **Cult Sites, Edicts, Shrines & Wars:**
  * Owned Sites: `+4 / +8 / +14` Faith/day (Tiers I/II/III) + `+5/day` (Oracle branch).
  * Regional Edicts: Prosperous Harvest (`+8/d`), Sanctified Crusade (`+4/d`), Arcane Convergence (`+6/d`), **Shadow Tithe (`+18/d`)**.
  * Roadside Shrine Desecration: `+15` town / **`+45` wild highway (`×3`)**.
  * Pilgrim Petitions: `+60` shrine (`+180` wild), `+80` edict, `+100` Inquisition.
  * Temple Siege Victory: `+80 / +140 / +220` (`×1.3` if Militant).
  * Wilderness War Skirmishes: `+35` Divine skirmish victory; `+25..+75` pacify roll + `+100` early regional war termination.

---

## The 4 Divine Portfolios

Choosing your **first Portfolio is free**. Switching Portfolios later costs **`250` Faith**, triggers a **`30-day` (`43,200m`) cooldown**, and inflicts a **`-20` apostasy relation penalty** on any deity that had `>= +25` affinity for your old Portfolio and `< +25` for your new one.

| Portfolio | Title | Passive Boons | Witness Alignment (Aligned / Opposed) | 4 Thematic Champions |
| :--- | :--- | :--- | :--- | :--- |
| **War** (`war`) | *Lord of Conflict & Conquest* | `+15` STR & END (cap raised), `+15%` Weapon Damage, `+15` Armor (all 7 slots), `-25%` Fatigue Cost | **Aligned:** `killall`, `kill`, `spawnfoe`, `encounter`, `dragon`/`give_dragon`, `crisis start war`<br>**Opposed:** `crisis stop [war]`, `bounty clear`, `pacifyall` | Warlord of the Crimson Host (Warrior M), Vanguard Berserker (Barbarian F), Dreadnought War-Knight (Knight M), Blood-Sworn Marksman (Archer F) |
| **Magic** (`magic`) | *Architect of Aetherius* | `+20` INT & WIL (cap raised), `+250` Max Magicka, `+25` all 6 Magic Schools, `+25%` Magic Resist, silent Arcane Unlock on Daedric hatches | **Aligned:** `divine_shield`, `portal`, `tele2loc`/`tp`, `weather`, `time`/`advance_*`, `map_reveal*`, `give_grimoire`, Lich decrees<br>**Opposed:** None | Archon of Aetherius (Battlemage F), Magus of the Starlight Weave (Mage M), Aetherial Sorcerer (Sorcerer F), Planar Spellsword (Spellsword M) |
| **Shadows** (`shadows`) | *Sovereign of Paths Unseen* | `+20` AGI & SPD (cap raised), `+25` Lockpicking, Pickpocket, Stealth, Backstabbing, Dodging, CriticalStrike, `-50%` Fall Damage | **Aligned:** `weather fog/3`, `time` at night (`20..23`/`0..5`), `bounty clear`, Lich decrees<br>**Opposed:** `killall`, `spawnfoe`, `crisis start`, `dragon`/`give_dragon` | Sovereign Nightblade (Nightblade F), Silent Hand Assassin (Assassin M), Twilight Stalker (Rogue F), Veil-Piercer Ranger (Ranger M) |
| **Order** (`order`) | *Anchor of Mundus* | `+20` PER & LUC (cap raised), `+25%` Magic, Fire, Frost, Shock & Poison Resist, `+25` Etiquette, Streetwise, Mercantile, `+25` Standing (all 5 social groups) | **Aligned:** `heal`, `legalrep`, `pacifyall`, `divine_shield`, `bounty clear`, `crisis stop`, `weather 0/1/sunny/cloudy`<br>**Opposed:** `bounty set`, `killall`, `kill`, `spawnfoe`, `crisis start`, Lich decrees | Justiciar of the Eternal Law (Knight M), Templar of the Golden Ward (Healer F), Aegis Sentinel (Monk M), Inquisitor of Mundus (Spellsword F) |

---

## Divine Champions & Allied Pantheon Bonus

Ascended Gods can summon Portfolio-matched Divine Champions via the Scroll of Aurbis (`summon_champion` for `1` at **`150` Faith**, or `summon_champions` for `4` at **`450` Faith**):

* **Duration & Persistence:** Champions fight for **`24` in-game hours (`1,440` min)** and persist across interior/exterior transitions (`recasting` replaces the prior batch).
* **Faith-Scaled Rank (I–V):** `rank = clamp(1 + floor(faithAtCast / 200), 1, 5)`:
  * **HP Multiplier:** `2.5x` (Rank I) up to **`4.5x`** (Rank V).
  * **Damage Scale:** `1.375x` (Rank I) up to **`1.875x`** (Rank V) - multiplied by an additional **`1.25x`** inside a region under the **Sanctified Crusade** edict.
  * **Speed & Protections:** `+(rank × 5)` Speed (cap `100` for Rank II+), `divineChampion`, and `noInstakill` immunity.
* **Allied Pantheon `+1` Bonus Champion:** Your highest-standing **Allied** deity in the Pantheon automatically dispatches **`+1` bonus thematic Champion** at the exact same Faith-scaled Rank and 24-hour duration (giving `1 + 1 = 2` or `4 + 1 = 5` total companions).

---

## Scroll of Aurbis (`apo aurbis`) & Miracle Decrees

The **Scroll of Aurbis** lets Ascended Gods invoke game systems through Faith inside **Pause → Apotheosis → Scroll of Aurbis** (featuring **14 Quick Miracle cards** plus a decree input) or via `apo aurbis <command>`.

### Core Rules
* **No Chaining / No Mortal Cheats:** Semicolon `;` command chaining is blocked. Cheat and mortal-stat commands (`tgm`, `tcl`, `set_level`, `set_skill`, `set_stat`, `set_max_magicka`, `set_fatigue`, `firmament`, `perk`, `prof`, `addmats`, `addspell`, `add_revenant`, `finish_errand`, `rcf`, `dynasty`, `housing`, `bank`, `city247`, `dump*`, `tdt`, `suicide`, `*boat*`, `necro test`, and `apo` except `apo status`) are forbidden.
* **100% Refund on Failure:** If a decree throws an error or fails validation (invalid item, bad target, etc.), **all spent Faith is refunded automatically**.
* **Regional Discounts:** Under the **Arcane Convergence** edict, all non-zero decrees cost **`-20%` (`0.8x`)** Faith. Under **Shadow Tithe**, `bounty clear` costs **`50%`** Faith (minimum `15`).

### Complete Decree Catalog

| Category | Decree / Command | Faith Cost | Effect & Notes |
| :--- | :--- | :--- | :--- |
| **Restoration** | `heal` (`player_heal`) | `40` | Full HP, Magicka, and Fatigue restoration. |
| **Restoration** | `divine_shield` (`aegis`, `divine_aegis`) | `1,000` | Wraps player in a **24h (`1,440` rounds)** Divine Aegis absorbing **`Level × 50`** HP. |
| **Portals & Sight** | `portal` | `120` *(deferred)* | Opens the Portal Stone travel map without a physical stone (supports inter-provincial travel outside the Bay); costs `0` if cancelled. |
| **Portals & Sight** | `tele2loc` (`teleport`, `tp`, `/tp`) | `180` | Divine teleportation to location or coordinates. |
| **Portals & Sight** | `map_revealall` / `map_reveallocations` / `map_reveallocation` | `120` / `100` / `80` | Reveals dungeon automap or overworld locations (`map_hide*` costs `60`). |
| **Materialization** | `additem` (`item`) | `max(15, ceil(gold/10))` | Conjures items (`max 999`; Lich elixir/reagents `250 × count` max `20`; Dwarven Dragon `#560` floor `500`). |
| **Materialization** | `addgold <amount>` | `max(10, ceil(amount/10))` | Materializes gold directly into your purse. |
| **Materialization** | `give_knife` / `give_dagger` / `give_grimoire` | `20` / `25` / `60` | Conjures Skinning Knife, Dagger + Knife, or Grimoire of the Worm. |
| **Materialization** | `dragon` / `give_dragon` | `150` / `500` | Mounts/toggles Dragon or grants the Dragon mount. |
| **Sky & Time** | `weather` (`set_weather`) | `35` (`45` storm/snow) | Sets weather and pins a **`180`-minute (3h)** divine override so weather simulation does not overwrite it. |
| **Sky & Time** | `time` / `advance_time` / `advance_days` | `25` .. `240` | Shifts time (`time`: `25`, `advance_time`: `25 + min(100, h*2)`, `advance_days`: `40 + min(200, d*15)`). |
| **Living Tamriel** | `crisis` (`telecrisis` `180`) | `0` / `180` / `250–500` | `status` (`0`), `tp` (`180`), flag `start`/`stop` (`250`), macro crisis `start` (`500`) / `stop` (`450`), `tick` (`500`). |
| **Living Tamriel** | `living adv` / `encounter` | `0`..`1600` / `75` | `list` (`0`), `tick <1..30>` (`100 + 50×days`), `kill_in_dungeon`/`setlevel` (`120`), `encounter` (`75`). |
| **Champions** | `summon_champion` / `summon_champions` | `150` / `450` | Summons `1` or `4` Faith-scaled 24h Champions (`+1` extra from highest Allied deity). |
| **Combat** | `pacifyall` (`pacify_all`, `pacify`) | `80` | Turns all non-protected hostiles `Neutral` and clears alerts without harming them (`+20`/`+10` Faith if Order). |
| **Combat** | `spawnfoe` (`spawn`) | `50` / `100` / `160 × count` | Summons low (`50`), mid/humanoid (`100`), or high-tier Daedra/Lich/Atronach (`160`) creatures. |
| **Combat** | `kill` / `killall` | `80` / `150` | `killall` spares `divineChampion` / `noInstakill` entities. |
| **Lich Decrees** | `lich [on\|off]` / `archlich` (`ancient_lich`) `[on\|off]` | `400`/`100` & `600`/`100` | Grants or strips Lichdom / Archlichdom directly as a divine decree (aligned with Magic & Shadows, opposed to Order). |
| **Lich Decrees** | `necro_*` & `give_elixir` / `give_reagents` | `0` .. `250` | `necro_spells` (`250`), `give_elixir`/`reagents` (`250`), `necro_disguise` (`80`), `necro_spawn` (`150` or `250` Lich), `necro_corpse` (`60`), `status`/`menu`/`lose_control` (`0`). |
| **Law & Info** | `bounty` / `legalrep` | `0` / `30+` / `50–60` | `get` (`0`), `bounty clear` (`max(30, ceil(bounty/20))`, halved min `15` under Shadow Tithe), `bounty set` (`60`), `legalrep set/clear` (`50`). |
| **Free Info** | `apo status`, `help`, `date`, `spawnlist`, `retinue` | `0` | Free inspection & divination decrees. |
