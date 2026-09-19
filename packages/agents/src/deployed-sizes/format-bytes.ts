/** Bytes in one kibibyte, the unit in which a deployment's sizes are readable. */
const BYTES_PER_KIB = 1_024;

/**
 * Renders one byte count at the scale that keeps it readable: kibibytes to one decimal place above a kibibyte, and
 * bytes below it, so that a description of a few dozen bytes is distinguishable from nothing at all.
 */
export function formatBytes(bytes: number): string {
  return bytes < BYTES_PER_KIB ? `${bytes} B` : `${(bytes / BYTES_PER_KIB).toFixed(1)} KiB`;
}

/**
 * Renders one byte count's change at the same scale, always signed, so that a column of deltas states its direction
 * without a second column. A change of nothing renders `+0 B`.
 */
export function formatDelta(delta: number): string {
  return `${delta < 0 ? '-' : '+'}${formatBytes(Math.abs(delta))}`;
}
