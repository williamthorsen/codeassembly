import { z } from 'zod';

/** A base name and the prompt and agent-logic files that share it. */
export const promptEntrySchema = z.object({
  name: z.string(),
  promptFile: z.string().optional(),
  agentLogicFile: z.string().optional(),
});

export type PromptEntry = z.infer<typeof promptEntrySchema>;

/**
 * The body of a `200` from `GET /prompts`: the absolute directory, the config file that names it, and its entries, or
 * `missing` when the directory does not exist.
 */
export const promptListSchema = z.union([
  z.object({ directory: z.string(), configPath: z.string(), entries: z.array(promptEntrySchema) }),
  z.object({ directory: z.string(), configPath: z.string(), missing: z.literal(true) }),
]);

export type PromptList = z.infer<typeof promptListSchema>;

/** The body of a `200` from `GET /prompts/files/{fileName}`. */
export const promptFileSchema = z.object({ text: z.string() });
