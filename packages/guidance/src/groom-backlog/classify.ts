/** Classifies an assessor's reply under the sweep's decision policy. */
import type { AssessorReply } from './schemas.ts';
import type { InProgress } from './types.ts';

/** The policy's classes, in the order in which `classify` tests them. The skill states one action per class. */
export const CLASSES = [
  'escalate-in-progress',
  'auto-close-complete',
  'auto-close-half-met',
  'silent-keep',
  'escalate',
] as const;

export type PolicyClass = (typeof CLASSES)[number];

/** The baseline verdict of each dimension that has one; complexity is informational and does not. */
export const BASELINE_VERDICTS = {
  drift: 'none',
  relevance: 'relevant',
  progress: 'none',
  advisability: 'advisable',
} as const;

/**
 * Returns the first class in `CLASSES` whose condition the reply meets. An in-progress ticket escalates whatever its
 * assessment, so that work under way is never closed without a human decision.
 */
export function classify(reply: AssessorReply, inProgress: InProgress | null): PolicyClass {
  if (inProgress !== null) return 'escalate-in-progress';

  const isHigh = reply.confidence === 'high';
  if (reply.recommendation === 'close-complete' && isHigh) {
    const hasVerifiedReference = reply.references.some((reference) => reference.verified);
    const hasCompleteProgress = reply.verdicts.progress === 'complete' && reply.evidence.progress.length > 0;
    if (hasVerifiedReference || hasCompleteProgress) return 'auto-close-complete';
  }
  if (reply.rule === 'half-met' && isHigh) return 'auto-close-half-met';
  if (reply.recommendation === 'keep' && isAllBaseline(reply.verdicts)) return 'silent-keep';
  return 'escalate';
}

/** Returns whether every verdict that has a baseline is at it. */
export function isAllBaseline(verdicts: Readonly<Record<string, string | null>>): boolean {
  return Object.entries(BASELINE_VERDICTS).every(([dimension, baseline]) => verdicts[dimension] === baseline);
}
