/** Zod schema for the `ticket.pull` preferences, with each key's default. */
import { z } from 'zod';

/** The `ticket.pull` section of `.agents/preferences.yaml`; every key is optional. */
export const PullConfigSchema = z.strictObject({
  now: z.string().min(1).optional(),
  assignOnPick: z.boolean().default(false),
  priorityPrefix: z.string().min(1).default('priority:'),
  staleGroomDays: z.number().int().positive().default(14),
  staleGroomNewTickets: z.number().int().positive().default(10),
  staleBranchDays: z.number().int().positive().default(14),
});

export type PullConfig = z.infer<typeof PullConfigSchema>;
