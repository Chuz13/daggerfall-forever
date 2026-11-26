# Living Tamriel

**Living Tamriel (LT)** is Daggerfall Forever's emergent-world simulation framework *(Experimental, pre-alpha)*. It turns Tamriel into a reactive world of regional crises, highway checkpoints, urban skirmishes, naval clashes, wandering adventurers, and reputation-driven consequences - while keeping save footprints tiny (`< 2 KB` of scalar state and cooldowns).

---

## Does It Work Across All of Tamriel?

**Yes.** Living Tamriel's regional state engine (`regionState.js`) tracks **all 71 regions** - the **62 Iliac Bay regions** plus the **9 continental Tamriel provinces**. World coordinates outside Iliac Bay map automatically via theatre lookup (`getRegionIndexAt`).

* **Vanilla `regionConditions` Bridge:** On daily ticks (`1440` in-game minutes/day), LT synchronizes with Daggerfall's 26 vanilla `REGION_FLAGS` (`0..25`), translating them into macro crises (`WAR`, `PLAGUE`, `FAMINE`, `CIVIL_STRIFE`) and phases (`START`, `MID`, `END`).
* **Dynamic Regional Tension (`5–100`):** Tension is calculated live from regional faction stability, diplomatic ally/enemy pressure, and active crisis flags.
* **Tamriel-Wide Adventurer Pool:** The virtual adventurer pool initializes across all **71 regions** (`TOTAL_REGION_COUNT` - 62 Iliac Bay regions + 9 outer provinces) and cycles across all of Tamriel during daily travel (existing 62-region saves upgrade automatically without resetting current adventurers).
* **Lore-Accurate Geography & Full Offline Parity:** 32 Tamriel cities and 3 mountain spines are relocated to lore-accurate Elder Scrolls positions; curved-road `Follow Paths`, real on-map province dungeons for adventurers, province-specific tavern menus, harbours, and live paperdoll context backgrounds all work seamlessly offline across all 71 regions.

---

## What Players Should Expect

### 1. Regional Crises & 42-Event Matrix
* **42 dynamic encounters** spanning 12 categories: `WAR` (5), `FAMINE` (5), `PLAGUE` (5, including `EVT_PLAGUE_RAT_SWARM` swarms), `OCCULT` (5, including `EVT_WITCH_COVEN_ASSAULT`), `CRIME` (4), `FAITH` (4), `POLITICS` (3), `COMMERCE` (2), `HOLIDAY` (4), `ARCANE` (1), `MUNDANE` (3), and the crisis-independent **`UNDEAD_HORDE`** (`EVT_UNDEAD_HORDE_INVASION` in settlements + wilderness hordes: base `15` undead scaled `15 / 30 / 60` by `livingEncounterScale` in waves of up to `20` active led by a Necromancer boss, with obelisk-shatter 1-on-1 duel and 50% crumble on boss death).
* **Climate/Region & Level-Gated Attacker Pools:** Encounter monsters scale dynamically with player level and regional climate (`isSouthernDesertRegion`) - e.g. Sabertooth Tigers / Giant Scorpions in southern deserts vs. Grizzly Bears / Wereboars / Giants elsewhere, and escalating undead/occult/Daedra tiers at levels `6+`, `11+`, and `14+`.
* **12 Thematic Prop Sets & Destructible Props:** Urban skirmishes spawn themed 3D/flat props (`MILITARY_BARRICADE`, `PRISONER_CAGE`, `GRANARY_MARKET`, `CAULDRON_STATION`, `PLAGUE_PYRE`, `WATER_WELL_SITE`, `MONUMENT_STATUE`, `OCCULT_RITUAL`, `CRIME_HEIST`, `FARM_HOMESTEAD`, `GRAVEYARD_CRYPT`, `TEMPLE_SANCTUARY`) plus solid tent/pavilion colliders (`41606`/`41607`). Siding with attackers in events like `EVT_NEW_RULER_STATUE_UNVEILING` or `EVT_PLAGUE_WATER_WELL_SCARE` physically topples or smashes those scene props.
* Encounters match your location type, active regional crises, and settlement prosperity (`LOW`, `MID`, `HIGH` based on building quality).
* **Dynamic Settlement Prosperity & Shop Quality Shifts (`settlementProsperity.js`):** Local settlement prosperity shifts between `-5` and `+5` (decaying 1 step toward `0` every `7` game days) based on urban skirmish and citizen plea outcomes (defending towns, brokering peace, or helping merchants/urchins raises prosperity `+1`/`+2`; siding with raiders, heists, or saboteurs lowers it `-1`/`-2`), stacking with regional crisis shifts (`PLAGUE`/`FAMINE`: `-1` to `-2`; `WAR`/`CIVIL_STRIFE` `MID`: `-1`). Effective shop quality (`1..20`) shifts dynamically for both stock and prices without mutating base building records, with booming (`>= +2`) and depressed (`<= -2`) callouts in Travel Map tooltips and the compass Town Panel.
* **4-Stance Choices & Typed Rolls:** Every crisis event offers 4 stances - side with defenders, side with attackers, stay neutral, or resolve peacefully via gold or skill checks (`Etiquette`, `Streetwise`, `Orcish`, `Mercantile`, `Restoration`, `Stealth`, `Medical`, `Thaumaturgy`, `Daedric`) with 5 outcome degrees (`TRIUMPH` to `CRITICAL_FAILURE`). Outcomes nudge vanilla faction power and crisis endurance.
* **Canonical Skirmish & Event Reputation Matrix (`skirmishReputation.js`):** All 41 crisis events route to canonical reputation stores — regional `legalRep` (local, enemy region, or Orsinium), social groups (`Commoners`, `Merchants`, `Scholars`, `Nobility`, `Underworld`, `Supernatural`), and guilds/factions (`Mages Guild`, `Fighters Guild`, `Thieves Guild`, `Dark Brotherhood`, `Temples`, `Knightly Orders`) — while beasts, rats, undead, and unbound Daedra incur no faction penalty.
* **10 Ambient NPC Pleas & Peacetime Town Roulette:** Citizens may approach you with **4 crisis pleas** (`PLAGUE_CURE`, `FAMINE_BREAD`, `WAR_REFUGEE`, `ESCORT_REQUEST` at `10%`/`25%`/`40%` base chance) or **6 grounded peace pleas** (`DRUNKEN_BRAWLER`, `BROKEN_CART_MERCHANT`, `STRAY_HOUND_HANDLER`, `STREET_PREACHER`, `ACCUSED_URCHIN`, `BOASTFUL_DUELIST`). In peacetime towns, encounters roll `65%` Grounded Plea / `35%` Mundane Skirmish (crisis towns roll `80%` crisis / `20%` mundane; plague quarantines roll `40%` tent / `60%` plague skirmish). Rudely provoking a peace plea turns the NPC hostile with scale-based street backup (`1` Low / `1–2` Mid / `2–3` High).

### 2. Urban Skirmishes & Quarantine Gates
* During `WAR.MID`, `CIVIL_STRIFE.MID`, or active regional crises, contained street clashes break out between `SkirmishLaw` and `SkirmishRebels` (max 1 per town scene, `10m` doorway clearance). Combatants spawn neutral to the player while fighting each other until you choose a stance; critical diplomatic failure turns both sides hostile (`both_hostile`, yield disabled), and surviving combatants automatically calm down (`calmUrbanSurvivors`) once one side is defeated. With **Tactical Enemy Packs** (`Combat › Enemies`, On by default), humanoid skirmishes, checkpoints, camps, and forts compose mixed commanders, frontline tanks, archers, and casters (see [Combat Balance & Difficulty](/balance/)).
* During severe plague outbreaks (`PLAGUE.MID`), city gates can be barred around the clock with outside relief tents.

### 3. Road Checkpoints & Travel Interruptions
* **Road Checkpoints:** During `WAR` or `CIVIL_STRIFE`, military checkpoints spawn on highways. Knightly Order members (`rank > 0`), players with regional reputation `>= 15`, or `Nobility >= 20` / `GENERIC_KNIGHTLY_ORDER >= 20` pass free. Others pay a toll (`50–99` gold), use diplomacy, or fight. High `Underworld (>= 25)` or low `Commoners (<= -20)` triggers baggage inspections (`50g` fine per stolen item). Passing grants a **24-hour** regional transit pass.
* **Travel Interruptions:** Trips under `3` hours (`180m`) are never interrupted. Longer journeys scale interruption rolls by trip length (`1..maxInterrupts`), camping vs. inns (`+8%`), and reckless vs. cautious pace (`+6%`), plus regional tension minus Luck. Land routes roll across 5 event types (`PEACEFUL_CARAVAN`, `ROAD_DILEMMA`, `AMBUSH`, `WILD_BEASTS`, `WEATHER_HAZARD`), while sea voyages roll `WEATHER_HAZARD`.

### 4. Naval Incidents
* At sea, naval squadrons (`LAW` vs `PIRATES`) clash `200–300m` from the player (`1–2` ships/side on Light, `2–4` or `5` at war on Mid, `3–6` on High). Approaching within `40m` prompts a side-allegiance choice.

### 5. Adventurer Simulation, Duels & Loot
* A pool of virtual adventurers (`30` per region default) across 12 classes and 7 traits (`HONORABLE`, `ARROGANT`, `ENVIOUS`, `CUTTHROAT`, `DUELIST`, `MERCENARY`, `CAUTIOUS`) delves `60` Iliac Bay dungeon slots and real province dungeons, leveling up to `45` with a regional elite soft-cap (`Lv 25+`) and legend retirement at `Lv 45`.
* Cleared dungeons enter a `3–5` day cooldown. Failed delves leave bounded `fallenRemains` loot (max `2` per dungeon slot, `14`-day TTL) in boss chests.
* **Quest Protection:** `allowQuestCompetition` is disabled - active quest dungeons and main story dungeons are immune to adventurer interference.
* **Wandering Road Adventurers & Multi-Day Companion Contracts:** Meet non-hostile adventurers on highways, at camps, fighting monsters, or returning with spoils. You can share intel, wager on a spar, extort spoils, or hire them on **multi-day contracts** (`1` / `3` / `7` days, extendable up to `14` days max, with replacement confirmation). Hiring uses a grounded `200g / level / day` base rate shaped by the adventurer's trait haggle quality (`16..20`), your Mercantile & Personality, regional wartime demand, Merchants Festival (`-50%`), RCF reputation, and Necromancy Taint/Disguise. Fallen hired companions drop no exploitable gear or gold. Defeated wager-sparring duelists cleanly exit combat (clearing active DoTs, poisons, and ally targets), drop into a 2D/3D surrender kneel pose, and gain a `5s` grace protection window.

### 6. Surrender / Yield & Nemesis System
* **Surrender / Yield:** In LT encounters and checkpoints, you can yield. Ransom is `25%` of your gold (scaled by bribe multiplier and clamped between `max(25, level * 15)` and `level * 80`). Paying halves fatigue (`ROBBED`); if you cannot pay (`BEATEN_PAUPER`), all gold is taken and Health/Fatigue drop to `10%`.
* **Nemesis Encounters (3-Tier Overhaul):** 6 persistent archetypes (`BOUNTY_HUNTER`, `SHADOW_ASSASSIN`, `GLORY_CHALLENGER`, `GRUDGE_AVENGER`, `ARCANE_RIVAL`, `CHAOTIC_MARAUDER`) hunt you at `playerLevel + 2` (min Lv `3`) across 3 scaling tiers (`1.8x`–`2.8x` HP, `1.35x`–`1.75x` damage, `1–2` Boss Traits, real adventurer gear, and role-balanced minions with `15%` elite chance — see [Combat Balance & Difficulty](/balance/)), resolvable via duel, bribe, intimidation, or pacification.

### 7. Reputation Consequences Framework (RCF) & Bounty Forts
* **RCF:** Reputation affects merchant prices/fencing, house purchase refusal (`Nobility <= -20`), shipyard refusal (`Merchants <= -30`), temple refusal (`<= -20`), soul gem locks (`MagesGuild < 0` or `< 25` for `>= 250` soulPts), tavern surcharges/refusal, jury bias (`-25..+25`), and 16 threshold-unlocked town rumors.
* **Bounty & Fort Assaults:** Notice boards rebalance toward wilderness contracts (`70%`, `3x–5x` payout) and dungeon contracts (`30%`, `5x–10x` payout), displaying each region's live **Regional Risk Zone** threat tier and multipliers. Regions in `WAR`, `CIVIL_STRIFE`, or `PLAGUE` offer **Fort/Outpost Assault** contracts that cut regional tension by `15` and advance crises toward `END`.

---

## Cooldowns Summary

| System | Cooldown / Duration |
| :--- | :--- |
| Town / Location Events & Skirmishes | Configurable: `2h` (`120m`) / `8h` (`480m`) / `24h` (`1440m`) / `3d` (`4320m`, default) |
| Travel Interruptions | `360` min (`6` h) default, failsafe cap `720` min (`12` in-game hours); trips `< 180` min exempt |
| Ambient NPC Pleas | `90` min (`1.5` in-game hours) |
| Checkpoint Transit Pass | `1440` min (`24` in-game hours) |
| Recruited Adventurer Companion | `1 / 3 / 7` in-game days per contract (extendable up to `14` days max) |
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
| **Wilderness Encounters** (`livingWilderness`) | `Mid (2)` | Controls how often Living Tamriel replaces or supplements exterior wilderness spawns with dynamic patrols, wildlife, and encounters. |
| **Roadside Camps & Checkpoints** (`livingCamps`) | `Mid (2)` | Spawns roadside camps, patrol outposts, traveler tents, and wartime checkpoints. |
| **Naval Incidents** (`livingNaval`) | `Mid (2)` | Spawns fleet skirmishes at sea (`1–2` / `2–4(5)` / `3–6` ships per side). |
| **Wilderness Mob Traits** (`livingMobTraits`) | `Mid (2)` | Grants exterior foes and camps level-scaled combat traits and shields. |
| **Dungeon Mob Traits** (`livingDungeonMobTraits`) | `Mid (2)` | Grants dungeon monsters and class enemies level-scaled combat traits and shields. |
| **Reputation Consequences** (`livingReputationConsequences`) | `High (3)` | Scales dynamic regional reputation reactions across prices, taverns, courts, temples, checkpoints, and nemesis pools (takes effect immediately). |

### Scale, Cooldown & Loot Policy Controls

| Setting | Options | Default | Effect |
| :--- | :--- | :---: | :--- |
| **Encounter Scale** (`livingEncounterScale`) | `Low (x1)` \| `Mid (x2)` \| `High (x4)` | `Low (1)` | Multiplies squad sizes, packs, and skirmish armies. |
| **Settlement event cooldown** (`livingLocationCooldown`) | `2 Hours` \| `8 Hours` \| `24 Hours` \| `3 Days` | `3 Days (4320m)` | Sets minimum in-game cooldown between Living Tamriel events/skirmishes in the same settlement (takes effect immediately). |
| **Urban Skirmish Loot** (`livingUrbanLootMode`) | `Zero-Loot` \| `Supplies & Gold` \| `Full Loot` | `Zero-Loot` | Controls corpse loot on urban skirmish fighters (economy guard by default). |
| **Wilderness Loot** (`livingWildernessLootMode`) | `Full Loot` \| `Supplies Only` | `Full Loot` | Controls loot dropped by bandit camps, marauders, and checkpoints. |
| **Adventurer Corpse Loot** (`livingAdventurerLootMode`) | `Empty` \| `Supplies` \| `Standard` \| `Full Gear` | `Full Gear` | Controls equipment dropped by defeated adventurers (takes effect immediately). |

*(Internal config key not exposed in the UI: `livingQuestCompetition` is locked `false`.)*
