import { z } from 'zod';

/**
 * The coverage map that the `convert-agent-prompt` skill writes before converting: one entry per instruction of the
 * prompt, whose quote is copied verbatim from the prompt and must occur in it exactly once, and whose element names
 * the draft's state, transition, or action that holds the instruction, or `ambient`, `unconverted`, or `none`.
 */
export const coverageMapSchema = z.array(z.strictObject({ quote: z.string().min(1), element: z.string().min(1) }));

export type CoverageMap = z.infer<typeof coverageMapSchema>;
