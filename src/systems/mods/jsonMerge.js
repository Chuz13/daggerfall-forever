// @ts-check
// DFF DATA-DRIVEN MODDING: Deep JSON Merger
//
// Merges configuration objects and data tables declaratively.
// Supports:
// - Deep object property merging
// - Array merging with entity key deduplication (id, name, key)
// - Pure immutability: never mutates input arguments

/**
 * Check if a value is a plain JavaScript object.
 * @param {any} item
 * @returns {boolean}
 */
export function isPlainObject(item) {
  return item !== null && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Deep merge source into target without mutating either.
 * If both target and source have an array of objects with an 'id' or 'name',
 * objects with matching keys will be merged; new items will be appended.
 *
 * @param {any} target
 * @param {any} source
 * @returns {any}
 */
export function deepMerge(target, source) {
  if (source === undefined) return structuredClone(target);
  if (target === undefined) return structuredClone(source);

  // If types differ or primitive, source overrides target
  if (typeof target !== typeof source || target === null || source === null) {
    return structuredClone(source);
  }

  // Handle Arrays
  if (Array.isArray(target) && Array.isArray(source)) {
    // Check if items are identifiable objects (by 'id', 'name', or 'key')
    const hasKeys = source.some((item) => isPlainObject(item) && (item.id || item.name || item.key));
    if (!hasKeys) {
      // Plain array: concatenate without duplicate primitives
      return Array.from(new Set([...target, ...source]));
    }

    // Merge array by identity
    const result = target.map((item) => structuredClone(item));
    for (const sItem of source) {
      if (!isPlainObject(sItem)) {
        result.push(structuredClone(sItem));
        continue;
      }
      const sKey = sItem.id ?? sItem.name ?? sItem.key;
      if (sKey === undefined) {
        result.push(structuredClone(sItem));
        continue;
      }

      const matchIndex = result.findIndex(
        (tItem) => isPlainObject(tItem) && (tItem.id ?? tItem.name ?? tItem.key) === sKey
      );

      if (matchIndex >= 0) {
        result[matchIndex] = deepMerge(result[matchIndex], sItem);
      } else {
        result.push(structuredClone(sItem));
      }
    }
    return result;
  }

  // Handle Objects
  if (isPlainObject(target) && isPlainObject(source)) {
    const output = structuredClone(target);
    for (const [key, value] of Object.entries(source)) {
      if (key in target) {
        output[key] = deepMerge(target[key], value);
      } else {
        output[key] = structuredClone(value);
      }
    }
    return output;
  }

  // Fallback for primitives
  return structuredClone(source);
}
