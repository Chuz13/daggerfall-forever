# Settings Added Outside the DFF Tab

While major frameworks (**Living Tamriel**, **Dark Arts & Necromancy**, and **Apotheosis: Path of CHIM**) live under the bottom **DFF** tab in the Enhanced Settings menu, many DFF features and granular toggles are placed directly in their natural vanilla/DFO categories or the Profile / Look selector.

---

## Gameplay › Character & survival

| Setting | Key / Pref | Default | Effect |
| :--- | :--- | :---: | :--- |
| **Firmament (Offline)** | `port:offlineFirmament` (`offlineFirmament`) | `On` | Enables the Firmament constellation passive tree and Renown leveling offline. |
| **Professions & Gathering (Offline)** | `port:offlineProfessions` (`offlineProfessions`) | `On` | Enables offline gathering nodes (mining, herbs, logging, hunting, fishing) and crafting professions. |
| **Starfall (Offline)** | `port:offlineStarfall` (`offlineStarfall`) | `Normal` | 4-tier selector (`Off` \| `Rare` \| `Normal` \| `Frequent`). Controls offline fallen star encounters, coven defenses, and Morwen's questline. |
| **Climates & Calories** | `feat:mod-climates-calories` (`survival`, `survivalTempHud`, `survivalNoWildRoughRest`) | `Veteran` (`Temp HUD: On`, `No wild sleep: Off`) | 6-tier selector (`Off` \| `Boons` \| `Casual` \| `Standard` \| `Veteran` \| `Hard`) with sub-toggles for HUD temperature plate and disallowing wilderness rough sleep without a tent or lit campfire. |
| **Online-Style Respawn** | `feat:offline-respawn` (`offlineRespawn`) | `On` | On death, wakes you at the nearest safe location with `50%` HP, `-10%` carried gold, and `+4–24` hours passed instead of ending the game. |

---

## Combat › Enemies

| Setting | Key / Pref | Default | Effect |
| :--- | :--- | :---: | :--- |
| **Reflexes** | `port:reflexes` (`playerEntity.reflexes`) | `Average (2)` | 5-tier selector (`Very High` `0` to `Very Low` `4`). Adjusts enemy attack speed and skill advancement rate mid-playthrough (active in pause menu). |

---

## Combat › With Morrowind data

| Setting | Key / Pref | Default | Effect |
| :--- | :--- | :---: | :--- |
| **Player Character (First Person)** | `feat:mw-player-fp` (`mwPlayerFp`) | `2D` | 2-tier selector (`2D` \| `3D`). Switches between classic 2D sprites and 3D Morrowind arms/weapons in 1st person (falls back to `2D` without Morrowind data). |
| **Player Character (Third Person)** | `feat:mw-player-tp` (`mwPlayerTp`) | `2D` | 2-tier selector (`2D` \| `3D`). Switches between your Profile 2D look and 3D Morrowind body in 3rd person (falls back to your 2D look without Morrowind data). |
| **Inventory Player Figure** | `feat:mw-inventory-body` (`mwInventoryBody`) | `Follow Third Person` | 3-tier selector (`Follow Third Person` \| `Always 3D` \| `Always Paperdoll`). Independently controls the inventory paperdoll vs. 3D model. |
| **Morrowind Item Icons** | `feat:mw-item-icons` (`mwItemIcons`) | `Off` | Renders inventory and quickslot items as 3D Morrowind ground meshes instead of 2D sprites. |
| **Morrowind Foes** | `feat:mw-foe-bodies` (`mwFoeBodies`) | `Off` | 3-tier selector (`Off` \| `Near` [up to 24] \| `All` [up to 48]). Enables Morrowind 3D bodies for monsters/hostiles independently of peaceful townsfolk (`mw-npc-bodies`). |

---

## World › Towns & people

| Setting | Key / Pref | Default | Effect |
| :--- | :--- | :---: | :--- |
| **Player Housing (Offline)** | `port:offlineHousing` (`offlineHousing`) | `On` | Enables buying/selling DFO-style houses at the front door with chest storage, decor, and exterior customization; `Off` restores classic DFU bank housing. |
| **Unified Bank** | `port:unifiedBank` (`unifiedBank`) | `On` | Unifies bank accounts across all 71 regions into a single global Empire bank account (syncs live if toggled mid-game). |
| **24/7 City Infrastructure** | `port:city247` (`city247`) | `On` | Keeps city gates, shops, guild halls, banks, and libraries open 24/7. |

---

## Interface › HUD

| Setting | Key / Pref | Default | Effect |
| :--- | :--- | :---: | :--- |
| **Status bars display** | `port:hudVitalsMode` (`hudVitalsMode`) | `Percentage` | 3-tier selector (`Percentage` \| `Current / Max` \| `Combo`) for Health, Magicka, and Fatigue on the enhanced HUD. |
| **Renown bar** | `port:showRenownBar` (`showRenownBar`) | `Off` | Shows or hides the Renown level and progress bar beneath the HUD vitals. |

---

## Profile / Look Window (`skinCard.js`)

| Setting | Key / Mod Setting | Default | Effect |
| :--- | :--- | :---: | :--- |
| **Look → Paperdoll** | `eye-of-the-beholder` → `Graphics.Paperdoll` | `Off` | Added alongside `Skins` and `Layered Gearing (WIP)` in the top-right Profile / Look card. Draws the player on foot in 3rd person as a static cropped 2D character-sheet paperdoll when Third Person is `2D` (or falling back without Morrowind data). |

---

## Notable Default Changes to Existing Settings

* **UI & Intro:** `shopHidden: true` (online shop hidden), `plusTheme: 'iron'`, `textFont: 'sans'`, `skipStartVideo: true`.
* **Survival:** `survival: 'veteran'` is the default Climates & Calories tier (stern survival with Survival Boons, soft rust, and non-fatal cold/thirst HP harm).
* **Decorator:** `0.25m` grid snapping starts ON by default in both interiors and exterior yards.
* **Travel Options:** `FirstPersonTravel: true` and `FirstPersonTravelFollowsRoads: true`.
* **Removed:** `feat:event-board` was removed from `Interface › Messages & prompts`.
