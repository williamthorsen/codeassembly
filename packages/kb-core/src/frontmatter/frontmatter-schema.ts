import { z } from 'zod';

// Zod schema describing the strongly-typed frontmatter contract. Used to
// validate that a parsed `Frontmatter` carries the required fields with the
// expected primitive shapes before a consumer treats it as trusted input.

/** Schema for the required-field core of a note's frontmatter. */
export const frontmatterSchema = z.object({
  title: z.string().min(1),
  type: z.string().min(1),
  created: z.string(),
  updated: z.string(),
  tags: z.array(z.string()),
  extra: z.record(z.string(), z.unknown()),
});

/** The validated frontmatter shape inferred from {@link frontmatterSchema}. */
export type ValidatedFrontmatter = z.infer<typeof frontmatterSchema>;
