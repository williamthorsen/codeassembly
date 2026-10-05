const DAY_MS = 86_400_000;

/** Returns the whole days elapsed from `timestamp` to `now`, negative when `timestamp` is later. */
export function daysSince(timestamp: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(timestamp)) / DAY_MS);
}
