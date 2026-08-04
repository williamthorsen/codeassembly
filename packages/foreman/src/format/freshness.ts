/** Formats the age of `tsIso` at `nowMs` as a compact "12s ago" / "3m 40s ago" / "2h 5m ago", or "—" when unknown. */
export function formatFreshness(tsIso: string | null, nowMs: number): string {
  if (tsIso === null) {
    return '—';
  }
  const elapsedMs = nowMs - Date.parse(tsIso);
  if (!Number.isFinite(elapsedMs)) {
    return '—';
  }
  const seconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}
