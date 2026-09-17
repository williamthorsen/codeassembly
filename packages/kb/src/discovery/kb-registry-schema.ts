import { z } from 'zod';

/** Schema for a single KB entry as written in `kb.yaml`. */
export const kbRegistryFileEntrySchema = z.object({
  path: z.string().min(1),
  description: z.string().optional(),
  readonly: z.boolean().optional(),
});

/** Schema for the full `kb.yaml` file. */
export const kbRegistryFileSchema = z.object({
  default_kb: z.string().min(1).optional(),
  kbs: z.record(z.string(), kbRegistryFileEntrySchema).optional(),
});

export type KbRegistryFileEntry = z.infer<typeof kbRegistryFileEntrySchema>;

export type KbRegistryFile = z.infer<typeof kbRegistryFileSchema>;
