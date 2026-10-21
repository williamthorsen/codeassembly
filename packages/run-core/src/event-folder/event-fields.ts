import type { Criticality, UsageMetrics } from '../types/canonical.ts';

const CRITICALITY_VALUES: ReadonlySet<string> = new Set(['none', 'low', 'medium', 'high']);

/** Builds a UsageMetrics object from an event's optional usage fields, or returns undefined if none are present. */
export function extractUsage(event: {
  tokens?: number | undefined;
  toolUses?: number | undefined;
  durationMs?: number | undefined;
}): UsageMetrics | undefined {
  const { tokens, toolUses, durationMs } = event;
  if (tokens === undefined && toolUses === undefined && durationMs === undefined) return undefined;
  const usage: UsageMetrics = {};
  if (tokens !== undefined) usage.tokens = tokens;
  if (toolUses !== undefined) usage.toolUses = toolUses;
  if (durationMs !== undefined) usage.durationMs = durationMs;
  return usage;
}

/** Narrows `value` to one of the `Criticality` levels. */
export function isCriticality(value: unknown): value is Criticality {
  return typeof value === 'string' && CRITICALITY_VALUES.has(value);
}
