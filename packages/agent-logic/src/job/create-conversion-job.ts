import type { Job, JobTool } from '@williamthorsen/toolbelt.llm/proposed';
import { z } from 'zod';

import { CHECK_COVERAGE_DESCRIPTION, SUBMIT_DRAFT_DESCRIPTION } from '../conversion-session/conversion-tools.ts';
import {
  createConversionSession,
  MAX_COVERAGE_CHECKS,
  MAX_SUBMISSIONS,
} from '../conversion-session/create-conversion-session.ts';
import { formatConversionInput, parseConversionInput } from '../conversion-session/format-conversion-input.ts';
import type { ConvertResult } from '../convert/convert-prompt.ts';
import { coverageMapSchema } from '../coverage-map/coverage-map-schema.ts';
import { CONVERSION_INSTRUCTIONS } from '../instructions/conversion-instructions.ts';

/**
 * The most model requests that a conversion job makes: one for each coverage check and each submission that the
 * session accepts, plus one for a refused call and one for a reading round.
 *
 * @stage proposed
 * @experimental
 */
export const MAX_ROUNDS = MAX_COVERAGE_CHECKS + MAX_SUBMISSIONS + 2;

/** What `createConversionJob` converts. */
export interface ConversionJobOptions {
  /** The prompt, verbatim. */
  readonly prompt: string;
  /** The prompt's file name, from which the config's root id derives. */
  readonly name: string;
}

/**
 * Creates a job for `runJob` of `@williamthorsen/toolbelt.llm` that converts a prompt: The model receives the same
 * instructions and message as `convertWithAgent`, checks its coverage map through `check_coverage`, and submits each
 * draft through `submit_draft`, with the same caps. The job's result is the outcome of the submission that finished
 * the conversion: an accepted config, an out-of-scope verdict, or the problems of the last submission accepted. A run
 * that the model ends before then is unfinished. Create a job for each run. Throws for a name that contains a newline.
 *
 * @stage proposed
 * @experimental
 */
export function createConversionJob({ prompt, name }: ConversionJobOptions): Job<ConvertResult> {
  const input = formatConversionInput(prompt, name);
  const session = createConversionSession({ prompt, name, onEvent: () => {} });
  let finished: ConvertResult | undefined;

  const checkCoverage: JobTool<{ map: z.infer<typeof coverageMapSchema> }, string> = {
    description: CHECK_COVERAGE_DESCRIPTION,
    inputSchema: z.object({ map: coverageMapSchema }),
    execute: ({ map }) => session.checkCoverage(map),
  };
  const submitDraft: JobTool<{ draft: string }, string> = {
    description: SUBMIT_DRAFT_DESCRIPTION,
    inputSchema: z.object({ draft: z.string().describe("The draft's JSON text.") }),
    execute: ({ draft }) => {
      const reply = session.submitDraft(draft);
      // Keep the submission that finished the conversion, which a later submission in the same round would replace.
      if (finished === undefined && session.isFinished) finished = session.result;
      return reply;
    },
  };

  return {
    instructions: CONVERSION_INSTRUCTIONS,
    input,
    tools: { check_coverage: checkCoverage, submit_draft: submitDraft },
    maxRounds: MAX_ROUNDS,
    readResult: () => finished,
  };
}

/**
 * Creates the job that `createConversionJob` creates for a prompt, from that job's `input`: the string that `runJob`
 * posts to an operator's endpoint, for the `createJob` of `createJobHandler`. Throws when `input` is not one that
 * `createConversionJob` creates.
 *
 * @stage proposed
 * @experimental
 */
export function createConversionJobFromInput(input: string): Job<ConvertResult> {
  return createConversionJob(parseConversionInput(input));
}
