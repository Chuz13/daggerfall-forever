# Necromancy & Lichdom

Daggerfall Forever features a complete **Dark Arts & Necromancy** progression path *(Experimental, alpha)* - taking a character from a mortal researcher of forbidden texts to a **Necromancer**, an immortal **Lich**, and finally an **Ancient Lich (Archlich)**.

---

## Progression Path: Mortal → Necromancer → Lich → Archlich

### Stage 1: Mortal → Necromancer
1. **Find the `Grimoire of the Worm`** (item template `585`):
   * Drops from **Liches** (`25%` chance) and **Ancient Liches** (`50%` chance).
2. **Read the Grimoire:**
   * Marks your character as an initiate of the Dark Arts (`necroGrimoireRead`).
   * Immediately grants **9 core spells**: `Animate Dead`, `Mass Animate Dead`, `Corpse Explosion`, `Life Tap`, `Bone Armor`, `Arch-Lichdom`, `Dark Flight`, `Control Undead`, and `Suture Cadaver`.
   * Grants the **Potion Recipe** for the **Elixir of Unlife** (if not already owned).
   * Unlocks **8 necromantic spell effects** in the Spell Maker.

### Stage 2: Necromancer → Lich
You can ascend to Lichdom by drinking the **Elixir of Unlife**.

* **Brewing the Elixir of Unlife:** Requires `Wraith Essence` (`38`), `Ectoplasm` (`39`), `Lich Dust` (`45`), and `Daedra's Heart` (`53`). You can brew it at a Potion Maker or in the field by using `Lich Dust` while carrying all 4 reagents.
* **Ascension Requirements:**
  * `Grimoire of the Worm` read
  * **Pure Mortal Vessel** (no active Vampirism or Lycanthropy)
  * **Level** `>= 20`
  * **Mysticism** `>= 100`
  * **Intelligence** `>= 100`
  * **Willpower** `>= 100`
* **Failure Penalty:** Drinking the Elixir without meeting all requirements deals massive lethal damage (`max(99999, maxHealth * 20)`), killing a mortal caster instantly.

### Stage 3: Lich → Archlich (Ancient Lich)
* **Method:** Cast the **Arch-Lichdom** ritual spell (`52,255`, granted by the Grimoire) or use the safe button in **Pause → Lichdom**.
* **Ascension Requirements:**
  * Must already be an active **Lich**
  * **Level** `>= 30`
  * **Mysticism** `>= 200`
  * **Intelligence** `>= 115`
  * **Willpower** `>= 115`
* **Failure Penalty:** Kills mortals outright; triggers Lich cemetery reconstitution if cast by an ineligible Lich.

### Pause → `Lichdom` Progression Tab
Once you read the `Grimoire of the Worm` (or are already a Lich/Archlich), a dedicated **`Lichdom`** tab unlocks in the Enhanced Pause menu with a live status bar (**Vessel**, **Taint**, **Control Pool**, **Disguise**) and 3 sub-views:
* **Overview:** Active undead mantle benefit cards, Vampirism/Lycanthropy conflict warning banner, and Stage I / Stage II progress summaries.
* **Stage I (Lichdom):** Live 6-prerequisite checklist, 4-reagent tracker, **Distil Elixir of Unlife**, safe **Drink Elixir & Become Lich** button (disabled until eligible so you cannot trigger lethal misfires by accident), and **Recover Formula from Grimoire**.
* **Stage II (Archlich):** Live 5-prerequisite checklist, spellbook/magicka tracker, safe **Perform Arch-Lichdom Ritual** button, and **Inscribe Grimoire Spells** recovery.

*(Ascended Gods can also grant or toggle Lichdom/Archlichdom directly via **Apotheosis Scroll of Aurbis** decrees - see [Faith, Portfolios & Scroll of Aurbis](/apotheosis/faith-and-aurbis) and [Console Commands](/reference/console-commands).)*

---

## Capabilities at Each Stage

### As a Necromancer
* **Corpse Harvesting:** Requires having read `Grimoire of the Worm` (`NecroGrimoireRead`) before the **Harvest Remains** option appears on corpses (non-initiates only see regular beast skinning). Corpses decay through `FRESH` (0–6h), `DECAYING` (6–24h), `SKELETAL` (>24h), and `DESECRATED`. Using a **Skinning Knife** (`603`), **Dagger** (`113`), or **Tanto** (`114`) within `8m` harvests creature reagents, scaled by `1.0 + Mysticism / 100`.
* **Minion Control Pool:**
  * In `stat_scaled` mode (default), capacity is `max(1, floor(INT/20) + floor(WIL/30) + floor(Mysticism/25))`.
  * **Slot Costs:** `Skeleton (1)`, `Zombie (2)`, `Ghost (3)`, `Mummy (4)`, `Flesh Colossus / Cadaver (6)`, `Lich (8)`, `Ancient Lich (12)`.
  * *Note:* Undead enslaved via `Control Undead` do **not** consume your summon capacity pool, though their timer ticks down each magic round.
* **Mana Upkeep & Rebellion (Optional):** When `Minion Magicka Upkeep` is enabled, raised minions drain magicka every `5000 ms` (`4` magicka/round for a Flesh Colossus; paused while resting). If `Minion Rebellion` is enabled and magicka/fatigue hits `0`, excess minions (`usedSlots > floor(WIL / 15)`) may turn hostile.
* **Necromantic Taint & Law:**
  * Taint (`0–100`) applies disposition penalties (`PRISTINE` `0–25`: `0`, `TAINTED` `26–50`: `-10`, `DEFILER` `51–75`: `-25`, `ABOMINATION` `76–100`: `-50`) and decays `-1/day` for mortals. At `taint >= 40`, resting or fast-traveling can trigger **Arkay Witch-Hunter** ambushes.
  * Visible minions in settlements trigger `Criminal_Conspiracy` (`High_Treason` in Hammerfell) unless set to `Feign Death`.
  * **Witnessed Harvest Crime:** Harvesting remains inside a settlement or inhabited interior (open shop, tavern, or residence) while witnessed by any NPC or guard within `77.5m` (`95°` cone LOS) commits **`Assault`**, summons city guards, and warns you (disabled if `Necromancy Social Law` is `Off`).
  * **Breaking Mortal Disguise:** Casting any necromantic spell other than `Mortal Disguise` (or custom necro Spell Maker spells) immediately strips active spell-based `Mortal Disguise` and suppresses worn `Mortal Disguise` enchantments for `2` magic rounds.
* **Undead Command Nexus & Hotkeys:**
  * `Numpad 6` - Open **Undead Command Nexus** (shows Control Pool, Mana Upkeep, Active Minions, and Stance).
  * `Numpad 7` - **Recall to Heel** (Shadow Tether teleport)
  * `Numpad 8` - **Attack / Focus** (nearest hostile within `45m`)
  * `Numpad 9` - **Feign Death / Ambush** (collapses minions to Neutral, hiding them from city law)
  * `Numpad 1` - **Follow** | `Numpad 2` - **Guard** | `Numpad 3` - **Dismiss**

### As a Lich
* **Attributes & Skills:** `INT +25`, `WIL +25`, `PER -30` (suppressed to `0` while disguised); `Mysticism +30`, `Destruction +20`, `Alteration +20`.
* **Vitals & Regen:** `+100` Max HP, `+250` Max Magicka, `+5` Magicka regen per magic round.
* **Immunities & Mitigations:** Immune to Paralysis, Disease, Poison, Drowning, and normal weapons below **Silver** (`minMetalToHit: Silver`). Incoming arrow damage reduced by `50%`. Survival needs (thirst, sleep debt, exposure) and active Climates & Calories survival effects are cleared upon ascension; curing Lichdom resets Necromantic Taint to `0`.
* **Weaknesses & Law:** Vulnerable to holy ground (`holyDamage: true`). Taint locked at `100`. Walking undisguised in a settlement triggers `Treason` (`High_Treason` in Hammerfell).
* **Immortality (Reconstitution):** Physical death is intercepted - your vitals restore to `100%`, curses/drains clear, `30` in-game days pass (`43,200` min), and you reconstitute at the nearest cemetery with zero gold/permadeath penalties.
* **Innate Spells:** `Paralyzing Touch` and `Mortal Disguise`.

### As an Archlich (Ancient Lich)
* **Attributes & Skills:** `INT +50`, `WIL +50`, `PER -60` (suppressed to `0` while disguised); `Mysticism +60`, `Destruction +40`, `Alteration +40`.
* **Vitals & Regen:** `+250` Max HP, `+500` Max Magicka, `+15` Magicka regen per magic round.
* **Upgraded Defenses:** Immune to weapons below **Mithril** (`minMetalToHit: Mithril`) and incoming arrow damage reduced by `80%`.
* **Innate Spells:** Retains Lich innate spells plus gains `Finger of Death`.

---

## Necromantic Spells

| Spell | School / Range | Craftable | How It Works |
| :--- | :--- | :---: | :--- |
| **Animate Dead** | Mysticism / Touch | Yes | Consumes a **humanoid** corpse (or conjures a skeleton in `abstract` mode). Tier scales with `Willpower + Magnitude` (`0` Skeleton, `40` Zombie, `80` Ghost, `130` Mummy, `190` Lich) and upgrades 1 tier if carrying matching reagents (up to `Ancient Lich` with 2x Lich Dust/Wraith Essence). |
| **Mass Animate Dead** | Mysticism / Caster Only | Yes | High-mana AoE (`280 SP` at Mysticism `100`). Raises all **humanoid** corpses within `clamp(Mysticism * 0.1, 2m, 30m)` (scales past `100`), rolling chance, tier, reagents, and capacity per corpse; in `abstract` mode with no humanoid corpses, conjures skeletons up to remaining capacity. |
| **Corpse Explosion** | Destruction / Area at Range | Yes | Detonates nearest unconsumed corpse within `2m` for `maxHealth * 5` Poison AoE damage in a `6m` radius (hits hostiles only, never self/allies/minions). |
| **Life Tap** | Restoration / Target at Range | Yes | Siphons HP from target to caster. Casting on self or an allied minion drains up to 100% of the minion's HP to heal you. |
| **Bone Armor** | Alteration / Caster Only | Yes | Grants a damage-absorbing shield. If you have an active Skeleton minion, sacrifices it to set shield HP to `round(skeleton.maxHealth * 3)`. |
| **Control Undead** | Mysticism / Target at Range | Yes | Temporarily enslaves an enemy undead for `duration` rounds if spell magnitude meets its tier (`10` Skeleton up to `65` Ancient Lich). Does not use summon capacity. |
| **Mortal Disguise** | Illusion / Caster Only | Yes (Lich-innate) | Suppresses Lich Personality penalty, zeroes trade taint penalty, and prevents settlement Lichdom law violations for `duration` rounds. Broken immediately if you cast any other necromantic spell. |
| **Suture Cadaver** | Mysticism / Caster Only | Yes | Consumes `3–5` corpses within `8m` (requires `6` control slots) to stitch a **Flesh Colossus** (`maxHealth = max(250, round(sum(corpse.maxHealth) * 0.8))`). |
| **Arch-Lichdom** | Mysticism / Caster Only | No | Ritual spell (`500` base magicka at Mysticism 200) to ascend from Lich to Ancient Lich. |
| **Dark Flight** | Alteration / Caster Only | No | Grimoire-granted Levitate (`5 SP` minimum cost). |
| **Paralyzing Touch** | Illusion / Touch | No | Lich-innate Paralyze on touch (`5 SP` minimum cost). |
| **Finger of Death** | Destruction / Target at Range | No | Ancient Lich-innate single-target Disintegrate (`50` base magicka). |

---

## Necromancy Settings

Located in **Settings → DFF → Dark Arts & Necromancy (Experimental, alpha)**.

| Setting | Options | Default | Effect |
| :--- | :--- | :---: | :--- |
| **Dark Arts & Necromancy** (`necroEnabled`) | `On` / `Off` | `On` | Master toggle for necromancy upkeep and taint ticks. |
| **Corpse Requirement** (`necroCorpseReq`) | `Physical Corpses` \| `Abstract (Anywhere)` | `Physical Corpses` | `Abstract` allows `Animate Dead` to conjure a skeleton from thin air without a corpse. |
| **Undead Control Capacity** (`necroCapMode`) | `Stat-Scaled` \| `Fixed Limit (4 Minions)` | `Stat-Scaled` | `Stat-Scaled` uses INT/WIL/Mysticism; `Fixed` uses `necroFixedCap` (default `4`, `1–10`). |
| **Minion Magicka Upkeep** (`necroMinionUpkeep`) | `On` / `Off` | `Off` | Drains magicka every 5s per active raised minion (paused while resting). |
| **Minion Rebellion on Depletion** (`necroMinionRebellion`) | `On` / `Off` | `Off` | Allows excess minions to turn hostile if magicka/fatigue hits `0`. |
| **Necromancy Social Law** (`necroSocialLaw`) | `Hardcore` \| `Mild` \| `Off` | `Hardcore` | `Off` disables city guard infractions for undisguised Liches, visible minions, and witnessed corpse harvesting in settlements. |
| **Witch-Hunter Purifiers** (`necroWitchHunters`) | `Frequent` \| `Rare` \| `Off` | `Frequent` | Controls Arkay purifier ambushes during rest/travel at `taint >= 40` (`Rare` halves chance). |
