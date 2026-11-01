import { EVENT_IMPACT_LEVELS } from '@williamthorsen/kb/records';
import { z } from 'zod';

const InventoryEntrySchema = z.object({
  id: z.string().min(1),
  summary: z.string(),
  skill: z.string().exactOptional(),
  repo: z.string().exactOptional(),
  capturedAt: z.string().min(1),
  impact: z.enum(EVENT_IMPACT_LEVELS).exactOptional(),
  excerpt: z.string(),
  deferredAt: z.string().exactOptional(),
});

/** The shape of the file that the `inventory` command writes. */
export const InventorySchema = z.object({
  store: z.string().min(1),
  pool: z.array(InventoryEntrySchema),
  deferred: z.array(InventoryEntrySchema.extend({ deferredAt: z.string().min(1) })),
  skipped: z.array(z.object({ file: z.string(), message: z.string() })),
});

/** The shape of the cluster map that the clusterer writes. */
export const ClusterMapSchema = z.object({
  clusters: z.array(
    z.object({
      id: z.string().min(1),
      lesson: z.string().min(1),
      eventIds: z.array(z.string()),
    }),
  ),
});
