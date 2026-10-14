/**
 * Returns the known key nearest to `key` by case-insensitive edit distance, or `undefined` when none is within
 * `max(1, floor(key.length / 3))` edits. Ties go to the alphabetically first key.
 */
export function findNearestKey(key: string, knownKeys: readonly string[]): string | undefined {
  const threshold = Math.max(1, Math.floor(key.length / 3));
  let nearest: { key: string; distance: number } | undefined;
  for (const candidate of knownKeys.toSorted()) {
    const distance = measureEditDistance(key.toLowerCase(), candidate.toLowerCase());
    if (distance <= threshold && (nearest === undefined || distance < nearest.distance)) {
      nearest = { key: candidate, distance };
    }
  }
  return nearest?.key;
}

// region | Helpers

/** Computes the Levenshtein distance between two strings. */
function measureEditDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    for (let column = 1; column <= right.length; column++) {
      const substitution = (previous[column - 1] ?? 0) + (left[row - 1] === right[column - 1] ? 0 : 1);
      current[column] = Math.min((previous[column] ?? 0) + 1, (current[column - 1] ?? 0) + 1, substitution);
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}

// endregion | Helpers
