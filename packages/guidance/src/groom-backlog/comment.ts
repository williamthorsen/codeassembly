/** Renders the comment that records a decision on a ticket: the assessment, the disposition, and the marker. */
import { isEffectiveBaseline } from './classify.ts';
import { renderMarker } from './marker.ts';
import type { AssessorReply, Marker } from './schemas.ts';
import type { InProgress } from './types.ts';

/** A reply file: the assessor's reply as `ingest` stored it, with the assessment's provenance. */
export interface StoredReply extends AssessorReply {
  assessedAt: string;
  inProgress: InProgress | null;
  sha: string;
  ticketUpdatedAt: string;
  umbrella: boolean;
}

/** The decision that the comment records. */
export interface CommentDecision {
  decidedBy: 'bulk' | 'policy' | 'user';
  decision: string;
  reason: string | undefined;
  run: string;
  supersededBy: number | undefined;
}

/**
 * Renders the comment body. A bulk decision does not have a reply: Its body is the disposition alone, and its marker
 * states null verdicts and a null recommendation.
 */
export function renderComment(decision: CommentDecision, reply: StoredReply | undefined): string {
  const reason = decision.reason ?? reply?.reason;
  const isHalfMet = reply?.rule === 'half-met' && decision.decision === 'close-superseded';
  const sections: string[] = [];

  if (reply !== undefined) sections.push(reply.markdown.trim());
  sections.push(`**Disposition:** ${describeDisposition(decision, isHalfMet, reason)}`);
  if (isHalfMet) {
    sections.push(['**Remainder:**', '', ...reply.remainder.map((part) => `- ${part}`)].join('\n'));
  }

  const marker: Marker = {
    run: decision.run,
    assessedAt: reply?.assessedAt ?? null,
    sha: reply?.sha ?? null,
    verdicts: reply?.verdicts ?? null,
    recommendation: reply?.recommendation ?? null,
    confidence: reply?.confidence ?? null,
    rule: isHalfMet ? 'half-met' : null,
    remainder: isHalfMet ? reply.remainder : [],
    decision: decision.decision,
    actor: 'agent',
    decidedBy: decision.decidedBy,
  };
  sections.push(renderMarker(marker));
  return `${sections.join('\n\n')}\n`;
}

/**
 * Returns whether the decision's comment is posted. A close or a bulk decision always is; a decision that keeps the
 * ticket open is posted only when its verdicts are not baseline, counting an umbrella's partial progress as baseline.
 */
export function shouldPostComment(
  decision: Pick<CommentDecision, 'decidedBy' | 'decision'>,
  reply: StoredReply | undefined,
): boolean {
  if (decision.decidedBy === 'bulk' || decision.decision.startsWith('close-') || reply === undefined) return true;
  return !isEffectiveBaseline(reply.verdicts, reply.umbrella);
}

// region | Helpers

/** Returns the disposition sentence, followed by the reason when there is one. */
function describeDisposition(decision: CommentDecision, isHalfMet: boolean, reason: string | undefined): string {
  const lead = describeLead(decision, isHalfMet);
  return reason === undefined || reason === '' ? lead : `${lead} ${reason}`;
}

/** Returns the sentence that states what was done with the ticket. */
function describeLead(decision: CommentDecision, isHalfMet: boolean): string {
  switch (decision.decision) {
    case 'close-complete':
      return 'Closed as complete.';
    case 'close-superseded':
      if (isHalfMet) {
        return "Closed as superseded, under the sweep's half-met rule: The motivation was met by other work, and the remainder does not have acceptance criteria. Reopen if the remainder is still wanted.";
      }
      return decision.supersededBy === undefined
        ? 'Closed as superseded.'
        : `Closed as superseded by #${decision.supersededBy}.`;
    case 'close-not-planned':
      return 'Closed as not planned.';
    case 'update':
      return 'Kept open, to be updated to match the codebase.';
    case 'revise':
      return 'Kept open, to be revised.';
    case 'split':
      return 'Kept open, to be split.';
    default:
      return 'Kept open.';
  }
}

// endregion | Helpers
