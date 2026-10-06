/** Proposes the action that a digest entry applies when the user confirms its page. */
import type { OverlapGroup } from './digest.ts';
import type { DECISIONS } from './schemas.ts';
import type { Escalation } from './types.ts';

/** A digest entry's proposed action: a decision that the skill applies on confirmation, or `leave`, which writes nothing. */
export interface ProposedAction {
  decision: (typeof DECISIONS)[number] | 'leave';
  supersededBy?: number;
}

/**
 * Returns the action that the entry proposes. A ticket in progress, or one without a stored reply, is left for the user
 * to name. A drafted recommendation applies its draft, a high-confidence close closes, and a keep keeps; anything else
 * is left. A superseded close names its overlap group's survivor when that is another ticket.
 */
export function proposeAction(escalation: Escalation, group: OverlapGroup | undefined): ProposedAction {
  const { record, reply } = escalation;
  if (record.inProgress !== null || reply === undefined) return { decision: 'leave' };

  switch (reply.recommendation) {
    case 'keep':
    case 'revise':
    case 'split':
    case 'update':
      return { decision: reply.recommendation };
    case 'close-complete':
      return { decision: reply.confidence === 'high' ? 'close-complete' : 'leave' };
    case 'close-superseded': {
      if (reply.confidence !== 'high') return { decision: 'leave' };
      const survivor = group?.survivor;
      return survivor === undefined || survivor === record.number
        ? { decision: 'close-superseded' }
        : { decision: 'close-superseded', supersededBy: survivor };
    }
    default:
      return { decision: 'leave' };
  }
}
