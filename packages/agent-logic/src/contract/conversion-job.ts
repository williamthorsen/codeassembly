import type { Job } from '@williamthorsen/telefactor/client';
import { defineJob, type JobRequest, type JobResult } from '@williamthorsen/telefactor/contract';
import { z } from 'zod';

const problemSchema = z.object({ path: z.string(), message: z.string() });

/** The shape of the problems file that `convert --problems-file` writes for a draft that cannot be converted. */
export const problemsFileSchema = z.object({ problems: z.array(problemSchema) });

/**
 * The conversion job: The page sends the prompt and a name, and a `done` job returns the outcome of the `convert`
 * script. A client loads `text` through its own parse-and-validate path, so `config` is not described here.
 */
export const conversionJob = defineJob({
  input: z.object({
    name: z
      .string()
      .max(100)
      .refine((value) => value.trim() !== '', 'Enter a name'),
  }),
  result: z.union([
    z.object({ ok: z.literal(true), config: z.unknown(), text: z.string() }),
    z.object({ ok: z.literal(false), problems: z.array(problemSchema) }),
    z.object({ ok: z.literal(false), outOfScope: z.object({ reason: z.string() }) }),
  ]),
});

/** The body that starts a conversion: the prompt, its name, and the harness, the default harness when omitted. */
export type ConversionRequest = JobRequest<typeof conversionJob>;

/** A conversion job. `result` is present when the job is `done`, and `error` when it is `failed`. */
export type ConversionJob = Job<JobResult<typeof conversionJob>>;
