import type { AssessorReply } from '../schemas.ts';

/** Builds a valid assessor reply that keeps a ticket with all-baseline verdicts, overridden by `overrides`. */
export function buildReply(overrides: Partial<AssessorReply> = {}): AssessorReply {
  return {
    number: 10,
    title: 'Add a retry to the uploader',
    verdicts: {
      drift: 'none',
      relevance: 'relevant',
      progress: 'none',
      advisability: 'advisable',
      complexity: 'mechanical',
    },
    evidence: { drift: [], relevance: ['The uploader still fails'], progress: [], advisability: [], complexity: [] },
    markdown: '## Assessment: Add a retry to the uploader (#10)\n\nAssessed at 20261001-120000Z against abc1234',
    recommendation: 'keep',
    rule: null,
    remainder: [],
    confidence: 'high',
    reason: 'The ticket stands as written.',
    relatedTickets: [],
    references: [],
    dependsOn: null,
    overlaps: [],
    draft: null,
    ...overrides,
  };
}
