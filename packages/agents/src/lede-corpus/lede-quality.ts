// The quality rating a lede decision carries. The helper that records a decision and the one that selects exemplars
// from the corpus share this vocabulary and its order, so neither can rename a level or reorder the scale alone.

/** The quality levels a rated lede may carry, ordered lowest to highest. */
export const LEDE_QUALITY_LEVELS = ['poor', 'adequate', 'good', 'strong', 'exemplary'] as const;

/** The author's rating of the lede that shipped, whether the agent wrote it or the author rewrote it before merge. */
export type LedeQuality = (typeof LEDE_QUALITY_LEVELS)[number];

// A widened-element set for membership tests: the `as const` tuple's literal element type rejects a `string` argument
// to `.includes`, and type assertions are banned, so the set's `.has(string)` is the assertion-free lookup.
const QUALITY_LEVEL_SET: ReadonlySet<string> = new Set(LEDE_QUALITY_LEVELS);

/** Reports whether a value is one of the declared {@link LEDE_QUALITY_LEVELS}. */
export function isLedeQuality(value: unknown): value is LedeQuality {
  return typeof value === 'string' && QUALITY_LEVEL_SET.has(value);
}

/**
 * Reports whether a rating meets a floor, comparing the two by their position in {@link LEDE_QUALITY_LEVELS}. The
 * tuple's order is the scale, so a level's rank is where it sits rather than anything the level itself carries.
 */
export function meetsQualityFloor(input: { quality: LedeQuality; floor: LedeQuality }): boolean {
  return LEDE_QUALITY_LEVELS.indexOf(input.quality) >= LEDE_QUALITY_LEVELS.indexOf(input.floor);
}
