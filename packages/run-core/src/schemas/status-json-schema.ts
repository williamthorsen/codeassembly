import { z } from 'zod';

import { phaseDecisionMapSchema, phasesSchema, runStatusSchema } from './run-index-schema.js';

export { criticalitySchema, phaseStatusSchema, runStatusSchema } from './run-index-schema.js';

/**
 * V1 status.json schema. Flat structure with `phaseDecision` (singular)
 * instead of the V2 `phaseDecisions` (plural). The singular name is the
 * historical V1 convention; `normalizeV1()` in run-data-parser.ts maps it
 * to the canonical plural form. No `mode`, `model`, or `artifacts` fields.
 */
export const v1StatusSchema = z.object({
  runId: z.string(),
  projectSlug: z.string(),
  ticketId: z.string().optional(),
  projectRoot: z.string(),
  branch: z.string(),
  task: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullish(),
  status: runStatusSchema,
  externalPlan: z.boolean().optional(),
  mergeBaseSha: z.string().optional(),
  diffBase: z.string().optional(),
  maxReviewRounds: z.number().optional(),
  phases: phasesSchema,
  phaseDecision: phaseDecisionMapSchema,
});
