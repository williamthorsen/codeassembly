// The triage artifact's filename dates the deferral, so the helper never reads the artifact itself, which may live on
// another machine.
const TRIAGE_REFERENCE = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})Z_[^/]+_feedback-triage\.md$/;

const DAY_MS = 86_400_000;

/** Returns the ISO timestamp of a triage-artifact reference, or `null` for any other reference. */
export function parseTriageReferenceDate(reference: string): string | null {
  const basename = reference.slice(reference.lastIndexOf('/') + 1);
  const match = TRIAGE_REFERENCE.exec(basename);
  if (match === null) {
    return null;
  }
  const [, year, month, day, hour, minute, second] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * Returns the latest deferral timestamp among `references`, or `null` unless every reference is a triage-artifact
 * reference. A deferred event that was later addressed some other way, such as by a ticket, is not deferred.
 */
export function findLatestDeferral(references: readonly string[]): string | null {
  let latest: string | null = null;
  for (const reference of references) {
    const date = parseTriageReferenceDate(reference);
    if (date === null) {
      return null;
    }
    if (latest === null || date > latest) {
      latest = date;
    }
  }
  return latest;
}

/** Reports whether a deferral made at `deferredAt` still holds at `now`. */
export function isDeferralActive(input: { deferredAt: string; now: Date; deferDays: number }): boolean {
  return input.now.getTime() - Date.parse(input.deferredAt) < input.deferDays * DAY_MS;
}
