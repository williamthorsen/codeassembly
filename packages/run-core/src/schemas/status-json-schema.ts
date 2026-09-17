import { z } from 'zod';

import { phaseDecisionMapSchema, phasesSchema, runStatusSchema } from './run-index-schema.ts';

export { criticalitySchema, phaseStatusSchema, runStatusSchema } from './run-index-schema.ts';

/**
 * V1 status.json schema: a flat structure. The phase-decision map is named `phaseDecision`, in the singular, where v2
 * and the canonical model name it `phaseDecisions`.
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
