import { z } from 'zod';

import type { ReviewMarker, SizeSnapshot } from './types.ts';

/**
 * Schema version written by this build, and the only one that `parseReviewMarkerLine` accepts. Versioned apart from
 * the snapshot, because the two line kinds share a record and evolve independently.
 */
export const REVIEW_MARKER_SCHEMA_VERSION = 1;

/** Schema version written by this build, and the only one that `parseSnapshotLine` accepts. */
export const SNAPSHOT_SCHEMA_VERSION = 1;

const ByteCountSchema = z.number().int().nonnegative();

const DeployedFileSchema = z.object({
  bytes: ByteCountSchema,
  kind: z.enum(['asset', 'document']),
});

const ExpansionUnitSchema = z.object({
  bytes: ByteCountSchema,
  reach: ByteCountSchema,
});

const AlwaysLoadedAggregateSchema = z.object({
  total: ByteCountSchema,
  ambientRegions: ByteCountSchema,
  skillDescriptions: ByteCountSchema,
  subagentDescriptions: ByteCountSchema,
});

const SizeAggregatesSchema = z.object({
  alwaysLoaded: AlwaysLoadedAggregateSchema,
  onInvocation: ByteCountSchema,
  assets: ByteCountSchema,
});

const ReviewMarkerSchema = z.object({
  schemaVersion: z.literal(REVIEW_MARKER_SCHEMA_VERSION),
  kind: z.literal('review'),
  recordedAt: z.string().min(1),
  reviewed: z.array(z.string().min(1)),
});

const SizeSnapshotSchema = z.object({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  kind: z.literal('snapshot'),
  recordedAt: z.string().min(1),
  version: z.string().min(1),
  sourceCommit: z.string().min(1).optional(),
  files: z.record(z.string().min(1), DeployedFileSchema),
  // Optional at this schema version: bumping the version would make every line written before the block exists
  // unreadable, which would re-report every document once.
  expansions: z.record(z.string().min(1), ExpansionUnitSchema).optional(),
  aggregates: SizeAggregatesSchema,
});

/**
 * Parses one record line into a review marker, or `undefined` when it is not one, on the same terms as
 * {@link parseSnapshotLine}.
 */
export function parseReviewMarkerLine(line: string): ReviewMarker | undefined {
  const parsed = parseJsonLine(line);
  const result = ReviewMarkerSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}

/**
 * Parses one record line into a snapshot, or `undefined` when it is not one: a truncated or malformed line, a line of
 * another `kind`, or a line written by a schema version that this build does not read.
 *
 * The record is machine-local telemetry, so a reader skips a line that it cannot read and keeps the rest of the
 * record.
 */
export function parseSnapshotLine(line: string): SizeSnapshot | undefined {
  const parsed = parseJsonLine(line);
  const result = SizeSnapshotSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}

// region | Helpers

/** Parses one record line as JSON, or `undefined` when it is malformed or truncated. */
function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

// endregion | Helpers
