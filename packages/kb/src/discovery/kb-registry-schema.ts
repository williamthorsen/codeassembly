import { z } from 'zod';

// Zod schema for the on-disk `kb.yaml` registry.
// A registry declares zero or more knowledge bases under `kbs`, keyed by name.
// Each entry's `path` is required; everything else is optional forward-compatible surface.

/** Schema for a single KB entry as written in `kb.yaml`. */
export const kbRegistryFileEntrySchema = z.object({
  path: z.string().min(1),
  description: z.string().optional(),
  default: z.boolean().optional(),
  readonly: z.boolean().optional(),
});

/** Schema for the full `kb.yaml` file. */
export const kbRegistryFileSchema = z.object({
  kbs: z.record(z.string(), kbRegistryFileEntrySchema).optional(),
});

/** The validated on-disk entry shape. */
export type KbRegistryFileEntry = z.infer<typeof kbRegistryFileEntrySchema>;

/** The validated on-disk file shape. */
export type KbRegistryFile = z.infer<typeof kbRegistryFileSchema>;
