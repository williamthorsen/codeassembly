import { z } from 'zod';

import type { RunEvent } from '../types/run-log.js';
import { criticalitySchema, runStatusSchema } from './run-index-schema.js';

// -- Individual event schemas --------------------------------------------------
//
// Each schema uses plain `.object()` (not `.loose()`). Zod 4's default behavior
// for `.object()` is to strip unknown keys during parse. This means:
//   1. Lines containing future/unknown fields parse without throwing.
//   2. The inferred output type exactly matches RunEvent (no index signature).
// This eliminates the need for type assertions on the parse result.

const phaseStatusSchema = z.enum(['completed', 'skipped', 'failed', 'in_progress', 'approved']);
const reviewerStatusSchema = z.enum(['completed', 'skipped', 'failed']);

const eventPhaseSchema = z.enum(['architecture', 'planning', 'implementation', 'review', 'simplifier', 'holistic']);

/** Reusable schema fragment for optional resource-usage metrics on events. */
const usageMetricsSchema = {
  tokens: z.number().optional(),
  toolUses: z.number().optional(),
  durationMs: z.number().optional(),
};

const runStartedSchema = z.object({
  t: z.string(),
  event: z.literal('run_started'),
});

const runCompletedSchema = z.object({
  t: z.string(),
  event: z.literal('run_completed'),
  status: runStatusSchema,
});

const runFailedSchema = z.object({
  t: z.string(),
  event: z.literal('run_failed'),
  status: runStatusSchema,
  reason: z.string().optional(),
});

const phaseDecisionSchema = z.object({
  t: z.string(),
  event: z.literal('phase_decision'),
  phase: z.string(),
  run: z.boolean(),
  reason: z.string().optional(),
});

const phaseStartedSchema = z.object({
  t: z.string(),
  event: z.literal('phase_started'),
  phase: eventPhaseSchema,
});

const phaseCompletedSchema = z.object({
  t: z.string(),
  event: z.literal('phase_completed'),
  phase: eventPhaseSchema,
  status: phaseStatusSchema,
  data: z.record(z.string(), z.unknown()).optional(),
  ...usageMetricsSchema,
});

const reviewerDispatchedSchema = z.object({
  t: z.string(),
  event: z.literal('reviewer_dispatched'),
  reviewer: z.string(),
});

const reviewerCompletedSchema = z.object({
  t: z.string(),
  event: z.literal('reviewer_completed'),
  reviewer: z.string(),
  status: reviewerStatusSchema,
  criticality: criticalitySchema,
  ...usageMetricsSchema,
});

const coderFixStartedSchema = z.object({
  t: z.string(),
  event: z.literal('coder_fix_started'),
  iteration: z.number(),
});

const coderFixCompletedSchema = z.object({
  t: z.string(),
  event: z.literal('coder_fix_completed'),
  iteration: z.number(),
  ...usageMetricsSchema,
});

const reReviewDispatchedSchema = z.object({
  t: z.string(),
  event: z.literal('re_review_dispatched'),
  reviewers: z.array(z.string()),
});

const reReviewCompletedSchema = z.object({
  t: z.string(),
  event: z.literal('re_review_completed'),
  criticalities: z.record(z.string(), criticalitySchema),
  ...usageMetricsSchema,
});

const artifactWrittenSchema = z.object({
  t: z.string(),
  event: z.literal('artifact_written'),
  filename: z.string(),
  role: z.string(),
  roleType: z.string(),
  agent: z.string(),
  type: z.string(),
  phase: z.string(),
  iteration: z.number().optional(),
  note: z.string().optional(),
});

/** Discriminated union over the `event` field covering all 13 event types. */
export const runEventSchema = z.discriminatedUnion('event', [
  runStartedSchema,
  runCompletedSchema,
  runFailedSchema,
  phaseDecisionSchema,
  phaseStartedSchema,
  phaseCompletedSchema,
  reviewerDispatchedSchema,
  reviewerCompletedSchema,
  coderFixStartedSchema,
  coderFixCompletedSchema,
  reReviewDispatchedSchema,
  reReviewCompletedSchema,
  artifactWrittenSchema,
]);

/** Parse a single JSONL line into a validated RunEvent. */
export function parseRunLogLine(line: string): RunEvent {
  const raw: unknown = JSON.parse(line);
  const parsed: z.infer<typeof runEventSchema> = runEventSchema.parse(raw);
  // z.infer output is structurally identical to RunEvent when schemas don't use .loose()
  return parsed;
}

// -- V3 run-index.json schema -------------------------------------------------

/** V3 context: header-only (no phases, status, completedAt, or phaseDecisions). */
const v3ContextSchema = z.object({
  runId: z.string(),
  projectSlug: z.string(),
  ticketId: z.string().optional(),
  projectRoot: z.string(),
  branch: z.string(),
  task: z.string(),
  startedAt: z.string(),
});

/** V3 config: same as v2 — all fields optional, loose for forward compatibility. */
const v3ConfigSchema = z
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

/** Top-level V3 run-index.json schema (header-only, events live in run-log.jsonl). */
export const v3RunIndexSchema = z.object({
  version: z.literal(3),
  context: v3ContextSchema,
  config: v3ConfigSchema,
});
