---
layout: doc
aside: false
---

# Daggerfall Forever (DFF)

**Daggerfall Forever** is an open-source, single-player, offline-first fork of **upstream DFO** (itself built on the Daggerfall Unity foundation). Its goal is to deliver a self-contained, modular, and deeply customizable single-player Daggerfall experience - with zero monetization, no persistent MMO servers, and full player control over every system.

> *Your game, your rules. Open source, customizable, without monetization, and expanded with new gameplay systems.*

**Community:** Join the official [Daggerfall Forever Discord](https://discord.gg/HVGrJFmYa) to share feedback, mod ideas, and bug reports.

---

## Core Vision & What DFF Changes

* **Purely Offline Single-Player:** Removes monetization, the Aura Armory, online shop, cloud accounts, and live-service/MMO tails while keeping isolated save and `userData` folders so your upstream DFO saves remain untouched.
* **Offline Starfall & Morwen's Questline:** Play the Starfall progression and Morwen's questline completely offline on your own schedule.
* **Offline Firmament:** Allocate and progress through Firmament constellations locally without requiring an online server.
* **Offline Professions & Gathering:** Train gathering and crafting professions and use the materials bag offline.
* **Offline Player Housing & Shipyards:** Purchase, furnish, and manage player homes and shipyards offline.
* **Unified Empire Banking:** Access a unified bank account across all Empire regions.
* **24/7 City Infrastructure:** Toggleable 24/7 city services, shops, and guild halls so towns stay alive on your schedule.
* **Apotheosis: Path of CHIM:** Ascend from mortality to Godhood via the `_APOTHEO` main questline (13-Artifact Sacrifice or Mantella Usurpation), wield 4 Divine Portfolios, cast **Scroll of Aurbis** miracles, and wage 4X geopolitics against 16 deities across 71 regions with subterranean cult sanctuaries, roadside shrines, and religious wars.
* **Combat Balance & Modular Difficulty:** Rebalances single-player combat around lethal, tactical fights without damage sponges — featuring 4 one-click Difficulty Presets (`Classic DFU`, `Balanced DFF`, `Veteran`, `Hardcore`), Combat Lethality tiers (including `Easy`), AoE Friendly Fire controls, Early Hero Threat Scaling (Lv.5+), 4-tier Regional Risk Zones across all 71 regions, Hard Player Stagger & Level 5+ telegraphed blows, Live Reflexes scaling, role-balanced Tactical Enemy Packs, revamped `BOSS_TRAITS`, a 3-Tier Nemesis overhaul, and gear/set/passive Stat Overcap (>100).
* **Smooth 2D Weapon Animation:** Adds smooth 2D weapon animation, edge extension, and motion blur (credited to Seluje).
* **Living Tamriel:** Adds 41 crisis encounters routed to a full canonical reputation matrix, 10 ambient pleas, standalone Undead Horde Invasions, dynamic settlement prosperity & shop quality shifts, road checkpoints, urban skirmishes, naval incidents, multi-day companion contracts, roaming adventurer intel, and reputation consequences.
* **Lore-Accurate Tamriel Map:** Relocates 32 cities and 3 mountain spines to match classic Elder Scrolls geography.
* **Full 71-Region Offline Parity:** Delivers curved-road `Follow Paths`, real province dungeons, province-specific taverns, harbours, and live paperdoll backgrounds across all 71 regions of Tamriel.
* **Necromancy & Lichdom:** Progress from mortal necromancer to Lich and Ancient Lich with a dedicated Pause tab, minion AI stances, `Animate Dead` / `Mass Animate Dead`, and dark arts settings.
* **Racial Overhaul:** Optional live-toggleable overhaul across all 8 playable races with favored weapon scaling, resistances, Spellsword Resonance, Green Pact, Night Vision, and Hist Regen.
* **Expanded Survival (Climates & Calories):** Expanded survival tiers, drink buffs, and Character Sheet Penalties/Boon tooltips.
* **NWN-Style Combat & Event Log:** Dedicated Neverwinter Nights-inspired combat and event log panel.
* **Portable Alchemy:** Brew potions anywhere on the road with portable alchemy support.
* **Item Quality & Shop Rolls:** Craftsmanship quality tiers and expanded shop item generation.
* **Dynamic Perks:** Unlockable gameplay perks integrated into character progression.
* **Native JS/JSON Modding:** Lightweight, zero-compiler Mod API v2 with Mini-MCM settings, live HUD chips, 26-language mod locales, custom items/spells/legendaries, Safe-Save isolation, Hot-Rescan, and 13 bundled mods (auto-updated on client updates).
* **Texture, Sound & Music Replacement Packs:** Native support for DFU `.dfmod` texture packs (such as *Vanilla Enhanced* or *DREAM 90s*) and loose sound/music replacement packs.

---

## Documentation Sections

| Section | What You Will Find |
| :--- | :--- |
| **[Combat Balance & Difficulty](/balance/)** | Full 7-block balance breakdown: 4 Difficulty Presets, Combat Lethality, Hero Threat Scaling (Lv.5+), 4-tier Regional Risk Zones across 71 regions, Hard Player Stagger & Lv.5+ tells, Live Reflexes, Tactical Enemy Packs, 11 `BOSS_TRAITS`, 3-Tier Nemesis overhaul, and Stat Overcap (>100). |
| **[Apotheosis: Path of CHIM](/apotheosis/)** | Mortal-to-Godhood progression (Stage 0 Fate Weight, Stage 1 Direnni Siege & Shadow Duel), 4 Divine Portfolios, Faith & Scroll of Aurbis miracles, 16-deity Pantheon 4X across 71 regions, Cult Sanctuaries, Roadside Shrines, Sieges, Wars, and Settings. |
| **[Living Tamriel](/living-tamriel/)** | What to expect in the living world (41 crisis encounters with canonical reputation routing, 10 ambient pleas, dynamic settlement prosperity & shop quality shifts, multi-day companion contracts, tactical packs, 3-tier Nemesis, wager sparring polish), lore-accurate 71-region Tamriel parity, RCF, and every LT setting. |
| **[Necromancy & Lichdom](/necromancy/)** | Complete progression from Mortal to Necromancer, Lich, and Archlich, Pause `Lichdom` tab, all 11 spells, minion control & upkeep, Harvest crime & Disguise-break rules, Nexus hotkeys, and all Necromancy settings. |
| **[Racial Overhaul](/racial-overhaul/)** | Optional live-toggleable overhaul for all 8 playable races: DPS-homogenized favored weapon scaling, resistances, Spellsword Resonance, Green Pact, Night Vision, Hist Regen, 8-race quick start, and `raceaudit` diagnostics. |
| **[Global Non-LT Changes](/features/global-changes)** | All global gameplay and technical changes outside Living Tamriel: Combat Balance overhaul, Stat Overcap (>100), lore-accurate Tamriel geography & offline parity, Offline Starfall, NWN-style Combat & Event Log, Climates & Calories tiers, drink buffs & Character Sheet Penalties, Rest selection clock, offline housing, firmament, banking, Morrowind visual splits, Paperdoll 3D mode, `Shift+FollowPaths` travel, campaign cinematics, portable alchemy, and test presets. |
| **[Settings Outside DFF Tab](/features/settings-reference)** | Exact menu locations, defaults, and effects for every DFF setting placed in standard tabs (`Gameplay`, `Combat` including Difficulty Presets & Balance controls, `World`, `Interface`) and the Profile / Look card. |
| **[Modding](/modding/)** | Capabilities of the native JS/JSON mod system (plus `<userData>/Mods/` seeding and texture/sound replacement packs), how to start modding, and walkthroughs of all 13 bundled mods. |
| **[Console Commands](/reference/console-commands)** | Complete command reference (including `difficulty`, `lethality`, `risk`, `reflexes`, `stagger`, `testtrait`, `give_stat_gear`, `relic`, `spawn_revenant`, `spawn_spar`, `spar_debug`, `sethp`, `foe_bodies`, `raceaudit`, `starfall`, `survival`, `living`, `apotheosis`/`apo`, and Archlich aliases), syntax, chaining rules, and partial name matching guide. |
