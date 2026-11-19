# Stage 3: Pantheon 4X, Cults, Shrines & Wars

Once ascended with a Portfolio, you enter the **Pantheon 4X** layer across all **71 regions of Tamriel** - competing diplomatically and militarily with the **16 major Aedra and Daedra**, founding **Underground Sanctuaries**, proclaiming **Regional Edicts**, interacting with **Roadside Shrines**, defending **Temple Sieges**, and fighting **Religious Wars**.

---

## Stage 3.1 - Pantheon 4X Geopolitics (All 71 Regions)

### The 16 Pantheon Deities

| Deity | Kind | Personality | Base Upstart | Artifact | Affinity (Order / War / Magic / Shadows) | Allies | Enemies | Allied Bonus Champion |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- |
| **Akatosh** | Aedra | guardian | `-25` | - | `+35 / +5 / +15 / -40` | Stendarr, Mara, Julianos | Mehrunes Dagon, Molag Bal | Dragon-Knight of Time |
| **Arkay** | Aedra | guardian | `-20` | - | `+20 / 0 / -25 / -40` | Stendarr, Mara | Molag Bal, Mehrunes Dagon | Warden of the Cycle |
| **Dibella** | Aedra | diplomat | `-5` | - | `+10 / -35 / +20 / 0` | Mara, Kynareth | Molag Bal, Mehrunes Dagon | Muse of Radiance |
| **Julianos** | Aedra | diplomat | `-15` | - | `+30 / -10 / +40 / -10` | Akatosh, Zenithar | Sheogorath, Mehrunes Dagon | Arch-Scribe of Logic |
| **Kynareth** | Aedra | diplomat | `-10` | - | `+5 / +30 / +10 / 0` | Dibella, Zenithar | Molag Bal, Sheogorath | Tempest-Ranger of the Sky |
| **Mara** | Aedra | diplomat | `-5` | - | `+25 / -45 / +5 / -20` | Akatosh, Dibella, Stendarr | Molag Bal, Dagon, Mephala | Seraphic Templar of Mercy |
| **Stendarr** | Aedra | expansionist | `-25` | - | `+40 / +15 / -25 / -50` | Akatosh, Arkay, Mara | Dagon, Molag Bal, Nocturnal, Mephala | Crusader of Mercy |
| **Zenithar** | Aedra | diplomat | `-10` | - | `+30 / -35 / +5 / -40` | Julianos, Kynareth | Nocturnal, Mehrunes Dagon | Ironclad Arbiter of Toil |
| **Mehrunes Dagon** | Daedra | expansionist | `-25` | Razor (`1`) | `-50 / +40 / 0 / +5` | Boethiah, Molag Bal | Akatosh, Stendarr, Mara, Zenithar | Dremora Scourge of Destruction |
| **Molag Bal** | Daedra | expansionist | `-30` | Mace (`2`) | `-45 / +20 / 0 / +5` | Mehrunes Dagon, Mephala | Arkay, Stendarr, Mara, Boethiah | Harvester of Coldharbour |
| **Boethiah** | Daedra | expansionist | `+5` | Ebony Mail (`18`) | `-25 / +40 / -20 / +30` | Mephala, Mehrunes Dagon | Molag Bal, Mara | Blade of Plots |
| **Mephala** | Daedra | schemer | `0` | Ebony Blade (`22`) | `-40 / +5 / +5 / +45` | Boethiah, Nocturnal | Mara, Stendarr | Webspinner Seducer |
| **Nocturnal** | Daedra | schemer | `+5` | Skeleton Key (`21`) | `-45 / 0 / +5 / +45` | Mephala, Azura | Stendarr, Zenithar | Nightingale Shadow-Wraith |
| **Hermaeus Mora** | Daedra | schemer | `0` | Oghma (`5`) | `0 / -10 / +40 / +15` | Azura | Stendarr | Seeker of Apocrypha |
| **Azura** | Daedra | diplomat | `+10` | Azura's Star (`9`) | `+10 / -10 / +35 / +15` | Nocturnal, Hermaeus Mora | Molag Bal, Sheogorath | Starlight Dawn-Guard |
| **Sheogorath** | Daedra | schemer | `+5` | Wabbajack (`6`) | `-50 / +10 / +20 / +15` | - | Julianos, Azura, Stendarr | Golden Jester of Mania |

### Relations, Initial Standing & Grace Period
* **Tiers (`-100..+100`):** `War` (`manualWar` or `<= -60`), `Hostile` (`<= -40`), `Wary` (`-39..+39`), `Pact` (`>= 10` with pact or `>= 40`), `Allied` (`>= 50` with alliance or `>= 75`).
* **Initial Standing:** Combines `baseUpstart`, temple faction reputation (`±20`), temple membership (`+15 + rank × 2`), worshipped patron (`+20`), shattered artifact penalty (`-30`), Portfolio affinity, and curse modifiers (*Lich*: Arkay/Stendarr `-40`, Mara/Akatosh `-20`, Mora/Molag Bal `+20`; *Vampire*: Arkay/Stendarr `-35`, Molag Bal `+25`; *Werebeast*: Stendarr `-15`, Boethiah `+20`).
* **30-Day Grace Period (`43,200m`):** Deities starting between `-39` and `+19` receive a 30-day Grace Period that shields you from AI hostility. Attacking or offending a deity during Grace immediately breaks it and **doubles (`2x`)** the relation penalty.
* **Ripple Propagation:** Relation changes automatically propagate **`+50%`** to the target deity's allies and **`-25%`** (inverted) to its enemies.

### 71 Regions & Daily AI Moves
* **Full Tamriel Scope:** Tracks influence shares (normalized to `100%`) across all **62 Iliac Bay regions + 9 outer Provinces (`71` total)**, visible in **Divine Lens & Geopolitics** and on the Held Map. You start with **`10%`** in your ascension region.
* **Reactive Conditions:** All 26 vanilla `REGION_FLAGS` nudge daily influence toward thematic deities (and `0.6x` to your cult if your Portfolio matches and you hold `>= 1%`).
* **Daily AI Turns:** Up to 30 catch-up days per tick. Base move probability is **`0.35`**, scaled by **Pantheon AI Activity** (`Passive 25%`, `Normal 100%`, `Dynamic 150%`, `Chaotic 250%`). Deities erode rivals (`1.5–3.0 × hostility`), aid allies (`+1.5%`), clash with enemy gods (`30%` chance), or expand via emissaries (`+1.8%`).

### Diplomacy & Geopolitics Actions

| Action | Faith Cost | Requirements & Effect |
| :--- | :---: | :--- |
| **Offering** | `100` | `+15` relation, `7-day` cooldown. |
| **Divine Pact** | `150` | Requires relation `>= +10`; grants `+10` relation & Pact status. |
| **Divine Alliance** | `300` | Requires relation `>= +50`; grants `+15` relation, Alliance status & `+1` Allied Bonus Champion. |
| **Sow Discord** | `200` | Drops mutual standing between two chosen deities by **`-50`** (can spark inter-deity wars). |
| **Declare Holy War** | `100` | `-40` relation and enters `War` state. |
| **Divine Truce (`30d`)** | `100–1,500` *(or `0`)* | Scales with power ratio, hostility depth, and warscore - or **`0` Faith (Free)** after defeating **`3`** of that deity's champions/sieges. Restores `+25` relation if `<= -60`. |
| **Ignite Region War** | `350` | Ignites `WarOngoing` and faction hostility between Region A and Region B. |
| **Enforce Region Peace** | `300` | Ends regional war flags/hostility and marks `WarWon`. |

### Pause Menu Apotheosis UI (`9` Navigation Views)
1. **Overview** (Ascension stage, Fate Weight, Artifact Sacrifice picker) · 2–4. **3 Fate Weight Category Tabs** (toggled by `apotheosisShowTracker`) · 5. **Divine Portfolio** · 6. **Scroll of Aurbis** (console + 14 Quick Miracles) · 7. **Deities & Diplomacy** (`[! N]` active wars badge) · 8. **Divine Lens & Geopolitics** (`71`-region grid with `All / Bay / Provinces / Wars` filters & war stance controls) · 9. **Pantheon Chronicle** (80-entry filterable & searchable log) · 10. **Temples & Underground Sanctuaries** (`[! N]` active sieges badge) · 11. **Regional Edicts**.

---

## Stage 3.2 - Cult Temples, Subterranean Sanctuaries & Regional Edicts

### Underground Sanctuaries
* **World Sites:** Every city Temple (`temple`) plus a hidden **Daedric Underground Hatch** (`daedra_hatch`) in cities with a Temple or `>= 16` buildings (`25%` chance in smaller hamlets).
* **Founding Your Own Sanctuary:** Costs **`350 Faith + 50,000 gold`** (max `1` player-owned site per city). Grants `+15%` regional influence, an offline home deed, a 3D street hatch + `2×2` Temple automap stamp, a free first branch choice, and one of 3 subterranean pools (`catacomb_nave`, `forbidden_ossuary`, `cult_undercroft`).
* **Remote Teleport:** Teleport directly to any owned sanctuary for **`75 Faith`** (free when within `4.5m` of the street hatch).

### Infiltrating & Consecrating Rival Sanctuaries
* **Locked Daedric Hatch (`4.5m`):**
  * **Lockpick:** `Lockpicking + floor(Luck / 10)` vs DC `35/45/55/65`; failure triggers a **Street Alarm** (3 outdoor Guardians, `15m` CD).
  * **Bash:** STR roll (`60m` CD); **always** triggers Street Alarm.
  * **Arcane Unlock:** Requires active `Open` spell, **Magic Portfolio**, or **Arcane Convergence** edict (silent - no Street Alarm).
  * **Sanctuary Seal Key / Pact / Alliance:** Silent, no alarm, no war. *(Pickpocketing the Gatekeeper is silent on success; failing or looting triggers Alarm + War.)*
  * **Break-In War:** Entering without Pact/Alliance triggers **Holy War & `-35` Relation**; trespassing inside a Hostile/War sanctuary ticks `-5` relation/day.
* **Consecration at the Interior Altar:**
  * **Consecrate by Force (`200 Faith`):** Declares Holy War (`-35` relation if not already penalized) and spawns defending Guardians (`2` normal, `4` if alarmed; `3-day` guardian respawn CD). Killing the last Guardian **automatically consecrates** the site (`+10%` player / `-10%` rival influence).
  * **Peaceful Consecration (`450 Faith`):** Requires **`Allied` status at `100` relation**; shifts `+8% / -8%` influence and costs `-10` relation (preserves Grace).

### Upgrades, Branches, Altars & Free Temple Services
* **Upgrade Tiers:**
  * **Tier I (Initiate Shrine):** Base (`+4 Faith/d`, `+100` Max Faith, `+0.4% Inf/d`, `2` guards).
  * **Tier II (Sacred Precinct):** `220 Faith + 25,000g` (`+8 Faith/d`, `+250` Max Faith, `+0.8% Inf/d`, `3` guards).
  * **Tier III (Grand Sanctum):** `420 Faith + 50,000g` (`+14 Faith/d`, `+500` Max Faith, `+1.4% Inf/d`, `4` guards).
* **Specialization Branches** *(1st free; switching costs **`180 Faith`** + **`7-day`** CD)*:
  * **Missionary Choir (`missionary`):** `1.5x` (`+50%`) daily regional influence conversion.
  * **Militant Chapter (`militant`):** `+2` guards, **`5-day`** siege holdout timer (vs `3-day`), **`+30%`** siege victory Faith, `+35%` garrison HP & `+2` garrison levels.
  * **Oracle Reliquary (`oracle`):** `+5 Faith/d` and `+150` Max Faith.
* **Altar Customization:** Choose from **`33` altar statue styles** (`23` 2D flats + `10` 3D models) with smart pedestal mounting and zero statue collision.
* **Free Temple Services (`ownTemple`):** At your own consecrated sites, all healing, magicka recharge, disease/vampire/lycanthropy cures, item curse lifting, spell buying, spell making, and skill training cost **`0` gold** and bypass rank/chapter locks.

### The 4 Regional Edicts
Proclaiming an edict costs **`200 Faith`**, lasts **`30 days` (`43,200m`)**, and requires **`>= 25%` player influence** or **`>= 1` owned site** in the target region (`0..70`). Repealing is free.

| Edict | Daily Passive Income | Regional Bonuses & `REGION_FLAGS` Effects |
| :--- | :--- | :--- |
| **Prosperous Harvest** (`prosperity`) | `+150g/d`, `+8 Faith/d`, `+0.25% Inf/d` | Activates `PricesLow` & `HappyHoliday`; clears `Famine*`, `Plague*`, `BadHarvest`, `PricesHigh`. |
| **Sanctified Crusade** (`crusade`) | `+4 Faith/d`, `+0.6% Inf/d` | **`+25%` Divine Champion damage** in region; activates `HolyHoliday`; clears `PersecutedTemple`. |
| **Arcane Convergence** (`arcane`) | `+6 Faith/d`, `+0.3% Inf/d` | **`-20%` Scroll of Aurbis Faith cost** in region; silent Arcane Unlock on underground hatches; clears `WitchBurnings`, `MadWizardNearby`. |
| **Shadow Tithe** (`shadow`) | `+220g/d`, **`+18 Faith/d`**, `+0.2% Inf/d` | **`-50%` court fines** and **`-50%` `bounty clear` Faith cost** (min `15`); activates `CrimeWave`. |

---

## Stage 3.3 - Roadside Shrines, Road Blessing & Pilgrim Petitions

* **Roadside Shrines:** Spawn at town road exits (towns without a Temple guarantee their regional Aedra patron at exit 0) and along `~20%` of wilderness highway road tiles (`24h` cooldown per shrine).
* **Pray / Donate (`50g` / `200g` / `500g`):** Grants `+1..+8` deity relation, `+0.2..+0.8%` deity influence, and a **`12-hour` (`720m`) Road Blessing** HUD buff (`+15%/25%/35%` instant fatigue restore, `+2/+3/+4` fatigue/min regen, `+5°/+7°/+10°` warmth, `dry: 25`, `fatigueLess: 0.20`, and `+10%` Fire/Frost/Shock resistance).
* **Desecrate:**
  * **Town Shrine:** `+15` Faith, `0.5%` influence shift, `-10` deity relation (`55%` base Guardian chance, reduced by Luck).
  * **Wild Highway Shrine (`×3`):** **`+45` Faith**, **`1.5%` influence shift**, and **`×3` Shrine Petition rewards** (`75%` base Guardian chance, `2` Guardians).
* **Bastion Defense:** Each undefeated rival deity site in a region grants `15%` defense (cap `45%`), reducing inter-god influence losses.
* **Pilgrim Petitions (every `3 days` when owning a site):**
  1. **Inquisition:** Activate your sanctum Altar to spawn and slay **`3` Inquisitors** (`+100 Faith, +600g, +2.5% Inf`). Leaving resets cleanly so they can be re-summoned.
  2. **Desecrate Shrine:** Desecrate the target deity's roadside shrine (`+60 Faith, +350g, +2.5% Inf` - or **`+180 Faith, +1,050g, +7.5% Inf`** on a wild highway shrine).
  3. **Regional Edict:** Proclaim any Regional Edict (`+80 Faith, +500g, +2.5% Inf`).
* **Fast Travel Interrupts (`10m` / `22m`):** Governed by `apotheosisTravelInterrupts` (`All Interactive` | `Roadside Shrines Only` | `Off`), pausing at `10m` for shrines/interactive nodes and `22m` for war skirmishes; declining mutes that node until you move `> 30m` away.

---

## Stage 3.4 - Temple Sieges, Religious Wars & Wilderness Skirmishes

### 4-Tier Scaling (`apotheosisTempleSieges`)

| Tier | Daily Siege Chance | Max Sieges | Siege CD | Skirmish CD | Skirmish Size | Squad / Ally Scale | War Regions | Fast-Travel Interrupt |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `off` | `0%` | `0` | `999d` | `0` | `0` | `0` / `0` | `0` | `0%` |
| `low` | `25%` | `2` | `3d` | `5h` (`300m`) | `2v2` | `1.0x` / `1.0x` | `1–2` | `20%` |
| `mid` *(default)* | `50%` | `3` | `1d` | `2h` (`120m`) | `3v3` | `1.5x` / `1.5x` | `2–3` | `40%` |
| `high` | `80%` | `5` | `0d` | `1h` (`60m`) | `5v5` | `2.5x` / `2.0x` | `3–4` | `70%` |

### Temple & Sanctuary Sieges
* Deities at `War` besiege your sites with a **`3-day` holdout timer** (**`5 days`** for Militant Chapter).
* Spawns automatically when entering the besieged town, or deploy from Pause → Apotheosis → Cult (`Free` in-city, `75 Faith` remote teleport). Leaving preserves remaining attackers without false victories.
* **Victory Rewards:** Tier I (`+80F, +750g, +1.5% Inf`), Tier II (`+140F, +1,500g, +3.0% Inf`), Tier III (`+220F, +3,000g, +5.0% Inf`), `×1.3` Faith if Militant, plus `+1` `championsDefeated` toward free Divine Truce (`3` wins).
* **Defeat / Sacrifice Sanctum:** Reverts ownership to the attacker at Tier I (`-3%/-6%/-10%` influence). Clicking **Sacrifice Sanctum** in the Cult UI opens departure portals (`companionFx.leave`) beneath all live siege troops to cleanly withdraw them and concede the site.

### Inter-Deity Religious Wars & Unified Wilderness Skirmishes
* **Religious Wars:** Up to **`3` concurrent wars**, igniting automatically when inter-god standing drops below **`-75`**. Wars last **`10 days`** across `1–4` regions (`WarOngoing`). You can **Support a Side (`600 Faith`)** or **Enforce Divine Truce (`900 Faith`)**.
* **Wilderness War Skirmishes (Divine & Mundane):** Spawn during roaming (`70%` chance off cooldown) or fast travel across both **Divine Wars** and **Mundane Regional Wars** (strictly blocked on ocean/afloat tiles).
  * **4-Choice Prompt (Saved Stance):** Join Side A, Join Side B, Observe, or **Reconcile & Pacify** (`150 Faith` upfront if Divine; `SOCIAL_DIPLOMACY` check at **DC `85`**). Critical failure turns **both sides hostile**. Reaching **`3 / 3` pacifications** ends the regional war early (`+100 Faith & +3% Inf` if Ascended; `+250g` if mortal).

---

## Apotheosis Settings

Located in **Settings → DFF → Apotheosis: Path of CHIM**.

| Setting | Key (`uiPrefs.js`) | Options | Default | Effect |
| :--- | :--- | :--- | :---: | :--- |
| **Show Fate Weight Tracker** | `apotheosisShowTracker` | `On` / `Off` | `On` | Shows or hides the Stage 0 Fate Weight progress bar and 3 category tabs in Pause → Apotheosis. |
| **World & Pantheon Hostility** | `apotheosisWorldHostility` | `Calm (0.5x)` \| `Normal (1.0x)` \| `Aggressive (1.5x)` \| `Relentless (2.5x)` | `Normal (1.0x)` | Scales how aggressively rival Temples, Daedric Princes, and hostile Champions react to your divinity. |
| **Faith Gain Multiplier** | `apotheosisFaithGainMult` | `0.25x` \| `0.5x` \| `1.0x` \| `1.5x` \| `2.0x` \| `3.0x` | `1.0x` | Multiplies Faith earned from Portfolio deeds, witnesses, and sanctuaries. |
| **Mythic Decay Multiplier** | `apotheosisFaithDecayMult` | `Off (0x)` \| `0.5x` \| `1.0x` \| `1.5x` \| `2.0x` \| `3.0x` | `1.0x` | Scales daily `-15` Faith loss on idle days (`Off` disables Mythic Decay). |
| **Pantheon AI Activity** | `apotheosisPantheonActivity` | `Passive (25%)` \| `Normal (100%)` \| `Dynamic (150%)` \| `Chaotic (250%)` | `Normal (100%)` | Scales the `0.35` base daily strategic turn chance for each Pantheon deity. |
| **Fast Travel Interrupts (10m)** | `apotheosisTravelInterrupts` | `All Interactive` \| `Roadside Shrines Only` \| `Off` | `All Interactive` | Controls whether accelerated travel pauses within `10m` of interactive shrines, camps, and war skirmishes. |
| **Temple Sieges & Religious Wars** | `apotheosisTempleSieges` | `Off` \| `Low` \| `Mid` \| `High` | `Mid` | Controls siege frequency against your sanctuaries, inter-deity wars, and wilderness war skirmishes. |
