// @ts-check
/**
 * Leaf constants for the legendary infinite magic arrow ("Starflight").
 * Kept import-free so inventory, equip, HUD, and 3D model loaders can
 * import it without introducing circular dependencies.
 */

export const INFINITE_ARROW_TEMPLATE = 564;
export const INFINITE_ARROW_ID = 'starflight';

/** @param {any} item @returns {boolean} */
export const isInfiniteArrow = (item) =>
  item?.group === 'Weapons' && item?.templateIndex === INFINITE_ARROW_TEMPLATE;

/** @param {any[] | null | undefined} items @returns {boolean} */
export const hasInfiniteArrow = (items) =>
  Array.isArray(items) && items.some((it) => isInfiniteArrow(it) && !it.questItem);
