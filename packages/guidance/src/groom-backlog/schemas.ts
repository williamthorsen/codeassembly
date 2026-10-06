/**
 * Zod schemas for the assessor's reply, the ledger's records, and the ticket-comment marker.
 *
 * The record and marker schemas are loose: The calibration sweep wrote its decision records in three key sets and its
 * policy record free-form, and a parser that dropped or refused a field it did not know would lose that history.
 */
import { z } from 'zod';

/** The five assessment dimensions, in the order in which the procedure investigates them. */
export const DIMENSIONS = ['drift', 'relevance', 'progress', 'advisability', 'complexity'] as const;

/** The dispositions that an assessor can recommend. */
export const RECOMMENDATIONS = [
  'keep',
  'close-complete',
  'close-superseded',
  'update',
  'revise',
  'split',
  'escalate',
] as const;

/** The dispositions that a `decision` record written by this helper can state. */
export const DECISIONS = [
  'keep',
  'close-complete',
  'close-superseded',
  'close-not-planned',
  'update',
  'revise',
  'split',
] as const;

/** Who decided a disposition: the policy, the user in a digest, or the user's decision for a whole group. */
export const DECIDED_BY = ['policy', 'user', 'bulk'] as const;

const ConfidenceSchema = z.enum(['high', 'medium', 'low']);

const VerdictsSchema = z.object({
  drift: z.enum(['none', 'partial', 'severe']),
  relevance: z.enum(['relevant', 'uncertain', 'superseded']),
  progress: z.enum(['complete', 'partial', 'none']),
  advisability: z.enum(['advisable', 'questionable', 'inadvisable']).nullable(),
  complexity: z.enum(['trivial', 'mechanical', 'involved', 'architectural']).nullable(),
});

const OverlapSchema = z.object({
  tickets: z.array(z.number().int().positive()).min(2),
  survivor: z.number().int().positive(),
  reason: z.string(),
});

/** The recommendations that carry a drafted edit. */
export const DRAFTED_RECOMMENDATIONS = ['update', 'revise', 'split'] as const;

const DraftSectionSchema = z.object({
  heading: z
    .string()
    .transform((heading) => heading.replace(/^##\s+/, '').trim())
    .pipe(z.string().min(1)),
  body: z.string().min(1),
});

/**
 * The edit that an `update`, `revise`, or `split` recommendation drafts: the replacement `## ` sections of the ticket
 * body, by heading, and for a split the child tickets.
 */
export const DraftSchema = z
  .object({
    sections: z.array(DraftSectionSchema).min(1),
    children: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })),
  })
  .superRefine((draft, context) => {
    const headings = draft.sections.map((section) => section.heading.toLowerCase());
    if (new Set(headings).size !== headings.length) {
      context.addIssue({ code: 'custom', path: ['sections'], message: 'names each heading once' });
    }
  });

export type Draft = z.infer<typeof DraftSchema>;

/** The JSON block that the `ticket-assessor` subagent returns. */
export const AssessorReplySchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string(),
    verdicts: VerdictsSchema,
    evidence: z.object({
      drift: z.array(z.string()),
      relevance: z.array(z.string()),
      progress: z.array(z.string()),
      advisability: z.array(z.string()),
      complexity: z.array(z.string()),
    }),
    markdown: z.string().min(1),
    recommendation: z.enum(RECOMMENDATIONS),
    rule: z.literal('half-met').nullable(),
    remainder: z.array(z.string().min(1)),
    confidence: ConfidenceSchema,
    reason: z.string().min(1),
    relatedTickets: z.array(z.number().int().positive()),
    references: z.array(z.object({ ref: z.string().min(1), verified: z.boolean(), note: z.string() })),
    dependsOn: z.number().int().positive().nullable(),
    overlaps: z.array(OverlapSchema),
    draft: DraftSchema.nullable().default(null),
  })
  .superRefine((reply, context) => {
    const isDrafted = new Set<string>(DRAFTED_RECOMMENDATIONS).has(reply.recommendation);
    if (isDrafted !== (reply.draft !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['draft'],
        message: 'is present exactly when the recommendation is update, revise, or split',
      });
    }
    if (reply.draft !== null && (reply.recommendation === 'split') !== reply.draft.children.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['draft', 'children'],
        message: 'is non-empty exactly when the recommendation is split',
      });
    }
    if ((reply.rule === 'half-met') !== reply.remainder.length > 0) {
      context.addIssue({ code: 'custom', path: ['remainder'], message: 'is non-empty exactly when rule is half-met' });
    }
    if (reply.rule === 'half-met' && reply.recommendation !== 'close-superseded') {
      context.addIssue({ code: 'custom', path: ['rule'], message: 'half-met requires close-superseded' });
    }
  });

export type AssessorReply = z.infer<typeof AssessorReplySchema>;

/** A sign that someone is working on a ticket, as `collect` writes it. */
export const InProgressSchema = z.object({
  signal: z.enum(['manifest', 'branch', 'remote-branch']),
  ref: z.string(),
  commitsAhead: z.number().int().nonnegative(),
  lastCommitAt: z.string(),
});

const RecordBaseShape = { run: z.string().min(1) };

/** An `assessment` record. The fields after `inProgress` are absent from the calibration's records. */
export const AssessmentRecordSchema = z.looseObject({
  ...RecordBaseShape,
  kind: z.literal('assessment'),
  number: z.number().int().positive(),
  assessedAt: z.string(),
  sha: z.string(),
  ticketUpdatedAt: z.string(),
  verdicts: z.record(z.string(), z.string().nullable()),
  recommendation: z.string(),
  confidence: z.string(),
  reason: z.string(),
  relatedTickets: z.array(z.number()),
  inProgress: InProgressSchema.nullable(),
  class: z.string().optional(),
  rule: z.string().nullable().optional(),
  dependsOn: z.number().nullable().optional(),
  overlaps: z.array(OverlapSchema).optional(),
});

/** A `decision` record. */
export const DecisionRecordSchema = z.looseObject({
  ...RecordBaseShape,
  kind: z.literal('decision'),
  number: z.number().int().positive(),
  decision: z.string().min(1),
  actor: z.string().min(1),
  decidedBy: z.string().min(1),
  appliedAt: z.string(),
  supersededBy: z.number().int().positive().nullable().optional(),
  reason: z.string().optional(),
});

/** A `policy` record, stating the run's settings. */
export const PolicyRecordSchema = z.looseObject({
  ...RecordBaseShape,
  kind: z.literal('policy'),
  decisions: z.record(z.string(), z.unknown()),
  decidedBy: z.string().min(1),
  recordedAt: z.string(),
});

/** A `note` record. */
export const NoteRecordSchema = z.looseObject({
  ...RecordBaseShape,
  kind: z.literal('note'),
  text: z.string().min(1),
  recordedAt: z.string(),
});

/** A `pull` record: the tickets picked from the backlog at a commit. */
export const PullRecordSchema = z.looseObject({
  ...RecordBaseShape,
  kind: z.literal('pull'),
  picked: z.array(z.number().int().positive()),
  sha: z.string().min(1),
  recordedAt: z.string(),
});

/** A `ripple` record, which earlier runs wrote: the closed ticket whose related set was assessed, its closing PR, and the set. */
export const RippleRecordSchema = z.looseObject({
  ...RecordBaseShape,
  kind: z.literal('ripple'),
  number: z.number().int().positive(),
  pr: z.number().int().positive().nullable(),
  candidates: z.array(z.number().int().positive()),
  recordedAt: z.string(),
});

export const LedgerRecordSchema = z.discriminatedUnion('kind', [
  AssessmentRecordSchema,
  DecisionRecordSchema,
  PolicyRecordSchema,
  NoteRecordSchema,
  PullRecordSchema,
  RippleRecordSchema,
]);

export type AssessmentRecord = z.infer<typeof AssessmentRecordSchema>;
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;
export type LedgerRecord = z.infer<typeof LedgerRecordSchema>;

/**
 * A record that `record` accepts on stdin. `run` and the timestamp are filled in when absent, and a decision is held
 * to the helper's own vocabulary.
 */
export const RecordInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('decision'),
    number: z.number().int().positive(),
    decision: z.enum(DECISIONS),
    actor: z.string().min(1).default('agent'),
    decidedBy: z.enum(DECIDED_BY),
    appliedAt: z.string().optional(),
    supersededBy: z.number().int().positive().optional(),
    reason: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('policy'),
    decisions: z.record(z.string(), z.unknown()),
    decidedBy: z.string().min(1),
    recordedAt: z.string().optional(),
  }),
  z.object({
    kind: z.literal('note'),
    text: z.string().min(1),
    recordedAt: z.string().optional(),
  }),
  z.object({
    kind: z.literal('pull'),
    picked: z.array(z.number().int().positive()),
    sha: z.string().min(1),
    recordedAt: z.string().optional(),
  }),
]);

/** The machine-readable record inside a `codeassembly-triage` comment marker. */
export const MarkerSchema = z.looseObject({
  run: z.string().min(1),
  assessedAt: z.string().nullable().optional(),
  sha: z.string().nullable().optional(),
  verdicts: z.record(z.string(), z.string().nullable()).nullable().optional(),
  recommendation: z.string().nullable().optional(),
  confidence: z.string().nullable().optional(),
  rule: z.string().nullable().optional(),
  remainder: z.array(z.string()).optional(),
  decision: z.string().optional(),
  actor: z.string().optional(),
  decidedBy: z.string().optional(),
});

export type Marker = z.infer<typeof MarkerSchema>;
