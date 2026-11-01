import { isDeferralActive } from './deferral.ts';
import type { ClusterSignals, ImpactCounts, InventoryEntry } from './types.ts';

/** Computes a cluster's signals from its member events. `members` must not be empty. */
export function computeSignals(
  members: readonly InventoryEntry[],
  options: { now: Date; deferDays: number },
): ClusterSignals {
  const impact: ImpactCounts = { critical: 0, high: 0, medium: 0, low: 0, unrated: 0 };
  let firstCapturedAt: string | undefined;
  let latestCapturedAt: string | undefined;
  let latestDeferral: string | null = null;
  let allDeferred = true;

  for (const member of members) {
    impact[member.impact ?? 'unrated'] += 1;
    if (firstCapturedAt === undefined || member.capturedAt < firstCapturedAt) firstCapturedAt = member.capturedAt;
    if (latestCapturedAt === undefined || member.capturedAt > latestCapturedAt) latestCapturedAt = member.capturedAt;
    if (member.deferredAt === undefined) {
      allDeferred = false;
    } else if (latestDeferral === null || member.deferredAt > latestDeferral) {
      latestDeferral = member.deferredAt;
    }
  }

  if (firstCapturedAt === undefined || latestCapturedAt === undefined) {
    throw new Error('computeSignals requires at least one member');
  }

  const deferredActive =
    allDeferred &&
    latestDeferral !== null &&
    isDeferralActive({ deferredAt: latestDeferral, now: options.now, deferDays: options.deferDays });

  return {
    recurrence: members.length,
    impact,
    firstCapturedAt,
    latestCapturedAt,
    status: deferredActive ? 'deferred-active' : 'eligible',
  };
}
