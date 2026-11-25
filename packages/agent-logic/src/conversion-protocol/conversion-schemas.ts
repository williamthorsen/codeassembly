import { z } from 'zod';

import type { Problem } from '../schema/validate-config.ts';

/** The largest prompt that a start request accepts, in bytes of UTF-8. */
export const MAX_PROMPT_BYTES = 1024 * 1024;

/** The longest name that a start request accepts, in characters. */
export const MAX_NAME_LENGTH = 100;

const problemSchema: z.ZodType<Problem> = z.object({ path: z.string(), message: z.string() });

/** The body of every error response: the problems that refused the request. */
export const problemsBodySchema = z.object({ problems: z.array(problemSchema) });

/**
 * The body that starts a conversion: the prompt, verbatim, and its file name, from which the config's root id derives.
 */
export const startConversionRequestSchema = z.object({
  prompt: z
    .string()
    .refine((value) => value !== '', 'Enter a prompt')
    .refine(
      (value) => new TextEncoder().encode(value).byteLength <= MAX_PROMPT_BYTES,
      `The prompt must not exceed ${MAX_PROMPT_BYTES} bytes`,
    ),
  name: z
    .string()
    .max(MAX_NAME_LENGTH)
    .refine((value) => value.trim() !== '', 'Enter a name'),
});

/** A conversion's result: the config text, the problems of the last draft, or an out-of-scope verdict. */
export const conversionResultSchema = z.union([
  z.object({ ok: z.literal(true), text: z.string() }),
  z.object({ ok: z.literal(false), problems: z.array(problemSchema) }),
  z.object({ ok: z.literal(false), outOfScope: z.object({ reason: z.string() }) }),
]);

/**
 * Members of every ended state: the `startedAt` of its running state and the `endedAt` at which it settled, which is
 * the deadline for a conversion that timed out. Both are optional because states stored before they existed lack them.
 */
const endedMembers = {
  id: z.string(),
  name: z.string(),
  startedAt: z.iso.datetime().optional(),
  endedAt: z.iso.datetime().optional(),
};

/** A conversion's state: `running` until its deadline, then one of the ended states, which never change. */
export const conversionStateSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('running'),
    id: z.string(),
    name: z.string(),
    startedAt: z.iso.datetime(),
    deadline: z.iso.datetime(),
  }),
  z.object({ status: z.literal('done'), ...endedMembers, result: conversionResultSchema }),
  z.object({ status: z.literal('failed'), ...endedMembers, reason: z.string() }),
  z.object({ status: z.literal('cancelled'), ...endedMembers }),
]);

export type ConversionResult = z.output<typeof conversionResultSchema>;
export type ConversionState = z.output<typeof conversionStateSchema>;
export type EndedConversionState = Exclude<ConversionState, { status: 'running' }>;
export type ProblemsBody = z.output<typeof problemsBodySchema>;
export type StartConversionRequest = z.output<typeof startConversionRequestSchema>;
