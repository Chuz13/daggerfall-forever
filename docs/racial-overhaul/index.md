# Racial Overhaul (All 8 Playable Races)

**Daggerfall Forever** includes an optional, live-toggleable **Racial Overhaul** designed to give every playable race in the Iliac Bay distinct combat identities, elemental/status profiles, and lore-accurate passive abilities without breaking classic Daggerfall compatibility.

---

## Toggle & Live Compatibility

* **Location:** **Settings → DFF → Races & Character → Racial Overhaul** (`feat:racial-overhaul`, pref `racialOverhaul`).
* **Default:** **`On`** (takes effect immediately).
* **Live Toggle Rescaling:** Turning Racial Overhaul `On` or `Off` mid-playthrough immediately recomputes entity modifiers and social standing, and proportionally rescales current/max **Health**, **Magicka**, and **Fatigue** (`keepFraction`) without stat stacking or save corruption. Turning it `Off` restores classic Daggerfall racial rules.
* **Compound Templates & Tolerances:** Works cleanly alongside Vampirism and Lycanthropy compound birth templates. Racial immunities (High Elf Paralysis Immunity, Argonian Poison Immunity) still respect career `LowTolerance` / `CriticalWeakness` disadvantages.

---

## Favored Weapon Scaling (DPS-Homogenized)

Six of the eight races gain level-scaled **Hit** and **Damage** bonuses with their favored weapon skills (applied in both classic combat formulas and Physical Combat & Armor Overhaul, and shown live in the Character Stats Card):

* **To-Hit Bonus (all favored skills):** `+floor(level / 3) + 2`
* **Damage Bonus (homogenized by weapon speed/type):**
  * **Short Blade & Hand-to-Hand** *(including Hand Wraps)*: `+floor(level / 6) + 1`
  * **Long Blade:** `+floor(level / 5) + 1`
  * **Axe & Blunt Weapon:** `+floor(level / 4) + 1`
  * **Archery:** `+floor(level / 3) + 1`

*(Bretons and High Elves have no favored weapon bonuses.)*

---

## All 8 Playable Races

| Race | Favored Weapons | Resistances & Immunities | Passives & Special Mechanics |
| :--- | :--- | :--- | :--- |
| **Breton** | None | `+30%` Magic Resistance | `15%` Spell Absorption; `-15%` spell cost for pure Restoration / Alteration / Mysticism spells; `+10` Etiquette & Mysticism; `+10` Scholars & Nobility standing *(outside gear cap)*. |
| **Redguard** | Long Blade, Short Blade | `+30%` Poison & Disease Resistance | `+15%` max Fatigue (`1.15x`); `-25%` movement Fatigue drain; `-30%` attack swing Fatigue cost (`0.70x`); `+10°` heat tolerance. |
| **Nord** | Axe, Blunt Weapon | `+50%` Frost *(capped `<= 95%`)*, `+30%` Shock Resistance | `+10%` max Health; `+15%` carry weight; `+15°` cold tolerance; **`+25%` melee damage below `35%` Health** *(non-bow attacks)*. |
| **Dark Elf** | Long Blade, Short Blade | `+50%` Fire Resistance *(capped `<= 95%`)* | `+5` Destruction & Short Blade; **Spellsword Resonance** *(1H non-bow weapon, excluding Hand Wraps, with empty off-hand & no off-hand torch)*: `-20%` Destruction cost, `+10%` Destruction spell power, `+10%` cast speed. |
| **High Elf** | None | **Paralysis Immunity**, `-25%` Fire / Frost / Shock Resistance *(weakness)* | `+25%` max Magicka; `+35%` Magicka recovery while resting (`1.35x`, respects `NoRegenSpellPoints`); `+15%` spell power (all schools); `+12%` cast speed. |
| **Wood Elf** | Archery, Short Blade | `+30%` Disease & Poison Resistance | `+10` Stealth; `+10%` bow reload/draw pace; **`+25%` damage vs unaware foes**; **Green Pact**: non-quest wild animals ignore you unless provoked. |
| **Khajiit** | Hand-to-Hand, Short Blade | Classic baseline | `+5` Speed & Agility; `+10` Stealth, Pickpocket & Critical Strike; `-50%` fall damage; automatic **Night Vision** *(soft cool ambient lift in darkness when `sunScale < 0.15`)*. |
| **Argonian** | Blunt Weapon, Archery | **Poison Immunity**, `+50%` Disease Resistance *(capped `<= 95%`)* | `+15` Swimming; `+40%` swim speed (`1.40x`); `+5` natural Armor on all 7 body parts; **Hist Regen** in water *(swimming or wading)* or outdoor rain/thunder (`+2%` max Fatigue per magic round / 5s, `+1` HP every 2nd round / 10s). |

### Notable Mechanic Notes
* **Dark Elf — Spellsword Resonance:** Requires a one-handed non-bow weapon (excluding Hand Wraps) in either hand while the opposite hand is completely empty. Carrying an off-hand torch disables the stance, while a waist lantern keeps it active.
* **Wood Elf — Green Pact:** Non-quest wild animals will not initiate combat with an unprovoked Wood Elf. Striking an animal or hitting it with a hostile spell marks it (and any packmates sharing its camp) as provoked.
* **Nord, Dark Elf & Argonian `50%` Resistances:** Combine a `+30%` racial flag with a `+20%` modifier, capped at `<= 95%` so they never falsely report hard immunity unless your class/career grants it.

---

## UI, Quick Start & Diagnostics

* **In-Game Visibility (26 Languages):** Overhaul trait summaries are shown in Character Creation (Enhanced hover & confirmation, Classic confirmation dialog), the Enhanced Character Sheet, and the Character Stats Card.
* **8-Race Quick Start (Test Room):** Under **Test Room → Race quick start (Gothway Garden)**, spawn any of the 8 races at **Level 1** or **Level 10** outdoors in Gothway Garden with starter weapons (Dagger, Longsword, Battle Axe, Mace, Long Bow + 60 Arrows, Hand Wraps), Leather Cuirass & Buckler, Torch, empty off-hand, and starter spells across Restoration, Alteration, Mysticism, and Destruction.
* **Console & Telemetry (`raceaudit` / `racecheck`):** Run `raceaudit` to verify live invariants, saving throws, `ON ↔ OFF` toggle vital rescaling, and save/load round-trips for your active character, or `raceaudit all [lvl]` to run the full 8-race verification matrix. Diagnostic snapshots also record `systems.racialOverhaul`.
