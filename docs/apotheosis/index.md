# Apotheosis: Path of CHIM

**Apotheosis: Path of CHIM** is Daggerfall Forever's end-game ascension and divine geopolitics expansion. It guides a character from a legendary mortal aspirant through a mythic trial at **Direnni Tower** into true **Ascended Godhood** - complete with a Faith economy, **Scroll of Aurbis** reality-bending decrees, **4 Divine Portfolios**, a **16-deity Pantheon 4X** across all **71 regions of Tamriel**, subterranean **Cult Sanctuaries**, **Roadside Shrines**, **Temple Sieges**, and **Religious Wars**.

---

## Overview & Journal Quest (`_APOTHEO`)

* **Always Active:** Apotheosis has no master enable/disable toggle. The **`Apotheosis`** tab is permanently available in the Enhanced Pause menu. (The `Show Fate Weight Tracker` setting only hides or shows the Stage 0 progress bar and category tabs inside that pane.)
* **Main Quest (`Apotheosis - Path of CHIM` / `_APOTHEO`):** Registered in the protected `MainQuest` family - it cannot be cancelled and is excluded from the `questsCompleted` Fate trigger count.
* **Automatic Quest Tracking:** Starting the trial adds `_APOTHEO` to your journal, reveals **Direnni Tower** on your map, updates journal logs (`1010`–`1016`) across ranks `0..5`, and places dungeon objective markers on the **Zero Stone** (Direnni Tower), **Shadow of the Agent** (Clockwork Orrery), and **Ascension Conduit** (Clockwork Orrery).

---

## Stage 0: Fate Weight (`16 / 24` Required)

Before you can step onto the Path of CHIM, your mortal deeds must accumulate enough mythic gravity: **at least `16` out of `24` Fate Weight triggers** (`REQUIRED_FATE_WEIGHT = 16`, two-thirds of the 24 triggers across 3 categories).

Fate Weight is evaluated dynamically from live character stats, gear, property, and 4 persistent counters (`totalKills`, distinct `booksRead` unioned with books owned in pack/wagon/bags/homes, `nemesesDefeated`, and successful `questsCompleted`).

### Category 1 - CHIM & Mind (`8` Triggers)

| Trigger ID | Name | Exact Requirement |
| :--- | :--- | :--- |
| `tr01_awakened_mind` | **Awakened Mind** | At least `3` attributes `>= 100`. |
| `tr19_mortal_apex` | **Pinnacle of Mortality** | Character level `>= 30`. |
| `tr02_tower_scholar` | **Tower Scholar** | `>= 25` distinct books read or collected. |
| `tr03_speaker_oblivion` | **Speaker in Oblivion** | `Daedric` language skill `>= 100`. |
| `tr04_mystic_weave` | **Weave of the Mystics** | Any magic school (`Destruction`, `Restoration`, `Illusion`, `Alteration`, `Thaumaturgy`, `Mysticism`) `>= 100`. |
| `tr05_firmament_child` | **Child of the Firmament** | `>= 50` Firmament stars attuned. |
| `tr20_renowned_legend` | **Herald of Renown** | Renown level `>= 25`. |
| `tr24_specialization` | **Twin-Art Specialization** | Any arcane (`pathOf`) or martial (`martialPathOf`) dual-skill specialization active. |

### Category 2 - Blood & Crucible (`8` Triggers)

| Trigger ID | Name | Exact Requirement |
| :--- | :--- | :--- |
| `tr07_harbinger_ash` | **Harbinger of Ash** | `>= 5,000` enemies slain (`totalKills`). |
| `tr08_mortal_flesh` | **Transcending Mortal Flesh** | Active Lichdom, Vampirism, or Lycanthropy. |
| `tr09_scourge_rivals` | **Scourge of Rivals** | `>= 10` Nemesis hunters defeated. |
| `tr10_peerless_warrior` | **Peerless Warrior** | Any martial skill (`ShortBlade`, `LongBlade`, `HandToHand`, `Axe`, `BluntWeapon`, `Archery`, `CriticalStrike`) `>= 100`. |
| `tr11_relic_bearer` | **Bearer of Daedric Power** | Hold `>= 3` distinct canonical artifacts (equipped or in pack). |
| `tr12_unbroken` | **Walker in Shadows** | Any stealth skill (`Backstabbing`, `Stealth`, `Pickpocket`, `Lockpicking`, `Dodging`, `CriticalStrike`) `>= 100`. |
| `tr21_titan_vitality` | **Unbroken Vessel** | Max Health `>= 500`. |
| `tr23_skill_200` | **Apex Mastery** | Any single skill `>= 200`. |

### Category 3 - Dominion & World (`8` Triggers)

| Trigger ID | Name | Exact Requirement |
| :--- | :--- | :--- |
| `tr13_guildmaster` | **Pillar of the Guilds** | Guild rank `>= 9` in any guild. |
| `tr14_grand_artisan` | **Grand Artisan** | Profession rank `100` in any crafting profession. |
| `tr15_cartographer` | **Cartographer of Tamriel** | `>= 75` charted places (`locations + floor(buildings / 5) + automap`). |
| `tr16_magnate` | **Merchant Sovereign** | `>= 500,000` gold (carried + all regional bank accounts). |
| `tr17_landed_sovereign` | **Landed Sovereign** | Own `>= 1` home (vanilla house deeds or offline homes). |
| `tr22_sea_captain` | **Captain of the Seas** | Own a ship. |
| `tr18_living_legend` | **Living Legend of Tamriel** | Peak faction reputation `>= +50`. |
| `tr06_hero_iliac` | **Shaper of History** | `>= 50` completed quests (excludes `_APOTHEO`). |

---

## Two Mutually Exclusive Entry Paths

Once you reach **`16 / 24` Fate Weight**, two mutually exclusive paths open. Both converge on the exact same Direnni Tower trial:

### 1. The 13-Artifact Sacrifice (`source: 'artifacts'`)
* Open **Pause → Apotheosis → Overview** outside Mantellan Crux and select **`13` distinct unequipped canonical artifacts** (out of the `23` canonical artifacts `0..22`). Equipped items are excluded so you cannot accidentally shatter worn gear.
* **Consequence:** Permanently destroys the 13 sacrificed artifacts, permanently locks the Mantella usurpation fork, and inflicts **`-30` initial Pantheon standing** with any Daedric Prince whose signature artifact was shattered.
* **Canonical Artifacts (`0..22`):** Masque of Clavicus Vile (`0`), Mehrunes' Razor (`1`), Mace of Molag Bal (`2`), Hircine's Ring (`3`), Sanguine's Rose (`4`), Oghma Infinium (`5`), Wabbajack (`6`), Ring of Namira (`7`), Skull of Corruption (`8`), Azura's Star (`9`), Volendrung (`10`), Warlock's Ring (`11`), Auriel's Bow (`12`), Necromancer's Amulet (`13`), Chrysamere (`14`), Lord's Mail (`15`), Staff of Magnus (`16`), Ring of Khajiit (`17`), Ebony Mail (`18`), Auriel's Shield (`19`), Spell Breaker (`20`), Skeleton's Key (`21`), Ebony Blade (`22`).

### 2. The Mantella Usurpation Fork (`source: 'mantella'`)
* When touching the Mantella at the end of Quest `S0000016` inside **Mantellan Crux** with `>= 16 / 24` Fate Weight (and Artifact Sacrifice not yet used), a prompt asks whether to usurp its divinity:
  * **Yes (Usurp its divinity):** Marks `S0000016` as `'usurped'` and tombstones it, teleports you outside **Shedungent**, and ignites the Dragon Break temporal storm.
  * **No (Fulfill the Mortal Ending):** Proceeds with the normal ending and **permanently closes** the Mantella fork (leaving only the 13-Artifact Sacrifice path).
* Touching the Mantella with `< 16 / 24` Fate Weight does **not** lock the fork - you may return once `16 / 24` is achieved.

---

## Stage 1: The Path of CHIM Trial

### 1. Global Dragon Break Temporal Storm
While Stage 1 is active (`questline_active` until the Shadow is defeated), every exterior across Tamriel undergoes a Dragon Break storm:
* Every **`5 seconds`**, the weather shifts to a new random state (`sunny`, `cloudy`, `overcast`, `fog`, `rain`, `thunder`, `snow`).
* Simultaneously, the visual sky clock and season jump randomly within **`±360 days`** of when the storm began.
* The storm dispels automatically the moment the Shadow of the Agent falls.

### 2. Direnni Tower 13-Wave Exterior Siege
* Approaching and activating the **Direnni Tower** entrance door locks the door and triggers **Wave 1** of a **`13`-wave exterior Daedric siege**.
* Each wave advances when all foes in the wave are slain or after a **`35-second`** fallback timer.
* **Retreat / Leash:** Moving more than **`95m`** from the tower or leaving the exterior cleanly abandons the siege (despawning all siege foes with no corpses or kill credit and resetting progress to wave `0`).
* **Wave Progression (`suppressInfighting`, `team = 'Daedra'`, elites from Wave `8+`):**
  * **Waves 1–3:** Imps, Fire/Frost Daedra, Daedroth.
  * **Waves 4–6:** Daedra Seducers, Atronachs.
  * **Waves 7–9:** Daedra Lords, Battlemages, Sorcerers.
  * **Waves 10–12:** Daedra Lords, Liches, Ancient Liches.
  * **Wave 13:** Daedra Lord, Daedra Seducer, Fire Atronach, and the boss **Aspect of the Tower**.
* **Wave 13 Boss - Aspect of the Tower:** Giant `DaedraLord` (`3x` size, `maxHealth = max(1200, (lvl + 12) * 95)`, `>= 1.85x` damage, 2 boss traits, `noInstakill`). Cycles through **3 Phases**:
  * **Phase 1 (`> 66%` HP):** Telegraph slam (`3.4m` radius, `38` damage).
  * **Phase 2 (`<= 66%` HP):** Summons 2 Daedra adds; slams deal `50` damage (`3.4m / 3.8m`).
  * **Phase 3 (`<= 33%` HP):** `+15%` damage scale, summons 3 adds, double telegraph slams (`4.0m / 4.2m`, `62` damage).
* Defeating the Aspect clears leftover siege foes and unlocks the Direnni Tower entrance.

### 3. Direnni Tower Interior Hard Mode & Zero Stone
* Inside Direnni Tower during Stage 1, every enemy receives forced boss traits (`100%` 1st trait, `50%` 2nd trait), **`1.6x` Max Health**, and **`1.3x` Damage**.
* Every **`26 seconds`**, if fewer than `6` foes remain alive, a hard-mode Daedra reinforcer spawns (`7.5m` away).
* Locate and activate the **Zero Stone** (`12–55m` from the dungeon entrance) to warp directly into the **Clockwork Orrery**.

### 4. Clockwork Orrery - Shadow of the Agent
* **Boss Reflection:** Mirrors your primary archetype (`Sorcerer`, `Battlemage`, or `Knight`), attributes, and equipped gear (`noLootDrop`), scaled to **`5.2x` your Max Health** (minimum `1,200` HP), `>= 1.75x` damage, 2 boss traits, and `noInstakill`.
* **Anti-Abuse `70%` Damage Resistance:** Resists **all** martial skills `> 100` and **all** magic schools `> 100` (if none exceed `100` in a category, resists your highest skill in that category), multiplying incoming damage from those skills by `0.3`.
* **Victory:** Slaying the Shadow dispels the Dragon Break storm and spawns/activates the **Ascension Conduit** at the Orrery center. Activating the Conduit returns you to Iliac Bay and opens **Pause → Apotheosis → Divine Portfolio** to claim your divinity.

---

## Ascended God Vitals, Immunities & Immortal Rebirth

Upon ascending to Godhood:

* **Permanent Vital Bonuses:** **`+500` Max Health**, **`+500` Max Magicka**, and **`+500` Max Fatigue** (`+32,000` raw internal fatigue), plus **`500` initial Faith** and a full 100% restore on first ascension.
* **Instakill Immunity (`noInstakill` / `divineChampion`):** Aspect of the Tower, Shadow of the Agent, and summoned Divine Champions cannot be insta-killed - instant-death spells and Mehrunes' Razor procs are capped at `10%` of Max HP, Wabbajack polymorph is ignored, and `killall`/`pacifyall` skip them.
* **Immortal Divine Rebirth:**
  * Whenever an Ascended God would suffer lethal damage, death is unconditionally intercepted (bypassing normal respawn settings).
  * **Cost:** **`150 Faith`**. *(If you have `< 150` Faith, Divine Rebirth fails with a notice and mortal death occurs.)*
  * **Effect:** Deducts `150` Faith, restores **100% Health, Magicka, and Fatigue**, purges bleeding and negative effects (`poison`, `disease`, `drainAttribute`, `drainSkill`, `paralyze`, `silence`, continuous damage), plays a golden-white flash, advances the world clock **`+1` day (`+1,440` min)**, ends active combat/sieges, and despawns nearby hostiles without kill credit.

---

## Next Guides in This Section

* **[Faith, Portfolios & Scroll of Aurbis](/apotheosis/faith-and-aurbis)** - Faith economy, Mythic Decay, all 4 Portfolios, Divine Champions, and every Scroll of Aurbis decree.
* **[Pantheon 4X, Cults, Shrines & Wars](/apotheosis/pantheon-cult-wars)** - 16 Pantheon deities, 71-region geopolitics, Underground Sanctuaries, Regional Edicts, Roadside Shrines, Sieges, Religious Wars, and Apotheosis settings.
