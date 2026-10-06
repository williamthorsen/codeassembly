/** Classifies an assessor's reply under the sweep's decision policy. */
import { extractUncheckedItems, isChildCriterion } from './parent-status.ts';
import type { AssessorReply } from './schemas.ts';
import type { InProgress, Issue } from './types.ts';

/** The policy's classes, in the order in which `classify` tests them. The skill states one action per class. */
export const CLASSES = [
  'silent-keep',
  'escalate-in-progress',
  'auto-close-complete',
  'auto-close-half-met',
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

/** The ticket's state that the policy reads beside the reply. */
export interface ClassifyContext {
  inProgress: InProgress | null;
  umbrella: boolean;
}

/**
 * Returns the first class in `CLASSES` whose condition the reply meets. A silent keep neither closes nor comments, so
 * it applies to an in-progress ticket too; every other assessment of an in-progress ticket escalates, so that work under
 * way is never closed or commented on without a human decision.
 */
export function classify(reply: AssessorReply, context: ClassifyContext): PolicyClass {
  if (reply.recommendation === 'keep' && isEffectiveBaseline(reply.verdicts, context.umbrella)) return 'silent-keep';
  if (context.inProgress !== null) return 'escalate-in-progress';

  const isHigh = reply.confidence === 'high';
  if (reply.recommendation === 'close-complete' && isHigh) {
    const hasVerifiedReference = reply.references.some((reference) => reference.verified);
    const hasCompleteProgress = reply.verdicts.progress === 'complete' && reply.evidence.progress.length > 0;
    if (hasVerifiedReference || hasCompleteProgress) return 'auto-close-complete';
  }
  if (reply.rule === 'half-met' && isHigh) return 'auto-close-half-met';
  return 'escalate';
}

/** Returns whether every verdict that has a baseline is at it. */
export function isAllBaseline(verdicts: Readonly<Record<string, string | null>>): boolean {
  return Object.entries(BASELINE_VERDICTS).every(([dimension, baseline]) => verdicts[dimension] === baseline);
}

/**
 * Returns whether the verdicts are baseline, counting an umbrella's `partial` progress as baseline: An umbrella with
 * open children is expected to be partly done.
 */
export function isEffectiveBaseline(verdicts: Readonly<Record<string, string | null>>, umbrella: boolean): boolean {
  if (umbrella && verdicts.progress === 'partial')
    return isAllBaseline({ ...verdicts, progress: BASELINE_VERDICTS.progress });
  return isAllBaseline(verdicts);
}

/** Returns whether the ticket has open children and its only unchecked criterion is "Every child is closed". */
export function isUmbrella(ticket: Pick<Issue, 'body' | 'subIssues'>): boolean {
  const hasOpenChildren = ticket.subIssues.total > ticket.subIssues.completed;
  const unchecked = extractUncheckedItems(ticket.body);
  return hasOpenChildren && unchecked.length > 0 && unchecked.every(isChildCriterion);
}
