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
* **Online Features Brought Offline (Toggleable):** Play with **Offline Starfall & Morwen's Questline**, **Offline Firmament** constellations, **Offline Professions & Gathering**, **Offline Player Housing & Shipyards**, **Unified Empire Banking**, and **24/7 City Infrastructure** on your own schedule.
* **Apotheosis: Path of CHIM:** Ascend from mortality to Godhood via the `_APOTHEO` main questline (13-Artifact Sacrifice or Mantella Usurpation), wield 4 Divine Portfolios, cast **Scroll of Aurbis** miracles, and wage 4X geopolitics against 16 deities across 71 regions with subterranean cult sanctuaries, roadside shrines, and religious wars.
* **Emergent World & Dark Arts:** Adds **Living Tamriel** (41 crisis encounters, 10 ambient pleas, dynamic settlement prosperity & shop quality shifts, road checkpoints, urban skirmishes, naval incidents, multi-day companion contracts, and reputation consequences), **Necromancy & Lichdom** (from mortal necromancer to Ancient Lich with a dedicated Pause progression tab), an optional live-toggleable **Racial Overhaul** across all 8 playable races, an **NWN-Style Combat & Event Log**, expanded **Climates & Calories** tiers, drink buffs, and Character Sheet Penalties/Boon tooltips, **Portable Alchemy**, **Item Quality & Shop Rolls**, and **Dynamic Perks**.
* **Native JS/JSON Modding:** Lightweight, zero-compiler mod architecture with Safe-Save isolation and Hot-Rescan, alongside support for DFU `.dfmod` texture packs and loose sound/music replacement packs.

---

## Documentation Sections

| Section | What You Will Find |
| :--- | :--- |
| **[Apotheosis: Path of CHIM](/apotheosis/)** | Mortal-to-Godhood progression (Stage 0 Fate Weight, Stage 1 Direnni Siege & Shadow Duel), 4 Divine Portfolios, Faith & Scroll of Aurbis miracles, 16-deity Pantheon 4X across 71 regions, Cult Sanctuaries, Roadside Shrines, Sieges, Wars, and Settings. |
| **[Living Tamriel](/living-tamriel/)** | What to expect in the living world (41 crisis encounters, 10 ambient pleas, dynamic settlement prosperity & shop quality shifts, multi-day companion contracts, climate-scaled pools, configurable cooldowns), Tamriel-wide 71-region coverage, RCF reputation consequences, duels, and every LT setting. |
| **[Necromancy & Lichdom](/necromancy/)** | Complete progression from Mortal to Necromancer, Lich, and Archlich, Pause `Lichdom` tab, all 11 spells, minion control & upkeep, Harvest crime & Disguise-break rules, Nexus hotkeys, and all Necromancy settings. |
| **[Racial Overhaul](/racial-overhaul/)** | Optional live-toggleable overhaul for all 8 playable races: DPS-homogenized favored weapon scaling, resistances, Spellsword Resonance, Green Pact, Night Vision, Hist Regen, 8-race quick start, and `raceaudit` diagnostics. |
| **[Global Non-LT Changes](/features/global-changes)** | All global gameplay and technical changes outside Living Tamriel: Offline Starfall, NWN-style Combat & Event Log, Climates & Calories tiers, drink buffs & Character Sheet Penalties, Rest selection clock, offline housing (with default grid snap), firmament, banking, Morrowind visual splits, Paperdoll 3D mode, `Shift+FollowPaths` travel, campaign cinematics, portable alchemy, and test presets. |
| **[Settings Outside DFF Tab](/features/settings-reference)** | Exact menu locations, defaults, and effects for every DFF setting placed in standard tabs (`Gameplay`, `Combat`, `World`, `Interface`) and the Profile / Look card. |
| **[Modding](/modding/)** | Capabilities of the native JS/JSON mod system (plus `<userData>/Mods/` seeding and texture/sound replacement packs), how to start modding, and walkthroughs of all 8 example mods. |
| **[Console Commands](/reference/console-commands)** | Complete command reference (including `raceaudit`, `starfall`, `survival`, `living prosperity`/`living adv` quote & companion tools, `player_view`/`lycan`, `apotheosis`/`apo` subcommands, Scroll of Aurbis miracles, and Archlich aliases), syntax, chaining rules, and partial name matching guide. |
