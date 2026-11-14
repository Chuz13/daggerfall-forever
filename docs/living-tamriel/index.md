# Living Tamriel

**Living Tamriel (LT)** is Daggerfall Forever's emergent-world simulation framework *(Experimental, pre-alpha)*. It turns Tamriel into a reactive world of regional crises, highway checkpoints, urban skirmishes, naval clashes, wandering adventurers, and reputation-driven consequences—while keeping save footprints tiny (`< 2 KB` of scalar state and cooldowns).

---

## Does It Work Across All of Tamriel?

**Yes.** Living Tamriel's regional state engine (`regionState.js`) tracks **all 71 regions**—the **62 Iliac Bay regions** plus the **9 continental Tamriel provinces**. World coordinates outside Iliac Bay map automatically via theatre lookup (`getRegionIndexAt`).

* **Vanilla `regionConditions` Bridge:** On daily ticks (`1440` in-game minutes/day), LT synchronizes with Daggerfall's 26 vanilla `REGION_FLAGS` (`0..25`), translating them into macro crises (`WAR`, `PLAGUE`, `FAMINE`, `CIVIL_STRIFE`) and phases (`START`, `MID`, `END`).
* **Dynamic Regional Tension (`5–100`):** Tension is calculated live from regional faction stability, diplomatic ally/enemy pressure, and active crisis flags.
* *(Note: The virtual adventurer pool defaults to the 62 Iliac Bay regions when initialized with `BAY_REGION_COUNT` and cycles across them during daily travel.)*

---

## What Players Should Expect

### 1. Regional Crises & 39-Event Matrix
* **39 dynamic encounters** spanning 11 categories: `WAR` (5), `FAMINE` (5), `PLAGUE` (4), `OCCULT` (4), `CRIME` (4), `FAITH` (4), `POLITICS` (3), `COMMERCE` (2), `HOLIDAY` (4), `ARCANE` (1), and `MUNDANE` (3).
* Encounters match your location type, active regional crises, and settlement prosperity (`LOW`, `MID`, `HIGH` based on building quality).
* **4-Stance Choices & Typed Rolls:** Every crisis event offers 4 stances—side with defenders, side with attackers, stay neutral, or resolve peacefully via gold or skill checks (`Etiquette`, `Streetwise`, `Orcish`, `Mercantile`, `Restoration`, `Stealth`, `Medical`, `Thaumaturgy`, `Daedric`) with 5 outcome degrees (`TRIUMPH` to `CRITICAL_FAILURE`). Outcomes nudge vanilla faction power and crisis endurance.
* **Ambient NPC Pleas:** Citizens may approach you with crisis-driven requests (`PLAGUE_CURE`, `FAMINE_BREAD`, `WAR_REFUGEE`, `ESCORT_REQUEST`) at `10%` (Light), `25%` (Mid), or `40%` (High) base chance.

### 2. Urban Skirmishes & Quarantine Gates
* During `WAR.MID`, `CIVIL_STRIFE.MID`, or active regional crises, contained street clashes break out between `SkirmishLaw` and `SkirmishRebels` (max 1 per town scene, `10m` doorway clearance, isolated teams so stray hits do not falsely trigger player crimes).
* During severe plague outbreaks (`PLAGUE.MID`), city gates can be barred around the clock with outside relief tents.

### 3. Road Checkpoints & Travel Interruptions
* **Road Checkpoints:** During `WAR` or `CIVIL_STRIFE`, military checkpoints spawn on highways. Knightly Order members (`rank > 0`), players with regional reputation `>= 15`, or `Nobility >= 20` / `GENERIC_KNIGHTLY_ORDER >= 20` pass free. Others pay a toll (`50–99` gold), use diplomacy, or fight. High `Underworld (>= 25)` or low `Commoners (<= -20)` triggers baggage inspections (`50g` fine per stolen item). Passing grants a **24-hour** regional transit pass.
* **Travel Interruptions:** Fast travel and overworld journeys can be interrupted by `PEACEFUL_CARAVAN` (`40%`), `ROAD_DILEMMA` (`30%`), or `AMBUSH` (`30%`), with base danger scaling by tier (`5%` Light, `12%` Mid, `22%` High) plus regional tension minus Luck.

### 4. Naval Incidents
* At sea, naval squadrons (`LAW` vs `PIRATES`) clash `200–300m` from the player (`1–2` ships/side on Light, `2–4` or `5` at war on Mid, `3–6` on High). Approaching within `40m` prompts a side-allegiance choice.

### 5. Adventurer Simulation, Duels & Loot
* A pool of virtual adventurers (`13` per region default, up to `30`) across 12 classes and 7 traits (`HONORABLE`, `ARROGANT`, `ENVIOUS`, `CUTTHROAT`, `DUELIST`, `MERCENARY`, `CAUTIOUS`) delves dungeons, levels up to `45`, and gears up across tiers `1–9`.
* Cleared dungeons enter a `3–5` day cooldown. Failed delves (`25%` base demise chance) leave `fallenRemains` loot in boss chests.
* **Quest Protection:** `allowQuestCompetition` is disabled—active quest dungeons and main story dungeons are immune to adventurer interference.
* **Wandering Road Adventurers:** Meet non-hostile adventurers on highways, at camps, fighting monsters, or returning with spoils. You can share intel, recruit them as a **24-hour** companion, wager on a spar, or extort spoils.

### 6. Surrender / Yield & Nemesis System
* **Surrender / Yield:** In LT encounters and checkpoints, you can yield. Ransom is `25%` of your gold (scaled by bribe multiplier and clamped between `max(25, level * 15)` and `level * 80`). Paying halves fatigue (`ROBBED`); if you cannot pay (`BEATEN_PAUPER`), all gold is taken and Health/Fatigue drop to `10%`.
* **Nemesis Encounters:** 6 persistent archetypes (`BOUNTY_HUNTER`, `SHADOW_ASSASSIN`, `GLORY_CHALLENGER`, `GRUDGE_AVENGER`, `ARCANE_RIVAL`, `CHAOTIC_MARAUDER`) track you based on legal/faction reputation and level, resolvable via duel, bribe, intimidation, or pacification.

### 7. Reputation Consequences Framework (RCF) & Bounty Forts
* **RCF:** Reputation affects merchant prices/fencing, house purchase refusal (`Nobility <= -20`), shipyard refusal (`Merchants <= -30`), temple refusal (`<= -20`), soul gem locks (`MagesGuild < 0` or `< 25` for `>= 250` soulPts), tavern surcharges/refusal, jury bias (`-25..+25`), and 16 threshold-unlocked town rumors.
* **Bounty & Fort Assaults:** Notice boards rebalance toward wilderness contracts (`70%`, `3x–5x` payout) and dungeon contracts (`30%`, `5x–10x` payout). Regions in `WAR`, `CIVIL_STRIFE`, or `PLAGUE` offer **Fort/Outpost Assault** contracts that cut regional tension by `15` and advance crises toward `END`.

---

## Cooldowns Summary

| System | Cooldown / Duration |
| :--- | :--- |
| Town / Location Events & Skirmishes | `4320` min (`3` in-game days) |
| Travel Interruptions | `360` min (`6` in-game hours) |
| Ambient NPC Pleas | `720` min (`12` in-game hours) |
| Checkpoint Transit Pass | `1440` min (`24` in-game hours) |
| Recruited Adventurer Companion | `1440` min (`24` in-game hours) |
| Adventurer-Cleared Dungeon | `3–5` in-game days |

---

## Living Tamriel Settings

All UI settings are located in **Settings → DFF → Living Tamriel (Experimental, pre-alpha)**.

### 4-Tier Presence Controls (`Off` / `Light` / `Mid` / `High`)

| Setting | Default | Effect |
| :--- | :---: | :--- |
| **Political & Regional Crises** (`livingPolitical`) | `Mid (2)` | Drives regional transitions between peace, war, plague, and civil strife. |
| **Quarantine Gates** (`livingQuarantine`) | `High (3)` | Bars city gates during `PLAGUE.MID` and spawns outside relief tents. |
| **Urban Skirmishes** (`livingUrban`) | `Mid (2)` | Spawns street clashes between watch and insurgents during war/strife/crises. |
| **Dynamic Bounties** (`livingBounties`) | `Mid (2)` | Rebalances bounty boards toward wilderness (`70%`) and high-payout contracts that reduce regional tension. |
| **Rival Adventurers** (`livingAdventurers`) | `Mid (2)` | Simulates virtual adventurers delving dungeons, leveling, and leaving remains in boss chests. |
| **Wandering Road Adventurers** (`livingRoadAdventurers`) | `Mid (2)` | Spawns non-hostile adventurers on roads and in camps (`12%`/`24%`/`40%` at 3D sites). |
| **Nemesis & Challengers** (`livingNemesis`) | `Mid (2)` | Dispatches persistent hunters, assassins, and rivals based on reputation and deeds. |
| **Travel Interruptions** (`livingTravel`) | `Mid (2)` | Allows journeys/fast travel to be interrupted by caravans, dilemmas, or ambushes. |
| **Roadside Camps & Checkpoints** (`livingCamps`) | `Mid (2)` | Spawns roadside camps, patrol outposts, traveler tents, and wartime checkpoints. |
| **Naval Incidents** (`livingNaval`) | `Mid (2)` | Spawns fleet skirmishes at sea (`1–2` / `2–4(5)` / `3–6` ships per side). |
| **Wilderness Mob Traits** (`livingMobTraits`) | `Mid (2)` | Grants exterior foes and camps level-scaled combat traits and shields. |
| **Dungeon Mob Traits** (`livingDungeonMobTraits`) | `Mid (2)` | Grants dungeon monsters and class enemies level-scaled combat traits and shields. |

### Scale & Loot Policy Controls

| Setting | Options | Default | Effect |
| :--- | :--- | :---: | :--- |
| **Encounter Scale** (`livingEncounterScale`) | `Low (x1)` \| `Mid (x2)` \| `High (x4)` | `Low (1)` | Multiplies squad sizes, packs, and skirmish armies. |
| **Urban Skirmish Loot** (`livingUrbanLootMode`) | `Zero-Loot` \| `Supplies & Gold` \| `Full Loot` | `Zero-Loot` | Controls corpse loot on urban skirmish fighters (economy guard by default). |
| **Wilderness Loot** (`livingWildernessLootMode`) | `Full Loot` \| `Supplies Only` | `Full Loot` | Controls loot dropped by bandit camps, marauders, and checkpoints. |
| **Adventurer Corpse Loot** (`livingAdventurerLootMode`) | `Empty` \| `Supplies` \| `Standard` \| `Full Gear` | `Full Gear` | Controls equipment dropped by defeated adventurers (takes effect immediately). |

*(Internal config keys not exposed in the UI: `livingWilderness` defaults to `2`, `livingReputationConsequences` defaults to `3` / `1.5x` scaling, and `livingQuestCompetition` is locked `false`.)*
