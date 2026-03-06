import { z } from 'zod';

/** Valid run-level statuses. */
export const runStatusSchema = z.enum(['in_progress', 'completed', 'failed', 'needs_manual_review']);

/** Valid phase-level statuses. */
export const phaseStatusSchema = z.enum(['completed', 'skipped', 'failed', 'in_progress', 'approved']);

/** Valid criticality levels. */
export const criticalitySchema = z.enum(['none', 'low', 'medium', 'high']);

/**
 * A single phase entry. Known enum fields are validated when present;
 * unknown keys pass through to preserve forward compatibility.
 *
 * Fields use `.nullish()` because production data contains explicit `null`
 * values (meaning "phase not yet reached") as distinct from `undefined`
 * (field absent). `.partial()` makes every field optional so keys can be
 * omitted entirely.
 */
export const phaseEntrySchema = z
  .object({
    status: phaseStatusSchema.nullish(),
    criticality: criticalitySchema.nullish(),
    finalCriticality: criticalitySchema.nullish(),
    aggregatedCriticality: criticalitySchema.nullish(),
  })
  .partial()
  .loose();

/**
 * Map of phase names to phase entries. Values may be `null` (phase not yet
 * reached) or a phase-entry object.
 */
export const phasesSchema = z.record(z.string(), z.union([z.null(), phaseEntrySchema]));

/**
 * A single phase-decision entry (run gate). Uses `.loose()` so that
 * extra fields (e.g. `disposition`) pass through without rejection.
 */
export const phaseDecisionSchema = z
  .object({
    run: z.boolean(),
    reason: z.string().optional(),
  })
  .loose();

/** Optional map of phase names to phase decisions. */
export const phaseDecisionMapSchema = z.record(z.string(), phaseDecisionSchema).optional();

/** A single artifact entry with 7 required string fields plus optional metadata. */
export const artifactEntrySchema = z.object({
  filename: z.string(),
  role: z.string(),
  roleType: z.string(),
  agent: z.string(),
  type: z.string(),
  phase: z.string(),
  createdAt: z.string(),
  iteration: z.number().optional(),
  note: z.string().optional(),
});

/** V2 context block: run metadata plus phases and decisions. */
export const v2ContextSchema = z.object({
  runId: z.string(),
  projectSlug: z.string(),
  ticketId: z.string().optional(),
  projectRoot: z.string(),
  branch: z.string(),
  task: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullish(),
  status: runStatusSchema,
  phases: phasesSchema,
  phaseDecisions: phaseDecisionMapSchema,
});

/**
 * V2 config block: all fields optional. Uses `.loose()` so that extra
 * fields (e.g. `pipeline`, `models`) pass through without rejection,
 * ensuring forward compatibility as config options evolve.
 */
export const v2ConfigSchema = z
  .object({
    externalPlan: z.boolean().optional(),
    mergeBaseSha: z.string().optional(),
    diffBase: z.string().optional(),
    maxReviewRounds: z.number().optional(),
    effort: z.string().optional(),
    approvalThreshold: z.string().optional(),
    budgetThreshold: z.string().optional(),
    mode: z.string().optional(),
    model: z.string().optional(),
  })
  .loose();

/** Top-level V2 run-index.json schema. */
export const v2RunIndexSchema = z.object({
  version: z.literal(2),
  context: v2ContextSchema,
  config: v2ConfigSchema,
  artifacts: z.array(artifactEntrySchema).optional(),
});
