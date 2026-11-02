import { z } from 'zod';

import { BINS } from './types.ts';

const PinSchema = z.object({
  repo: z.string().min(1),
  root: z.string().min(1),
  branch: z.string().min(1),
  sha: z.string().regex(/^[0-9a-f]{40}$/),
  sources: z.array(z.string()),
});

const ReferenceEntrySchema = z.object({
  id: z.string().min(1),
  summary: z.string(),
  excerpt: z.string(),
  references: z.array(z.string().min(1)).min(1),
});

/** The shape of the file that the `pin` command writes. */
export const PinsFileSchema = z.object({
  pins: z.array(PinSchema),
  skipped: z.array(z.object({ source: z.string(), reason: z.string() })),
});

/** The shape of the file that the `references` command writes. */
export const ReferencesFileSchema = z.object({
  store: z.string().min(1),
  references: z.array(ReferenceEntrySchema),
});

/** The shape of one judge's assignment: its clusters with their events, and what the judge reads them against. */
export const AssignmentSchema = z.object({
  store: z.string().min(1),
  clusters: z.array(
    z.object({
      id: z.string().min(1),
      lesson: z.string(),
      events: z.array(
        z.object({
          id: z.string().min(1),
          summary: z.string(),
          excerpt: z.string(),
          skill: z.string().exactOptional(),
          deferredAt: z.string().exactOptional(),
        }),
      ),
    }),
  ),
  references: z.array(ReferenceEntrySchema),
  pins: z.array(PinSchema),
});

export type Assignment = z.infer<typeof AssignmentSchema>;

/** The shape of the bins file that a judge writes beside its assignment. */
export const BinsFileSchema = z.object({
  events: z.array(
    z.object({
      id: z.string().min(1),
      bin: z.enum(BINS),
      source: z.string().exactOptional(),
      path: z.string().exactOptional(),
      duplicateOf: z.string().exactOptional(),
      reason: z.string().exactOptional(),
    }),
  ),
});

export type BinsFile = z.infer<typeof BinsFileSchema>;

const MarkResultSchema = z.object({ ok: z.boolean(), failed: z.array(z.string()) }).nullable();

/** The shape of the curation record that `validate` writes and that the skill fills with each mark's result. */
export const RecordSchema = z.object({
  store: z.string().min(1),
  pins: z.array(PinSchema),
  events: z.array(
    z.object({
      id: z.string().min(1),
      summary: z.string(),
      bin: z.enum(BINS),
      reason: z.string().exactOptional(),
      reference: z.string().exactOptional(),
      duplicateOf: z.string().exactOptional(),
      file: z.string().min(1),
    }),
  ),
  counts: z.object({ covered: z.number(), duplicate: z.number(), obsolete: z.number(), kept: z.number() }),
  marks: z.object({
    addressedBy: z.array(
      z.object({
        references: z.array(z.string()).min(1),
        eventIds: z.array(z.string()).min(1),
        result: MarkResultSchema,
      }),
    ),
    obsolete: z.object({ eventIds: z.array(z.string()), result: MarkResultSchema }),
  }),
});

export type CurationRecord = z.infer<typeof RecordSchema>;
