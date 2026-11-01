/** The documents that the code-health helper reads and writes: the sense document and a lens's proposals. */
import { z } from 'zod';

export const SENSOR_STATUSES = ['ok', 'failed', 'not-applicable'] as const;

export const SensorResultSchema = z.object({
  name: z.string().min(1),
  version: z.string().nullable(),
  status: z.enum(SENSOR_STATUSES),
  detail: z.string().nullable(),
  outputPath: z.string().nullable(),
  data: z.unknown(),
});

export const SenseDocumentSchema = z.object({
  unit: z.string().min(1),
  windowDays: z.number().int().positive(),
  windowStart: z.string().nullable(),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  sensors: z.array(SensorResultSchema),
});

const SpanEvidenceSchema = z.strictObject({
  kind: z.literal('span'),
  path: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  quote: z.string().min(1),
});

const RuleEvidenceSchema = z.strictObject({
  kind: z.literal('rule'),
  rulebook: z.string().min(1),
  section: z.string().min(1),
  quote: z.string().min(1),
});

const SensorEvidenceSchema = z.strictObject({
  kind: z.literal('sensor'),
  sensor: z.string().min(1),
  detail: z.string().min(1),
});

export const EvidenceSchema = z.discriminatedUnion('kind', [
  SpanEvidenceSchema,
  RuleEvidenceSchema,
  SensorEvidenceSchema,
]);

/** A proposal carries ordinals but never a confidence or value grade, so the object is strict. */
export const ProposalSchema = z.strictObject({
  id: z.string().regex(/^[A-Z]+\d+$/),
  title: z.string().min(1),
  key: z.string().min(1),
  paths: z.array(z.string().min(1)).min(1),
  evidence: z.array(EvidenceSchema).min(1),
  change: z.string().min(1),
  strength: z.enum(['sensor', 'rule', 'reading']),
  size: z.enum(['small', 'medium', 'large']),
  reach: z.number().int().nonnegative(),
});

export const ProposalsSchema = z.array(ProposalSchema);

export type Evidence = z.infer<typeof EvidenceSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type SenseDocument = z.infer<typeof SenseDocumentSchema>;
export type SensorResult = z.infer<typeof SensorResultSchema>;
