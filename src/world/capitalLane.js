// @ts-check
// TESA10/TESA11 (bible/03-World/Arena-Provinces.md) - THE CAPITALS' MAP IDS, alone: their lane and the test of one, with no
// import, so a reader that keys by a map id (systems/banking.js's deeds, AUDIT RELEASE R2-9) asks it without the
// capitals' plans. world/tamrielCapitals.js re-exports both.

/** The capitals' lane - after the country places' 64 (0x300-0x33f) and the lairs' (0x340). */
export const CAPITAL_LANE = 0x341;
/** Is a map id a capital's - any slice's (world/tamrielCapitals.js capitalPlaceId). */
export const isCapitalPlaceId = (id) =>
  ((Number(id) >>> 20) & 0xfff) === CAPITAL_LANE && ((Number(id) >>> 0) & 0x80000) !== 0;

/** Extracts the capital index `k` (0..CAPITALS.length-1) from any slice map id, or -1 if not a capital id. */
export const capitalIndexOfId = (id) =>
  isCapitalPlaceId(id) ? ((Number(id) >>> 0) & 0x7ffff) % 16 : -1;

/** Maps any slice map id of a multi-slice capital to its canonical centre map id (`so = 0`). */
export const canonicalCapitalMapId = (id) => {
  const k = capitalIndexOfId(id);
  return k >= 0 ? (((CAPITAL_LANE << 20) | 0x80000 | k) >>> 0) : id;
};
