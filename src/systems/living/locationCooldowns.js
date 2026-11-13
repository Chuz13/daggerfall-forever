// @ts-check
export const LOCATION_EVENT_COOLDOWN_MINUTES = 4320; // 3 in-game days (72 hours)
export const SKIRMISH_LOCATION_COOLDOWN_MINUTES = LOCATION_EVENT_COOLDOWN_MINUTES; // backwards-compatible alias
export const locationEventCooldowns = new Map();
export const locationSkirmishCooldowns = locationEventCooldowns; // backwards-compatible alias

export function getLocationEventCooldownsSnapshot() {
  return Object.fromEntries(locationEventCooldowns);
}

export function restoreLocationEventCooldownsSnapshot(record) {
  locationEventCooldowns.clear();
  if (record && typeof record === 'object') {
    for (const [k, v] of Object.entries(record)) {
      if (Number.isFinite(v)) locationEventCooldowns.set(k, Number(v));
    }
  }
}
