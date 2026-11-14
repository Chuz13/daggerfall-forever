# Settings Added Outside the DFF Tab

While major experimental frameworks (**Living Tamriel** and **Dark Arts & Necromancy**) live under the bottom **DFF** tab in the Enhanced Settings menu, many DFF features and granular toggles are placed directly in their natural vanilla/DFO categories.

---

## Gameplay › Character & survival

| Setting | Key / Pref | Default | Effect |
| :--- | :--- | :---: | :--- |
| **Firmament (Offline)** | `port:offlineFirmament` (`offlineFirmament`) | `On` | Enables the Firmament constellation passive tree and Renown leveling offline. |
| **Professions & Gathering (Offline)** | `port:offlineProfessions` (`offlineProfessions`) | `On` | Enables offline gathering nodes (mining, herbs, logging, hunting, fishing) and crafting professions. |
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
| **Morrowind Player Body** | `feat:mw-player-body` (`mwPlayerBody`) | `Off` | Draws the player in 3D using Morrowind data (1st-person hands/weapons, 3rd-person body, 3D inventory figure). Takes effect immediately. |
| **Inventory Player Figure** | `feat:mw-inventory-body` (`mwInventoryBody`) | `Follow Player Body` | 3-tier selector (`Follow Player Body` \| `Always 3D` \| `Always Paperdoll`). Independently controls the inventory paperdoll vs. 3D model. |
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

## Notable Default Changes to Existing Settings

* **UI & Intro:** `shopHidden: true` (online shop hidden), `plusTheme: 'iron'`, `textFont: 'sans'`, `skipStartVideo: true`.
* **Travel Options:** `FirstPersonTravel: true` and `FirstPersonTravelFollowsRoads: true`.
* **Removed:** `feat:event-board` was removed from `Interface › Messages & prompts`.
