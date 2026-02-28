import { z } from 'zod';

const dismissedRunEntrySchema = z.object({ status: z.string() });

export const userSettingsSchema = z.object({
  dismissedRuns: z.record(z.string(), dismissedRunEntrySchema),
});
