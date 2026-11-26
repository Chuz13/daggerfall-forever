# Combat Balance & Modular Difficulty

**Daggerfall Forever (DFF)** rebalances single-player combat around lethal, tactical encounters rather than bloated damage sponges. Every pillar of the combat curve is modular and live-configurable under **Settings → Combat → Enemies** (with immediate effect on newly spawned enemies and encounters).

---

## 1. Difficulty Presets (`difficultyPresets.js`)

Four one-click presets configure all 7 combat balance controls together (switching any individual row automatically shows **Custom**):

| Setting | `Classic DFU` | `Balanced DFF` *(Default)* | `Veteran` | `Hardcore` |
| :--- | :---: | :---: | :---: | :---: |
| **Combat Lethality** (`combat-lethality`) | `Classic (1.0x)` | `Classic (1.0x)` | `Sharp (1.25x dmg)` | `Lethal (1.45x dmg)` |
| **Regional Risk Zones** (`regional-risk-zones`) | `Off (Uniform)` | `Standard` | `Standard` | `Harsh` |
| **Hero Threat Scaling** (`hero-threat-scaling`) | `Classic (Lv.10+)` | `Early (Lv.5+)` | `Early (Lv.5+)` | `Early (Lv.5+)` |
| **Tactical Stagger & Tells** (`tactical-stagger`) | `Classic (Lv.10+, Soft)` | `Tactical (Lv.5+, Hard)` | `Tactical (Lv.5+, Hard)` | `Tactical (Lv.5+, Hard)` |
| **Tactical Enemy Packs** (`tactical-packs`) | `Off` | `On` | `On` | `On` |
| **Wilderness Mob Traits** (`living-mob-traits`) | `Off (0)` | `Mid (2)` | `Mid (2)` | `High (3)` |
| **Dungeon Mob Traits** (`living-dungeon-mob-traits`) | `Off (0)` | `Mid (2)` | `Mid (2)` | `High (3)` |

---

## 2. Combat Lethality (`combatLethality.js`)

Raises enemy damage while keeping enemy health multipliers modest so high-tier combat stays dangerous without turning fights into attritional sponges:

| Preset | Enemy Damage | Enemy Health |
| :--- | :---: | :---: |
| **`Easy`** | `0.50x` | `0.50x` |
| **`Classic`** *(Default)* | `1.00x` | `1.00x` |
| **`Sharp`** | `1.25x` | `1.05x` |
| **`Lethal`** | `1.45x` | `1.10x` |
| **`Brutal`** | `1.75x` | `1.20x` |

* **Direnni Tower Hard-Mode Attenuation:** Direnni Tower's extra `1.3x` damage multiplier automatically attenuates by `baseMult / sqrt(damageMult)` whenever Combat Lethality is above `Classic`, preventing unfair one-shots on `Lethal` or `Brutal`.

---

## 3. Hero Threat Scaling (`heroThreat.js`)

Vanilla Daggerfall monsters stop scaling past their bestiary row, creating a steep mid-game difficulty drop as player stats, skills, and gear compound. **Hero Threat Scaling** scales foes in dungeons and the wilderness to answer player progression (two-thirds damage, one-third health):

| Mode | Level Band | Level Scaling *(per level, compounding)* | Renown Band | Renown Scaling *(per Renown, compounding)* |
| :--- | :---: | :---: | :---: | :---: |
| **`Off (Vanilla)`** | — | `1.00x` | — | `1.00x` |
| **`Classic (Lv.10+)`** | `10–30` | `+7.0%` dmg / `+4.0%` HP | `15–50` | `+1.0%` dmg / `+0.5%` HP |
| **`Early (Lv.5+)`** *(Default)* | `5–30` | `+5.6%` dmg / `+3.2%` HP | `8–50` | `+0.85%` dmg / `+0.42%` HP |

* `Early (Lv.5+)` closes the mid-game dip smoothly starting at Level 5 instead of waiting for Level 10.
* Offline saves do not use online Firmament Renown, so scaling is driven by character level (or mentored level when mentoring).

---

## 4. Regional Risk Zones (`regionRisk.js`)

All **71 regions** (62 Iliac Bay regions + 9 outer Tamriel provinces) are assigned to one of 4 threat tiers. **Travel Map** tooltips and **Bounty Board** headers display each region's live threat tier and multipliers whenever Regional Risk Zones is active (`Standard` by default, or `Harsh` / `Off`).

| Tier | Regions | `Standard` *(Default)* | `Harsh` |
| :--- | :--- | :--- | :--- |
| **Tier I — Heartland** | Core kingdoms (e.g., Daggerfall, Wayrest, Sentinel, Anticlere, Betony) | `1.00x` dmg, `1.00x` HP, `+0%` elite, minLv `1` | `1.05x` dmg, `1.00x` HP, `+0%` elite, minLv `1` |
| **Tier II — Frontier** | Borderlands, coasts, forests, High Rock, Hammerfell, Sumurset Isle, Cyrodiil | `1.12x` dmg, `1.08x` HP, `+3%` elite, minLv `5` | `1.22x` dmg, `1.15x` HP, `+5%` elite, minLv `6` |
| **Tier III — Wilds** | Alik'r Desert, Dragontail & Wrothgarian Mountains, Orsinium Area, Skyrim, Valenwood, Elsweyr | `1.24x` dmg, `1.18x` HP, `+6%` elite, minLv `10` | `1.38x` dmg, `1.30x` HP, `+10%` elite, minLv `12` |
| **Tier IV — Perilous** | Devilrock, Cybiades, Morrowind, Black Marsh | `1.36x` dmg, `1.28x` HP, `+10%` elite, minLv `14` | `1.55x` dmg, `1.45x` HP, `+15%` elite, minLv `16` |

---

## 5. Tactical Stagger, Level 5+ Tells & Live Reflexes (`blowEffects.js`, `tells.js`)

Under **`Tactical (Lv.5+, Hard)`** *(Default)*, Enhanced AI telegraphed combat engages earlier and punishes mistimed trades on both sides:

* **Level 5+ Telegraphed Blows:** Ordinary foes begin telegraphing attacks at **Level 5+** (down from Level 10 in `Classic (Lv.10+, Soft)`).
* **Hard Player Stagger:** Landing telegraphed blows (`lunge`, `sweep`, `slam`, `ring`, `charge`, `leap`) inflict a hard interrupt on the player:
  * `0.45s` swing/cast lock
  * `0.55s` movement slow (`60%` walk speed unless mounted)
  * `+15%` damage taken for `1.0s`
  * `4.5s` anti-stunlock guard after the vulnerability window ends
  * **Iron Knockdowns:** Iron blows (`slam`, `ring`, `charge`, `lunge`, `sweep` from heavy/massive bodies or elites) knock the player down for `0.9s` with a `5s` knockdown guard.
* **Rebalanced Enemy Poise & Stagger:** Breaking an enemy's wind-up poise staggers them for `0.9s` (light), `0.8s` (medium), `0.65s` (heavy), or `0.5s` (massive), followed by a `6s` stagger immunity guard. Staggered foes take `1.1x` damage (`1.12x` while overreached after a missed blow).
* **Live Reflexes Scaling:** Adjusting **Reflexes** (`Very High` `0` to `Very Low` `4`) mid-playthrough under `Combat › Enemies` (or via `reflexes`) dynamically scales telegraphed blow wind-up (`0.88x`–`1.12x`) and cooldown (`0.84x`–`1.16x`).

---

## 6. Tactical Enemy Packs (`tacticalPacks.js`) & `BOSS_TRAITS` (`bossTraits.js`)

### Tactical Enemy Packs (`On` by Default)
Bandit Camps, Road Checkpoints, Nemesis squads, Urban/War Skirmishes, and Crisis/Bounty Forts compose mixed tactical roles instead of uniform mobs:
* **Humanoids:** Commanders (`Knight` / `Barbarian`), Frontline Tanks (`Warrior` / `Barbarian`), Archers/Crossbowmen (`Archer` / `Ranger`), and Casters (`Battlemage` / `Spellsword` / `Nightblade`).
* **Monster Families (Crisis Forts):** Stay faithful to their family while adding tactical variety — **Orcs** (`OrcWarlord`, `OrcSergeant`, `OrcShaman`, `Orc`), **Undead** (`SkeletalWarrior`, `Ghost`/`Wraith`, `Mummy`), and **Daedra** (`Daedroth`, `FireDaedra`, `FrostDaedra`, `DaedraSeducer`).

### `BOSS_TRAITS` Reference (11 Traits)
Elites, Nemesis hunters, and trait-rolled regular mobs can carry up to 1–2 traits (`bladeturning` and `stoneskin` are mutually exclusive):

| Trait | Effect |
| :--- | :--- |
| **`warded`** | `30%` max HP ward absorbs every blow first; begins regrowing `10s` after the last hit (refills over `4s`). |
| **`flameproof`** / **`frostproof`** / **`venomproof`** / **`stormproof`** / **`spellproof`** | Spells of the matching element (`Fire`, `Frost`, `Poison`, `Shock`, `Magic`) deal `25%` damage. |
| **`bladeturning`** | Blades and arrows deal `50%` damage; blunt weapons and fists deal full damage. |
| **`stoneskin`** | Blunt weapons and fists deal `50%` damage; blades and arrows deal full damage. |
| **`curbing`** | No single blow can deal more than `15%` max HP (`5%` for raid leaders). |
| **`wrathful`** | Deals `1.6x` damage once below `45%` HP or after `25s` of combat (resets after `30s` out of combat). |
| **`thorned`** | Reflects `20%` of landed melee and arrow damage back at the striker. |

* **Regular Mob Trait Odds:** Controlled by `Wilderness Mob Traits` and `Dungeon Mob Traits` (`Off` `0%`, `Light` `8% + 0.5%/lvl` cap `25%`, `Mid` `16% + 1%/lvl` cap `50%`, `High` `30% + 1.5%/lvl` cap `75%`; `High` at Lv `15+` has a `15%` chance for 2 traits).

---

## 7. Living Tamriel Scaling, 3-Tier Nemesis & Stat Overcap (>100)

* **Unified Living Tamriel Scaling:** Camps, checkpoints, skirmishes, and forts participate in Hero Threat, Regional Risk, Combat Lethality, Elite/Champion rolls, and Boss Traits.
* **3-Tier Nemesis Overhaul (`nemesisHost.js`):** Nemesis hunters spawn at `playerLevel + 2` (minimum Lv `3`) with real adventurer gear, elite promotion, and role-balanced hunter minions (`15%` elite chance):
  * **Tier 1 (Lv `3–7`):** `1.8x` HP, `1.35x` damage, `1` Boss Trait
  * **Tier 2 (Lv `8–15`):** `2.3x` HP, `1.55x` damage, `2` Boss Traits
  * **Tier 3 (Lv `16+`):** `2.8x` HP, `1.75x` damage, `2` Boss Traits
* **Gear, Set & Passive Stat Overcap (>100):** Equipment affixes, Aetheric/item sets, racial passives, and seat edicts can push effective attributes above the classic `100` cap across combat, magic, and derived calculations.

---

## Balance Console Commands

| Command | Syntax | Purpose |
| :--- | :--- | :--- |
| `difficulty` | `difficulty [status\|classic\|balanced\|veteran\|hardcore]` | Inspect or apply a modular difficulty preset. |
| `lethality` | `lethality [status\|easy\|classic\|sharp\|lethal\|brutal]` | Inspect or set Combat Lethality and view Hero Threat multipliers. |
| `risk` | `risk [status\|off\|standard\|harsh\|<regionIndex>]` | Inspect or set Regional Risk Zones, or check any region (`0..70`). |
| `reflexes` | `reflexes [status\|0..4\|veryhigh\|high\|average\|low\|verylow]` | Inspect or set player Reflexes live with wind-up/cooldown multipliers. |
| `stagger` | `stagger [status\|me\|clear]` | Inspect, trigger, or clear hard player stagger state. |
| `testtrait` | `testtrait <trait> [mob]` | Spawn an elite foe with a specific `BOSS_TRAITS` trait. |
| `give_stat_gear` | `give_stat_gear [kit \| <attribute> [1..15]]` | Grant a 10-piece Stat Overcap QA Kit or a single stat ring. |
| `encounter` | `encounter [random\|wild\|camp\|merchant\|adv\|bandit\|plea\|nemesis\|checkpoint\|skirmish [EVT_ID]\|war\|naval]` | Trigger any Living Tamriel encounter in exterior world mode. |
